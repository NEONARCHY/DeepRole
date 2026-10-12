import { validStorySnapshot, type StorySnapshot } from "./story-records";
import { validNativeStoryId, validNativeStoryKey } from "./story-transport";

export interface StoryCheckpointScope { chatId: string; worldId: string }
export interface StoryCheckpointChoice extends StoryCheckpointScope {
  bindingId: string;
  requestId: string;
  expectedSceneRevision: string | null;
  expectedSnapshot: StorySnapshot;
}
export interface StoryCheckpointReview extends StoryCheckpointScope {
  bindingId: string;
  worldName: string;
  sceneRevision: string | null;
  snapshot: StorySnapshot;
  /** Recent source receipts, not a reconstructed timeline or inferred local selection. */
  candidates: { requestId: string; observedAt: number; draft: string; answer: string; serverSelection: "anchor" | "ancestor" | "different" | "unknown" }[];
  availableCount: number;
  checkpoint: { branchId: string; anchorKey: string | null; createdAt: number } | null;
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, fields: string[]) => Object.keys(v).length === fields.length && fields.every(f => Object.hasOwn(v, f));
const id = (v: unknown): v is string => typeof v === "string" && !!v && v.length <= 160 && v === v.trim() && !["__proto__", "prototype", "constructor"].includes(v);
const time = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
export const validStoryCheckpointScope = (v: unknown): v is StoryCheckpointScope => object(v) && exact(v, ["chatId", "worldId"]) && validNativeStoryId(v.chatId) && id(v.worldId);
export const validStoryCheckpointChoice = (v: unknown): v is StoryCheckpointChoice => object(v) && exact(v, ["chatId", "worldId", "bindingId", "requestId", "expectedSceneRevision", "expectedSnapshot"])
  && validNativeStoryId(v.chatId) && id(v.worldId) && id(v.bindingId) && id(v.requestId) && (v.expectedSceneRevision === null || id(v.expectedSceneRevision)) && validStorySnapshot(v.expectedSnapshot);
export function validStoryCheckpointReview(v: unknown): v is StoryCheckpointReview {
  if (!object(v) || !exact(v, ["chatId", "worldId", "bindingId", "worldName", "sceneRevision", "snapshot", "candidates", "availableCount", "checkpoint"])
    || !validNativeStoryId(v.chatId) || !id(v.worldId) || !id(v.bindingId) || typeof v.worldName !== "string" || (v.sceneRevision !== null && !id(v.sceneRevision))
    || !validStorySnapshot(v.snapshot) || !Number.isSafeInteger(v.availableCount) || (v.availableCount as number) < 0 || !Array.isArray(v.candidates) || v.candidates.length > 8 || v.candidates.length > (v.availableCount as number)) return false;
  if (!v.candidates.every(c => object(c) && exact(c, ["requestId", "observedAt", "draft", "answer", "serverSelection"]) && id(c.requestId) && time(c.observedAt)
    && typeof c.draft === "string" && c.draft.length <= 100_000 && typeof c.answer === "string" && c.answer.length <= 250_000 && ["anchor", "ancestor", "different", "unknown"].includes(String(c.serverSelection)))) return false;
  if (new Set(v.candidates.map(c => c.requestId)).size !== v.candidates.length) return false;
  return v.checkpoint === null || object(v.checkpoint) && exact(v.checkpoint, ["branchId", "anchorKey", "createdAt"]) && id(v.checkpoint.branchId)
    && (v.checkpoint.anchorKey === null || validNativeStoryKey(v.checkpoint.anchorKey)) && time(v.checkpoint.createdAt);
}
