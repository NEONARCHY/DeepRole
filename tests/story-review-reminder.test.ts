import { expect, it } from "vitest";
import { storyReviewReminderReply } from "../src/core/story-review-reminder";
import type { StoryRecord } from "../src/core/story-records";
import type { WorldGame } from "../src/core/world-game";
import { storyWorld } from "./fixtures/story-worlds";

function fixture() {
  const { world, binding } = storyWorld();
  const revisions = Array.from({ length: 24 }, (_, i) => ({
    type: "revision", id: "revision-" + i, role: i % 2 === 0 ? "user" : "assistant",
    completion: "complete", nativeMessageKey: JSON.stringify(["message", String(i)]),
  }));
  const game = { id: "game", activeBindingId: binding.id, activeChatId: binding.chatId, pendingReviewIds: ["first", "later"] } as WorldGame;
  const baseline = { type: "baseline", id: "baseline", worldId: world.id, gameId: game.id, branchId: "branch", origin: { bindingId: binding.id }, pendingReviewSeeds: [] as string[] };
  const branch = { type: "branch", id: "branch", gameManaged: true, projectionId: "projection" };
  const projection = { type: "projection", id: "projection", bindingId: binding.id, chatId: binding.chatId, revisionIds: revisions.map(r => r.id) };
  const events = [
    { type: "event", id: "first", branchId: "branch", revisionId: "revision-1" },
    { type: "event", id: "later", branchId: "branch", revisionId: "revision-5" },
  ];
  return { binding, game, baseline, projection, story: [baseline, branch, projection, ...revisions, ...events] as StoryRecord[] };
}

it("starts counting after the first unresolved entry and advances on every fifth reply", () => {
  const { binding, game, projection, story } = fixture();
  const wholeLine = projection.revisionIds;
  projection.revisionIds = wholeLine.slice(0, 10);
  expect(storyReviewReminderReply(story, game, binding)).toBeUndefined();
  projection.revisionIds = wholeLine.slice(0, 12);
  expect(storyReviewReminderReply(story, game, binding)).toBe('["message","11"]');
  projection.revisionIds = wholeLine;
  expect(storyReviewReminderReply(story, game, binding)).toBe('["message","21"]');
  expect(storyReviewReminderReply(story, { ...game, pendingReviewIds: ["later"] }, binding)).toBe('["message","15"]');
  expect(storyReviewReminderReply(story, { ...game, pendingReviewIds: [] }, binding)).toBeUndefined();
});

it("counts carried entries from the new chat and ignores an inactive game or an unselected source", () => {
  const { binding, game, baseline, projection, story } = fixture();
  baseline.pendingReviewSeeds = ["carried"];
  expect(storyReviewReminderReply(story, { ...game, pendingReviewIds: ["carried"] }, binding)).toBe('["message","19"]');
  expect(storyReviewReminderReply(story, { ...game, activeChatId: "another" }, binding)).toBeUndefined();
  projection.revisionIds = projection.revisionIds.slice(6);
  expect(storyReviewReminderReply(story, game, binding)).toBeUndefined();
});
