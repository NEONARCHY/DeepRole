import type { ContinuationDraft } from "./continuation-flow";
import { validStoryGameSnapshot } from "./story-game";

export async function continuationPromptDigest(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Exact first pair from the canonical server graph, never a DOM/text guess. */
export async function continuationHistoryIssue(value: unknown, draft: ContinuationDraft) {
  if (!draft.requestId || !draft.promptDigest || !validStoryGameSnapshot(value) || value.chatId !== draft.targetChatId) return "native-shape";
  if (value.messages.length !== 2) return "handoff-history-count";
  const user = value.messages.find(m => m.identity.role === "user");
  const reply = value.messages.find(m => m.identity.role === "assistant");
  if (!user || !reply || user.identity.nativeParentKey !== null || reply.identity.nativeParentKey !== user.identity.nativeMessageKey
    || value.selectedNativeKey !== reply.identity.nativeMessageKey) return "handoff-history-branch";
  if (user.completion !== "complete") return "handoff-history-user-incomplete";
  if (reply.completion !== "complete") return "handoff-history-reply-incomplete";
  return await continuationPromptDigest(user.content) === draft.promptDigest ? null : "handoff-history-digest";
}

export async function acceptedContinuationHistory(value: unknown, draft: ContinuationDraft): Promise<boolean> {
  return await continuationHistoryIssue(value, draft) === null;
}
