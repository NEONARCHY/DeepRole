import { describe, expect, it } from "vitest";
import { estimateChatHistory } from "../src/core/chat-history";
import { estimateTokens } from "../src/core/text";

describe("chat history estimate", () => {
  it("counts only user and assistant text without retaining the history", () => {
    const messages = [{ role: "system", content: "Private system text" }, { role: "user", content: "The brass key" }, { role: "assistant", content: "Mira hands Noah a map." }];
    const original = structuredClone(messages);
    const estimate = estimateChatHistory({ code: 0, data: { biz_code: 0, biz_data: { chat_messages: messages } } });
    expect(estimate).toEqual({ estimatedTokens: estimateTokens("The brass key") + estimateTokens("Mira hands Noah a map."), messageCount: 2, atLeast: false, source: "history" });
    expect(messages).toEqual(original);
    expect(JSON.stringify(estimate)).not.toMatch(/key|Mira|Private/);
  });

  it("handles fragments and nested text representations used by history responses", () => {
    const estimate = estimateChatHistory({ data: { biz_data: { messages: [{ role: "assistant", fragments: [{ content: "First" }, { text: "Second" }, { fragment_content: [{ text: "Third" }] }, "Fourth", null] }, { content: [{ text: "Fifth" }, { content: { value: "Sixth" } }] }] } } });
    expect(estimate).toEqual({ estimatedTokens: estimateTokens("First\nSecond\nThird\nFourth") + estimateTokens("Fifth\nSixth"), messageCount: 2, atLeast: false, source: "history" });
  });

  it.each(["chat_messages", "messages", "chat_message_list", "history", "message_list"])("recognizes %s and marks paginated history as a lower bound", key => {
    expect(estimateChatHistory({ data: { has_more: true, biz_data: { [key]: [{ content: "Hello" }] } } })).toMatchObject({ messageCount: 1, atLeast: true });
    expect(estimateChatHistory({ [key]: [], has_more: true })).toMatchObject({ estimatedTokens: 0, messageCount: 0, atLeast: true });
  });

  it("distinguishes an empty chat from an unsupported response", () => {
    expect(estimateChatHistory({ messages: [] })).toEqual({ estimatedTokens: 0, messageCount: 0, atLeast: false, source: "history" });
    for (const value of [null, [], "text", {}, { code: 1, messages: [] }, { data: { biz_code: 1, messages: [] } }, { messages: [{ content: { unknown: "text" } }] }, { messages: [null, 42] }, { messages: [{ content: { content: { content: { content: { content: "Too deeply nested" } } } } }] }]) {
      expect(estimateChatHistory(value)).toBeNull();
    }
  });

  it("scales to a long history while the result remains only four counters", () => {
    const content = "Noah must bring the key to Leon before 18:30. ".repeat(100);
    const estimate = estimateChatHistory({ messages: Array.from({ length: 1000 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content })) });
    expect(estimate).toEqual({ estimatedTokens: estimateTokens(content) * 1000, messageCount: 1000, atLeast: false, source: "history" });
    expect(Object.keys(estimate!)).toHaveLength(4);
  });
});
