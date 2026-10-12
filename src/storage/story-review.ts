import { validStoryReviewInput, validStoryPreviewInput, type StoryReviewGuard, type StoryReviewInput, type StoryPreviewInput, type StoryReviewPage, type StoryReviewPreview } from "../core/story-review";
import { assertStoryGraph, type StoryBaseline, type StoryBranch, type StoryEvent, type StoryProjection, type StoryRecord, type StoryRevision } from "../core/story-records";
import { projectStoryBranch } from "../core/story-projection";
import { sameStoryValue } from "../core/story-value";
import type { ChatBinding, DataRecord, WorldProfile } from "../core/types";
import { repository, type DeepRoleRepository } from "./repository";
import { relationshipNarrative } from "../core/relationships";
import { validServiceOperation, type ServiceOperation } from "../core/service-operations";

const kinds = ["story", "world", "binding", "service"] as const;
function scoped(all: DataRecord[], scope: { chatId: string; worldId: string }) {
  assertStoryGraph(all);
  const bindings = all.filter(r => r.kind === "binding" && (r.data as ChatBinding).chatId === scope.chatId);
  const world = all.find(r => r.kind === "world" && r.id === scope.worldId)?.data as WorldProfile | undefined;
  const binding = bindings[0]?.data as ChatBinding | undefined;
  if (bindings.length !== 1 || !binding || binding.worldId !== scope.worldId || !world) throw Error("story-binding-conflict");
  const stored = all.filter(r => r.kind === "story").map(r => r.data as StoryRecord);
  const baselines = stored.filter((r): r is StoryBaseline => r.type === "baseline" && r.worldId === scope.worldId && r.origin.bindingId === binding.id && r.origin.chatId === scope.chatId);
  if (baselines.length > 1) throw Error("story-binding-conflict");
  const baseline = baselines[0]?.origin.nativeAnchor ? baselines[0] : undefined;
  const branch = baseline && stored.find((r): r is StoryBranch => r.type === "branch" && r.id === baseline.branchId);
  if (branch && branch.parentBranchId !== null) throw Error("story-branch-routing-required");
  const revisions = branch ? stored.filter((r): r is StoryRevision => r.type === "revision" && r.branchId === branch.id).sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) : [];
  const projection = branch && stored.find((r): r is StoryProjection => r.type === "projection" && r.id === branch.projectionId);
  const guard: StoryReviewGuard | null = branch ? { branchId: branch.id, headRevisionId: branch.headRevisionId, selectionVersion: branch.selectionVersion, revisionCount: revisions.length } : null;
  return { binding, world, stored, baseline, branch, revisions, projection, guard };
}
function sameGuard(current: StoryReviewGuard | null, input: StoryReviewGuard) {
  if (!current || !sameStoryValue(current, { branchId: input.branchId, headRevisionId: input.headRevisionId, selectionVersion: input.selectionVersion, revisionCount: input.revisionCount })) throw Error("story-review-stale");
}
/** Local read only; bounded transfer. Date order is NOT narrative ancestry. */
export async function readStoryReview(input: StoryReviewInput, repo: DeepRoleRepository = repository): Promise<StoryReviewPage> {
  input = structuredClone(input); if (!validStoryReviewInput(input)) throw Error("story-review-invalid");
  return repo.updateRecords(all => {
    const f = scoped(all, input), offset = input.cursor?.offset ?? 0;
    if (input.cursor) sameGuard(f.guard, input.cursor);
    const line = f.branch ? projectStoryBranch(f.stored, f.branch.id, f.branch.headRevisionId, f.projection?.acceptedEventIds ?? []) : null;
    const selected = new Set(line?.revisionIds ?? []), applied = new Set(line?.appliedEventIds ?? []);
    const events = f.stored.filter((r): r is StoryEvent => r.type === "event" && r.branchId === f.branch?.id);
    const byId = new Map(f.revisions.map(r => [r.id, r]));
    const head = byId.get(f.branch?.headRevisionId ?? "");
    const audit = head?.metadataRepair && all.find(r => r.kind === "service" && r.id === head.metadataRepair!.id)?.data as ServiceOperation | undefined;
    const repair = head?.metadataRepair ? { ...head.metadataRepair, ...(validServiceOperation(audit) && audit.operation === "story-repair" ? { cleanup: audit.cleanup } : {}) } : undefined;
    const factPage = input.cursor ? new Set(f.revisions.slice(offset, offset + 8).map(r => r.id)) : null;
    const facts = f.branch?.gameManaged ? events.filter(e => e.memory && selected.has(e.revisionId) && (!factPage || factPage.has(e.revisionId))).sort((a, b) => (line?.revisionIds.indexOf(a.revisionId) ?? 0) - (line?.revisionIds.indexOf(b.revisionId) ?? 0) || a.ordinal - b.ordinal).slice(-24).map(e => ({ ...e.memory!, edited: !!e.memory!.edited, eventId: e.id, accepted: applied.has(e.id) })) : undefined;
    const entries = f.revisions.slice(offset, offset + 8).map(r => {
      const related = events.filter(e => e.revisionId === r.id), parent = r.parentRevisionId === null ? null : byId.get(r.parentRevisionId);
      const visible = (source: StoryRevision) => source.role === "assistant" ? relationshipNarrative(source.content) : source.content;
      return { id: r.id, role: r.role, completion: r.completion, content: visible(r), parentExcerpt: parent ? visible(parent).slice(0, 140) : null,
        observedAt: r.createdAt, selected: selected.has(r.id), candidateCount: related.length, appliedCount: related.filter(e => applied.has(e.id)).length };
    });
    return { records: [], removed: [], result: structuredClone({ chatId: input.chatId, worldId: input.worldId, bindingId: f.binding.id, worldName: f.world.name,
      ...(f.branch?.gameManaged ? { managed: true, paused: Object.hasOwn(f.branch, "pausedAtRevisionId"), nextOutOfCharacter: f.binding.nextStoryMessageMode === "out-of-character", facts } : {}), ...(head?.updateDiagnostic ? { update: head.repairDiagnostic ?? head.updateDiagnostic, currentRevisionId: head.id } : {}), ...(repair ? { repair } : {}), baselineAt: f.baseline?.updatedAt ?? null, guard: f.guard, offset, entries, next: f.guard && offset + entries.length < f.revisions.length ? { ...f.guard, offset: offset + entries.length } : null }) };
  }, undefined, [...kinds]);
}
/** Preview keeps only previously approved events. It neither selects nor writes. */
export async function previewStoryReview(input: StoryPreviewInput, repo: DeepRoleRepository = repository): Promise<StoryReviewPreview> {
  input = structuredClone(input); if (!validStoryPreviewInput(input)) throw Error("story-review-invalid");
  return repo.updateRecords(all => {
    const f = scoped(all, input); sameGuard(f.guard, input.guard);
    if (!f.branch || !f.baseline) throw Error("story-review-stale");
    if (input.headRevisionId !== null && !f.revisions.some(r => r.id === input.headRevisionId && r.role === "assistant" && r.completion === "complete")) throw Error("story-source-incomplete");
    const value = projectStoryBranch(f.stored, f.branch.id, input.headRevisionId, f.projection?.acceptedEventIds ?? []);
    const before = f.projection?.snapshot ?? f.baseline.snapshot, scene = f.binding.characterScenes?.[input.worldId];
    const sceneValue = { states: scene?.states ?? {}, presentIds: scene?.presentIds ?? [], partnerIds: scene?.partnerIds ?? (scene?.partnerId ? [scene.partnerId] : []) };
    const expected = { states: before.states, presentIds: before.presentIds, partnerIds: before.partnerIds };
    const old = new Set(f.projection?.appliedEventIds ?? []), next = new Set(value.appliedEventIds);
    return { records: [], removed: [], result: structuredClone({ chatId: input.chatId, worldId: input.worldId, guard: f.guard!, headRevisionId: input.headRevisionId,
      snapshot: value.snapshot, addedEvents: [...next].filter(id => !old.has(id)).length, removedEvents: [...old].filter(id => !next.has(id)).length,
      manualConflict: (scene?.revision ?? null) !== (f.projection?.bindingRevision ?? f.baseline.origin.sceneRevision) || !sameStoryValue(sceneValue, expected) }) };
  }, undefined, [...kinds]);
}
