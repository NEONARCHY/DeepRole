import { describe, expect, it } from "vitest";
import { readNativeStoryServerSnapshot, readNativeSnapshotDiagnostics } from "../src/core/story-native-snapshot";
import { readStoryDiagnosticResult, storyDiagnosticReport } from "../src/core/story-diagnostics";
import { nativeStoryMessageKey } from "../src/core/story-transport";
import { probeNativeStoryHistory } from "../src/adapters/story-native-history-probe";

const user = { message_id: 1, parent_id: null, role: "USER", status: "FINISHED", has_pending_fragment: false, content: "PRIVATE_USER" };
const reply = { message_id: 2, parent_id: 1, role: "ASSISTANT", status: "FINISHED", has_pending_fragment: false, fragments: [{ type: "RESPONSE", content: "PRIVATE_REPLY" }], reasoning: "PRIVATE_THOUGHTS" };
function payload(messages: unknown[] = [user, reply], current: unknown = 2, extra = {}) {
  return { code: 0, data: { biz_code: 0, biz_data: { chat_session: { id: "PRIVATE_CHAT", current_message_id: current }, chat_messages: structuredClone(messages), ...extra } } };
}
function read(value: unknown = payload(), anchor = "2") { return readNativeStoryServerSnapshot(value, "PRIVATE_CHAT", anchor); }
function summary(value: ReturnType<typeof read>) {
  if (value.diagnostics.diagnosticVersion !== 4) throw Error("Expected v4");
  return value.diagnostics.nativeSnapshot;
}
describe("verified native server snapshot, not an automatic game acceptance policy", () => {
  it("reads the exact session, selected chain and pending-fragment lifecycle without exposing them in the report", async () => {
    const result = read();
    expect(summary(result)).toEqual({ contract: "deepseek-web-history-2026-10", session: "matched", selection: "anchor", selectedPath: "complete", selectedMessageCount: 2, anchorCompletion: "complete", issue: null });
    expect(result.serverSelectedPath?.map(row => row.nativeMessageKey)).toEqual([nativeStoryMessageKey("1"), nativeStoryMessageKey("2")]);
    const safe = readStoryDiagnosticResult({ status: "read", diagnostics: result.diagnostics });
    expect(safe).not.toBeNull();
    const report = storyDiagnosticReport(safe, 10)!;
    expect(JSON.parse(report)).toMatchObject({ diagnosticVersion: 4, automaticStoryIngestion: "not-checked" });
    expect(report).not.toMatch(/PRIVATE|nativeMessageKey|chatId|fragments|reasoning|message_id/);
    const response = new Response(JSON.stringify(payload()), { headers: { "content-type": "application/json" } });
    expect(await probeNativeStoryHistory(response, "PRIVATE_CHAT", "2")).toEqual(safe);
  });
  it("selects three alternatives and earlier descendants by explicit pointer, not ID, list order or a unique leaf", () => {
    const messages = [{ ...reply, message_id: 100 }, { message_id: 3, parent_id: 2, role: "USER" }, { ...reply, message_id: 4, parent_id: 3 }, { ...reply, message_id: 50 }, reply, user];
    expect(summary(read(payload(messages, 2)))).toMatchObject({ selection: "anchor", selectedMessageCount: 2 });
    expect(summary(read(payload(messages, 4)))).toMatchObject({ selection: "ancestor", selectedMessageCount: 4 });
    expect(summary(read(payload(messages, 50)))).toMatchObject({ selection: "different", selectedMessageCount: 2 });
    expect(summary(read(payload(messages, 100), "100"))).toMatchObject({ selection: "anchor" });
    expect(summary(read(payload(messages, 2), "50"))).toMatchObject({ selection: "different" });
    expect(summary(read(payload(messages, 2)))).toMatchObject({ selection: "anchor" });
  });
  it("does not exclude service parents or classify their purpose by words/status", () => {
    const result = read(payload([user, { ...reply, content: "[DeepRole Service]" }, { ...user, message_id: 3, parent_id: 2 }, { ...reply, message_id: 4, parent_id: 3 }], 4), "4");
    expect(result.serverSelectedPath).toHaveLength(4); expect(summary(result).selectedMessageCount).toBe(4);
    expect(result.messages).not.toMatchObject([{ purpose: "game" }]);
  });
  it.each([undefined, null, "", "__proto__", "not a key", 1.2, -1, 9007199254740992])("never falls back to max ID for a missing/invalid pointer %s", current => {
    const data = payload(undefined, current); if (current === undefined) delete (data.data.biz_data.chat_session as any).current_message_id;
    const result = read(data);
    expect(summary(result)).toMatchObject({ selection: "unknown", selectedPath: "unknown", selectedMessageCount: null, issue: "selection-unavailable" });
    expect(result.serverSelectedPath).toBeNull(); expect(readStoryDiagnosticResult({ status: "read", diagnostics: result.diagnostics })).not.toBeNull();
  });
  it("keeps unavailable and user anchors separate from assistant completion", () => {
    expect(summary(read(payload(), "99"))).toMatchObject({ selectedPath: "complete", selection: "unknown", anchorCompletion: "unknown" });
    expect(summary(read(payload(), "1"))).toMatchObject({ selection: "ancestor", anchorCompletion: "not-applicable" });
    expect(summary(readNativeStoryServerSnapshot(payload(), "PRIVATE_CHAT"))).toMatchObject({ selection: "unknown", anchorCompletion: "unknown" });
  });
  it("rejects a foreign session even with a valid-looking chain and pointer", () => {
    const data = payload(); data.data.biz_data.chat_session.id = "FOREIGN_CHAT";
    const result = read(data);
    expect(summary(result)).toMatchObject({ session: "mismatch", selection: "unknown", anchorCompletion: "unknown", issue: "chat-mismatch" });
    expect(result.messages).toBeNull(); expect(result.serverSelectedPath).toBeNull();
    expect(storyDiagnosticReport({ status: "read", diagnostics: result.diagnostics }, 0)).not.toMatch(/PRIVATE|FOREIGN/);
  });
  it.each([
    (data: any) => { data.code = 1; }, (data: any) => { data.data.biz_code = 1; }, (data: any) => { delete data.code; },
    (data: any) => { delete data.data.biz_code; }, (data: any) => { data.data.biz_data.chat_session = {}; },
    (data: any) => { data.data.biz_data.chat_messages[1].role = "assistant"; },
    (data: any) => { const row = data.data.biz_data.chat_messages[1]; row.id = row.message_id; delete row.message_id; },
  ])("does not adopt generic aliases or an unsupported native envelope %#", mutate => {
    const data = payload(); mutate(data); const result = read(data);
    expect(summary(result)).toMatchObject({ selectedPath: "unknown", anchorCompletion: "unknown", issue: "unsupported-schema" });
    expect(result.serverSelectedPath).toBeNull(); expect(readStoryDiagnosticResult({ status: "read", diagnostics: result.diagnostics })).not.toBeNull();
  });
  it.each([
    [true, undefined, undefined], [undefined, undefined, undefined], ["false", undefined, undefined], [false, "WIP", undefined], [false, "PRIVATE", undefined], [false, undefined, "PRIVATE"],
  ])("FINISHED is not accepted with missing, pending or conflicting lifecycle fields %#", (pending, quasi, incomplete) => {
    const row: any = { ...reply, has_pending_fragment: pending };
    if (pending === undefined) delete row.has_pending_fragment;
    if (quasi !== undefined) row.quasi_status = quasi;
    if (incomplete !== undefined) row.incomplete_message = incomplete;
    expect(summary(read(payload([user, row]))).anchorCompletion).toBe("unknown");
  });
  it.each([
    ["WIP", "in-progress"], ["INCOMPLETE", "interrupted"], ["TIMEOUT", "interrupted"], ["CONTENT_FILTER", "unusable"], ["CONTEXT_LENGTH_EXCEEDED", "unusable"],
    ["COMPLETED", "unknown"], ["STOPPED", "unknown"], ["PRIVATE_CODE", "unknown"], [null, "unknown"], [3, "unknown"],
  ])("interprets only the verified native lifecycle %s", (status, expected) => {
    const result = read(payload([user, { ...reply, status }]));
    expect(summary(result).anchorCompletion).toBe(expected); expect(readStoryDiagnosticResult({ status: "read", diagnostics: result.diagnostics })).not.toBeNull();
    expect(storyDiagnosticReport({ status: "read", diagnostics: result.diagnostics }, 0)).not.toContain("PRIVATE");
  });
  it("does not reconstruct a missing selected prefix or use a pointer outside the response", () => {
    const partial = read(payload([{ ...reply, parent_id: 99 }]));
    expect(summary(partial)).toMatchObject({ selection: "unknown", selectedPath: "partial", selectedMessageCount: 1, issue: "selected-path-partial" });
    expect(partial.serverSelectedPath).toBeNull();
    expect(summary(read(payload(undefined, 99)))).toMatchObject({ selectedPath: "unknown", issue: "selection-outside-history" });
    const pagination = read(payload(undefined, 2, { has_more: true }));
    expect(summary(pagination)).toMatchObject({ selectedPath: "partial", selection: "unknown" }); expect(pagination.serverSelectedPath).toBeNull();
  });
  it("retains an explicit complete selected chain even when an unrelated branch has a missing parent", () => {
    const result = read(payload([user, reply, { ...reply, message_id: 4, parent_id: 99 }]));
    expect(result.diagnostics.ancestry).toBe("partial"); expect(summary(result)).toMatchObject({ selection: "anchor", selectedPath: "complete" });
    expect(readStoryDiagnosticResult({ status: "read", diagnostics: result.diagnostics })).not.toBeNull();
  });
  it.each([
    [user, reply, reply], [{ ...user, parent_id: 2 }, reply], [user, { ...reply, parent_id: 2 }], [user, { ...reply, role: "USER" }],
  ])("does not use a corrupt identity graph %#", (...messages) => {
    const result = read(payload(messages)); expect(summary(result)).toMatchObject({ issue: "invalid-history", selection: "unknown", anchorCompletion: "unknown" });
    expect(result.serverSelectedPath).toBeNull(); expect(readStoryDiagnosticResult({ status: "read", diagnostics: result.diagnostics })).not.toBeNull();
  });
  it("supports numeric zero as an explicit message ID, and never treats it as a missing root", () => {
    const result = read(payload([{ ...reply, message_id: 0, parent_id: null }], 0), "0");
    expect(summary(result)).toMatchObject({ selection: "anchor", selectedMessageCount: 1, anchorCompletion: "complete" });
  });
  it("keeps legacy v1/v2/v3 reports diagnostic-only", () => {
    const result = read({ messages: [user, reply], current_message_id: 2 }); expect(result.diagnostics.diagnosticVersion).toBe(3); expect(result.serverSelectedPath).toBeNull();
  });
  it("captures identities defensively and returns a rebuilt safe summary", () => {
    const data = payload(); const result = read(data); (data.data.biz_data.chat_messages[1] as typeof reply).message_id = 99;
    expect(result.serverSelectedPath?.at(-1)?.nativeMessageKey).toBe(nativeStoryMessageKey("2"));
    const safe = readNativeSnapshotDiagnostics(summary(result))!; summary(result).selection = "different"; expect(safe.selection).toBe("anchor");
  });
  it.each([
    (s: any) => { s.chatId = "PRIVATE"; }, (s: any) => { s.issue = "PRIVATE"; }, (s: any) => { s.selectedMessageCount = 100001; },
    (s: any) => { s.selectedMessageCount = 0; }, (s: any) => { s.selectedMessageCount = null; }, (s: any) => { s.session = "unknown"; },
    (s: any) => { s.selectedPath = "partial"; }, (s: any) => { s.anchorCompletion = "PRIVATE"; }, (s: any) => { s.issue = "selection-unavailable"; },
  ])("rejects malformed, leaking or contradictory summaries %#", mutate => {
    const result = read(); mutate(summary(result)); expect(readNativeSnapshotDiagnostics(summary(result))).toBeNull();
    expect(storyDiagnosticReport({ status: "read", diagnostics: result.diagnostics }, 0)).toBeNull();
  });
  it.each([
    (d: any) => { d.nativeSnapshot.selectedMessageCount = 3; }, (d: any) => { d.replyProbe.fields[0].state = "WIP"; },
    (d: any) => { d.replyProbe.anchor = "not-supplied"; d.replyProbe.role = "unknown"; d.replyProbe.parent = "unknown"; d.replyProbe.fields = []; d.replyProbe.siblingReplies = null; d.replyProbe.childMessages = null; },
    (d: any) => { d.pagination = true; d.ancestry = "partial"; },
  ])("rejects cross-report inconsistencies %#", mutate => { const result = read(); mutate(result.diagnostics); expect(readStoryDiagnosticResult({ status: "read", diagnostics: result.diagnostics })).toBeNull(); });
});
