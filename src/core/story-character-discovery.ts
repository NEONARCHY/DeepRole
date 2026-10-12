import { validStoryReviewGuard, type StoryReviewGuard } from "./story-review";
import { validNativeStoryId } from "./story-transport";
import { mentionsCharacter } from "./character-context";
import { validDiscoveryProfile, validDiscoveryValues, type DiscoveryProfile } from "./discovery-profile";
import type { ProfileValues } from "./character-profile";

/** Per-request bounds, never a limit on saved characters or history. */
export const DISCOVERY_CHUNK = 12000;
export const DISCOVERY_OVERLAP = 1000;
export const DISCOVERY_PAGE = 20;
export interface CharacterCandidate { name: string; quote: string; dismissed: boolean }
export interface CharacterDiscoveryProgress { offset: number; request: { id: string; status: "requested" | "done" | "failed" | "cancelled"; end: number; at: number } }
export interface CharacterDiscoveryScope { worldId: string; chatId: string }
export interface CharacterDiscoveryInput extends CharacterDiscoveryScope { guard: StoryReviewGuard }
export interface CharacterDiscoveryRead extends CharacterDiscoveryScope { offset: number; guard?: StoryReviewGuard }
export interface CharacterDiscoveryApproval extends CharacterDiscoveryInput { eventId: string; name: string; background: string; accept: boolean; values?: ProfileValues }
export interface DiscoveryProfileInput extends CharacterDiscoveryInput { eventId: string; name: string; values: ProfileValues }
export interface CharacterDiscoveryPage extends CharacterDiscoveryInput {
  sources: number; completed: number; remaining: number; total: number; offset: number; next: number | null;
  candidates: { eventId: string; name: string; quote: string; background: string; added: boolean; profile?: DiscoveryProfile }[];
}
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, names: string[]) => Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k));
const num = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const name = (v: unknown): v is string => typeof v === "string" && !!v.trim() && v === v.trim() && v.length <= 80 && !["__proto__", "prototype", "constructor"].includes(v);
export const discoveryName = (v: string) => v.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase();
export function validCharacterCandidate(v: unknown): v is CharacterCandidate {
  return obj(v) && keys(v, ["name", "quote", "dismissed"]) && name(v.name) && typeof v.quote === "string" && !!v.quote.trim() && v.quote.length <= 1000 && mentionsCharacter(v.quote, { name: v.name, aliases: [] }) && typeof v.dismissed === "boolean";
}
export function validCharacterDiscoveryProgress(v: unknown): v is CharacterDiscoveryProgress {
  return obj(v) && keys(v, ["offset", "request"]) && num(v.offset) && v.offset <= 250000 && obj(v.request) && keys(v.request, ["id", "status", "end", "at"])
    && validNativeStoryId(v.request.id) && v.request.id.startsWith("discover_") && ["requested", "done", "failed", "cancelled"].includes(String(v.request.status))
    && num(v.request.end) && v.request.end >= v.offset && v.request.end <= 250000 && num(v.request.at);
}
const scope = (v: Record<string, unknown>) => validNativeStoryId(v.worldId) && validNativeStoryId(v.chatId);
export const validCharacterDiscoveryInput = (v: unknown): v is CharacterDiscoveryInput => obj(v) && keys(v, ["worldId", "chatId", "guard"]) && scope(v) && validStoryReviewGuard(v.guard);
export const validCharacterDiscoveryRead = (v: unknown): v is CharacterDiscoveryRead => obj(v) && keys(v, ["worldId", "chatId", "offset", ...(Object.hasOwn(v, "guard") ? ["guard"] : [])]) && scope(v) && num(v.offset) && (v.guard === undefined || validStoryReviewGuard(v.guard)) && (v.offset === 0 || v.guard !== undefined);
export const validCharacterDiscoveryApproval = (v: unknown): v is CharacterDiscoveryApproval => obj(v) && keys(v, ["worldId", "chatId", "guard", "eventId", "name", "background", "accept", ...(Object.hasOwn(v, "values") ? ["values"] : [])]) && scope(v) && validStoryReviewGuard(v.guard) && validNativeStoryId(v.eventId) && name(v.name) && typeof v.background === "string" && v.background.length <= 1600 && typeof v.accept === "boolean" && (v.values === undefined || validDiscoveryValues(v.values) && v.values.background === v.background);
export const validDiscoveryProfileInput = (v: unknown): v is DiscoveryProfileInput => obj(v) && keys(v, ["worldId", "chatId", "guard", "eventId", "name", "values"]) && scope(v) && validStoryReviewGuard(v.guard) && validNativeStoryId(v.eventId) && name(v.name) && validDiscoveryValues(v.values);
export function validCharacterDiscoveryPage(v: unknown): v is CharacterDiscoveryPage {
  if (!obj(v) || !keys(v, ["worldId", "chatId", "guard", "sources", "completed", "remaining", "total", "offset", "next", "candidates"]) || !scope(v) || !validStoryReviewGuard(v.guard) || !num(v.sources) || !num(v.completed) || !num(v.remaining) || !num(v.total) || !num(v.offset) || v.completed + v.remaining !== v.sources || !Array.isArray(v.candidates) || v.candidates.length > DISCOVERY_PAGE) return false;
  return v.candidates.every(c => obj(c) && keys(c, ["eventId", "name", "quote", "background", "added", ...(Object.hasOwn(c, "profile") ? ["profile"] : [])]) && validNativeStoryId(c.eventId) && name(c.name) && typeof c.quote === "string" && !!c.quote.trim() && c.quote.length <= 1000 && typeof c.background === "string" && c.background.length <= 1600 && typeof c.added === "boolean" && (c.profile === undefined || validDiscoveryProfile(c.profile)))
    && new Set(v.candidates.map(c => c.eventId)).size === v.candidates.length && v.offset + v.candidates.length <= v.total
    && (v.next === null ? v.offset + v.candidates.length === v.total : num(v.next) && v.next === v.offset + v.candidates.length && v.next < v.total);
}
export type CharacterDiscoveryAction = { action: "read"; input: CharacterDiscoveryRead } | { action: "run"; input: CharacterDiscoveryInput } | { action: "profile"; input: DiscoveryProfileInput } | { action: "approve"; input: CharacterDiscoveryApproval } | { action: "cancel"; input: CharacterDiscoveryScope };
export function parseDiscoveryReply(raw: string, id: string, sources: { id: string; text: string }[]) {
  if (typeof raw !== "string" || raw.length > 64000) throw Error("invalid-result");
  let v: unknown; try { v = JSON.parse(raw.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/u, "$1")); } catch { throw Error("invalid-result"); }
  if (!obj(v) || !keys(v, ["requestId", "people", "more"]) || v.requestId !== id || !Array.isArray(v.people) || v.people.length > 32 || typeof v.more !== "boolean") throw Error("invalid-result");
  const people = v.people.map(p => {
    if (!obj(p) || !keys(p, ["source", "name", "quote"]) || !name(p.name) || typeof p.quote !== "string" || !p.quote.trim() || p.quote.length > 1000) throw Error("invalid-result");
    if (!sources.some(s => s.id === p.source && s.text.includes(p.quote as string)) || !mentionsCharacter(p.quote, { name: p.name, aliases: [] })) throw Error("invalid-evidence");
    return { source: p.source as string, name: p.name, quote: p.quote };
  });
  return { people, more: v.more };
}
