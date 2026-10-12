import { createId } from "../core/id";
import { matchStoryBaselineEffects } from "../core/story-baseline-effects";
import { validDataRecord } from "../core/record-validation";
import { projectStoryBranch, StoryProjectionError } from "../core/story-projection";
import { assertStoryGraph, storyRow, type StoryBaseline, type StoryBranch, type StoryProjection, type StoryRecord, type StoryRevision } from "../core/story-records";
import { sameStoryValue } from "../core/story-value";
import type { CharacterScene, ChatBinding, DataRecord, SceneEntity } from "../core/types";
import { repository, type DeepRoleRepository } from "./repository";
import { storySceneOwner } from "./story-scene-owner";
import { planStoryEffects } from "./story-effect-replay";

export interface StorySelection {
  headRevisionId: string | null;
  expectedHeadRevisionId: string | null;
  expectedSelectionVersion: number;
  /** Explicit local review. Never populate this array from untrusted model output. */
  acceptedEventIds: string[];
}
export interface StorySelectionResult {
  status: "selected" | "already-selected";
  branch: StoryBranch;
  projection: StoryProjection;
}

const sceneState = (scene: CharacterScene | undefined) => ({ states: scene?.states ?? {}, presentIds: scene?.presentIds ?? [], partnerIds: scene?.partnerIds ?? (scene?.partnerId ? [scene.partnerId] : []) });
const selectionId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 160 && value === value.trim() && !["__proto__", "prototype", "constructor"].includes(value);
const nullableId = (value: unknown) => value === null || selectionId(value);
export function validStorySelection(input: unknown): input is StorySelection {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const value = input as StorySelection;
  return Object.keys(value).length === 4 && Object.keys(value).every(key => ["headRevisionId", "expectedHeadRevisionId", "expectedSelectionVersion", "acceptedEventIds"].includes(key))
    && nullableId(value.headRevisionId) && nullableId(value.expectedHeadRevisionId) && Number.isSafeInteger(value.expectedSelectionVersion) && value.expectedSelectionVersion >= 0
    && Array.isArray(value.acceptedEventIds) && Array.from(value.acceptedEventIds).every(selectionId) && new Set(value.acceptedEventIds).size === value.acceptedEventIds.length;
}

/** Atomic root-line selection and scene replay. Not exposed to website messages.
 * Detached histories and cross-chat/fork routing require their own explicit flow.
 */
export async function selectStoryRevision(branchId: string, input: StorySelection, repo: DeepRoleRepository = repository, stillCurrent?: () => Promise<void>): Promise<StorySelectionResult> {
  if (!selectionId(branchId) || !validStorySelection(input)) throw new StoryProjectionError("story-selection-invalid");
  input = structuredClone(input);
  return repo.updateRecords(all => planStorySelection(all, branchId, input), stillCurrent, ["story", "world", "binding", "entity"]);
}

/** Pure scene/branch plan for a future unified effect transaction; no nested locks. */
export function planStorySelection(all: DataRecord[], branchId: string, input: StorySelection, keepManual = false, freshPhotos: import("../core/types").ScenePhoto[] = []): { records: DataRecord[]; removed: { kind: "entity"; id: string }[]; result: StorySelectionResult } {
    if (!selectionId(branchId) || !validStorySelection(input)) throw new StoryProjectionError("story-selection-invalid");
    input = structuredClone(input);
    assertStoryGraph(all);
    const stored = all.filter(row => row.kind === "story").map(row => row.data as StoryRecord);
    const branch = stored.find(row => row.type === "branch" && row.id === branchId) as StoryBranch | undefined;
    if (!branch || branch.worldId === null) throw new StoryProjectionError("story-scope-invalid");
    if (branch.parentBranchId !== null) throw new StoryProjectionError("story-branch-routing-required");
    const baseline = stored.find(row => row.id === branch.baselineId) as StoryBaseline;
    const previous = stored.find(row => row.type === "projection" && row.id === branch.projectionId) as StoryProjection | undefined;
    const target = stored.find(row => row.id === input.headRevisionId) as StoryRevision | undefined;
    // Internal replay also needs a completed user prefix for edit/regeneration.
    // The read-only review UI separately restricts answer choices to assistants.
    if (input.headRevisionId !== null && (target?.type !== "revision" || target.branchId !== branch.id)) throw new StoryProjectionError("story-selection-target-invalid");
    if (target?.type === "revision" && target.completion !== "complete") throw new StoryProjectionError("story-source-incomplete");
    const approved = [...input.acceptedEventIds].sort();
    const currentVersion = input.expectedSelectionVersion === branch.selectionVersion && input.expectedHeadRevisionId === branch.headRevisionId;
    const immediateRetry = previous && input.expectedSelectionVersion + 1 === branch.selectionVersion && input.expectedHeadRevisionId === previous.previousHeadRevisionId;
    if (previous && previous.headRevisionId === input.headRevisionId && sameStoryValue(previous.acceptedEventIds, approved) && (currentVersion || immediateRetry)) {
      // In particular, do not overwrite a later manual edit on a transport retry.
      return { records: [], removed: [], result: { status: "already-selected" as const, branch: structuredClone(branch), projection: structuredClone(previous) } };
    }
    if (!currentVersion || branch.selectionVersion === Number.MAX_SAFE_INTEGER) throw new StoryProjectionError("story-selection-conflict", { path: "branch.selectionVersion" });
    if (!previous && (branch.headRevisionId !== null || branch.selectionVersion !== 0)) throw new StoryProjectionError("story-projection-missing");
    const binding = all.find(row => row.kind === "binding" && row.id === baseline.origin.bindingId)?.data as ChatBinding | undefined;
    if (!binding || binding.chatId !== baseline.origin.chatId || binding.worldId !== branch.worldId) throw new StoryProjectionError("story-binding-conflict", { path: "binding.worldId" });
    storySceneOwner(all, binding, branch.worldId, branch.id);
    const scene = binding.characterScenes?.[branch.worldId], expected = previous?.snapshot ?? baseline.snapshot;
    if ((scene?.revision ?? null) !== (previous?.bindingRevision ?? baseline.origin.sceneRevision) || !sameStoryValue(sceneState(scene), { states: expected.states, presentIds: expected.presentIds, partnerIds: expected.partnerIds })) throw new StoryProjectionError("story-manual-conflict", { path: "binding.characterScenes" });

    // Preserve proven before-checkpoint effects, without rolling image jobs back.
    // New/lost/changed untracked effects still prevent a partial replay.
    if (!branch.gameManaged && !matchStoryBaselineEffects(binding, branch.worldId, baseline.legacyEffects)) throw new StoryProjectionError("story-effects-untracked");

    const value = projectStoryBranch(stored, branch.id, input.headRevisionId, approved);
    const effects = branch.gameManaged ? planStoryEffects(all, binding, baseline, previous?.appliedEventIds ?? [], value.appliedEventIds, keepManual, freshPhotos) : null;
    const removed = effects?.removed ?? [];
    const people = new Set([...all.filter(row => row.kind === "entity" && !removed.some(r => r.id === row.id) && (row.data as SceneEntity).kind === "character" && (row.data as SceneEntity).worldId === branch.worldId), ...effects?.records ?? []].map(row => row.id));
    if ([...Object.keys(value.snapshot.states), ...value.snapshot.presentIds].some(id => !people.has(id))) throw new StoryProjectionError("story-participant-missing", { path: "snapshot.states" });
    const now = Date.now(), revision = createId("rev");
    const projection: StoryProjection = { format: "deeprole-story", contractVersion: 1, type: "projection", id: previous?.id ?? createId("projection"), worldId: branch.worldId, playthroughId: branch.playthroughId, branchId: branch.id,
      algorithmVersion: 1, baselineId: baseline.id, selectionVersion: branch.selectionVersion + 1, ...value, bindingId: binding.id, chatId: binding.chatId, bindingRevision: revision, previousHeadRevisionId: branch.headRevisionId, createdAt: previous?.createdAt ?? now, updatedAt: now };
    const nextBranch: StoryBranch = { ...branch, projectionId: projection.id, headRevisionId: input.headRevisionId, selectionVersion: projection.selectionVersion, updatedAt: now };
    const nextScene: CharacterScene = { ...(effects ? effects.metadata : scene), revision, presentIds: [...value.snapshot.presentIds], partnerIds: [...value.snapshot.partnerIds], partnerId: value.snapshot.partnerIds[0] ?? null, states: structuredClone(value.snapshot.states), updatedAt: now };
    const nextBinding: ChatBinding = { ...binding, ...(effects ? { scenePhotos: effects.photos } : {}), characterScenes: { ...binding.characterScenes, [branch.worldId]: nextScene }, updatedAt: now };
    const bindingRow = { kind: "binding" as const, id: binding.id, data: nextBinding };
    if (!validDataRecord(bindingRow)) throw new StoryProjectionError("story-binding-invalid", { path: "binding.characterScenes" });
    const changes = [storyRow(nextBranch), storyRow(projection), bindingRow, ...effects?.records ?? []], keys = new Set(changes.map(row => `${row.kind}:${row.id}`));
    assertStoryGraph([...all.filter(row => !keys.has(`${row.kind}:${row.id}`) && !removed.some(r => r.kind === row.kind && r.id === row.id)), ...changes]);
    return { records: changes, removed, result: { status: "selected" as const, branch: structuredClone(nextBranch), projection: structuredClone(projection) } };
}
