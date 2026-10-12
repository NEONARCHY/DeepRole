import { validNativeStoryId } from "./story-transport";
import { validStoryAutomationDecision } from "./story-automation";
import { validStorySnapshot, type StorySnapshot } from "./story-records";
import { validStoryCheckpointScope, type StoryCheckpointScope } from "./story-checkpoint";
import { validStoryFact, validStoryUpdateDiagnostic, type StoryFact, type StoryUpdateDiagnostic } from "./story-update";

/** Read-only guards, never authority to select a story or approve events. */
export interface StoryReviewGuard { branchId: string; headRevisionId: string | null; selectionVersion: number; revisionCount: number }
export interface StoryReviewCursor extends StoryReviewGuard { offset: number }
export interface StoryReviewInput extends StoryCheckpointScope { cursor: StoryReviewCursor | null }
export interface StoryPreviewInput extends StoryCheckpointScope { guard: StoryReviewGuard; headRevisionId: string | null }
export interface StoryReviewPage extends StoryCheckpointScope {
  bindingId: string; worldName: string; baselineAt: number | null;
  guard: StoryReviewGuard | null; offset: number;
  entries: { id: string; role: "user" | "assistant"; completion: "complete" | "partial" | "interrupted";
    content: string; parentExcerpt: string | null; observedAt: number; selected: boolean; candidateCount: number; appliedCount: number }[];
  next: StoryReviewCursor | null;
  managed?: boolean;
  paused?: boolean;
  nextOutOfCharacter?: boolean;
  facts?: (StoryFact & { eventId: string; accepted: boolean; edited: boolean; superseded?: true; automation?: import("./story-automation").StoryAutomationDecision })[];
  update?: StoryUpdateDiagnostic;
  currentRevisionId?: string;
  repair?: { id: string; status: "requested" | "done" | "failed" | "cancelled"; at: number; cleanup?: "pending" | "done" | "failed" };
}
export interface StoryReviewPreview extends StoryCheckpointScope {
  guard: StoryReviewGuard; headRevisionId: string | null;
  snapshot: StorySnapshot; addedEvents: number; removedEvents: number; manualConflict: boolean;
}
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const id = (v: unknown): v is string => typeof v === "string" && !!v && v.length <= 160 && v === v.trim() && !["__proto__", "prototype", "constructor"].includes(v);
const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
export const validStoryReviewGuard = (v: unknown): v is StoryReviewGuard => obj(v) && exact(v, ["branchId", "headRevisionId", "selectionVersion", "revisionCount"])
  && id(v.branchId) && (v.headRevisionId === null || id(v.headRevisionId)) && count(v.selectionVersion) && count(v.revisionCount);
export const validStoryReviewCursor = (v: unknown): v is StoryReviewCursor => obj(v) && exact(v, ["branchId", "headRevisionId", "selectionVersion", "revisionCount", "offset"])
  && validStoryReviewGuard({ branchId: v.branchId, headRevisionId: v.headRevisionId, selectionVersion: v.selectionVersion, revisionCount: v.revisionCount }) && count(v.offset) && (v.offset as number) > 0 && (v.offset as number) < (v.revisionCount as number);
export const validStoryReviewInput = (v: unknown): v is StoryReviewInput => obj(v) && exact(v, ["chatId", "worldId", "cursor"])
  && validStoryCheckpointScope({ chatId: v.chatId, worldId: v.worldId }) && (v.cursor === null || validStoryReviewCursor(v.cursor));
export const validStoryPreviewInput = (v: unknown): v is StoryPreviewInput => obj(v) && exact(v, ["chatId", "worldId", "guard", "headRevisionId"])
  && validStoryCheckpointScope({ chatId: v.chatId, worldId: v.worldId }) && validStoryReviewGuard(v.guard) && (v.headRevisionId === null || id(v.headRevisionId));
export function validStoryReviewPage(v: unknown): v is StoryReviewPage {
  if (!obj(v) || !exact(v, ["chatId", "worldId", "bindingId", "worldName", "baselineAt", "guard", "offset", "entries", "next", ...["managed", "paused", "nextOutOfCharacter", "facts", "update", "currentRevisionId", "repair"].filter(k => Object.hasOwn(v, k))]) || ["managed", "paused", "nextOutOfCharacter"].some(k => v[k] !== undefined && typeof v[k] !== "boolean")
    || !validNativeStoryId(v.chatId) || !id(v.worldId) || !id(v.bindingId) || typeof v.worldName !== "string" || !count(v.offset)
    || !Array.isArray(v.entries) || v.entries.length > 8 || v.baselineAt !== null && (typeof v.baselineAt !== "number" || !Number.isFinite(v.baselineAt) || v.baselineAt < 0)) return false;
  if (v.facts !== undefined && (!Array.isArray(v.facts) || v.facts.length > 24 || !v.facts.every(f => obj(f) && exact(f, ["text", "kind", "quote", "eventId", "accepted", "edited", ...["claim", "automation", "superseded"].filter(k => Object.hasOwn(f, k))]) && validStoryFact({ text: f.text, kind: f.kind, quote: f.quote, ...(f.claim !== undefined ? { claim: f.claim } : {}) }) && (f.automation === undefined || validStoryAutomationDecision(f.automation)) && (f.superseded === undefined || f.superseded === true) && id(f.eventId) && typeof f.accepted === "boolean" && typeof f.edited === "boolean"))) return false;
  if (v.update !== undefined && !validStoryUpdateDiagnostic(v.update) || v.currentRevisionId !== undefined && !id(v.currentRevisionId)) return false;
  if (v.repair !== undefined && (!obj(v.repair) || !exact(v.repair, ["id", "status", "at", ...(Object.hasOwn(v.repair, "cleanup") ? ["cleanup"] : [])]) || !id(v.repair.id) || !["requested", "done", "failed", "cancelled"].includes(String(v.repair.status)) || !count(v.repair.at) || v.repair.cleanup !== undefined && !["pending", "done", "failed"].includes(String(v.repair.cleanup)))) return false;
  if (!v.entries.every(e => obj(e) && exact(e, ["id", "role", "completion", "content", "parentExcerpt", "observedAt", "selected", "candidateCount", "appliedCount"])
    && id(e.id) && ["user", "assistant"].includes(String(e.role)) && ["complete", "partial", "interrupted"].includes(String(e.completion))
    && typeof e.content === "string" && e.content.length <= 250_000 && (e.parentExcerpt === null || typeof e.parentExcerpt === "string" && e.parentExcerpt.length <= 140)
    && typeof e.observedAt === "number" && Number.isFinite(e.observedAt) && e.observedAt >= 0 && typeof e.selected === "boolean" && count(e.candidateCount) && count(e.appliedCount) && e.appliedCount <= e.candidateCount)) return false;
  if (new Set(v.entries.map(e => e.id)).size !== v.entries.length) return false;
  if (v.guard === null) return v.baselineAt === null && v.offset === 0 && v.entries.length === 0 && v.next === null;
  if (!validStoryReviewGuard(v.guard) || v.baselineAt === null || v.offset + v.entries.length > v.guard.revisionCount) return false;
  return v.next === null ? v.offset + v.entries.length === v.guard.revisionCount : validStoryReviewCursor(v.next)
    && v.next.branchId === v.guard.branchId && v.next.headRevisionId === v.guard.headRevisionId && v.next.selectionVersion === v.guard.selectionVersion
    && v.next.revisionCount === v.guard.revisionCount && v.entries.length > 0 && v.next.offset === v.offset + v.entries.length;
}
export const validStoryReviewPreview = (v: unknown): v is StoryReviewPreview => obj(v) && exact(v, ["chatId", "worldId", "guard", "headRevisionId", "snapshot", "addedEvents", "removedEvents", "manualConflict"])
  && validNativeStoryId(v.chatId) && id(v.worldId) && validStoryReviewGuard(v.guard) && (v.headRevisionId === null || id(v.headRevisionId))
  && validStorySnapshot(v.snapshot) && count(v.addedEvents) && count(v.removedEvents) && typeof v.manualConflict === "boolean";
