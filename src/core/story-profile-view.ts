import type { SceneEntity, DataRecord } from "./types";
import { characterInChat } from "./characters";
import type { StoryRecord, StoryEvent } from "./story-records";
import type { ProfileValues } from "./character-profile";
import type { MergeSeeds } from "./story-character-merge";
import { storyIdentityEntities, type IdentitySeeds } from "./story-character-identity";
/** Compact runtime view includes all selected-story overlays, without full revision bodies. */
export const storyProfileRecords = (records: DataRecord[]): StoryRecord[] => records.filter(r => r.kind === "story").map(r => r.data as StoryRecord).filter(r => ["baseline", "branch", "projection"].includes(r.type) || r.type === "event" && (!!r.profileSupplement || !!r.characterIdentity || !!r.identityControl || !!r.characterMerge));
export const PROFILE_TEXT_FIELDS = ["appearance", "personality", "goals", "background"] as const;
export type ProfileFieldRevisions = Partial<Record<typeof PROFILE_TEXT_FIELDS[number], string>>;
export interface ProfileSeed { canonical: ProfileValues; versions: ProfileFieldRevisions; values: Partial<ProfileValues> }
export type ProfileSeeds = Record<string, ProfileSeed>;
export function validProfileSeeds(v: unknown): v is ProfileSeeds {
  const object = (s: unknown): s is Record<string, unknown> => !!s && typeof s === "object" && !Array.isArray(s);
  return object(v) && Object.entries(v).every(([id, seed]) => !!id && id === id.trim() && id.length <= 160 && !["__proto__", "prototype", "constructor"].includes(id)
    && object(seed) && Object.keys(seed).length === 3 && object(seed.canonical) && Object.keys(seed.canonical).length === 4 && PROFILE_TEXT_FIELDS.every(k => typeof (seed.canonical as Record<string, unknown>)[k] === "string" && ((seed.canonical as Record<string, unknown>)[k] as string).length <= 1200)
    && validProfileVersions(seed.versions) && object(seed.values) && Object.entries(seed.values).every(([k, s]) => PROFILE_TEXT_FIELDS.includes(k as typeof PROFILE_TEXT_FIELDS[number]) && typeof s === "string" && s.length <= 1200));
}
export function validProfileVersions(v: unknown): v is ProfileFieldRevisions {
  return !!v && typeof v === "object" && !Array.isArray(v) && Object.entries(v).every(([k, value]) => PROFILE_TEXT_FIELDS.includes(k as typeof PROFILE_TEXT_FIELDS[number]) && typeof value === "string" && /^[A-Za-z0-9_-]{1,120}$/u.test(value) && !["__proto__", "prototype", "constructor"].includes(value));
}
/** Selected-story overlays only: entity rows and other chats are untouched.
 * Canonical edits, including deliberate clearing, invalidate only their field. */
export function storyProfileEntities(entities: SceneEntity[], records: StoryRecord[], applied: string[], worldId: string, chatId: string, seeds: ProfileSeeds = {}, identitySeeds: IdentitySeeds = {}, mergeSeeds: MergeSeeds = {}): SceneEntity[] {
  const events = new Map(records.filter((e): e is StoryEvent => e.type === "event" && !!e.profileSupplement).map(e => [e.id, e]));
  const updates = new Map<string, StoryEvent[]>();
  for (const id of applied) { const e = events.get(id); if (e?.worldId === worldId && e.profileUpdate) updates.set(e.profileSupplement!.entityId, [...updates.get(e.profileSupplement!.entityId) ?? [], e]); }
  const profiles = entities.map(entity => {
    if (entity.worldId !== worldId || !entity.characterSheet || !characterInChat(entity, chatId) || !updates.has(entity.id) && !seeds[entity.id]) return entity;
    const sheet = { ...entity.characterSheet }; let changed = false;
    const values = [...(seeds[entity.id] ? [{ ...seeds[entity.id]!, profileUpdate: seeds[entity.id]!.values }] : []), ...(updates.get(entity.id) ?? []).map(e => ({ ...e.profileSupplement!, profileUpdate: e.profileUpdate! }))];
    for (const s of values) for (const k of PROFILE_TEXT_FIELDS) {
      const text = s.profileUpdate[k];
      if (text !== undefined && entity.characterSheet[k] === s.canonical[k] && (entity.profileFieldRevisions?.[k] ?? "") === (s.versions[k] ?? "")) { sheet[k] = text; changed ||= text !== entity.characterSheet[k]; }
    }
    return changed ? { ...entity, characterSheet: sheet } : entity;
  });
  return storyIdentityEntities(profiles, records, applied, worldId, chatId, identitySeeds, mergeSeeds);
}
export function currentStoryProfileEntities(entities: SceneEntity[], records: StoryRecord[], worldId: string, chatId: string, bindingId?: string) {
  const baselines = records.filter(r => r.type === "baseline" && r.worldId === worldId && r.origin.chatId === chatId && (!bindingId || r.origin.bindingId === bindingId) && records.some(b => b.type === "branch" && b.id === r.branchId && b.gameManaged));
  const baseline = baselines.length === 1 ? baselines[0] : undefined;
  const branch = baseline && records.find(r => r.type === "branch" && r.id === baseline.branchId);
  const p = branch?.type === "branch" ? records.find(r => r.type === "projection" && r.id === branch.projectionId) : undefined;
  return baseline?.type === "baseline" ? storyProfileEntities(entities, records, p?.type === "projection" ? p.appliedEventIds : [], worldId, chatId, baseline.profileSeeds, baseline.identitySeeds, baseline.mergeSeeds) : entities;
}
export function appendProfileText(before: string, addition: string) {
  const text = before.trim() ? before + "\n" + addition.trim() : addition.trim();
  if (text.length > 1200) throw Error("text-too-long");
  return text;
}
