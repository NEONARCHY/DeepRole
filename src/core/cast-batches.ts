import { parseCastDraft, validateCastDraftValue, type CastDraft, type CastJob, type CastSource } from "./cast-initialization";
import { castCheck, CastValidationError } from "./cast-validation";
import { acceptLargeCastReply } from "./cast-large-lore";
import {acceptResetEntryReply,beginResetEntries} from "./world-reset-entries";
import {resetBatchMore} from "./world-reset";
function payload(raw: string): Record<string, unknown> {
  const body = /<deeprole_cast>\s*([\s\S]*?)\s*<\/deeprole_cast>/u.exec(raw)?.[1] ?? raw.trim();
  try { return JSON.parse(body.replace(/^```(?:json)?\s*|\s*```$/gu, "")) as Record<string, unknown>; }
  catch { throw new CastValidationError([{path:"$",rule:"complete valid JSON object",actual:"invalid JSON"}]); }
}
export function parseCastBatch(raw: string, request: string, sources: CastSource[], size: number, previous?: CastDraft): { draft?: CastDraft; more: boolean; partial: boolean } {
  castCheck(raw.length <= 180000, "$", "reply length <=180000", raw);
  castCheck([...raw.matchAll(/<deeprole_cast>/gu)].length <= 1, "$", "at most one deeprole_cast block", raw);
  const value = payload(raw);
  castCheck(value && typeof value === "object" && !Array.isArray(value), "$", "object", value);
  castCheck(value.version === 1, "version", "version must equal 1", value.version);
  castCheck(value.request === request, "request", "must match current request ID", value.request);
  castCheck(Array.isArray(value.characters) && value.characters.length <= size, "characters", "batch array <=" + size, value.characters);
  const partial = value.partial === true;
  castCheck(partial || typeof value.more === "boolean", "more", "boolean unless partial reply", value.more);
  if (!value.characters.length) {
    castCheck(value.more === false && !partial, "characters", "empty batch requires more=false and no partial flag", value.characters);
    for (const field of ["present", "partners", "warnings"]) castCheck(Array.isArray(value[field]) && value[field].length === 0, field, "empty array for empty final batch", value[field]);
    return { more: false, partial: false };
  }
  return { draft: parseCastDraft(JSON.stringify(value), request, sources, previous?.characters), more: value.more === true, partial };
}
export function mergeCastBatches(previous: CastDraft | undefined, incoming: CastDraft | undefined, request: string, sources: CastSource[]): CastDraft {
  castCheck(incoming || previous, "characters", "at least one prepared profile across batches");
  if (!previous) return incoming!;
  if (!incoming) return { ...previous, request };
  const known = new Set(previous.characters.flatMap(c => [c.name, ...c.aliases]).map(s => s.toLocaleLowerCase()));
  incoming.characters.forEach((c, i) => castCheck(![c.name, ...c.aliases].some(s => known.has(s.toLocaleLowerCase())), `characters[${i}].name/aliases`, "must not repeat an earlier batch", c.aliases, "duplicate-character"));
  return validateCastDraftValue({ version: 1, request, characters: [...previous.characters, ...incoming.characters], present: [...new Set([...previous.present, ...incoming.present])].slice(0, 12), partners: [...new Set([...previous.partners, ...incoming.partners])].slice(0, 12), warnings: [...new Set([...previous.warnings, ...incoming.warnings])].slice(0, 12), ...((previous.resetEntries||incoming.resetEntries)?{resetEntries:[...previous.resetEntries??[],...incoming.resetEntries??[]]}:{}) }, request, sources);
}
/** Keep already validated data on a closed tab or lost worker; never commit profiles here. */
export function interruptedCastJob(job: CastJob, error: string): CastJob {
  let draft = job.draft;
  const saved = job.replyCheckpoint;
  if(job.reset?.entryOffset!==undefined&&job.awaiting&&saved&&saved.step===job.step&&saved.repair===job.repair&&saved.chatId===job.chatId){try{return {...acceptResetEntryReply(job,saved.raw),phase:"error",error};}catch{}}
  if (job.large && job.awaiting && saved && saved.step === job.step && saved.repair === job.repair && saved.chatId === job.chatId) {
    try { return { ...beginResetEntries(acceptLargeCastReply(job, saved.raw)), phase: "error", error }; } catch { /* Invalid catalogue/profile checkpoints never advance progress. */ }
  }
  if (job.awaiting && saved && saved.step === job.step && saved.repair === job.repair && saved.chatId === job.chatId) {
    try {
      const received = job.batchSize ? parseCastBatch(saved.raw, job.id, job.sources, job.batchSize, job.draft).draft : parseCastDraft(saved.raw, job.id, job.sources);
      if(job.reset&&job.batchSize)resetBatchMore(job,received);
      draft = mergeCastBatches(draft, received, job.id, job.sources);
    } catch { /* A stale or invalid checkpoint is never a draft. */ }
  }
  return { ...job, phase: "error", error, awaiting: false, replyCheckpoint: undefined, ...(draft ? { draft } : {}) };
}
/** Salvage only finished character objects from the final answer, never guesses about cut fields. */
export function receivedCastCharacters(raw: string, request: string): string | undefined {
  if (!raw || raw.length > 180000) return;
  const opening = raw.indexOf("<deeprole_cast>");
  const body = opening >= 0 ? raw.slice(opening + 15) : raw.replace(/^```(?:json)?\s*/u, "");
  const start = /"characters"\s*:\s*\[/u.exec(body);
  if (!start) return;
  try {
    // Parsing the header as JSON avoids interpreting a quoted example/request as a real envelope.
    const header = JSON.parse(body.slice(0, start.index) + '"characters":[]}');
    if (header.version !== 1 || header.request !== request) return;
  } catch { return; }
  const characters: unknown[] = [];
  let quoted = false, escaped = false, depth = 0, begin = -1;
  for (let i = start.index + start[0].length; i < body.length; i++) {
    const ch = body[i]!;
    if (quoted) { if (escaped) escaped = false; else if (ch === "\\") escaped = true; else if (ch === '"') quoted = false; continue; }
    if (ch === '"') { quoted = true; continue; }
    if (ch === "{") { if (!depth) begin = i; depth++; }
    else if (ch === "}") { if (!depth) return; if (!--depth) { try { characters.push(JSON.parse(body.slice(begin, i + 1))); } catch { return; } } }
    else if (!depth && ch === "]") break;
    else if (!depth && ch !== "," && !/\s/u.test(ch)) return;
  }
  if (!characters.length || characters.length > 2) return;
  return "<deeprole_cast>" + JSON.stringify({ version: 1, request, characters, present: [], partners: [], warnings: [], partial: true }) + "</deeprole_cast>";
}
