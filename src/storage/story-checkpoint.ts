import { validStoryCheckpointChoice, validStoryCheckpointScope, type StoryCheckpointChoice, type StoryCheckpointReview, type StoryCheckpointScope } from "../core/story-checkpoint";
import { validStoryDispatchCapture, type StoryDispatchCapture } from "../core/story-dispatch-capture";
import { assertStoryGraph, type StoryBaseline, type StoryBranch, type StoryRecord } from "../core/story-records";
import { sameStoryValue } from "../core/story-value";
import type { ChatBinding, DataRecord, WorldProfile } from "../core/types";
import { repository, type DeepRoleRepository } from "./repository";
import { legacyStorySnapshot, planLegacyStory } from "./story-history";
import { planStoryCheckpointAnchor } from "./story-observer";

const kinds = ["story", "world", "binding", "entity", "dispatch"] as const;
function liveBinding(all: DataRecord[], scope: StoryCheckpointScope) {
  const bindings = all.filter(r => r.kind === "binding" && (r.data as ChatBinding).chatId === scope.chatId).map(r => r.data as ChatBinding);
  if (bindings.length !== 1 || bindings[0]!.worldId !== scope.worldId || !all.some(r => r.kind === "world" && r.id === scope.worldId)) throw Error("story-binding-conflict");
  return bindings[0]!;
}
function sources(all: DataRecord[], scope: StoryCheckpointScope, bindingId: string, owner: number) {
  return all.filter(r => r.kind === "dispatch").map(r => r.data as StoryDispatchCapture).filter(c => validStoryDispatchCapture(c) && c.origin === "local" && c.ownerTabId === owner
    && c.worldId === scope.worldId && c.bindingId === bindingId && c.identity.chatId === scope.chatId && !!c.reply && c.injection !== "unconfirmed"
    && c.delivery?.status === "accepted" && c.wire.phase === "closed" && c.wire.sawFinish && !!c.wire.link);
}
/** Manual read only. Date order is a review convenience, not narrative ancestry. */
export async function readStoryCheckpoint(scope: StoryCheckpointScope, owner: number, repo: DeepRoleRepository = repository): Promise<StoryCheckpointReview> {
  scope = structuredClone(scope);
  if (!validStoryCheckpointScope(scope) || !Number.isSafeInteger(owner) || owner < 0) throw Error("story-checkpoint-invalid");
  return repo.updateRecords(all => {
    assertStoryGraph(all);
    const binding = liveBinding(all, scope), world = all.find(r => r.kind === "world" && r.id === scope.worldId)!.data as WorldProfile;
    const baseline = all.filter(r => r.kind === "story").map(r => r.data as StoryRecord).find((r): r is StoryBaseline => r.type === "baseline" && r.worldId === scope.worldId && r.origin.bindingId === binding.id);
    const candidates = sources(all, scope, binding.id, owner).sort((a, b) => b.reply!.observedAt - a.reply!.observedAt || a.id.localeCompare(b.id));
    return { records: [], removed: [], result: structuredClone({ ...scope, bindingId: binding.id, worldName: world.name, sceneRevision: binding.characterScenes?.[scope.worldId]?.revision ?? null,
      snapshot: legacyStorySnapshot(all, scope.worldId, binding), availableCount: candidates.length,
      candidates: candidates.slice(0, 8).map(c => ({ requestId: c.id, observedAt: c.reply!.observedAt, draft: c.originalDraft, answer: c.reply!.assistant.content, serverSelection: c.reply!.serverSelection })),
      checkpoint: baseline?.origin.nativeAnchor ? { branchId: baseline.branchId, anchorKey: baseline.origin.nativeAnchor.nativeMessageKey, createdAt: baseline.updatedAt } : null }) };
  }, undefined, [...kinds]);
}
/** A human-confirmed starting point, not retroactive acceptance of that reply's events.
 * Freeze + anchor are one write. Failure leaves no orphan baseline/branch. */
export async function saveStoryCheckpoint(choice: StoryCheckpointChoice, owner: number, repo: DeepRoleRepository = repository, stillCurrent?: () => Promise<void>): Promise<{ branchId: string }> {
  choice = structuredClone(choice);
  if (!validStoryCheckpointChoice(choice) || !Number.isSafeInteger(owner) || owner < 0) throw Error("story-checkpoint-invalid");
  return repo.updateRecords(all => {
    assertStoryGraph(all);
    const binding = liveBinding(all, choice);
    if (binding.id !== choice.bindingId) throw Error("story-binding-conflict");
    const source = sources(all, choice, binding.id, owner).find(c => c.id === choice.requestId);
    if (!source) throw Error("story-checkpoint-source");
    if ((binding.characterScenes?.[choice.worldId]?.revision ?? null) !== choice.expectedSceneRevision || !sameStoryValue(legacyStorySnapshot(all, choice.worldId, binding), choice.expectedSnapshot)) throw Error("story-manual-conflict");
    const nativeAnchor = { nativeMessageKey: source.reply!.assistant.identity.nativeMessageKey, role: "assistant" as const };
    const existing = all.filter(r => r.kind === "story").map(r => r.data as StoryRecord).find((r): r is StoryBaseline => r.type === "baseline" && r.worldId === choice.worldId && r.origin.bindingId === binding.id);
    if (existing?.origin.nativeAnchor) {
      // Repeated clicks cannot move the checkpoint or silently start another playthrough.
      if (!sameStoryValue(existing.origin.nativeAnchor, nativeAnchor) || existing.origin.sceneRevision !== choice.expectedSceneRevision || !sameStoryValue(existing.snapshot, choice.expectedSnapshot)) throw Error("story-anchor-conflict");
      return { records: [], removed: [], result: { branchId: existing.branchId } };
    }
    const legacy = planLegacyStory(all, choice), branch = legacy.result as StoryBranch;
    const baseline = [...all, ...legacy.records].find(r => r.kind === "story" && r.id === branch.baselineId)!.data as StoryBaseline;
    if (baseline.origin.sceneRevision !== choice.expectedSceneRevision || !sameStoryValue(baseline.snapshot, choice.expectedSnapshot)) throw Error("story-manual-conflict");
    const anchored = planStoryCheckpointAnchor([...all, ...legacy.records], branch.id, { identity: { chatId: choice.chatId, nativeParentKey: nativeAnchor.nativeMessageKey }, role: "assistant", completion: "complete", expectedSceneRevision: choice.expectedSceneRevision });
    const replacements = new Map([...legacy.records, ...anchored.records].map(r => [r.id, r]));
    const records = [...replacements.values()];
    assertStoryGraph([...all.filter(r => r.kind !== "story" || !replacements.has(r.id)), ...records]);
    return { records, removed: [], result: { branchId: branch.id } };
  }, stillCurrent, [...kinds]);
}
