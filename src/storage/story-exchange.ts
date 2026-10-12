import { matchNativeStoryExchange, nativeStorySampleDigest, type NativeStoryExchange, type StoryExchangePause } from "../core/story-exchange";
import { assertStoryGraph, type StoryRecord } from "../core/story-records";
import { planNativeStoryObservation } from "./story-observer";
import { repository, type DeepRoleRepository } from "./repository";
import type { DataRecord } from "../core/types";

export type StoryExchangeObservationResult = StoryExchangePause | { status: "recorded" | "already-recorded"; userRevisionId: string | null; assistantRevisionId: string };

/** Atomic observation gate. Observation does not select the game's current history.
 * Capture before hashing/queuing, recheck the persisted receipt under the lock, and write
 * user+assistant atomically. A pause writes nothing. No scene/candidates/lore are applied.
 */
export async function observeNativeStoryExchange(branchId: string, input: NativeStoryExchange, repo: DeepRoleRepository = repository): Promise<StoryExchangeObservationResult> {
  input = structuredClone(input);
  const digest = await nativeStorySampleDigest(input?.assistant);
  return repo.updateRecords<StoryExchangeObservationResult>(all => planNativeStoryExchange(all, branchId, input, digest), undefined, ["story", "world", "entity"]);
}

/** Pure planner; digest must be computed from the caller's frozen assistant source. */
export function planNativeStoryExchange(all: DataRecord[], branchId: string, input: NativeStoryExchange, digest: string | null): { records: DataRecord[]; removed: []; result: StoryExchangeObservationResult } {
    assertStoryGraph(all);
    const stored = all.filter(row => row.kind === "story").map(row => row.data as StoryRecord);
    const matched = matchNativeStoryExchange(stored, branchId, input, digest);
    if (matched.status === "paused") return { records: [], removed: [], result: matched };
    const user = matched.user ? planNativeStoryObservation(all, branchId, { ...matched.user, requestId: matched.request.id, parentRevisionId: matched.parentRevisionId }) : null;
    const assistant = planNativeStoryObservation([...all, ...user?.records ?? []], branchId, { ...matched.assistant, requestId: matched.request.id, parentRevisionId: user?.result.revisionId ?? matched.parentRevisionId });
    return { records: [...user?.records ?? [], ...assistant.records], removed: [], result: { status: assistant.result.status === "already-recorded" && (!user || user.result.status === "already-recorded") ? "already-recorded" : "recorded", userRevisionId: user?.result.revisionId ?? null, assistantRevisionId: assistant.result.revisionId } };
}
