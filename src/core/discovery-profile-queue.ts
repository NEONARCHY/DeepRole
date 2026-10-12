import { validDiscoveryValues } from "./discovery-profile";
import type { ProfileValues } from "./character-profile";
import { validStoryReviewGuard, type StoryReviewGuard } from "./story-review";
import { validNativeStoryId } from "./story-transport";

/** Durable work, not permission to create an entity or resend an interrupted request. */
export interface DiscoveryProfileTask {
  id: string; guard: StoryReviewGuard; name: string; values: ProfileValues;
  status: "pending" | "preparing" | "ready" | "failed"; requestId: string | null;
}
export interface DiscoveryQueueInput {
  worldId: string; chatId: string; guard: StoryReviewGuard;
  operation: "enqueue" | "resume" | "clear";
  items: { eventId: string; name: string; values: ProfileValues }[];
}
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const name = (v: unknown): v is string => typeof v === "string" && v === v.trim() && !!v && v.length <= 80 && !["__proto__", "prototype", "constructor"].includes(v);
export const validProfileQueueId = (v: unknown): v is string => typeof v === "string" && /^profilequeue_[0-9a-f-]{36}$/u.test(v);
export function validDiscoveryProfileTask(v: unknown): v is DiscoveryProfileTask {
  return obj(v) && exact(v, ["id", "guard", "name", "values", "status", "requestId"]) && validProfileQueueId(v.id) && validStoryReviewGuard(v.guard) && !!v.guard.headRevisionId
    && name(v.name) && validDiscoveryValues(v.values) && ["pending", "preparing", "ready", "failed"].includes(String(v.status))
    && (v.requestId === null ? v.status === "pending" : typeof v.requestId === "string" && /^field_[0-9a-f-]{36}$/u.test(v.requestId) && v.status !== "pending");
}
export function validDiscoveryQueueInput(v: unknown): v is DiscoveryQueueInput {
  return obj(v) && exact(v, ["worldId", "chatId", "guard", "operation", "items"]) && validNativeStoryId(v.worldId) && validNativeStoryId(v.chatId) && validStoryReviewGuard(v.guard)
    && ["enqueue", "resume", "clear"].includes(String(v.operation)) && Array.isArray(v.items)
    // A bounded transport page; a saved queue can contain any number of pages.
    && (v.operation === "enqueue" ? v.items.length > 0 && v.items.length <= 20 : v.items.length === 0)
    && v.items.every(i => obj(i) && exact(i, ["eventId", "name", "values"]) && validNativeStoryId(i.eventId) && name(i.name) && validDiscoveryValues(i.values))
    && new Set(v.items.map(i => i.eventId)).size === v.items.length;
}
