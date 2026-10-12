import { assertStoryGraph, type StoryBaseline, type StoryBranch, type StoryRecord, type StoryRequest } from "../core/story-records";
import type { StoryDispatchCapture } from "../core/story-dispatch-capture";
import type { ChatBinding, DataRecord } from "../core/types";
import { planStoryRequest } from "./story-requests";

/** An optional pre-send observation route, not automatic selection or effect authority.
 * Unknown/unselected parents stay in the source journal. No post-hoc preparation. */
export function planDispatchStoryRequest(all: DataRecord[], capture: StoryDispatchCapture): DataRecord[] {
  if (capture.purpose !== "user-turn" || capture.transport !== "xhr" || capture.origin !== "local" || !capture.worldId || capture.originalDraft.trimStart().startsWith("[DeepRole Service]") || capture.originalDraft.includes("<deeprole_character_mode>")) return [];
  const records = all.filter(r => r.kind === "story").map(r => r.data as StoryRecord);
  const baselines = records.filter((r): r is StoryBaseline => r.type === "baseline" && r.worldId === capture.worldId && r.origin.bindingId === capture.bindingId && r.origin.chatId === capture.identity.chatId && r.origin.nativeAnchor !== undefined);
  if (baselines.length !== 1 || all.filter(r => r.kind === "binding" && (r.data as ChatBinding).chatId === capture.identity.chatId).length !== 1) return [];
  assertStoryGraph(all);
  if (records.some(r => r.id === capture.id)) throw Error("dispatch-story-conflict");
  const baseline = baselines[0]!, branch = records.find(r => r.id === baseline.branchId) as StoryBranch;
  // The unified game writer reads canonical native history, including edits and
  // regenerations. Do not prepare a second competing exchange writer for it.
  if (branch.gameManaged) return [];
  if (branch.parentBranchId !== null) return [];
  const head = records.find(r => r.id === branch.headRevisionId);
  if (head && (head.type !== "revision" || head.role !== "assistant" || head.completion !== "complete")) return [];
  if (capture.identity.nativeParentKey !== (head?.type === "revision" ? head.nativeMessageKey : baseline.origin.nativeAnchor!.nativeMessageKey)) return [];
  try {
    return planStoryRequest(all, branch.id, { id: capture.id, purpose: "user-turn", bindingId: capture.bindingId, identity: capture.identity,
      parentRevisionId: branch.headRevisionId, expectedHeadRevisionId: branch.headRevisionId, expectedSelectionVersion: branch.selectionVersion, expectedSceneRevision: capture.sceneRevision }).records;
  } catch (error) {
    // A newer manual/legacy scene is not permission to rewrite the frozen checkpoint.
    if (error instanceof Error && error.message === "story-manual-conflict") return [];
    throw error;
  }
}

/** Validate the durable link, including in backups. Restored data remains non-executable. */
export function dispatchStoryRequest(all: DataRecord[], capture: StoryDispatchCapture): StoryRequest | null {
  if (capture.storyBranchId === undefined) return null;
  assertStoryGraph(all);
  const request = all.find(r => r.kind === "story" && r.id === capture.id)?.data as StoryRecord | undefined;
  if (request?.type !== "request" || request.branchId !== capture.storyBranchId || request.worldId !== capture.worldId || request.bindingId !== capture.bindingId
    || request.chatId !== capture.identity.chatId || request.nativeParentKey !== capture.identity.nativeParentKey || request.sceneRevision !== capture.sceneRevision || request.purpose !== "user-turn") throw Error("dispatch-story-conflict");
  return request;
}
