import { expect, it, vi } from "vitest";
import { readActiveStoryReview, previewActiveStoryReview, runActiveStoryGame, type StoryReviewTabs } from "../src/adapters/story-review-client";
import { storyReviewPage, storyReviewLastPage, storyReviewPreview } from "./fixtures/story-review";
const tab = { id: 7, url: "https://chat.deepseek.com/a/chat/s/synthetic-a" };
it("freezes the requested game scope and rejects another chat before sending", async () => {
  const f = fixture(), scope = { chatId: "synthetic-a", worldId: "world" };
  f.sendMessage.mockResolvedValue({ ok: true, data: { active: true } });
  const pending = runActiveStoryGame(f.tabs, "sync", "stop", scope); scope.worldId = "late-change"; await pending;
  expect(f.sendMessage).toHaveBeenCalledWith(7, { type: "DR_STORY_GAME", operation: "sync", manual: "stop", scope: { chatId: "synthetic-a", worldId: "world" } });
  f.sendMessage.mockClear(); await expect(runActiveStoryGame(f.tabs, "restart", "stop", { chatId: "other", worldId: "world" })).rejects.toThrow("story-binding-conflict"); expect(f.sendMessage).not.toHaveBeenCalled();
});
function fixture() {
  const page = storyReviewPage(), query = vi.fn<StoryReviewTabs["query"]>().mockResolvedValue([tab]), sendMessage = vi.fn<StoryReviewTabs["sendMessage"]>().mockResolvedValue({ ok: true, data: page });
  return { page, query, sendMessage, tabs: { query, sendMessage }, target: { tabId: tab.id, url: tab.url, page } };
}
it("reads, pages and previews only through read-only messages with frozen scope", async () => {
  const f = fixture(); expect(await readActiveStoryReview(f.tabs)).toEqual(f.target); expect(f.sendMessage.mock.calls[0]).toEqual([7, { type: "DR_STORY_REVIEW_READ", cursor: null }]);
  f.sendMessage.mockResolvedValue({ ok: true, data: storyReviewLastPage() }); const next = await readActiveStoryReview(f.tabs, f.target); expect(next.page.offset).toBe(2); expect(f.sendMessage.mock.calls[1]).toEqual([7, { type: "DR_STORY_REVIEW_READ", cursor: f.page.next }]);
  f.sendMessage.mockResolvedValue({ ok: true, data: storyReviewPreview() }); expect(await previewActiveStoryReview(f.tabs, f.target, "review-assistant")).toEqual(storyReviewPreview());
  expect(f.sendMessage.mock.calls[2]).toEqual([7, { type: "DR_STORY_REVIEW_PREVIEW", input: { chatId: f.page.chatId, worldId: f.page.worldId, guard: f.page.guard, headRevisionId: "review-assistant" } }]);
});
it.each(["https://example.com", "https://chat.deepseek.com/", "https://user@chat.deepseek.com/a/chat/s/synthetic-a"])("rejects %s before sending", async url => {
  const f = fixture(); f.query.mockResolvedValue([{ ...tab, url }]); await expect(readActiveStoryReview(f.tabs)).rejects.toThrow("story-checkpoint-no-scope"); expect(f.sendMessage).not.toHaveBeenCalled();
});
it.each(["tab", "url"])("discards a reply after changed %s", async change => {
  const f = fixture(); f.query.mockResolvedValueOnce([tab]).mockResolvedValue([{ ...tab, ...(change === "tab" ? { id: 8 } : { url: "https://chat.deepseek.com/chat/s/another" }) }]); await expect(readActiveStoryReview(f.tabs)).rejects.toThrow("story-binding-conflict");
});
it.each(["world", "chat", "head", "guard"])("rejects a preview returned with another %s", async change => {
  const f = fixture(), p = storyReviewPreview(); if (change === "world") p.worldId = "foreign"; if (change === "chat") p.chatId = "foreign"; if (change === "head") p.headRevisionId = null; if (change === "guard") p.guard.selectionVersion++;
  f.sendMessage.mockResolvedValue({ ok: true, data: p }); await expect(previewActiveStoryReview(f.tabs, f.target, "review-assistant")).rejects.toThrow("story-binding-conflict");
});
it.each(["user", "incomplete", "unknown", "chat"])("does not request a %s target", async change => {
  const f = fixture(); if (change === "incomplete") f.page.entries[1]!.completion = "partial"; if (change === "chat") f.page.chatId = "foreign";
  await expect(previewActiveStoryReview(f.tabs, f.target, change === "user" ? "review-user" : change === "unknown" ? "unknown" : "review-assistant")).rejects.toThrow(); expect(f.sendMessage).not.toHaveBeenCalled();
});
it("freezes a preview before any await and denies malformed responses", async () => {
  const f = fixture(); f.sendMessage.mockResolvedValue({ ok: true, data: storyReviewPreview() }); const pending = previewActiveStoryReview(f.tabs, f.target, "review-assistant"); f.page.guard!.selectionVersion++; await pending;
  expect((f.sendMessage.mock.calls[0]![1] as any).input.guard.selectionVersion).toBe(0);
  f.sendMessage.mockResolvedValue({ ok: true, data: { ...storyReviewPage(), secret: "PRIVATE" } }); await expect(readActiveStoryReview(f.tabs)).rejects.toThrow("story-review-invalid");
});
it("rejects a wrong-chat first page and stale pagination; propagates vault denial", async () => {
  const f = fixture(); f.sendMessage.mockResolvedValue({ ok: true, data: { ...f.page, chatId: "foreign" } }); await expect(readActiveStoryReview(f.tabs)).rejects.toThrow("story-binding-conflict");
  f.sendMessage.mockResolvedValue({ ok: true, data: { ...storyReviewLastPage(), worldId: "foreign" } }); await expect(readActiveStoryReview(f.tabs, f.target)).rejects.toThrow("story-binding-conflict");
  f.sendMessage.mockResolvedValue({ ok: false, error: "vault-locked" }); await expect(readActiveStoryReview(f.tabs)).rejects.toThrow("vault-locked");
});
