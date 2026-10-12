import { assertStoryGraph, storyRow, type StoryBaseline, type StoryBranch, type StoryProjection } from "../../src/core/story-records";
import { projectStoryBranch } from "../../src/core/story-projection";
import { storyWorld } from "./story-worlds";

/** Synthetic persisted projection only; never activates story mode for a user. */
export function ownedStoryScene(locale: "ru" | "en" = "en", selected = true) {
  const f = storyWorld(locale), scene = f.binding.characterScenes![f.world.id]!;
  const branch: StoryBranch = { format: "deeprole-story", contractVersion: 1, type: "branch", id: "synthetic-owner-branch", branchId: "synthetic-owner-branch", worldId: f.world.id,
    playthroughId: "synthetic-owner-playthrough", baselineId: "synthetic-owner-baseline", parentBranchId: null, forkRevisionId: null, headRevisionId: null, selectionVersion: 0, createdAt: 30, updatedAt: 30 };
  const baseline: StoryBaseline = { format: "deeprole-story", contractVersion: 1, type: "baseline", id: branch.baselineId, branchId: branch.id, worldId: f.world.id, playthroughId: branch.playthroughId,
    origin: { bindingId: f.binding.id, chatId: f.binding.chatId, worldId: f.world.id, sceneRevision: scene.revision },
    snapshot: { states: structuredClone(scene.states), presentIds: [...scene.presentIds], partnerIds: [], names: Object.fromEntries(f.entities.slice(0, 2).map(e => [e.id, e.name])) }, historyBeforeBaseline: "unknown", legacyEntryScope: "unclassified", createdAt: 30, updatedAt: 30 };
  const projection: StoryProjection = { format: "deeprole-story", contractVersion: 1, type: "projection", id: "synthetic-owner-projection", branchId: branch.id, worldId: f.world.id, playthroughId: branch.playthroughId,
    algorithmVersion: 1, baselineId: baseline.id, selectionVersion: 1, ...projectStoryBranch([baseline, branch], branch.id, null, []), bindingId: f.binding.id, chatId: f.binding.chatId,
    bindingRevision: "synthetic-owner-scene", previousHeadRevisionId: null, createdAt: 31, updatedAt: 31 };
  if (selected) { branch.projectionId = projection.id; branch.selectionVersion = 1; scene.revision = projection.bindingRevision; }
  f.records.push(storyRow(baseline), storyRow(branch), ...(selected ? [storyRow(projection)] : []));
  assertStoryGraph(f.records);
  return { ...f, branch, baseline, projection };
}
