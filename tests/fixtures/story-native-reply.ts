import { nativeStoryMessageKey as key } from "../../src/core/story-transport";
import type { NativeStoryReplyQuery } from "../../src/core/story-native-reply";
export const replyQuery: NativeStoryReplyQuery = { requestId: "request-a", identity: { chatId: "synthetic-a", nativeParentKey: key("41") }, link: { requestId: "request-a", chatId: "synthetic-a", nativeParentKey: key("41"), userMessageKey: key("42"), assistantMessageKey: key("43") } };
export function nativeReplyPayload(wireText = "PRIVATE_DRAFT") {
  return { code: 0, data: { biz_code: 0, biz_data: { chat_session: { id: "synthetic-a", current_message_id: 43 }, chat_messages: [
    { message_id: 40, parent_id: null, role: "USER", status: "FINISHED", has_pending_fragment: false, fragments: [{ type: "REQUEST", content: "PRIVATE_EARLIER_USER" }] },
    { message_id: 41, parent_id: 40, role: "ASSISTANT", status: "FINISHED", has_pending_fragment: false, fragments: [{ type: "RESPONSE", content: "PRIVATE_EARLIER_REPLY" }] },
    { message_id: 42, parent_id: 41, role: "USER", status: "FINISHED", has_pending_fragment: false, fragments: [{ type: "REQUEST", content: wireText }] },
    { message_id: 43, parent_id: 42, role: "ASSISTANT", status: "FINISHED", has_pending_fragment: false, fragments: [{ type: "THINK", content: "PRIVATE_THOUGHTS" }, { type: "RESPONSE", content: "Мира передала ключ. Mira delivered the key." }] },
    { message_id: 99, parent_id: 42, role: "ASSISTANT", status: "FINISHED", has_pending_fragment: false, fragments: [{ type: "RESPONSE", content: "PRIVATE_FOREIGN_BRANCH" }] },
  ] } } };
}
