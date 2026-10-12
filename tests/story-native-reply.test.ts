import { describe, expect, it } from "vitest";
import { readNativeStoryReply, validNativeStoryReplyQuery, validNativeStoryReplyResult } from "../src/core/story-native-reply";
import { nativeStoryMessageKey as key } from "../src/core/story-transport";
import { nativeReplyPayload, replyQuery } from "./fixtures/story-native-reply";

describe("exact native reply sources, not local story selection", () => {
  it("extracts only the associated final pair, preserving literal request markers and response whitespace", () => {
    const text = "PRIVATE_MEMORY\n\n[User message]\nI quote [User message] literally.", payload = nativeReplyPayload(text);
    payload.data.biz_data.chat_messages[3]!.fragments.push({ type: "RESPONSE", content: "\nSecond fragment.  " });
    const read = readNativeStoryReply(payload, replyQuery); expect(read.status).toBe("read"); if (read.status !== "read") throw Error();
    expect(read.result.wireUserText).toBe(text); expect(read.result.assistant.content).toBe("Мира передала ключ. Mira delivered the key.\nSecond fragment.  ");
    expect(read.result.serverSelection).toBe("anchor"); expect(validNativeStoryReplyResult(read.result)).toBe(true);
    expect(JSON.stringify(read.result)).not.toMatch(/THOUGHTS|EARLIER|FOREIGN/);
  });
  it("can observe an explicitly linked completed alternative without adopting the server pointer", () => {
    const payload = nativeReplyPayload(); payload.data.biz_data.chat_session.current_message_id = 99;
    expect(readNativeStoryReply(payload, replyQuery)).toMatchObject({ status: "read", result: { serverSelection: "different", assistant: { content: "Мира передала ключ. Mira delivered the key." } } });
    delete (payload.data.biz_data.chat_session as any).current_message_id;
    expect(readNativeStoryReply(payload, replyQuery)).toMatchObject({ status: "read", result: { serverSelection: "unknown" } });
  });
  it.each([
    (p: any) => { p.data.biz_data.chat_session.id = "foreign"; }, (p: any) => { p.code = 1; },
    (p: any) => { p.data.biz_data.chat_messages[3].parent_id = 40; }, (p: any) => { p.data.biz_data.chat_messages[2].parent_id = null; },
    (p: any) => { p.data.biz_data.chat_messages[3].role = "USER"; }, (p: any) => { p.data.biz_data.chat_messages.push(p.data.biz_data.chat_messages[3]); },
    (p: any) => { p.data.biz_data.chat_messages[3].id = 98; }, (p: any) => { p.data.biz_data.chat_messages[3].status = "WIP"; },
    (p: any) => { p.data.biz_data.chat_messages[3].status = "INCOMPLETE"; }, (p: any) => { p.data.biz_data.chat_messages[3].status = "CONTENT_FILTER"; },
    (p: any) => { p.data.biz_data.chat_messages[3].status = "UNKNOWN"; }, (p: any) => { p.data.biz_data.chat_messages[3].has_pending_fragment = true; },
    (p: any) => { delete p.data.biz_data.chat_messages[3].has_pending_fragment; }, (p: any) => { p.data.biz_data.chat_messages[3].quasi_status = "WIP"; },
    (p: any) => { p.data.biz_data.chat_messages[2].status = "WIP"; },
  ])("rejects a wrong schema, pair or unproven terminal state %#", mutate => {
    const payload = nativeReplyPayload(); mutate(payload); expect(readNativeStoryReply(payload, replyQuery).status).toBe("unavailable");
  });
  it.each([
    [{ type: "THINK", content: "PRIVATE_THOUGHTS" }], [{ type: "RESPONSE", text: "PRIVATE_ALIAS" }], [{ type: "TEXT", content: "PRIVATE_ALIAS" }],
    [{ type: "RESPONSE", content: "ok" }, { type: "UNKNOWN", content: "PRIVATE_UNKNOWN" }], [{ type: "RESPONSE", content: "ok" }, { type: "IMAGE", content: "PRIVATE_IMAGE" }],
    [{ type: "RESPONSE", content: "[DeepRole Service]\nInternal operation" }], [{ type: "RESPONSE", content: "x".repeat(250_001) }],
  ].map(fragments => ({ fragments })))("does not truncate or promote unknown/nontext/service fragments %#", ({ fragments }) => {
    const payload = nativeReplyPayload(); payload.data.biz_data.chat_messages[3]!.fragments = fragments as any;
    (payload.data.biz_data.chat_messages[3] as any).content = "PRIVATE_FALLBACK";
    expect(readNativeStoryReply(payload, replyQuery)).toEqual({ status: "unavailable", code: "text" });
  });
  it("requires one literal committed REQUEST, not file text or concatenated unrelated prompts", () => {
    const payload = nativeReplyPayload(); payload.data.biz_data.chat_messages[2]!.fragments.push({ type: "REQUEST", content: "extra" });
    expect(readNativeStoryReply(payload, replyQuery).status).toBe("unavailable");
    payload.data.biz_data.chat_messages[2]!.fragments = [{ type: "FILE", content: "PRIVATE_FILE" }];
    expect(readNativeStoryReply(payload, replyQuery).status).toBe("unavailable");
  });
  it("can read an explicit root, but never treats an absent parent as a root", () => {
    const query = { ...replyQuery, identity: { ...replyQuery.identity, nativeParentKey: null }, link: { ...replyQuery.link, nativeParentKey: null } }, payload = nativeReplyPayload();
    payload.data.biz_data.chat_messages.splice(0, 2); payload.data.biz_data.chat_messages[0]!.parent_id = null;
    expect(readNativeStoryReply(payload, query).status).toBe("read"); delete (payload.data.biz_data.chat_messages[0] as any).parent_id;
    expect(readNativeStoryReply(payload, query).status).toBe("unavailable");
  });
  it.each(["quasi_status", "incomplete_message"])("rejects conflicting user lifecycle %s", field => {
    const payload = nativeReplyPayload(); (payload.data.biz_data.chat_messages[2] as any)[field] = "PRIVATE_CONFLICT";
    expect(readNativeStoryReply(payload, replyQuery)).toEqual({ status: "unavailable", code: "completion" });
  });
  it("does not accept additional page-controlled fields or a conflicting request link", () => {
    expect(validNativeStoryReplyQuery({ ...replyQuery, token: "PRIVATE_TOKEN" })).toBe(false);
    expect(validNativeStoryReplyQuery({ ...replyQuery, link: { ...replyQuery.link, nativeParentKey: key("99") } })).toBe(false);
    const read = readNativeStoryReply(nativeReplyPayload(), replyQuery); if (read.status !== "read") throw Error();
    expect(validNativeStoryReplyResult({ ...read.result, token: "PRIVATE_TOKEN" })).toBe(false);
    expect(validNativeStoryReplyResult({ ...read.result, assistant: { ...read.result.assistant, completion: "partial" } })).toBe(false);
  });
});
