import { isDiagnosticChatUrl } from "./story-diagnostics-client";
import { isSameDeepSeekChat } from "../core/chat-scope";
import { validStoryReviewPage, validStoryReviewPreview, type StoryReviewCursor, type StoryReviewPage, type StoryReviewPreview } from "../core/story-review";
import { sameStoryValue } from "../core/story-value";
import { validCharacterDiscoveryPage, type CharacterDiscoveryAction } from "../core/story-character-discovery";
type DiscoveryMessage = { type: "DR_CHARACTER_DISCOVERY" } & CharacterDiscoveryAction;
import { validSupplementPage, type SupplementAction } from "../core/profile-supplements";
type SupplementMessage = { type: "DR_STORY_PROFILE" } & SupplementAction;
export interface StoryReviewTabs {
  query(query: { active: boolean; currentWindow: boolean }): Promise<{ id?: number; url?: string }[]>;
  sendMessage(tabId: number, message: SupplementMessage | DiscoveryMessage | { type: "DR_STORY_REPAIR"; input: import("../storage/story-repair").StoryRepairInput; cancel?: boolean } | { type: "DR_STORY_FACT"; input: import("../storage/story-facts").StoryFactApproval } | { type: "DR_STORY_REVIEW_READ"; cursor: StoryReviewCursor | null } | { type: "DR_STORY_REVIEW_PREVIEW"; input: import("../core/story-review").StoryPreviewInput } | { type: "DR_STORY_GAME"; operation: "start" | "restart" | "sync" | "undo" | "out-of-character"; manual: "stop" | "keep" }): Promise<unknown>;
}
export interface ActiveStoryReview { tabId: number; url: string; page: StoryReviewPage }
async function active(tabs: StoryReviewTabs) {
  const [tab] = await tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || !tab.url || !isDiagnosticChatUrl(tab.url)) throw Error("story-checkpoint-no-scope");
  return { tabId: tab.id, url: tab.url };
}
function result(reply: unknown) {
  if (!reply || typeof reply !== "object") throw Error("story-review-invalid");
  const r = reply as { ok?: unknown; data?: unknown; error?: unknown };
  if (r.ok !== true) throw Error(typeof r.error === "string" ? r.error : "story-review-invalid");
  return r.data;
}
function sameTab(a: { tabId: number; url: string }, b: { tabId: number; url: string }) {
  if (a.tabId !== b.tabId || a.url !== b.url) throw Error("story-binding-conflict");
}
export async function readActiveStoryReview(tabs: StoryReviewTabs, previous?: ActiveStoryReview): Promise<ActiveStoryReview> {
  previous = previous && structuredClone(previous);
  const before = await active(tabs); if (previous) { sameTab(before, previous); if (!validStoryReviewPage(previous.page) || !previous.page.next) throw Error("story-review-stale"); }
  const data = result(await tabs.sendMessage(before.tabId, { type: "DR_STORY_REVIEW_READ", cursor: previous?.page.next ?? null }));
  sameTab(before, await active(tabs));
  if (!validStoryReviewPage(data)) throw Error("story-review-invalid");
  if (!isSameDeepSeekChat(before.url, before.url, data.chatId) || previous && (data.worldId !== previous.page.worldId || data.bindingId !== previous.page.bindingId || !sameStoryValue(data.guard, previous.page.guard) || data.offset !== previous.page.next!.offset)) throw Error("story-binding-conflict");
  if (!previous && data.offset !== 0) throw Error("story-review-invalid");
  return { ...before, page: data };
}
export async function previewActiveStoryReview(tabs: StoryReviewTabs, target: ActiveStoryReview, headRevisionId: string | null): Promise<StoryReviewPreview> {
  target = structuredClone(target); const before = await active(tabs); sameTab(before, target);
  if (!validStoryReviewPage(target.page) || !target.page.guard || !isSameDeepSeekChat(before.url, before.url, target.page.chatId)
    || headRevisionId !== null && !target.page.entries.some(e => e.id === headRevisionId && e.role === "assistant" && e.completion === "complete")) throw Error("story-review-invalid");
  const data = result(await tabs.sendMessage(before.tabId, { type: "DR_STORY_REVIEW_PREVIEW", input: { chatId: target.page.chatId, worldId: target.page.worldId, guard: target.page.guard, headRevisionId } }));
  sameTab(before, await active(tabs));
  if (!validStoryReviewPreview(data)) throw Error("story-review-invalid");
  if (data.chatId !== target.page.chatId || data.worldId !== target.page.worldId || data.headRevisionId !== headRevisionId || !sameStoryValue(data.guard, target.page.guard)) throw Error("story-binding-conflict");
  return data;
}
export async function runActiveStoryGame(tabs: StoryReviewTabs, operation: "start" | "restart" | "sync" | "undo" | "out-of-character", manual: "stop" | "keep" = "stop") {
  const before = await active(tabs);
  const data = result(await tabs.sendMessage(before.tabId, { type: "DR_STORY_GAME", operation, manual }));
  sameTab(before, await active(tabs));
  if (!data || typeof data !== "object" || typeof (data as { active?: unknown }).active !== "boolean") throw Error("story-game-invalid");
  return data;
}
export async function approveActiveStoryFact(tabs: StoryReviewTabs, page: StoryReviewPage, eventId: string, text: string, accept: boolean) {
  const before = await active(tabs);
  if (!page.guard || !validStoryReviewPage(page) || !isSameDeepSeekChat(before.url, before.url, page.chatId)) throw Error("story-binding-conflict");
  result(await tabs.sendMessage(before.tabId, { type: "DR_STORY_FACT", input: { chatId: page.chatId, worldId: page.worldId, guard: page.guard, eventId, text, accept } }));
  sameTab(before, await active(tabs));
}
export async function repairActiveStory(tabs: StoryReviewTabs, page: StoryReviewPage) {
  const before = await active(tabs);
  if (!page.guard || !page.currentRevisionId || !isSameDeepSeekChat(before.url, before.url, page.chatId)) throw Error("story-binding-conflict");
  result(await tabs.sendMessage(before.tabId, { type: "DR_STORY_REPAIR", input: { worldId: page.worldId, chatId: page.chatId, revisionId: page.currentRevisionId, guard: page.guard } }));
  sameTab(before, await active(tabs));
}
export async function discoverActiveStory(tabs: StoryReviewTabs, action: CharacterDiscoveryAction) {
  const before = await active(tabs);
  if (!isSameDeepSeekChat(before.url, before.url, action.input.chatId)) throw Error("story-binding-conflict");
  const data = result(await tabs.sendMessage(before.tabId, { type: "DR_CHARACTER_DISCOVERY", ...action }));
  sameTab(before, await active(tabs));
  if (action.action === "cancel") return null;
  if (!validCharacterDiscoveryPage(data) || data.chatId !== action.input.chatId || data.worldId !== action.input.worldId) throw Error("story-review-invalid");
  return data;
}
export async function supplementActiveStory(tabs: StoryReviewTabs, action: SupplementAction) {
  const before = await active(tabs);
  if (!isSameDeepSeekChat(before.url, before.url, action.input.chatId)) throw Error("story-binding-conflict");
  const data = result(await tabs.sendMessage(before.tabId, { type: "DR_STORY_PROFILE", ...action })); sameTab(before, await active(tabs));
  if (action.action === "cancel") return null;
  if (!validSupplementPage(data) || data.chatId !== action.input.chatId || data.worldId !== action.input.worldId) throw Error("story-review-invalid");
  return data;
}
