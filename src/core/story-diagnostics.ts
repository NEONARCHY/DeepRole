import type { NativeStoryHistoryDiagnostics } from "./story-native-history";
import { readStoryReplyProbe, type NativeStoryReplyProbe } from "./story-reply-probe";
import { maxNativeStoryStatusRows, nativeStoryStatusFields, nativeStoryStatusRoles, nativeStoryStatusStates, type NativeStoryStatusCount } from "./story-status-summary";
import { readNativeSnapshotDiagnostics, type NativeStorySnapshotDiagnostics } from "./story-native-snapshot";

export type StoryDiagnosticCode = "http" | "format" | "too-large" | "unreadable" | "no-chat" | "busy" | "vault-locked" | "timeout" | "changed" | "invalid-bridge" | "not-connected";
export type StoryDiagnosticResult = { status: "read"; diagnostics: NativeStoryHistoryDiagnostics } | { status: "unavailable"; code: StoryDiagnosticCode };
const codes: StoryDiagnosticCode[] = ["http", "format", "too-large", "unreadable", "no-chat", "busy", "vault-locked", "timeout", "changed", "invalid-bridge", "not-connected"];
const issues = ["unsupported-shape", "remote-error", "chat-mismatch", "history-too-large", "ambiguous-list", "invalid-message", "invalid-id", "conflicting-id", "missing-parent", "invalid-parent", "conflicting-parent", "invalid-role", "duplicate-id", "self-parent", "same-role-parent", "parent-cycle"];
const fields = ["status", "message_status", "finish_reason", "is_finished", "is_complete", "finished_at"];
const types = ["null", "string", "number", "boolean", "array", "object", "other"];
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const shape = (v: unknown, keys: string[]): v is Record<string, unknown> => object(v) && Object.keys(v).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(v, key));
const count = (v: unknown, max = 30_000_000): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max;
const path = (v: unknown): v is string => typeof v === "string" && /^\$(?:\.data)?(?:\.biz_data)?(?:\.(?:code|biz_code|chat_session_id)|\.(?:chat_messages|messages|chat_message_list|history|message_list)(?:\[\d{1,6}\](?:\.(?:message_id|id|parent_id|parent_message_id|role))?)?)?$/u.test(v);
export const diagnosticUnavailable = (code: StoryDiagnosticCode): StoryDiagnosticResult => ({ status: "unavailable", code });

/** The page is not trusted. Reject arbitrary paths/fields/values before display or copying. */
export function readStoryDiagnosticResult(value: unknown): StoryDiagnosticResult | null {
  if (shape(value, ["status", "code"]) && value.status === "unavailable" && codes.includes(value.code as StoryDiagnosticCode)) return diagnosticUnavailable(value.code as StoryDiagnosticCode);
  if (!shape(value, ["status", "diagnostics"]) || value.status !== "read") return null;
  const d = value.diagnostics;
  if (!object(d) || ![1, 2, 3, 4].includes(d.diagnosticVersion as number)) return null;
  const keys = ["diagnosticVersion", "ancestry", "completion", "messageCount", "identityCount", "rootCount", "boundaryCount", "pagination", "issueCount", "issues", "completionFields"];
  if (d.diagnosticVersion !== 1) keys.push("statusCounts");
  if (d.diagnosticVersion === 3 || d.diagnosticVersion === 4) keys.push("replyProbe");
  if (d.diagnosticVersion === 4) keys.push("nativeSnapshot");
  if (!shape(d, keys)
    || !["unknown", "invalid", "partial", "complete", "empty"].includes(d.ancestry as string) || d.completion !== "unknown"
    || !(d.messageCount === null || count(d.messageCount)) || !count(d.identityCount, 100_000) || !count(d.rootCount, 100_000) || !count(d.boundaryCount, 100_000)
    || typeof d.pagination !== "boolean" || !count(d.issueCount) || !Array.isArray(d.issues) || d.issues.length > 40 || d.issueCount < d.issues.length
    || !d.issues.every(i => shape(i, ["path", "code"]) && path(i.path) && issues.includes(i.code as string))
    || !Array.isArray(d.completionFields) || d.completionFields.length > fields.length
    || !d.completionFields.every(f => shape(f, ["field", "types"]) && fields.includes(f.field as string) && object(f.types)
      && Object.keys(f.types).length > 0 && Object.keys(f.types).every(t => types.includes(t) && count((f.types as Record<string, unknown>)[t], 100_000) && (f.types as Record<string, number>)[t]! > 0))
    || new Set(d.completionFields.map(f => f.field)).size !== d.completionFields.length
    || d.rootCount + d.boundaryCount > d.identityCount || d.messageCount !== null && d.identityCount > d.messageCount
    || ["complete", "partial", "empty"].includes(d.ancestry as string) && d.issueCount !== 0
    || d.ancestry === "complete" && (d.boundaryCount !== 0 || d.pagination || !d.identityCount || d.identityCount !== d.messageCount)
    || d.ancestry === "empty" && (d.identityCount !== 0 || d.messageCount !== 0)
    || d.ancestry === "partial" && (!d.identityCount || !d.boundaryCount && !d.pagination)
    || d.ancestry === "invalid" && d.issueCount === 0) return null;
  let statusCounts: NativeStoryStatusCount[] = [];
  if (d.diagnosticVersion !== 1) {
    if (!Array.isArray(d.statusCounts) || d.statusCounts.length > maxNativeStoryStatusRows
      || !d.statusCounts.every(row => shape(row, ["field", "role", "state", "count"])
        && nativeStoryStatusFields.includes(row.field as NativeStoryStatusCount["field"])
        && nativeStoryStatusRoles.includes(row.role as NativeStoryStatusCount["role"])
        && nativeStoryStatusStates.includes(row.state as NativeStoryStatusCount["state"])
        && count(row.count, 100_000) && row.count > 0)
      || new Set(d.statusCounts.map(row => `${row.field}:${row.role}:${row.state}`)).size !== d.statusCounts.length) return null;
    // A status row must account for a real field/type observation. Reject injected,
    // missing, duplicated or inflated counts, including fields not in the type summary.
    if (d.completionFields.some(f => {
      const total = Object.values(f.types as Record<string, number>).reduce((sum, n) => sum + n, 0);
      return d.messageCount === null || total > (d.messageCount as number) || total > 100_000;
    })) return null;
    for (const field of nativeStoryStatusFields) {
      const fieldTypes = d.completionFields.find(f => f.field === field)?.types as Record<string, number> | undefined;
      const rows = d.statusCounts.filter(row => row.field === field);
      const strings = rows.filter(row => row.state !== "non-string").reduce((sum, row) => sum + row.count, 0);
      const nonStrings = rows.filter(row => row.state === "non-string").reduce((sum, row) => sum + row.count, 0);
      if (strings !== (fieldTypes?.string ?? 0)
        || nonStrings !== Object.entries(fieldTypes ?? {}).filter(([type]) => type !== "string").reduce((sum, [, n]) => sum + n, 0)) return null;
    }
    statusCounts = d.statusCounts.map(row => ({ field: row.field, role: row.role, state: row.state, count: row.count }));
  }
  let replyProbe: NativeStoryReplyProbe | null = null;
  if (d.diagnosticVersion === 3 || d.diagnosticVersion === 4) {
    replyProbe = readStoryReplyProbe(d.replyProbe);
    if (!replyProbe || (d.issueCount > 0 || d.ancestry === "unknown" || d.ancestry === "invalid") !== (replyProbe.anchor === "invalid-history")
      || replyProbe.anchor === "matched" && (!d.identityCount || (replyProbe.siblingReplies ?? 0) > d.identityCount || replyProbe.childMessages! >= d.identityCount)
      || replyProbe.parent === "outside-window" && !d.boundaryCount
      || replyProbe.parent === "root" && !d.rootCount) return null;
    for (const f of replyProbe.fields) {
      if (fields.includes(f.field) && !(d.completionFields.find(t => t.field === f.field)?.types as Record<string, number> | undefined)?.[f.type]) return null;
      if ((f.field === "status" || f.field === "message_status") && !statusCounts.some(s => s.field === f.field && s.role === replyProbe!.role && s.state === f.state)) return null;
    }
  }
  let nativeSnapshot: NativeStorySnapshotDiagnostics | null = null;
  if (d.diagnosticVersion === 4) {
    nativeSnapshot = readNativeSnapshotDiagnostics(d.nativeSnapshot);
    if (!nativeSnapshot || nativeSnapshot.selectedMessageCount !== null && nativeSnapshot.selectedMessageCount > d.identityCount
      || nativeSnapshot.selection !== "unknown" && replyProbe?.anchor !== "matched"
      || nativeSnapshot.anchorCompletion !== "unknown" && replyProbe?.anchor !== "matched"
      || nativeSnapshot.anchorCompletion === "not-applicable" && replyProbe?.role !== "user"
      || !["unknown", "not-applicable"].includes(nativeSnapshot.anchorCompletion) && replyProbe?.role !== "assistant"
      || nativeSnapshot.selectedPath !== "unknown" && !["complete", "partial"].includes(d.ancestry as string)
      || nativeSnapshot.selectedPath === "complete" && d.pagination
      || nativeSnapshot.anchorCompletion === "complete" && !replyProbe?.fields.some(field => field.field === "status" && field.state === "FINISHED")
      || nativeSnapshot.anchorCompletion === "in-progress" && !replyProbe?.fields.some(field => field.field === "status" && field.state === "WIP")
      || nativeSnapshot.anchorCompletion === "interrupted" && !replyProbe?.fields.some(field => field.field === "status" && ["INCOMPLETE", "TIMEOUT"].includes(field.state ?? ""))
      || nativeSnapshot.anchorCompletion === "unusable" && !replyProbe?.fields.some(field => field.field === "status" && ["CONTENT_FILTER", "CONTEXT_LENGTH_EXCEEDED"].includes(field.state ?? ""))) return null;
  }
  // Rebuild from allowlisted fields, never forward a raw page object.
  return { status: "read", diagnostics: {
    ...(d.diagnosticVersion === 4 ? { diagnosticVersion: 4 as const, statusCounts, replyProbe: replyProbe!, nativeSnapshot: nativeSnapshot! } : d.diagnosticVersion === 3 ? { diagnosticVersion: 3 as const, statusCounts, replyProbe: replyProbe! } : d.diagnosticVersion === 2 ? { diagnosticVersion: 2 as const, statusCounts } : { diagnosticVersion: 1 as const }), ancestry: d.ancestry as NativeStoryHistoryDiagnostics["ancestry"], completion: "unknown",
    messageCount: d.messageCount, identityCount: d.identityCount, rootCount: d.rootCount, boundaryCount: d.boundaryCount,
    pagination: d.pagination, issueCount: d.issueCount, issues: d.issues.map(i => ({ path: i.path, code: i.code })),
    completionFields: d.completionFields.map(f => ({ field: f.field, types: { ...f.types } })),
  } };
}
export function storyDiagnosticReport(result: unknown, checkedAt: number): string | null {
  const safe = readStoryDiagnosticResult(result);
  if (!safe || !Number.isSafeInteger(checkedAt) || checkedAt < 0 || checkedAt > 8_640_000_000_000_000) return null;
  return JSON.stringify({ diagnosticVersion: safe.status === "read" ? safe.diagnostics.diagnosticVersion : 1, extensionVersion: "0.1.0", checkedAt, automaticStoryIngestion: "not-checked", result: safe }, null, 2);
}
