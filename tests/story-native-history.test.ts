import { describe, expect, it } from "vitest";
import { readNativeStoryHistory } from "../src/core/story-native-history";
import { nativeStoryMessageKey as key } from "../src/core/story-transport";

const chat = "synthetic-clock-chat";
const message = (id: unknown = 1, parent: unknown = null, role: unknown = "USER") => ({ message_id: id, parent_message_id: parent, role });
const history = (messages: unknown[], extra = {}) => ({ code: 0, data: { biz_code: 0, biz_data: { chat_session_id: chat, messages, ...extra } } });
describe("strict native history metadata (not transcript transfer or completion proof)", () => {
  it("keeps explicit native links, not list order, and never declares completion", () => {
    const input = history([message(3, 2), message(2, 1, "assistant"), message(1)]);
    const before = structuredClone(input), result = readNativeStoryHistory(input, chat);
    expect(result.messages).toEqual([
      { role: "user", nativeMessageKey: key("3"), nativeParentKey: key("2") },
      { role: "assistant", nativeMessageKey: key("2"), nativeParentKey: key("1") },
      { role: "user", nativeMessageKey: key("1"), nativeParentKey: null },
    ]);
    expect(result.diagnostics).toMatchObject({ ancestry: "complete", completion: "unknown", messageCount: 3, identityCount: 3, rootCount: 1, boundaryCount: 0, issues: [] });
    expect(input).toEqual(before);
  });
  it("normalizes numeric/string aliases but distinguishes root, zero and literal null", () => {
    const result = readNativeStoryHistory(history([
      { ...message(0), id: "0", parent_id: null },
      { ...message("null", "0", "ASSISTANT"), id: "null", parent_id: 0 },
      { ...message("last", "null", "user"), parent_id: "null" },
    ]), chat);
    expect(result.messages?.map(row => row.nativeParentKey)).toEqual([null, key("0"), key("null")]);
    expect(result.diagnostics.ancestry).toBe("complete");
  });
  it.each(["chat_messages", "messages", "chat_message_list", "history", "message_list"])("reads the known %s list without arbitrary deep searching", field => {
    const result = readNativeStoryHistory({ [field]: [{ id: "a", parent_id: null, role: "user" }] }, chat);
    expect(result.messages).toHaveLength(1);
    expect(readNativeStoryHistory({ arbitrary: { [field]: [message()] } }, chat).messages).toBeNull();
  });
  it.each([
    ["missing-parent", { message_id: 1, role: "user", content: "Explicit root: null" }],
    ["invalid-parent", message(1, "")], ["invalid-parent", { ...message(), parent_message_id: undefined }],
    ["invalid-parent", message(1, -1)], ["invalid-parent", message(1, Number.MAX_SAFE_INTEGER + 1)],
    ["conflicting-parent", { ...message(1, null), parent_id: 0 }],
    ["conflicting-parent", { ...message(1, 2), parent_id: 3 }],
    ["invalid-id", message(" ")], ["invalid-id", message(1.5)], ["invalid-id", message(-1)],
    ["invalid-id", message("__proto__")], ["invalid-id", { parent_id: null, role: "user" }],
    ["conflicting-id", { ...message(1), id: 2 }],
    ["invalid-id", { ...message(1), id: undefined }],
    ["invalid-role", message(1, null, "system")], ["invalid-role", message(1, null, " user ")],
    ["invalid-role", { message_id: 1, parent_id: null, assistant: true }],
    ["invalid-message", null], ["invalid-message", []], ["self-parent", message(1, "1")],
  ])("rejects %s without rescuing the rest of an ambiguous window", (code, input) => {
    const result = readNativeStoryHistory(history([input, message("valid")]), chat);
    expect(result.messages).toBeNull();
    expect(result.diagnostics.ancestry).toBe("invalid");
    expect(result.diagnostics.issues).toContainEqual(expect.objectContaining({ code }));
  });
  it("rejects duplicate IDs, including identical duplicates, and does not silently overwrite a source", () => {
    for (const second of [message(), message(1, null, "assistant")]) {
      expect(readNativeStoryHistory(history([message(), second]), chat).diagnostics.issues[0]?.code).toBe("duplicate-id");
    }
  });
  it("rejects same-role parent links and parent cycles, without recursion", () => {
    expect(readNativeStoryHistory(history([message(1), message(2, 1)]), chat).diagnostics.issues[0]?.code).toBe("same-role-parent");
    const cycle = readNativeStoryHistory(history([message(1, 2), message(2, 1, "assistant")]), chat);
    expect(cycle.messages).toBeNull(); expect(cycle.diagnostics.issues).toContainEqual(expect.objectContaining({ code: "parent-cycle" }));
  });
  it("retains a paginated/missing-parent boundary instead of pretending it is a root", () => {
    const result = readNativeStoryHistory(history([message(42, 41, "assistant")], { has_more: true }), chat);
    expect(result.messages?.[0]?.nativeParentKey).toBe(key("41"));
    expect(result.diagnostics).toMatchObject({ ancestry: "partial", boundaryCount: 1, rootCount: 0, pagination: true, completion: "unknown" });
    expect(readNativeStoryHistory(history([message()], { has_more: true }), chat).diagnostics.ancestry).toBe("partial");
    expect(readNativeStoryHistory({ data: { has_more: true, messages: [message()] } }, chat).diagnostics.pagination).toBe(true);
  });
  it("does not choose among alternatives, disconnected roots or a unique newest leaf", () => {
    const result = readNativeStoryHistory(history([message(1), message(2, 1, "assistant"), message(3, 1, "assistant"), message(9)]), chat);
    expect(result.messages).toHaveLength(4); expect(result.diagnostics.rootCount).toBe(2);
    expect(result).not.toHaveProperty("selected"); expect(result.diagnostics.completion).toBe("unknown");
    expect(readNativeStoryHistory(history([{ id: 1, role: "user" }, { id: 2, role: "assistant" }]), chat).messages).toBeNull();
  });
  it.each([
    null, [], { data: null }, { data: { biz_data: [] } }, { code: 1, messages: [message()] },
    { code: "0", messages: [message()] }, { data: { biz_code: 1, messages: [message()] } },
    { messages: "private text" }, { messages: [], history: [] },
    { messages: [], data: { messages: [] } }, { chat_session_id: "another", messages: [] },
    { data: { biz_data: { chat_session_id: null, messages: [] } } },
  ])("fails closed on unsupported, conflicting or cross-chat envelopes %#", input => {
    expect(readNativeStoryHistory(input, chat).messages).toBeNull();
  });
  it("separates an empty valid list from unreadable metadata and validates the target chat", () => {
    expect(readNativeStoryHistory(history([]), chat)).toMatchObject({ messages: [], diagnostics: { ancestry: "empty", completion: "unknown", messageCount: 0 } });
    expect(readNativeStoryHistory(history([]), "__proto__").messages).toBeNull();
  });
  it("returns only fixed field names and type counts, never status values, reasoning, text, IDs in diagnostics, or secrets", () => {
    const input = history([{ ...message(), status: "PRIVATE_STATUS_VALUE", message_status: 4, finish_reason: { text: "PRIVATE_NESTED_VALUE" }, is_finished: true, is_complete: null, finished_at: ["PRIVATE_DATE"], content: "PRIVATE_LORE", fragments: [{ type: "THINK", content: "PRIVATE_REASONING" }], token: "PRIVATE_TOKEN", PRIVATE_FIELD_NAME: "PRIVATE_VALUE" }]);
    const result = readNativeStoryHistory(input, chat), output = JSON.stringify(result);
    expect(output).not.toMatch(/PRIVATE/); expect(result.diagnostics.completion).toBe("unknown");
    expect(result.diagnostics.completionFields).toEqual([
      { field: "status", types: { string: 1 } }, { field: "message_status", types: { number: 1 } },
      { field: "finish_reason", types: { object: 1 } }, { field: "is_finished", types: { boolean: 1 } },
      { field: "is_complete", types: { null: 1 } }, { field: "finished_at", types: { array: 1 } },
    ]);
    expect(JSON.stringify(result.diagnostics)).not.toContain(chat);
  });
  it("does not use inherited identity fields and keeps even apparently final status values unknown", () => {
    expect(readNativeStoryHistory(history([Object.create(message())]), chat).messages).toBeNull();
    for (const status of ["FINISHED", "COMPLETED", "STOPPED", "ERROR", "STREAMING"]) {
      expect(readNativeStoryHistory(history([{ ...message(), status }]), chat).diagnostics.completion).toBe("unknown");
    }
  });
  it("bounds error diagnostics without disguising how many checks failed", () => {
    const result = readNativeStoryHistory(history(Array.from({ length: 100 }, () => ({ id: 1, role: "user" }))), chat);
    expect(result.messages).toBeNull(); expect(result.diagnostics.issueCount).toBe(100); expect(result.diagnostics.issues).toHaveLength(40);
  });
  it("bounds one operation and accepts a long explicit chain without quadratic ancestor walks", () => {
    expect(readNativeStoryHistory(history(new Array(100_001).fill(null)), chat).diagnostics.issues[0]?.code).toBe("history-too-large");
    const chain = Array.from({ length: 20_000 }, (_, i) => message(i, i ? i - 1 : null, i % 2 ? "assistant" : "user"));
    const result = readNativeStoryHistory(history(chain.reverse()), chat);
    expect(result.messages).toHaveLength(20_000); expect(result.diagnostics).toMatchObject({ ancestry: "complete", rootCount: 1, issues: [] });
  });
});
