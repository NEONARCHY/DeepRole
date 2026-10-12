import { PROFILE_FIELDS, type ProfileValues, type ProfileField } from "./character-profile";
import { validDiscoveryProfile, type DiscoveryProfile } from "./discovery-profile";
import { validNativeStoryId } from "./story-transport";
import { validStoryReviewGuard, type StoryReviewGuard } from "./story-review";
import { validProfileVersions } from "./story-profile-view";
export { validProfileVersions, storyProfileEntities, currentStoryProfileEntities, storyProfileRecords, appendProfileText } from "./story-profile-view";
import type { ProfileFieldRevisions } from "./story-profile-view";
export type { ProfileFieldRevisions } from "./story-profile-view";

export interface ProfileSupplement { entityId: string; canonical: ProfileValues; versions: ProfileFieldRevisions; profile: DiscoveryProfile }
export interface SupplementScope { worldId: string; chatId: string }
export interface SupplementInput extends SupplementScope { guard: StoryReviewGuard; entityId: string }
export interface SupplementRead extends SupplementScope { query: string; offset: number; entityId: string | null; guard?: StoryReviewGuard }
export interface SupplementApproval extends SupplementScope { guard: StoryReviewGuard; eventId: string; additions: Partial<ProfileValues>; accept: boolean }
export interface SupplementPage extends SupplementScope {
  guard: StoryReviewGuard; query: string; offset: number; total: number; next: number | null;
  people: { id: string; name: string }[];
  target: { id: string; name: string; values: ProfileValues; suggestions: { eventId: string; supplement: ProfileSupplement; accepted: boolean }[] } | null;
  result?: { applied: number; skipped: ProfileField[] };
}
export type SupplementAction = { action: "read"; input: SupplementRead } | { action: "prepare"; input: SupplementInput } | { action: "approve"; input: SupplementApproval } | { action: "cancel"; input: SupplementScope };
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, k: string[]) => Object.keys(v).length === k.length && k.every(key => Object.hasOwn(v, key));
const number = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const scope = (v: Record<string, unknown>) => validNativeStoryId(v.worldId) && validNativeStoryId(v.chatId);
const localId = (v: unknown): v is string => typeof v === "string" && !!v && v === v.trim() && v.length <= 160 && !["__proto__", "prototype", "constructor"].includes(v);
export function validProfileValues(v: unknown): v is ProfileValues { return obj(v) && keys(v, [...PROFILE_FIELDS]) && PROFILE_FIELDS.every(k => typeof v[k] === "string" && (v[k] as string).length <= 1200); }
export function validProfileAdditions(v: unknown, empty = false): v is Partial<ProfileValues> { return obj(v) && (empty || Object.keys(v).length > 0) && Object.entries(v).every(([k, s]) => PROFILE_FIELDS.includes(k as ProfileField) && typeof s === "string" && !!s.trim() && s.length <= 1200); }
export function validProfileSupplement(v: unknown): v is ProfileSupplement { return obj(v) && keys(v, ["entityId", "canonical", "versions", "profile"]) && localId(v.entityId) && validProfileValues(v.canonical) && validProfileVersions(v.versions) && validDiscoveryProfile(v.profile) && validProfileValues(v.profile.values); }
export const validSupplementInput = (v: unknown): v is SupplementInput => obj(v) && keys(v, ["worldId", "chatId", "guard", "entityId"]) && scope(v) && validStoryReviewGuard(v.guard) && localId(v.entityId);
export const validSupplementRead = (v: unknown): v is SupplementRead => obj(v) && keys(v, ["worldId", "chatId", "query", "offset", "entityId", ...(Object.hasOwn(v, "guard") ? ["guard"] : [])]) && scope(v) && typeof v.query === "string" && v.query.length <= 80 && number(v.offset) && (v.entityId === null || localId(v.entityId)) && (v.guard === undefined || validStoryReviewGuard(v.guard)) && (v.offset === 0 || v.guard !== undefined);
export const validSupplementApproval = (v: unknown): v is SupplementApproval => obj(v) && keys(v, ["worldId", "chatId", "guard", "eventId", "additions", "accept"]) && scope(v) && validStoryReviewGuard(v.guard) && localId(v.eventId) && typeof v.accept === "boolean" && validProfileAdditions(v.additions, !v.accept);
export function validSupplementPage(v: unknown): v is SupplementPage {
  if (!obj(v) || !keys(v, ["worldId", "chatId", "guard", "query", "offset", "total", "next", "people", "target", ...(Object.hasOwn(v, "result") ? ["result"] : [])]) || !scope(v) || !validStoryReviewGuard(v.guard) || typeof v.query !== "string" || v.query.length > 80 || !number(v.offset) || !number(v.total) || !Array.isArray(v.people) || v.people.length > 40 || !v.people.every(p => obj(p) && keys(p, ["id", "name"]) && localId(p.id) && typeof p.name === "string" && !!p.name.trim() && p.name.length <= 80) || new Set(v.people.map(p => p.id)).size !== v.people.length || v.offset + v.people.length > v.total || (v.next === null ? v.offset + v.people.length !== v.total : !number(v.next) || v.next !== v.offset + v.people.length || v.next >= v.total)) return false;
  const t = v.target;
  if (t !== null && (!obj(t) || !keys(t, ["id", "name", "values", "suggestions"]) || !localId(t.id) || typeof t.name !== "string" || !t.name.trim() || t.name.length > 80 || !validProfileValues(t.values) || !Array.isArray(t.suggestions) || t.suggestions.length > 10 || !t.suggestions.every(s => obj(s) && keys(s, ["eventId", "supplement", "accepted"]) && localId(s.eventId) && validProfileSupplement(s.supplement) && s.supplement.entityId === t.id && typeof s.accepted === "boolean"))) return false;
  return v.result === undefined || obj(v.result) && keys(v.result, ["applied", "skipped"]) && number(v.result.applied) && v.result.applied <= 4 && Array.isArray(v.result.skipped) && new Set(v.result.skipped).size === v.result.skipped.length && v.result.skipped.every(k => PROFILE_FIELDS.includes(k));
}
