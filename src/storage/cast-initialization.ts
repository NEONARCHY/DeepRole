import { repository, type DeepRoleRepository } from "./repository";
import { createId } from "../core/id";
import { castDiagnostic, castParts, castSources, castSignature, castRepairIssues, parseCastDraft, validateCastDraftValue, type CastDraft, type CastJob } from "../core/cast-initialization";
import { mergeCastBatches, parseCastBatch } from "../core/cast-batches";
import { EMPTY_CHARACTER, actionsFor } from "../core/characters";
import { resolveCharacterAction } from "../core/character-actions";
import { attributeState } from "../core/attributes";
import { getSettings } from "./settings";
import { CastValidationError } from "../core/cast-validation";
import type { CharacterScene, CharacterSheet, CharacterStatus, ChatBinding, DataRecord, Locale, SceneEntity, WorldProfile } from "../core/types";

export async function createCastJob(worldId: string, locale: Locale, retry = false, repo: DeepRoleRepository = repository): Promise<CastJob> {
  const defaults = (await getSettings()).characterActions;
  return repo.updateRecords(records => {
    const previous = records.filter(r => r.kind === "cast" && (r.data as CastJob).worldId === worldId).map(r => r.data as CastJob).sort((a,b) => b.createdAt - a.createdAt)[0];
    if (previous && (!retry || ["opening", "reading", "analyzing"].includes(previous.phase))) return { records: [], removed: [], result: previous };
    if (previous && retry && ["pending", "failed"].includes(previous.cleanup)) throw new Error("cleanup-required");
    const sources = castSources(records, worldId); castParts(sources);
    const now = Date.now(), job: CastJob = { id: createId("cast"), worldId, locale, phase: "opening", createdAt: now, updatedAt: now, sources, signature: castSignature(records, worldId), step: 0, awaiting: false, repair: false, cleanup: "pending", batchSize: 1, ...(previous?.batchSize && previous.phase === "error" && previous.draft && previous.signature === castSignature(records, worldId) ? { draft: { ...previous.draft, request: "" } } : {}) };
    if (job.draft) job.draft.request = job.id;
    if (previous?.diagnostics) job.diagnostics = previous.diagnostics.slice(-24);
    const world = records.find(r => r.kind === "world" && r.id === worldId)!.data as WorldProfile;
    job.actions = [...actionsFor(world.characterActions ?? defaults)];
    return { records: [{ kind: "cast", id: job.id, data: job }, { kind: "world", id: worldId, data: { ...world, autoPrepareCharacters: false } }], removed: previous ? [{ kind: "cast", id: previous.id }] : [], result: job };
  });
}
export async function mutateCastJob(id: string, update: (job: CastJob) => CastJob, repo: DeepRoleRepository = repository): Promise<CastJob> {
  return repo.updateRecords(records => {
    const job = records.find(r => r.kind === "cast" && r.id === id)?.data as CastJob | undefined;
    if (!job) throw new Error("job-missing");
    const next = { ...update(job), updatedAt: Date.now() };
    return { records: [{ kind: "cast", id, data: next }], removed: [], result: next };
  });
}
export async function acceptCastReply(id: string, step: number, raw: string, repo: DeepRoleRepository = repository): Promise<CastJob> {
  return mutateCastJob(id, job => {
    if (!["reading", "analyzing"].includes(job.phase) || job.step !== step || !job.awaiting) throw new Error("stale-step");
    if (job.step < castParts(job.sources).length) return { ...job, step: job.step + 1, awaiting: false };
    let stage: "parse" | "merge" = "parse";
    try {
      if (job.batchSize) {
        const batch = parseCastBatch(raw, job.id, job.sources, job.batchSize, job.draft);
        stage = "merge";
        const draft = mergeCastBatches(job.draft, batch.draft, job.id, job.sources);
        if (batch.partial) return { ...castDiagnostic({...job,draft}, "partial-reply", [], {stage:"parse",replyLength:raw.length,details:[{path:"$",rule:"complete final batch envelope",actual:"only completed profiles recovered from interrupted reply"}]}), phase: "error", awaiting: false, replyCheckpoint: undefined, draft, error: "partial-reply" };
        return { ...job, draft, phase: batch.more ? "analyzing" : "ready", step: job.step + 1, repair: false, repairIssues: undefined, awaiting: false, replyCheckpoint: undefined };
      }
      return { ...job, phase: "ready", awaiting: false, replyCheckpoint: undefined, draft: parseCastDraft(raw, job.id, job.sources) };
    }
    catch (e) {
      const details = e instanceof CastValidationError ? e.issues.slice(0, 60) : undefined;
      const hints = castRepairIssues(raw, job);
      const repairIssues = [...(details?.map(d => `${d.path}: expected ${d.rule}; received ${d.actual}.`) ?? []), ...(details?.length && hints[0]?.startsWith("Schema or exact") ? [] : hints)].filter((v, i, all) => all.indexOf(v) === i).slice(0, 60);
      const diagnosed = castDiagnostic(job, e instanceof Error ? e.message : "invalid-result", repairIssues, { details, stage, replyLength: raw.length });
      if (!job.repair) return { ...diagnosed, repair: true, repairIssues, awaiting: false, replyCheckpoint: undefined };
      return { ...diagnosed, phase: "error", repairIssues, awaiting: false, replyCheckpoint: undefined, error: e instanceof Error ? e.message : "invalid-result" };
    }
  }, repo);
}
function fillSheet(old: CharacterSheet | undefined, proposed: CharacterSheet, state: CharacterStatus): CharacterSheet {
  if (!old) return { ...proposed, initialStatus: state };
  const next = { ...old };
  for (const field of ["appearance", "personality", "goals", "background"] as const) if (!old[field].trim()) next[field] = proposed[field];
  if (!old.attributes?.length) next.attributes = proposed.attributes;
  if (!old.relationships) next.relationships = proposed.relationships;
  if (!old.initialStatus) next.initialStatus = state;
  return next;
}
export async function applyCastDraft(id: string, draft: CastDraft, selected: string[], heroKey: string, repo: DeepRoleRepository = repository): Promise<number> {
  const defaults = (await getSettings()).characterActions;
  return repo.updateRecords(records => {
    const job = records.find(r => r.kind === "cast" && r.id === id)?.data as CastJob | undefined;
    if (!job || !["ready", "error"].includes(job.phase) || !job.draft) throw new Error("job-missing");
    if (castSignature(records, job.worldId) !== job.signature) throw new Error("lore-changed");
    const sanitized = validateCastDraftValue(draft, id, job.sources);
    if (sanitized.characters.length !== job.draft.characters.length || sanitized.characters.some(c => !job.draft!.characters.some(old => old.key === c.key && old.name === c.name))) throw new Error("invalid-result");
    const members = sanitized.characters.filter(c => selected.includes(c.key));
    if (!members.length || !members.some(c => c.key === heroKey)) throw new Error("hero-required");
    const people = records.filter(r => r.kind === "entity" && (r.data as SceneEntity).worldId === job.worldId && (r.data as SceneEntity).kind === "character").map(r => r.data as SceneEntity);
    const existingHero = people.find(e => e.characterSheet?.protagonist);
    const world = records.find(r => r.kind === "world" && r.id === job.worldId)!.data as WorldProfile;
    const changes: DataRecord[] = [], mapping = new Map<string, string>(), now = Date.now();
    for (const member of members) {
      const aliases = new Set([member.name, ...member.aliases].map(s => s.toLocaleLowerCase()));
      const matching = people.filter(p => [p.name, ...p.aliases].some(n => aliases.has(n.toLocaleLowerCase())));
      if (matching.length > 1) throw new Error("ambiguous-name");
      const old = matching[0], entityId = old?.id ?? createId("entity");
      if ([...mapping.values()].includes(entityId)) throw new Error("ambiguous-name");
      mapping.set(member.key, entityId);
      if (member.key === heroKey && existingHero && existingHero.id !== entityId) throw new Error("hero-conflict");
      const state = { ...member.state, action: resolveCharacterAction(old?.characterSheet, member.state.action, undefined, actionsFor(world.characterActions ?? defaults)) };
      const proposed = { ...member.sheet, ...(member.sheet.relationships ? { relationships: { ...member.sheet.relationships, initialCompleted: member.completed } } : {}) };
      const sheet = fillSheet(old?.characterSheet, proposed, state);
      sheet.protagonist = member.key === heroKey || !!old?.characterSheet?.protagonist;
      const entity: SceneEntity = old ? { ...old, characterSheet: sheet, updatedAt: now } : { id: entityId, worldId: job.worldId, kind: "character", name: member.name, aliases: member.aliases, description: "", memberIds: [], characterSheet: { ...EMPTY_CHARACTER, ...sheet }, createdAt: now, updatedAt: now };
      changes.push({ kind: "entity", id: entityId, data: entity });
    }
    const heroId = mapping.get(heroKey)!;
    for (const row of records.filter(r => r.kind === "binding" && (r.data as ChatBinding).worldId === job.worldId)) {
      const binding = row.data as ChatBinding, previous = binding.characterScenes?.[job.worldId];
      const states = { ...previous?.states };
      for (const member of members) {
        const entityId = mapping.get(member.key)!, sheet = (changes.find(r => r.id === entityId)!.data as SceneEntity).characterSheet!;
        if (states[entityId]) continue; // Played values and locks are authoritative.
        const status: CharacterStatus = { ...(sheet.initialStatus ?? member.state) };
        if (sheet.attributes?.length) status.attributes = attributeState(sheet.attributes);
        if (sheet.relationships?.enabled && entityId !== heroId) status.bonds = { [heroId]: { ...sheet.relationships.initial, locked: false, completed: sheet.relationships.initialCompleted ?? [], history: [] } };
        states[entityId] = status;
      }
      const present = sanitized.present.map(k => mapping.get(k)).filter((v): v is string => !!v);
      const partners = sanitized.partners.map(k => mapping.get(k)).filter((v): v is string => !!v && v !== heroId && present.includes(v));
      const scene: CharacterScene = { ...previous, revision: createId("scene"), states, presentIds: previous?.presentIds ?? present, partnerIds: previous?.partnerIds ?? partners, updatedAt: now };
      changes.push({ kind: "binding", id: row.id, data: { ...binding, characterScenes: { ...binding.characterScenes, [job.worldId]: scene }, updatedAt: now } });
    }
    changes.push({ kind: "cast", id, data: { ...job, phase: "applied", draft: sanitized, updatedAt: now } });
    return { records: changes, removed: [], result: members.length };
  });
}
