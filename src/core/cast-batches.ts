import { parseCastDraft, type CastDraft, type CastJob, type CastSource } from "./cast-initialization";
function payload(raw: string): Record<string, unknown> {
  const body = /<deeprole_cast>\s*([\s\S]*?)\s*<\/deeprole_cast>/u.exec(raw)?.[1] ?? raw.trim();
  return JSON.parse(body.replace(/^```(?:json)?\s*|\s*```$/gu, "")) as Record<string, unknown>;
}
export function parseCastBatch(raw: string, request: string, sources: CastSource[], size: number): { draft?: CastDraft; more: boolean; partial: boolean } {
  const value = payload(raw);
  if (!value || value.version !== 1 || value.request !== request || !Array.isArray(value.characters) || value.characters.length > size) throw Error("invalid-result");
  const partial = value.partial === true;
  if (!partial && typeof value.more !== "boolean") throw Error("invalid-result");
  if (!value.characters.length) {
    if (value.more !== false || partial || !Array.isArray(value.present) || value.present.length || !Array.isArray(value.partners) || value.partners.length || !Array.isArray(value.warnings) || value.warnings.length) throw Error("invalid-result");
    return { more: false, partial: false };
  }
  return { draft: parseCastDraft(JSON.stringify(value), request, sources), more: value.more === true, partial };
}
export function mergeCastBatches(previous: CastDraft | undefined, incoming: CastDraft | undefined, request: string, sources: CastSource[]): CastDraft {
  if (!incoming && !previous) throw Error("invalid-result");
  if (!previous) return incoming!;
  if (!incoming) return { ...previous, request };
  const known = new Set(previous.characters.flatMap(c => [c.name, ...c.aliases]).map(s => s.toLocaleLowerCase()));
  if (incoming.characters.some(c => [c.name, ...c.aliases].some(s => known.has(s.toLocaleLowerCase())))) throw Error("duplicate-character");
  return parseCastDraft(JSON.stringify({ version: 1, request, characters: [...previous.characters, ...incoming.characters], present: [...new Set([...previous.present, ...incoming.present])].slice(0, 12), partners: [...new Set([...previous.partners, ...incoming.partners])].slice(0, 12), warnings: [...new Set([...previous.warnings, ...incoming.warnings])].slice(0, 12) }), request, sources);
}
/** Keep already validated data on a closed tab or lost worker; never commit profiles here. */
export function interruptedCastJob(job: CastJob, error: string): CastJob {
  let draft = job.draft;
  const saved = job.replyCheckpoint;
  if (job.awaiting && saved && saved.step === job.step && saved.repair === job.repair && saved.chatId === job.chatId) {
    try {
      const received = job.batchSize ? parseCastBatch(saved.raw, job.id, job.sources, job.batchSize).draft : parseCastDraft(saved.raw, job.id, job.sources);
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
