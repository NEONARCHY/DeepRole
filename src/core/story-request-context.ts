import type { CharacterScene } from "./types";
import type { StoryRecord, StorySnapshot } from "./story-records";
import { projectStoryBranch, StoryProjectionError } from "./story-projection";

export interface StoryRequestContextValue {
  algorithmVersion: 1;
  requestId: string;
  branchId: string;
  parentRevisionId: string | null;
  preparedAt: number;
  revisionIds: string[];
  appliedEventIds: string[];
  snapshot: StorySnapshot;
}

/** Pure reconstruction of a validated graph. Never uses the current selected scene/approvals.
 * Missing old context is UNKNOWN, not permission to reconstruct it from today's state.
 */
export function projectStoryRequestContext(records: StoryRecord[], branchId: string, requestId: string): StoryRequestContextValue {
  const request = records.find(item => item.id === requestId);
  if (request?.type !== "request" || request.branchId !== branchId) throw new StoryProjectionError("story-request-missing");
  if (!request.context || request.context.algorithmVersion !== 1) throw new StoryProjectionError("story-request-context-missing", { path: "request.context" });
  const projection = projectStoryBranch(records, branchId, request.parentRevisionId, request.context.acceptedEventIds);
  const applied = new Set(projection.appliedEventIds);
  if (request.context.acceptedEventIds.some(id => !applied.has(id))) throw new StoryProjectionError("story-request-context-invalid", { path: "request.context.acceptedEventIds" });
  return { algorithmVersion: 1, requestId, branchId, parentRevisionId: request.parentRevisionId, preparedAt: request.createdAt,
    revisionIds: projection.revisionIds, appliedEventIds: projection.appliedEventIds, snapshot: projection.snapshot };
}

/** Detached request reference for existing character prompt construction. Not a binding write.
 * No lastReply/progress/portrait state from a later scene can leak through this object.
 */
export function storyRequestCharacterScene(context: StoryRequestContextValue): CharacterScene {
  return { revision: context.requestId, updatedAt: context.preparedAt, states: structuredClone(context.snapshot.states),
    presentIds: [...context.snapshot.presentIds], partnerIds: [...context.snapshot.partnerIds], partnerId: context.snapshot.partnerIds[0] ?? null };
}
