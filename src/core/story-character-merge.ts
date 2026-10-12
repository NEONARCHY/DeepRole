import type { CharacterStatus, SceneEntity } from "./types";
import { characterInChat } from "./characters";
import type { StoryBaseline, StoryEvent, StoryRecord } from "./story-records";
import type { StoryReviewGuard } from "./story-review";
import { identityCanonical, validIdentityCanonical, type IdentityCanonical } from "./story-character-identity";
import { sameStoryValue } from "./story-value";
import { validCharacterStatus } from "./characters";
import { identityDecisions, identityKey } from "./story-identity-management";
export interface CharacterMerge { sourceIds: [string, string]; mergedId: string; canonical: IdentityCanonical; disabledAliases?: string[] }
export type MergeSeeds = Record<string, CharacterMerge>;
export interface MergeRead { worldId: string; chatId: string; query: string; offset: number; pair: [string, string] | null }
export interface MergeChoices { profile: "a" | "b"; state: "a" | "b"; incoming: "a" | "b"; name: string; aliases: string[]; protagonist: boolean }
export interface MergeApproval extends MergeRead { guard: StoryReviewGuard; versions: [number, number]; choices: MergeChoices }
export interface MergeUndo { worldId: string; chatId: string; query: string; offset: number; guard: StoryReviewGuard; eventId: string }
export interface MergePerson { id: string; name: string; updatedAt: number; profile: { appearance: string; personality: string; goals: string; background: string }; state: CharacterStatus; protagonist: boolean; images: boolean; aliases: string[] }
export interface MergePage extends MergeRead {
 guard: StoryReviewGuard; paused: boolean; people: { id: string; name: string; summary: string }[]; total: number; next: number | null;
 preview: { a: MergePerson; b: MergePerson; incomingConflicts: number } | null;
 merges: { id: string; name: string; sources: string[]; inherited: boolean; dropsLaterScenes: boolean }[];
}
export type MergeAction = { action: "read"; input: MergeRead } | { action: "approve"; input: MergeApproval } | { action: "undo"; input: MergeUndo };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const id = (v: unknown): v is string => typeof v === "string" && !!v && v === v.trim() && v.length <= 160 && !["__proto__", "constructor", "prototype"].includes(v);
const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const names = (v: unknown): v is string[] => Array.isArray(v) && v.every(n => typeof n === "string" && n.length > 0 && n.length <= 80 && n === n.trim());
const pair = (v: unknown): v is [string, string] => Array.isArray(v) && v.length === 2 && v.every(id) && v[0] !== v[1];
export const validCharacterMerge = (v: unknown): v is CharacterMerge => object(v) && Object.keys(v).every(k => ["sourceIds", "mergedId", "canonical", "disabledAliases"].includes(k)) && pair(v.sourceIds) && id(v.mergedId) && !v.sourceIds.includes(v.mergedId) && validIdentityCanonical(v.canonical) && v.canonical.name.length <= 80 && names(v.canonical.aliases) && (v.disabledAliases === undefined || names(v.disabledAliases) && v.disabledAliases.every(n => (v.canonical as IdentityCanonical).aliases.includes(n)));
export const validMergeSeeds = (v: unknown): v is MergeSeeds => object(v) && Object.entries(v).every(([key, value]) => id(key) && validCharacterMerge(value));
export const validMergeRead = (v: unknown): v is MergeRead => object(v) && exact(v, ["worldId", "chatId", "query", "offset", "pair"]) && id(v.worldId) && id(v.chatId) && typeof v.query === "string" && v.query.length <= 80 && count(v.offset) && (v.pair === null || pair(v.pair));
export const validMergeChoices = (v: unknown): v is MergeChoices => object(v) && exact(v, ["profile", "state", "incoming", "name", "aliases", "protagonist"]) && [v.profile, v.state, v.incoming].every(k => k === "a" || k === "b") && typeof v.name === "string" && v.name === v.name.trim() && !!v.name && v.name.length <= 80 && names(v.aliases) && typeof v.protagonist === "boolean";
const guard = (v: unknown): v is StoryReviewGuard => object(v) && exact(v, ["branchId", "headRevisionId", "selectionVersion", "revisionCount"]) && id(v.branchId) && (v.headRevisionId === null || id(v.headRevisionId)) && count(v.selectionVersion) && count(v.revisionCount);
export const validMergeApproval = (v: unknown): v is MergeApproval => object(v) && exact(v, ["worldId", "chatId", "query", "offset", "pair", "guard", "versions", "choices"]) && validMergeRead({ worldId: v.worldId, chatId: v.chatId, query: v.query, offset: v.offset, pair: v.pair }) && v.pair !== null && guard(v.guard) && Array.isArray(v.versions) && v.versions.length === 2 && v.versions.every(count) && validMergeChoices(v.choices);
export const validMergeUndo = (v: unknown): v is MergeUndo => object(v) && exact(v, ["worldId", "chatId", "query", "offset", "guard", "eventId"]) && validMergeRead({ worldId: v.worldId, chatId: v.chatId, query: v.query, offset: v.offset, pair: null }) && guard(v.guard) && id(v.eventId);
export function validMergePage(v: unknown): v is MergePage {
 if (!object(v) || !exact(v, ["worldId", "chatId", "query", "offset", "pair", "guard", "paused", "people", "total", "next", "preview", "merges"]) || !validMergeRead({ worldId: v.worldId, chatId: v.chatId, query: v.query, offset: v.offset, pair: v.pair }) || !count(v.offset) || !guard(v.guard) || typeof v.paused !== "boolean" || !count(v.total) || !Array.isArray(v.people) || v.people.length > 40 || !v.people.every(p => object(p) && exact(p, ["id", "name", "summary"]) && id(p.id) && typeof p.name === "string" && typeof p.summary === "string") || !Array.isArray(v.merges) || !v.merges.every(m => object(m) && exact(m, ["id", "name", "sources", "inherited", "dropsLaterScenes"]) && id(m.id) && typeof m.name === "string" && Array.isArray(m.sources) && m.sources.length === 2 && m.sources.every(s => typeof s === "string") && typeof m.inherited === "boolean" && typeof m.dropsLaterScenes === "boolean")) return false;
 const person = (p: unknown) => object(p) && exact(p, ["id", "name", "updatedAt", "profile", "state", "protagonist", "images", "aliases"]) && id(p.id) && typeof p.name === "string" && count(p.updatedAt) && object(p.profile) && exact(p.profile, ["appearance", "personality", "goals", "background"]) && Object.values(p.profile).every(s => typeof s === "string") && validCharacterStatus(p.state) && typeof p.protagonist === "boolean" && typeof p.images === "boolean" && Array.isArray(p.aliases) && p.aliases.every(s => typeof s === "string");
 return (v.preview === null || object(v.preview) && exact(v.preview, ["a", "b", "incomingConflicts"]) && person(v.preview.a) && person(v.preview.b) && count(v.preview.incomingConflicts)) && v.offset + v.people.length <= v.total && (v.next === null ? v.offset + v.people.length === v.total : count(v.next) && v.next === v.offset + v.people.length && v.next < v.total) && new Set(v.people.map(p => p.id)).size === v.people.length;
}
export function storyMerges(records: StoryRecord[], applied: string[], seeds: MergeSeeds = {}) {
 const events = new Map(records.filter((e): e is StoryEvent => e.type === "event" && !!e.characterMerge).map(e => [e.id, e]));
 return [...Object.entries(seeds).map(([id, merge]) => ({ id, merge, inherited: true, revisionId: null as string | null })), ...applied.flatMap(id => { const e = events.get(id); return e?.characterMerge ? [{ id, merge: e.characterMerge, inherited: false, revisionId: e.revisionId }] : []; })];
}
export function currentMergeSeeds(records: StoryRecord[], worldId: string, chatId: string, bindingId: string): MergeSeeds {
 const baseline = records.find((r): r is StoryBaseline => r.type === "baseline" && r.worldId === worldId && r.origin.chatId === chatId && r.origin.bindingId === bindingId);
 const branch = baseline ? records.find(r => r.id === baseline.branchId) : undefined, projection = branch?.type === "branch" ? records.find(r => r.id === branch.projectionId) : undefined;
 if (!baseline || projection?.type !== "projection") return {};
 const decisions = identityDecisions(records, projection.appliedEventIds);
 return Object.fromEntries(storyMerges(records, projection.appliedEventIds, baseline.mergeSeeds).map(r => [r.id, { ...r.merge, disabledAliases: r.merge.canonical.aliases.filter(n => decisions.get(identityKey(r.merge.mergedId, n)) === false || !decisions.has(identityKey(r.merge.mergedId, n)) && r.merge.disabledAliases?.includes(n)) }]));
}
export function mergedStoryEntities(entities: SceneEntity[], records: StoryRecord[], applied: string[], worldId: string, chatId: string, seeds: MergeSeeds = {}): SceneEntity[] {
 const merges = storyMerges(records, applied, seeds);
 const active = new Set(merges.map(m => m.merge.mergedId));
 const known = new Set(records.flatMap(e => e.type === "event" && e.worldId === worldId && e.characterMerge ? [e.characterMerge.mergedId] : e.type === "baseline" && e.worldId === worldId ? Object.values(e.mergeSeeds ?? {}).map(m => m.mergedId) : []));
 if (!merges.length && !known.size) return entities;
  const present = new Set(entities.filter(p => p.worldId === worldId && characterInChat(p, chatId)).map(p => p.id));
 const hidden = new Set([...merges.flatMap(({ merge }) => present.has(merge.mergedId) ? merge.sourceIds : []), ...[...known].filter(id => !active.has(id))]);
 return entities.filter(p => p.worldId !== worldId || !hidden.has(p.id));
}
export const localMergeProfile = (id: string, records: StoryRecord[]) => records.some(e => e.type === "event" && e.characterMerge?.mergedId === id || e.type === "baseline" && Object.values(e.mergeSeeds ?? {}).some(m => m.mergedId === id));
export const mergeCanonicalMatches = (entity: SceneEntity, merge: CharacterMerge) => sameStoryValue(identityCanonical(entity), merge.canonical);
