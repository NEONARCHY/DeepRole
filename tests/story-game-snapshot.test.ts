import { describe, expect, it } from "vitest";
import { readStoryGameSnapshot, validStoryGameSnapshot } from "../src/core/story-game";
import { nativeReplyPayload } from "./fixtures/story-native-reply";
describe("native playable snapshot", () => {
  it("uses canonical identities and final fragments only", () => {
    const result = readStoryGameSnapshot(nativeReplyPayload(), "synthetic-a")!;
    expect(result).not.toBeNull(); expect(validStoryGameSnapshot(result)).toBe(true); expect(JSON.stringify(result)).not.toContain("PRIVATE_THOUGHTS"); expect(result.messages).toHaveLength(5);
  });
  it("refuses a foreign session, missing parent or an unknown schema; preserves unknown completion", () => {
    expect(readStoryGameSnapshot(nativeReplyPayload(), "foreign")).toBeNull(); expect(readStoryGameSnapshot({ messages: [] }, "synthetic-a")).toBeNull();
    const missing = nativeReplyPayload(); missing.data.biz_data.chat_messages[3]!.parent_id = 999; expect(readStoryGameSnapshot(missing, "synthetic-a")).toBeNull();
    const partial = nativeReplyPayload(); partial.data.biz_data.chat_messages[3]!.has_pending_fragment = true; expect(readStoryGameSnapshot(partial, "synthetic-a")!.messages[3]!.completion).toBe("interrupted");
    expect(readStoryGameSnapshot(null, "synthetic-a")).toBeNull();
  });
  it("can start in an empty verified session", () => {
    const value = nativeReplyPayload(); value.data.biz_data.chat_messages = []; (value.data.biz_data.chat_session as { current_message_id: number | null }).current_message_id = null;
    expect(readStoryGameSnapshot(value, "synthetic-a")).toEqual({ chatId: "synthetic-a", selectedNativeKey: null, messages: [] });
  });
  it("accepts the site's exact user text with an extension prefix; it is stripped only by a matched dispatch", () => {
    const result = readStoryGameSnapshot(nativeReplyPayload("<deeprole_character_mode>PRIVATE_CONTEXT</deeprole_character_mode>\n\n[User message]\nAct"), "synthetic-a")!;
    expect(validStoryGameSnapshot(result)).toBe(true); expect(result.messages[2]!.content).toContain("PRIVATE_CONTEXT");
  });
});
