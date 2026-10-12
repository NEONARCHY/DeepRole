import { describe, expect, it } from "vitest";
import { readNativeStoryHistory } from "../src/core/story-native-history";
import { readStoryDiagnosticResult, storyDiagnosticReport, type StoryDiagnosticCode } from "../src/core/story-diagnostics";
import { diagnosticErrorTextKeys, storyDiagnosticsText } from "../src/core/story-diagnostics-i18n";

const safe = () => ({ status: "read", diagnostics: readNativeStoryHistory({ messages: [{ id: 1, parent_id: null, role: "user", content: "PRIVATE_LORE", status: "PRIVATE_STATUS" }] }, "PRIVATE_CHAT").diagnostics });
describe("safe story diagnostic boundary", () => {
  it("rebuilds a detached allowlisted report without native IDs, content or status values", () => {
    const input = safe(), result = readStoryDiagnosticResult(input)!;
    expect(result).toEqual(input); expect(result).not.toBe(input);
    input.diagnostics.completionFields[0]!.types.string = 88;
    expect(JSON.parse(storyDiagnosticReport(result, 123)!)).toMatchObject({ automaticStoryIngestion: "not-checked", result: { diagnostics: { completion: "unknown", completionFields: [{ types: { string: 1 } }] } } });
    expect(storyDiagnosticReport(result, 123)).not.toMatch(/PRIVATE|FINISHED|nativeMessageKey|chatId/);
  });
  it.each([
    (x: any) => { x.transcript = "PRIVATE"; }, (x: any) => { x.diagnostics.transcript = "PRIVATE"; },
    (x: any) => { x.diagnostics.diagnosticVersion = 2; }, (x: any) => { x.diagnostics.completion = "complete"; },
    (x: any) => { x.diagnostics.ancestry = "PRIVATE"; }, (x: any) => { x.diagnostics.messageCount = Infinity; },
    (x: any) => { x.diagnostics.identityCount = -1; }, (x: any) => { x.diagnostics.rootCount = 2; },
    (x: any) => { x.diagnostics.boundaryCount = 100001; }, (x: any) => { x.diagnostics.pagination = "false"; },
    (x: any) => { x.diagnostics.issueCount = 1.5; }, (x: any) => { x.diagnostics.issues = [{ path: "$.PRIVATE_LORE", code: "missing-parent" }]; },
    (x: any) => { x.diagnostics.ancestry = "invalid"; x.diagnostics.issueCount = 1; x.diagnostics.issues = [{ path: "$.messages[0].role", code: "PRIVATE" }]; },
    (x: any) => { x.diagnostics.ancestry = "invalid"; x.diagnostics.issueCount = 41; x.diagnostics.issues = Array(41).fill({ path: "$", code: "missing-parent" }); },
    (x: any) => { x.diagnostics.issueCount = 1; }, (x: any) => { x.diagnostics.completionFields[0].value = "PRIVATE"; },
    (x: any) => { x.diagnostics.completionFields[0].field = "PRIVATE"; }, (x: any) => { x.diagnostics.completionFields[0].types = { PRIVATE: 1 }; },
    (x: any) => { x.diagnostics.completionFields[0].types.string = "PRIVATE"; }, (x: any) => { x.diagnostics.completionFields.push(x.diagnostics.completionFields[0]); },
    (x: any) => { x.diagnostics.completionFields[0].types = {}; }, (x: any) => { x.diagnostics.completionFields[0].types.string = 0; },
    (x: any) => { x.diagnostics.pagination = true; }, (x: any) => { x.diagnostics.ancestry = "empty"; },
    (x: any) => { x.diagnostics.ancestry = "partial"; }, (x: any) => { x.diagnostics.ancestry = "invalid"; },
  ])("rejects a malformed or privacy-leaking summary %# before display/copy", mutate => {
    const input = safe(); mutate(input); expect(readStoryDiagnosticResult(input)).toBeNull(); expect(storyDiagnosticReport(input, 0)).toBeNull();
  });
  it.each([null, [], {}, { status: "unavailable", code: "PRIVATE" }, { status: "unavailable", code: "http", error: "PRIVATE" }])("rejects malformed result %#", input => { expect(readStoryDiagnosticResult(input)).toBeNull(); });
  it.each([NaN, -1, 1.5, 8_640_000_000_000_001])("does not build a report with an invalid timestamp %s", timestamp => { expect(storyDiagnosticReport(safe(), timestamp)).toBeNull(); });
  it.each(Object.keys(diagnosticErrorTextKeys) as StoryDiagnosticCode[])("has safe localized recovery text for %s", code => {
    expect(readStoryDiagnosticResult({ status: "unavailable", code })).toEqual({ status: "unavailable", code });
    const key = diagnosticErrorTextKeys[code]; expect(storyDiagnosticsText("ru", key)).toMatch(/[А-Яа-я]/); expect(storyDiagnosticsText("en", key)).not.toMatch(/[А-Яа-я]/);
  });
  it.each([
    { messages: [{ id: 1, role: "user" }] }, { data: null }, { messages: [] }, { biz_data: { messages: [{ id: 1, role: "user" }] } },
    { data: { biz_data: { messages: [{ id: 2, parent_id: 1, role: "assistant", is_finished: false }], has_more: true } } },
    { data: { code: 1 } }, { messages: [{ id: 1, parent_id: null, role: "user" }, { id: 2, parent_id: 1, role: "user" }] },
    { messages: [{ id: 1, parent_id: 2, role: "user" }, { id: 2, parent_id: 1, role: "assistant" }] },
  ])("accepts an actual decoder summary %# without inventing completion", payload => {
    const diagnostics = readNativeStoryHistory(payload, "test-chat").diagnostics;
    expect(readStoryDiagnosticResult({ status: "read", diagnostics })).toEqual({ status: "read", diagnostics });
  });
});
