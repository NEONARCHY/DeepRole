import { validStoryCheckpointReview, type StoryCheckpointChoice, type StoryCheckpointReview } from "../core/story-checkpoint";
import { isDiagnosticChatUrl } from "./story-diagnostics-client";
import { isSameDeepSeekChat } from "../core/chat-scope";

export interface StoryCheckpointTabs {
  query(query: { active: boolean; currentWindow: boolean }): Promise<{ id?: number; url?: string }[]>;
  sendMessage(tabId: number, message: { type: "DR_STORY_CHECKPOINT_READ" } | { type: "DR_STORY_CHECKPOINT_SAVE"; choice: StoryCheckpointChoice }): Promise<unknown>;
}
export interface ActiveCheckpointReview { tabId: number; url: string; review: StoryCheckpointReview }
async function active(tabs: StoryCheckpointTabs) {
  const [tab] = await tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || !tab.url || !isDiagnosticChatUrl(tab.url)) throw Error("story-checkpoint-no-scope");
  return { tabId: tab.id, url: tab.url };
}
function result(reply: unknown): unknown {
  if (!reply || typeof reply !== "object") throw Error("story-checkpoint-failed");
  const r = reply as { ok?: unknown; error?: unknown; data?: unknown };
  if (r.ok !== true) throw Error(typeof r.error === "string" ? r.error : "story-checkpoint-failed");
  return r.data;
}
export async function readActiveStoryCheckpoint(tabs: StoryCheckpointTabs): Promise<ActiveCheckpointReview> {
  const before = await active(tabs), data = result(await tabs.sendMessage(before.tabId, { type: "DR_STORY_CHECKPOINT_READ" })), after = await active(tabs);
  if (before.tabId !== after.tabId || before.url !== after.url) throw Error("story-binding-conflict");
  if (!validStoryCheckpointReview(data)) throw Error("story-checkpoint-failed");
  if (!isSameDeepSeekChat(before.url, before.url, data.chatId)) throw Error("story-binding-conflict");
  return { ...before, review: data };
}
export async function saveActiveStoryCheckpoint(tabs: StoryCheckpointTabs, input: ActiveCheckpointReview, requestId: string): Promise<void> {
  // Freeze the reviewed scene before any tab/IPC awaits. Switching away invalidates it.
  input = structuredClone(input);
  const before = await active(tabs);
  if (input.tabId !== before.tabId || input.url !== before.url || !validStoryCheckpointReview(input.review) || !isSameDeepSeekChat(input.url, input.url, input.review.chatId) || !input.review.candidates.some(c => c.requestId === requestId)) throw Error("story-binding-conflict");
  const r = input.review;
  const data = result(await tabs.sendMessage(input.tabId, { type: "DR_STORY_CHECKPOINT_SAVE", choice: { chatId: r.chatId, worldId: r.worldId, bindingId: r.bindingId, requestId, expectedSceneRevision: r.sceneRevision, expectedSnapshot: r.snapshot } }));
  const after = await active(tabs);
  if (before.tabId !== after.tabId || before.url !== after.url) throw Error("story-binding-conflict");
  if (!data || typeof data !== "object" || typeof (data as { branchId?: unknown }).branchId !== "string") throw Error("story-checkpoint-failed");
}
