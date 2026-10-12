import { describe, expect, it, vi } from "vitest";
import { readActiveStoryCheckpoint, saveActiveStoryCheckpoint, type StoryCheckpointTabs } from "../src/adapters/story-checkpoint-client";
import { checkpointReview } from "./fixtures/story-checkpoint";
const tab = { id: 7, url: "https://chat.deepseek.com/a/chat/s/synthetic-a" };
function fixture() {
  const review = checkpointReview(), query = vi.fn<StoryCheckpointTabs["query"]>().mockResolvedValue([tab]);
  const sendMessage = vi.fn<StoryCheckpointTabs["sendMessage"]>().mockResolvedValue({ ok: true, data: review });
  return { review, query, sendMessage, tabs: { query, sendMessage }, input: { tabId: tab.id, url: tab.url, review } };
}
describe("active checkpoint review routing", () => {
  it("reads only on request and saves precisely the reviewed snapshot without a model call", async () => {
    const f = fixture(), input = await readActiveStoryCheckpoint(f.tabs); expect(input).toEqual(f.input); expect(f.sendMessage.mock.calls).toEqual([[7, { type: "DR_STORY_CHECKPOINT_READ" }]]);
    f.sendMessage.mockResolvedValue({ ok: true, data: { branchId: "saved-branch" } }); await saveActiveStoryCheckpoint(f.tabs, input, "request-first");
    expect(f.sendMessage.mock.calls[1]).toEqual([7, { type: "DR_STORY_CHECKPOINT_SAVE", choice: { chatId: f.review.chatId, worldId: f.review.worldId, bindingId: f.review.bindingId, requestId: "request-first", expectedSceneRevision: f.review.sceneRevision, expectedSnapshot: f.review.snapshot } }]);
  });
  it.each(["https://example.com", "https://chat.deepseek.com/", "https://user@chat.deepseek.com/a/chat/s/synthetic-a"])("rejects no active bound chat for %s", async url => {
    const f = fixture(); f.query.mockResolvedValue([{ ...tab, url }]); await expect(readActiveStoryCheckpoint(f.tabs)).rejects.toThrow("story-checkpoint-no-scope"); expect(f.sendMessage).not.toHaveBeenCalled();
  });
  it("discards a read from a tab or URL changed during IPC", async () => {
    const f = fixture(); f.query.mockResolvedValueOnce([tab]).mockResolvedValue([{ ...tab, id: 8 }]); await expect(readActiveStoryCheckpoint(f.tabs)).rejects.toThrow("story-binding-conflict");
  });
  it("does not render a review returned for another chat", async () => {
    const f = fixture(); f.review.chatId = "foreign"; await expect(readActiveStoryCheckpoint(f.tabs)).rejects.toThrow("story-binding-conflict");
  });
  it("does not send approval with a different chat inside an otherwise valid review", async () => {
    const f = fixture(); f.input.review.chatId = "foreign"; await expect(saveActiveStoryCheckpoint(f.tabs, f.input, "request-first")).rejects.toThrow("story-binding-conflict"); expect(f.sendMessage).not.toHaveBeenCalled();
  });
  it.each(["tab", "url", "candidate", "review"])("does not dispatch a stale %s approval", async change => {
    const f = fixture(); if (change === "tab") f.query.mockResolvedValue([{ ...tab, id: 8 }]); if (change === "url") f.query.mockResolvedValue([{ ...tab, url: "https://chat.deepseek.com/a/chat/s/another" }]); if (change === "review") f.input.review.availableCount = 0;
    await expect(saveActiveStoryCheckpoint(f.tabs, f.input, change === "candidate" ? "foreign" : "request-first")).rejects.toThrow(); expect(f.sendMessage).not.toHaveBeenCalled();
  });
  it("freezes scene data before awaiting the active tab", async () => {
    const f = fixture(); f.sendMessage.mockResolvedValue({ ok: true, data: { branchId: "b" } });
    const promise = saveActiveStoryCheckpoint(f.tabs, f.input, "request-first"); f.input.review.snapshot.states["person-1"]!.goal = "Changed"; await promise;
    expect((f.sendMessage.mock.calls[0]![1] as any).choice.expectedSnapshot.states["person-1"].goal).toBe("Repair the clock.");
  });
  it("propagates conflict/vault errors and rejects malformed replies", async () => {
    const f = fixture(); f.sendMessage.mockResolvedValue({ ok: false, error: "vault-locked" }); await expect(readActiveStoryCheckpoint(f.tabs)).rejects.toThrow("vault-locked");
    f.sendMessage.mockResolvedValue({ ok: true, data: { ...f.review, secret: "PRIVATE" } }); await expect(readActiveStoryCheckpoint(f.tabs)).rejects.toThrow("story-checkpoint-failed");
    f.sendMessage.mockResolvedValue({ ok: true, data: null }); await expect(saveActiveStoryCheckpoint(f.tabs, f.input, "request-first")).rejects.toThrow("story-checkpoint-failed");
  });
});
