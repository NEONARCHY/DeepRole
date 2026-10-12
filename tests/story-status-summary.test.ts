import { describe, expect, it } from "vitest";
import { readNativeStoryHistory } from "../src/core/story-native-history";
import { readStoryDiagnosticResult, storyDiagnosticReport } from "../src/core/story-diagnostics";
import { summarizeNativeStoryStatuses, nativeStoryStatusCodes } from "../src/core/story-status-summary";

const read = (messages: unknown[]) => ({ status: "read", diagnostics: readNativeStoryHistory({ messages }, "PRIVATE_CHAT", { collectStatuses: true }).diagnostics });
const safe = () => read([
  { id: 1, parent_id: null, role: "USER", status: "FINISHED", content: "PRIVATE_LORE" },
  { id: 2, parent_id: 1, role: "ASSISTANT", status: "FINISHED", message_status: "PRIVATE_STATE" },
  { id: 3, parent_id: 2, role: "USER", status: 123456, message_status: "PRIVATE_STATE" },
]);
describe("opt-in native status counts, not lifecycle proof", () => {
  it("keeps the default decoder v1 and adds v2 only to an explicit status probe", () => {
    expect(readNativeStoryHistory({ messages: [] }, "chat").diagnostics).toMatchObject({ diagnosticVersion: 1 });
    expect(readNativeStoryHistory({ messages: [] }, "chat").diagnostics).not.toHaveProperty("statusCounts");
    expect(read([]).diagnostics).toMatchObject({ diagnosticVersion: 2, statusCounts: [], completion: "unknown" });
    expect(readStoryDiagnosticResult(read([]))).toEqual(read([]));
  });
  it("counts safe states by field and role without IDs, arbitrary values or completion claims", () => {
    expect(safe().diagnostics).toMatchObject({ diagnosticVersion: 2, completion: "unknown", statusCounts: [
      { field: "status", role: "user", state: "FINISHED", count: 1 },
      { field: "status", role: "user", state: "non-string", count: 1 },
      { field: "status", role: "assistant", state: "FINISHED", count: 1 },
      { field: "message_status", role: "user", state: "unrecognized-string", count: 1 },
      { field: "message_status", role: "assistant", state: "unrecognized-string", count: 1 },
    ] });
    const report = storyDiagnosticReport(safe(), 123)!;
    expect(JSON.parse(report)).toMatchObject({ diagnosticVersion: 2, automaticStoryIngestion: "not-checked", result: safe() });
    expect(report).not.toMatch(/PRIVATE|123456|nativeMessageKey|content|chatId/);
  });
  it("is exact and allowlisted: no trimming, case folding, parsing or partial-string disclosure", () => {
    const values: unknown[] = [...nativeStoryStatusCodes, "finished", " FINISHED ", "FINISHED PRIVATE", "", null, false, 42, {}, [], undefined];
    const summary = summarizeNativeStoryStatuses(values.map(status => ({ role: "assistant", status })));
    expect(summary).toEqual([...nativeStoryStatusCodes.map(state => ({ field: "status", role: "assistant", state, count: 1 })),
      { field: "status", role: "assistant", state: "unrecognized-string", count: 4 }, { field: "status", role: "assistant", state: "non-string", count: 6 }]);
  });
  it("does not read inherited fields or reveal malformed roles or unrelated state fields", () => {
    expect(summarizeNativeStoryStatuses([null, [], "PRIVATE", Object.create({ role: "user", status: "FINISHED" }),
      { role: "PRIVATE_ROLE", status: "ERROR", finish_reason: "PRIVATE" }, { role: " user ", message_status: "PENDING" },
      Object.assign(Object.create({ role: "user" }), { status: "FINISHED" })])).toEqual([
      { field: "status", role: "unknown", state: "FINISHED", count: 1 }, { field: "status", role: "unknown", state: "ERROR", count: 1 },
      { field: "message_status", role: "unknown", state: "PENDING", count: 1 },
    ]);
  });
  it("handles the reported 144-message shape without selecting a reply or interpreting FINISHED", () => {
    const result = read(Array.from({ length: 144 }, (_, i) => ({ id: i + 1, parent_id: i ? i : null, role: i % 2 ? "assistant" : "user", status: "FINISHED" })));
    expect(result.diagnostics).toMatchObject({ messageCount: 144, identityCount: 144, rootCount: 1, issueCount: 0, ancestry: "complete", completion: "unknown", statusCounts: [
      { field: "status", role: "user", state: "FINISHED", count: 72 }, { field: "status", role: "assistant", state: "FINISHED", count: 72 },
    ] });
    expect(readStoryDiagnosticResult(result)).toEqual(result);
  });
  it.each([null, {}, { data: null }, { messages: [{}] }, { messages: [1] }, { messages: [{ id: 1, role: "PRIVATE", status: "PRIVATE" }] },
    { messages: [{ id: 1, parent_id: null, role: "user", message_status: false, finished_at: 123 }] },
    { messages: [{ id: 2, parent_id: 1, role: "assistant", status: "STREAMING" }], has_more: true },
    { messages: Array(100_001).fill(null) },
  ])("accepts actual v2 summaries for early rejection, invalid and partial histories %#", value => {
    const result = { status: "read", diagnostics: readNativeStoryHistory(value, "chat", { collectStatuses: true }).diagnostics };
    expect(readStoryDiagnosticResult(result)).toEqual(result);
  });
  it("rebuilds detached safe count rows while accepting existing v1 reports", () => {
    const input: any = safe(), rebuilt = readStoryDiagnosticResult(input)!;
    input.diagnostics.statusCounts[0].state = "PRIVATE"; input.diagnostics.statusCounts[1].count = 88;
    expect(rebuilt).toEqual(safe());
    const old = { status: "read", diagnostics: readNativeStoryHistory({ messages: [] }, "chat").diagnostics };
    expect(readStoryDiagnosticResult(old)).toEqual(old); expect(JSON.parse(storyDiagnosticReport(old, 0)!).diagnosticVersion).toBe(1);
  });
  it.each([
    (d: any) => { delete d.statusCounts; }, (d: any) => { d.statusCounts = {}; },
    (d: any) => { d.statusCounts[0].state = "PRIVATE"; }, (d: any) => { d.statusCounts[0].state = "finished"; },
    (d: any) => { d.statusCounts[0].field = "finished_at"; }, (d: any) => { d.statusCounts[0].role = "PRIVATE"; },
    (d: any) => { d.statusCounts[0].value = "PRIVATE"; }, (d: any) => { d.statusCounts[0].count = -1; },
    (d: any) => { d.statusCounts[0].count = 0; }, (d: any) => { d.statusCounts[0].count = 1.5; },
    (d: any) => { d.statusCounts[0].count = 100001; }, (d: any) => { d.statusCounts[0].count = "PRIVATE"; },
    (d: any) => { d.statusCounts.push(d.statusCounts[0]); }, (d: any) => { d.statusCounts = Array(1000).fill(d.statusCounts[0]); },
    (d: any) => { d.statusCounts.pop(); }, (d: any) => { d.statusCounts[0].count++; },
    (d: any) => { d.statusCounts[1].state = "unrecognized-string"; },
    (d: any) => { d.completionFields[0].types.number = 2; }, (d: any) => { d.completionFields = []; },
    (d: any) => { d.completionFields.push({ field: "finished_at", types: { string: 4 } }); },
    (d: any) => { d.diagnosticVersion = 1; }, (d: any) => { d.completion = "complete"; },
  ])("rejects non-allowlisted or inconsistent v2 counts %#", mutate => {
    const input = safe(); mutate(input.diagnostics);
    expect(readStoryDiagnosticResult(input)).toBeNull(); expect(storyDiagnosticReport(input, 0)).toBeNull();
  });
});
