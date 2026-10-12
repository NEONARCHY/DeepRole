import { createId } from "../core/id";
import { matchStoryBaselineEffects } from "../core/story-baseline-effects";
import { assertStoryGraph, storyRow, validStoryRecord, type StoryBaseline, type StoryBranch, type StoryEvent, type StoryRecord, type StoryRevision } from "../core/story-records";
import { sameStoryValue } from "../core/story-value";
import { validNativeStoryIdentity, validStoryTransportIdentity, type NativeStorySample, type StoryTransportIdentity } from "../core/story-transport";
import type { ChatBinding, DataRecord } from "../core/types";
import { repository, type DeepRoleRepository } from "./repository";
import { planStoryObservation, type StoryObservation } from "./story-history";

export interface NativeStoryObservation extends NativeStorySample {
  requestId: string;
  /** Exact local parent chosen by the request route, never the nearest DOM sibling. */
  parentRevisionId: string | null;
}

/** Stores a terminal sample, not every streaming token. No selection or event acceptance.
 * Local IDs are assigned/looked up under the library lock, surviving reload and concurrent tabs.
 * The site adapter must separately establish the identity and completion signal.
 */
export async function observeNativeStoryMessage(branchId: string, input: NativeStoryObservation, repo: DeepRoleRepository = repository) {
  input = structuredClone(input);
  validateNativeObservation(input);
  return repo.updateRecords(all => planNativeStoryObservation(all, branchId, input), undefined, ["story", "world", "entity"]);
}

function validateNativeObservation(input: NativeStoryObservation) {
  if (!validNativeStoryIdentity(input.identity) || typeof input.requestId !== "string" || !input.requestId
    || !["complete", "partial", "interrupted"].includes(input.completion) || typeof input.content !== "string" || !input.content.trim() || input.content.length > 250_000
    || input.identity.role === "user" && input.completion !== "complete") throw new Error("story-observation-invalid");
}

/** Internal planner: reuse stable IDs when an entire exchange is saved in one transaction. */
export function planNativeStoryObservation(all: DataRecord[], branchId: string, input: NativeStoryObservation) {
  validateNativeObservation(input);
  assertStoryGraph(all);
  const stored = all.filter(row => row.kind === "story").map(row => row.data as StoryRecord);
  const branch = stored.find(row => row.type === "branch" && row.id === branchId) as StoryBranch | undefined;
  if (!branch || branch.worldId === null || branch.parentBranchId !== null) throw new Error("story-scope-invalid");
  const messages = stored.filter(row => row.type === "revision" && row.playthroughId === branch.playthroughId && row.role === input.identity.role && row.nativeMessageKey === input.identity.nativeMessageKey) as StoryRevision[];
  const messageIds = new Set(messages.map(row => row.messageId));
  if (messageIds.size > 1) throw new Error("story-native-message-ambiguous");
  const previous = messages.find(row => row.branchId === branchId && row.requestId === input.requestId && row.parentRevisionId === input.parentRevisionId
    && row.completion === input.completion && row.content === input.content && sameStoryValue(row.requestProof, { nativeParentKey: input.identity.nativeParentKey }));
  const previousEvents = previous ? stored.filter((row): row is StoryEvent => row.type === "event" && row.revisionId === previous.id).sort((a, b) => a.ordinal - b.ordinal) : [];
  // Revalidate provenance even on repeats; legacy text matches are never silently upgraded.
  const observation: StoryObservation = { id: previous?.id ?? createId("revision"), messageId: messages[0]?.messageId ?? createId("message"), nativeMessageKey: input.identity.nativeMessageKey,
    requestId: input.requestId, parentRevisionId: input.parentRevisionId, role: input.identity.role, completion: input.completion, content: input.content,
    requestProof: { nativeParentKey: input.identity.nativeParentKey }, events: previousEvents.map(row => ({ id: row.id, label: row.label, quote: row.quote, participantIds: row.participantIds, changes: row.changes, ...(row.sceneChange ? { sceneChange: row.sceneChange } : {}) })) };
  const plan = planStoryObservation(all, branchId, observation);
  return { ...plan, result: { status: plan.result, revisionId: observation.id, messageId: observation.messageId } };
}

export interface StoryCheckpointAnchor {
  identity: StoryTransportIdentity;
  role: "assistant" | null;
  completion: "complete";
  expectedSceneRevision: string | null;
}

/** Explicit checkpoint decision only. NOT an automatic guess based on the last visible reply.
 * A caller must confirm that this saved scene is the chosen starting point after that native
 * completed assistant (or at an explicit root). Earlier history remains unknown and non-replayable.
 */
export async function anchorStoryCheckpoint(branchId: string, input: StoryCheckpointAnchor, repo: DeepRoleRepository = repository): Promise<StoryBaseline> {
  input = structuredClone(input);
  if (!validStoryTransportIdentity(input.identity) || input.completion !== "complete" || (input.identity.nativeParentKey === null ? input.role !== null : input.role !== "assistant")) throw new Error("story-anchor-invalid");
  return repo.updateRecords(all => planStoryCheckpointAnchor(all, branchId, input), undefined, ["story", "world", "binding", "entity"]);
}

export function planStoryCheckpointAnchor(all: DataRecord[], branchId: string, input: StoryCheckpointAnchor) {
    if (!validStoryTransportIdentity(input.identity) || input.completion !== "complete" || (input.identity.nativeParentKey === null ? input.role !== null : input.role !== "assistant")) throw new Error("story-anchor-invalid");
    assertStoryGraph(all);
    const stored = all.filter(row => row.kind === "story").map(row => row.data as StoryRecord);
    const branch = stored.find(row => row.type === "branch" && row.id === branchId) as StoryBranch | undefined;
    if (!branch || branch.worldId === null || branch.parentBranchId !== null) throw new Error("story-scope-invalid");
    const baseline = stored.find(row => row.id === branch.baselineId) as StoryBaseline;
    if (baseline.origin.chatId !== input.identity.chatId) throw new Error("story-binding-conflict");
    const nativeAnchor = { nativeMessageKey: input.identity.nativeParentKey, role: input.role };
    if (baseline.origin.nativeAnchor) {
      if (!sameStoryValue(baseline.origin.nativeAnchor, nativeAnchor) || baseline.origin.sceneRevision !== input.expectedSceneRevision) throw new Error("story-anchor-conflict");
      return { records: [], removed: [], result: structuredClone(baseline) };
    }
    if (branch.headRevisionId !== null || branch.selectionVersion !== 0 || branch.projectionId || stored.some(row => row.branchId === branchId && ["request", "revision"].includes(row.type))) throw new Error("story-anchor-too-late");
    const binding = all.find(row => row.kind === "binding" && row.id === baseline.origin.bindingId)?.data as ChatBinding | undefined;
    if (!binding || binding.chatId !== input.identity.chatId || binding.worldId !== branch.worldId) throw new Error("story-binding-conflict");
    const scene = binding.characterScenes?.[branch.worldId];
    if ((scene?.revision ?? null) !== input.expectedSceneRevision || baseline.origin.sceneRevision !== input.expectedSceneRevision
      || !sameStoryValue({ states: scene?.states ?? {}, presentIds: scene?.presentIds ?? [], partnerIds: scene?.partnerIds ?? (scene?.partnerId ? [scene.partnerId] : []) },
        { states: baseline.snapshot.states, presentIds: baseline.snapshot.presentIds, partnerIds: baseline.snapshot.partnerIds })) throw new Error("story-manual-conflict");
    if (baseline.legacyEffects && !matchStoryBaselineEffects(binding, branch.worldId, baseline.legacyEffects)) throw Error("story-effects-untracked");
    const next: StoryBaseline = { ...baseline, origin: { ...baseline.origin, nativeAnchor }, updatedAt: Math.max(Date.now(), baseline.updatedAt) };
    if (!validStoryRecord(next)) throw new Error("story-anchor-invalid");
    const row = storyRow(next); assertStoryGraph([...all.filter(row => row.kind !== "story" || row.id !== baseline.id), row]);
    return { records: [row], removed: [], result: structuredClone(next) };
}
