import { describe, expect, it } from "vitest";
import { acceptedContinuationHistory, continuationPromptDigest } from "../src/core/continuation-recovery";
import { assembledPrompt, injectIntoJsonBody, outgoingUserText } from "../src/core/request-injection";
import { nativeStoryMessageKey as key } from "../src/core/story-transport";
import type { StoryGameSnapshot } from "../src/core/story-game";
import { matchingContinuationDraft, continuationDraftKey } from "../src/core/continuation-flow";

async function fixture() {
  const prompt = assembledPrompt("  Original\nЯ отвечаю.  ", "<deeprole_context>Exact memory</deeprole_context>");
  const draft = { snapshotId: "s", snapshotToken: "t", targetChatId: "target", draft: "original", requestId: "request", promptDigest: await continuationPromptDigest(prompt) };
  const history: StoryGameSnapshot = { chatId: "target", selectedNativeKey: key("2"), messages: [
    { identity: { role: "user", nativeMessageKey: key("1"), nativeParentKey: null }, completion: "complete", content: prompt },
    { identity: { role: "assistant", nativeMessageKey: key("2"), nativeParentKey: key("1") }, completion: "complete", content: "The answer." },
  ] };
  return { draft, history };
}

describe("continuation history recovery", () => {
  it("matches the complete first server pair against the exact outgoing text", async () => {
    const { draft, history } = await fixture();
    expect(await acceptedContinuationHistory(history, draft)).toBe(true);
    history.messages.reverse();
    expect(await acceptedContinuationHistory(history, draft)).toBe(true);
    expect(draft.promptDigest).toHaveLength(64);
  });
  it.each(["chat", "text", "whitespace", "root", "parent", "selection", "user-partial", "reply-partial", "extra", "duplicate", "empty", "no-proof"])("never infers acceptance from %s", async kind => {
    const { draft, history } = await fixture();
    if (kind === "chat") history.chatId = "other";
    if (kind === "text") history.messages[0]!.content += "changed";
    if (kind === "whitespace") history.messages[0]!.content = history.messages[0]!.content.trim();
    if (kind === "root") history.messages[0]!.identity.nativeParentKey = key("old");
    if (kind === "parent") history.messages[1]!.identity.nativeParentKey = key("other");
    if (kind === "selection") history.selectedNativeKey = key("1");
    if (kind === "user-partial") history.messages[0]!.completion = "partial";
    if (kind === "reply-partial") history.messages[1]!.completion = "interrupted";
    if (kind === "extra") history.messages.push({ ...history.messages[0]!, identity: { role: "user", nativeMessageKey: key("3"), nativeParentKey: key("2") } });
    if (kind === "duplicate") history.messages[1]!.identity.nativeMessageKey = key("1");
    if (kind === "empty") history.messages = [];
    if (kind === "no-proof") draft.promptDigest = "";
    expect(await acceptedContinuationHistory(history, draft)).toBe(false);
  });
  it("keeps the prepared fingerprint consistent with actual prompt injection", () => {
    const original = "  Exact\nmessage 😀  ", memory = "<deeprole_context>Memory</deeprole_context>";
    const injected = injectIntoJsonBody(JSON.stringify({ prompt: original }), memory);
    expect(injected.changed).toBe(true);
    expect(outgoingUserText(injected.body)).toBe(assembledPrompt(original, memory));
  });
  it("requires a complete proof pair and includes the request ID in dismissal guards", async () => {
    const { draft } = await fixture();
    expect(matchingContinuationDraft(draft, "s", "t", draft)).toBe(draft);
    expect(matchingContinuationDraft({ ...draft, promptDigest: undefined }, "s", "t", draft)).toBeNull();
    expect(matchingContinuationDraft({ ...draft, requestId: undefined }, "s", "t", draft)).toBeNull();
    expect(continuationDraftKey({ ...draft, requestId: "next" })).not.toBe(continuationDraftKey(draft));
  });
  it("compares the captured memory policy by value across storage serialization", async () => {
    const { draft } = await fixture();
    const policy = { mode: "automatic" as const, revision: "r", profileVersions: {}, profileLocks: {} };
    const reordered = { profileLocks: {}, profileVersions: {}, revision: "r", mode: "automatic" as const };
    expect(continuationDraftKey({ ...draft, automation: reordered })).toBe(continuationDraftKey({ ...draft, automation: policy }));
    expect(continuationDraftKey({ ...draft, automation: { ...policy, revision: "s" } })).not.toBe(continuationDraftKey({ ...draft, automation: policy }));
  });
});
