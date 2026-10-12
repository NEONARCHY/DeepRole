import type { SceneEntity } from "./types";
import type { StoryBaseline, StoryEvent, StoryRecord } from "./story-records";
import type { StoryReviewGuard } from "./story-review";
import { identityName, identityCanonical, type IdentityCanonical, type IdentitySeeds } from "./story-character-identity";
import { sameStoryValue } from "./story-value";
import { storyMerges } from "./story-character-merge";

export interface IdentityReference { sourceId: string; entityId: string; alias: string }
export interface IdentityControl extends IdentityReference { enabled: boolean }
export interface IdentityRead { worldId: string; chatId: string; offset: number }
export interface IdentityApproval extends IdentityRead { guard: StoryReviewGuard; reference: IdentityReference; expectedUpdatedAt: number | null; enabled: boolean }
export interface IdentityRow { reference: IdentityReference; name: string; inherited: boolean; updatedAt: number | null; status: "active" | "disabled" | "changed" | "ambiguous" | "missing" | "canonical" }
export interface IdentityPage extends IdentityRead { guard: StoryReviewGuard; paused: boolean; total: number; next: number | null; rows: IdentityRow[] }
export type IdentityAction = { action: "read"; input: IdentityRead } | { action: "approve"; input: IdentityApproval };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const id = (v: unknown): v is string => typeof v === "string" && !!v.trim() && v === v.trim() && v.length <= 160 && !["__proto__", "prototype", "constructor"].includes(v);
const offset = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
export const identityKey = (entityId: string, alias: string) => JSON.stringify([entityId, identityName(alias)]);
export const validIdentityReference = (v: unknown): v is IdentityReference => object(v) && exact(v, ["sourceId", "entityId", "alias"]) && id(v.sourceId) && id(v.entityId) && typeof v.alias === "string" && !!v.alias.trim() && v.alias === v.alias.trim() && v.alias.length <= 80;
export const validIdentityControl = (v: unknown): v is IdentityControl => object(v) && exact(v, ["sourceId", "entityId", "alias", "enabled"]) && typeof v.enabled === "boolean" && validIdentityReference({ sourceId: v.sourceId, entityId: v.entityId, alias: v.alias });
export const validIdentityRead = (v: unknown): v is IdentityRead => object(v) && exact(v, ["worldId", "chatId", "offset"]) && id(v.worldId) && id(v.chatId) && offset(v.offset);
export function validIdentityApproval(v: unknown): v is IdentityApproval {
  return object(v) && exact(v, ["worldId", "chatId", "offset", "guard", "reference", "expectedUpdatedAt", "enabled"]) && validIdentityRead({ worldId: v.worldId, chatId: v.chatId, offset: v.offset }) && validIdentityReference(v.reference) && (v.expectedUpdatedAt === null || offset(v.expectedUpdatedAt)) && typeof v.enabled === "boolean" && object(v.guard) && exact(v.guard, ["branchId", "headRevisionId", "selectionVersion", "revisionCount"]) && id(v.guard.branchId) && (v.guard.headRevisionId === null || id(v.guard.headRevisionId)) && offset(v.guard.selectionVersion) && offset(v.guard.revisionCount);
}
export function validIdentityPage(v: unknown): v is IdentityPage {
  if (!object(v) || !exact(v, ["worldId", "chatId", "offset", "guard", "paused", "total", "next", "rows"]) || !validIdentityRead({ worldId: v.worldId, chatId: v.chatId, offset: v.offset }) || !offset(v.offset) || typeof v.paused !== "boolean" || !offset(v.total) || !Array.isArray(v.rows) || v.rows.length > 40 || !v.rows.every(r => object(r) && exact(r, ["reference", "name", "inherited", "updatedAt", "status"]) && validIdentityReference(r.reference) && typeof r.name === "string" && r.name.length <= 80 && typeof r.inherited === "boolean" && (r.updatedAt === null || offset(r.updatedAt)) && ["active", "disabled", "changed", "ambiguous", "missing", "canonical"].includes(String(r.status)))) return false;
  return validIdentityApproval({ worldId: v.worldId, chatId: v.chatId, offset: v.offset, guard: v.guard, reference: { sourceId: "test", entityId: "test", alias: "test" }, expectedUpdatedAt: null, enabled: false }) && v.offset + v.rows.length <= v.total && (v.next === null ? v.offset + v.rows.length === v.total : offset(v.next) && v.next === v.offset + v.rows.length && v.next < v.total) && new Set(v.rows.map(r => identityKey(r.reference.entityId, r.reference.alias))).size === v.rows.length;
}

export function identityDecisions(records: StoryRecord[], applied: string[]) {
  const events = new Map(records.filter((e): e is StoryEvent => e.type === "event" && (!!e.characterIdentity || !!e.identityControl)).map(e => [e.id, e]));
  const result = new Map<string, boolean>();
  for (const eventId of applied) { const event = events.get(eventId), decision = event?.identityControl ?? (event?.characterIdentity ? { ...event.characterIdentity, enabled: true } : undefined); if (decision) result.set(identityKey(decision.entityId, decision.alias), decision.enabled); }
  return result;
}
export function identityReferences(baseline: StoryBaseline, records: StoryRecord[], applied: string[]) {
  const sources = new Map<string, { reference: IdentityReference; canonical: IdentityCanonical; inherited: boolean; merged?: boolean }>();
  for (const [entityId, seed] of Object.entries(baseline.identitySeeds ?? {})) for (const alias of seed.aliases) sources.set(identityKey(entityId, alias), { reference: { sourceId: baseline.id, entityId, alias }, canonical: seed.canonical, inherited: true });
  const events = new Map(records.filter((r): r is StoryEvent => r.type === "event" && !!r.characterIdentity).map(r => [r.id, r]));
  for (const eventId of applied) { const event = events.get(eventId); if (event?.characterIdentity) { const { entityId, alias, canonical } = event.characterIdentity; sources.set(identityKey(entityId, alias), { reference: { sourceId: event.id, entityId, alias }, canonical, inherited: false }); } }
  for (const m of storyMerges(records, applied, baseline.mergeSeeds)) for (const alias of m.merge.canonical.aliases) sources.set(identityKey(m.merge.mergedId, alias), { reference: { sourceId: m.inherited ? baseline.id : m.id, entityId: m.merge.mergedId, alias }, canonical: m.merge.canonical, inherited: m.inherited, merged: true });
  return [...sources.values()];
}
export function identityRows(raw: SceneEntity[], visible: SceneEntity[], baseline: StoryBaseline, records: StoryRecord[], applied: string[]): IdentityRow[] {
  const decisions = identityDecisions(records, applied);
  for (const [id, seed] of Object.entries(baseline.identitySeeds ?? {})) for (const n of seed.disabledAliases ?? []) if (!decisions.has(identityKey(id, n))) decisions.set(identityKey(id, n), false);
  for (const m of storyMerges(records, applied, baseline.mergeSeeds)) for (const n of m.merge.disabledAliases ?? []) if (!decisions.has(identityKey(m.merge.mergedId, n))) decisions.set(identityKey(m.merge.mergedId, n), false);
  return identityReferences(baseline, records, applied).map(source => {
    const p = raw.find(p => p.id === source.reference.entityId), view = visible.find(p => p.id === source.reference.entityId), key = identityKey(source.reference.entityId, source.reference.alias);
    const canonical = !!p && !source.merged && [p.name, ...p.aliases].some(n => identityName(n) === identityName(source.reference.alias));
    const status: IdentityRow["status"] = !p ? "missing" : canonical ? "canonical" : decisions.get(key) === false ? "disabled" : !sameStoryValue(identityCanonical(p), source.canonical) ? "changed" : !view?.aliases.some(n => identityName(n) === identityName(source.reference.alias)) ? "ambiguous" : "active";
    return { reference: source.reference, name: (p?.name ?? source.canonical.name).trim().slice(0, 80), inherited: source.inherited, updatedAt: p?.updatedAt ?? null, status };
  });
}
/** Only inherited/approved borrowed names can be controlled, never raw world aliases. */
export function identityControlSource(records: Map<string, StoryRecord>, baseline: StoryBaseline, control: IdentityControl) {
  const source = records.get(control.sourceId);
  return source?.id === baseline.id && source.type === "baseline" && (source.identitySeeds?.[control.entityId]?.aliases.includes(control.alias) || Object.values(source.mergeSeeds ?? {}).some(m => m.mergedId === control.entityId && m.canonical.aliases.includes(control.alias)))
    || source?.type === "event" && source.worldId === baseline.worldId && source.playthroughId === baseline.playthroughId && (source.characterIdentity?.entityId === control.entityId && source.characterIdentity.alias === control.alias || source.characterMerge?.mergedId === control.entityId && source.characterMerge.canonical.aliases.includes(control.alias));
}
export const controlledIdentityAliases = (entityId: string, aliases: string[], records: StoryRecord[], applied: string[]) => { const decisions = identityDecisions(records, applied); return aliases.filter(alias => decisions.get(identityKey(entityId, alias)) !== false); };
export function inheritedIdentitySeeds(seeds: IdentitySeeds, records: StoryRecord[], applied: string[]) {
  return Object.fromEntries(Object.entries(seeds).map(([id, seed]) => [id, { ...seed, aliases: controlledIdentityAliases(id, seed.aliases, records, applied) }]).filter(([, seed]) => (seed as { aliases: string[] }).aliases.length));
}
