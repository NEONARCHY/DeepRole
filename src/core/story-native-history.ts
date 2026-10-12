import { nativeStoryMessageKey, validNativeStoryId, type NativeStoryIdentity } from "./story-transport";
import { summarizeNativeStoryStatuses, type NativeStoryStatusCount } from "./story-status-summary";
import { emptyStoryReplyProbe, summarizeStoryReplyProbe, type NativeStoryReplyProbe } from "./story-reply-probe";
import type { NativeStorySnapshotDiagnostics } from "./story-native-snapshot";

const LIST_FIELDS = ["chat_messages", "messages", "chat_message_list", "history", "message_list"] as const;
const COMPLETION_FIELDS = ["status", "message_status", "finish_reason", "is_finished", "is_complete", "finished_at"] as const;
const MAX_MESSAGES = 100_000; // Bound one history response, not the stored world library.
const MAX_ISSUES = 40;
type ValueType = "null" | "string" | "number" | "boolean" | "array" | "object" | "other";
type HistoryIssueCode = "unsupported-shape" | "remote-error" | "chat-mismatch" | "history-too-large" | "ambiguous-list" | "invalid-message" | "invalid-id" | "conflicting-id" | "missing-parent" | "invalid-parent" | "conflicting-parent" | "invalid-role" | "duplicate-id" | "self-parent" | "same-role-parent" | "parent-cycle";
interface NativeStoryHistoryDiagnosticFields {
  /** No ordering, selected leaf or lifecycle state is inferred from a history list. */
  ancestry: "unknown" | "invalid" | "partial" | "complete" | "empty";
  completion: "unknown";
  messageCount: number | null;
  identityCount: number;
  rootCount: number;
  boundaryCount: number;
  pagination: boolean;
  issueCount: number;
  issues: { path: string; code: HistoryIssueCode }[];
  /** Field names and types. Even a string named FINISHED is not completion proof. */
  completionFields: { field: typeof COMPLETION_FIELDS[number]; types: Partial<Record<ValueType, number>> }[];
}
export type NativeStoryHistoryDiagnostics = NativeStoryHistoryDiagnosticFields & (
  { diagnosticVersion: 1 } | { diagnosticVersion: 2; statusCounts: NativeStoryStatusCount[] }
  | { diagnosticVersion: 3; statusCounts: NativeStoryStatusCount[]; replyProbe: NativeStoryReplyProbe }
  | { diagnosticVersion: 4; statusCounts: NativeStoryStatusCount[]; replyProbe: NativeStoryReplyProbe; nativeSnapshot: NativeStorySnapshotDiagnostics }
);
export interface NativeStoryHistoryResult {
  /** null on any identity/graph ambiguity; a partial window retains explicit boundary links. */
  messages: NativeStoryIdentity[] | null;
  diagnostics: NativeStoryHistoryDiagnostics;
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const own = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key);
function nativeId(value: unknown): string | null {
  const id = typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? String(value) : value;
  return validNativeStoryId(id) ? id : null;
}
function valueType(value: unknown): ValueType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  const type = typeof value;
  return ["string", "number", "boolean", "object"].includes(type) ? type as ValueType : "other";
}

/** Strict capability decoder for the history shapes already read by the transfer adapter.
 * No transcript/credentials/reasoning are returned; unknown status meanings stay unknown.
 * The caller must scope the HTTP response to the requested current chat, and separately
 * prove request/revision identity and completion before creating or selecting story records.
 */
export function readNativeStoryHistory(value: unknown, chatId: string, options: { collectStatuses?: boolean; collectReplyProbe?: boolean; anchorId?: string | null } = {}): NativeStoryHistoryResult {
  const diagnostics: NativeStoryHistoryDiagnostics = { ...(options.collectReplyProbe ? { diagnosticVersion: 3 as const, statusCounts: [], replyProbe: emptyStoryReplyProbe() } : options.collectStatuses ? { diagnosticVersion: 2 as const, statusCounts: [] } : { diagnosticVersion: 1 as const }), ancestry: "unknown", completion: "unknown", messageCount: null, identityCount: 0, rootCount: 0, boundaryCount: 0, pagination: false, issueCount: 0, issues: [], completionFields: [] };
  const result: NativeStoryHistoryResult = { messages: null, diagnostics };
  const issue = (path: string, code: HistoryIssueCode) => {
    diagnostics.issueCount++;
    if (diagnostics.issues.length < MAX_ISSUES) diagnostics.issues.push({ path, code });
  };
  if (!validNativeStoryId(chatId) || !record(value)) { issue("$", "unsupported-shape"); return result; }
  const layers: { value: Record<string, unknown>; path: string }[] = [{ value, path: "$" }];
  if (own(value, "data")) {
    if (!record(value.data)) { issue("$.data", "unsupported-shape"); return result; }
    layers.push({ value: value.data, path: "$.data" });
  }
  const data = layers[layers.length - 1]!;
  if (own(data.value, "biz_data")) {
    if (!record(data.value.biz_data)) { issue(`${data.path}.biz_data`, "unsupported-shape"); return result; }
    layers.push({ value: data.value.biz_data, path: `${data.path}.biz_data` });
  }
  for (const layer of layers) {
    for (const key of ["code", "biz_code"]) if (own(layer.value, key) && layer.value[key] !== 0) issue(`${layer.path}.${key}`, "remote-error");
    if (own(layer.value, "chat_session_id") && layer.value.chat_session_id !== chatId) issue(`${layer.path}.chat_session_id`, "chat-mismatch");
    if (layer.value.has_more === true) diagnostics.pagination = true;
  }
  if (diagnostics.issueCount) return result;
  // More than one recognized list is ambiguous, even if the arrays look identical.
  const lists = layers.flatMap(layer => LIST_FIELDS.filter(key => own(layer.value, key)).map(key => ({ value: layer.value[key], path: `${layer.path}.${key}` })));
  if (lists.length !== 1) { issue("$", lists.length ? "ambiguous-list" : "unsupported-shape"); return result; }
  const list = lists[0]!;
  if (!Array.isArray(list.value)) { issue(list.path, "unsupported-shape"); return result; }
  diagnostics.messageCount = list.value.length;
  if (list.value.length > MAX_MESSAGES) { issue(list.path, "history-too-large"); return result; }
  if (diagnostics.diagnosticVersion !== 1) diagnostics.statusCounts = summarizeNativeStoryStatuses(list.value);
  const messages: NativeStoryIdentity[] = [];
  const byKey = new Map<string, NativeStoryIdentity>();
  const completionTypes = new Map<typeof COMPLETION_FIELDS[number], Partial<Record<ValueType, number>>>();
  for (let index = 0; index < list.value.length; index++) {
    const input: unknown = list.value[index], path = `${list.path}[${index}]`;
    if (!record(input)) { issue(path, "invalid-message"); continue; }
    for (const field of COMPLETION_FIELDS) if (own(input, field)) {
      const types = completionTypes.get(field) ?? {}, type = valueType(input[field]);
      types[type] = (types[type] ?? 0) + 1; completionTypes.set(field, types);
    }
    const idFields = ["message_id", "id"].filter(key => own(input, key));
    const ids = idFields.map(key => nativeId(input[key]));
    if (!ids.length || ids.includes(null)) { issue(`${path}.${idFields[0] ?? "message_id"}`, "invalid-id"); continue; }
    if (!ids.every(id => id === ids[0])) { issue(`${path}.message_id`, "conflicting-id"); continue; }
    const parentFields = ["parent_id", "parent_message_id"].filter(key => own(input, key));
    if (!parentFields.length) { issue(`${path}.parent_message_id`, "missing-parent"); continue; }
    // null is a root, but numeric 0 and the string "null" are real IDs. No ?? fallback.
    const parents = parentFields.map(key => input[key] === null ? null : nativeId(input[key]) ?? undefined);
    if (parents.includes(undefined)) { issue(`${path}.${parentFields[0]}`, "invalid-parent"); continue; }
    if (!parents.every(parent => parent === parents[0])) { issue(`${path}.parent_message_id`, "conflicting-parent"); continue; }
    const role = own(input, "role") && typeof input.role === "string" ? input.role.toLowerCase() : "";
    if (role !== "user" && role !== "assistant") { issue(`${path}.role`, "invalid-role"); continue; }
    const nativeMessageKey = nativeStoryMessageKey(ids[0]!);
    const nativeParentKey = parents[0] === null ? null : nativeStoryMessageKey(parents[0]!);
    if (nativeMessageKey === nativeParentKey) { issue(`${path}.parent_message_id`, "self-parent"); continue; }
    if (byKey.has(nativeMessageKey)) { issue(`${path}.message_id`, "duplicate-id"); continue; }
    const identity: NativeStoryIdentity = { role, nativeMessageKey, nativeParentKey };
    messages.push(identity); byKey.set(nativeMessageKey, identity);
  }
  diagnostics.identityCount = messages.length;
  diagnostics.completionFields = COMPLETION_FIELDS.filter(field => completionTypes.has(field)).map(field => ({ field, types: completionTypes.get(field)! }));
  if (diagnostics.issueCount) { diagnostics.ancestry = "invalid"; return result; }
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]!;
    if (message.nativeParentKey === null) diagnostics.rootCount++;
    else {
      const parent = byKey.get(message.nativeParentKey);
      if (!parent) diagnostics.boundaryCount++;
      else if (parent.role === message.role) issue(`${list.path}[${index}].parent_message_id`, "same-role-parent");
    }
  }
  // Iterative O(n) traversal: numeric order, response order and a unique leaf prove nothing.
  const settled = new Set<string>();
  for (const message of messages) {
    if (settled.has(message.nativeMessageKey)) continue;
    const path = new Set<string>(); let cursor: NativeStoryIdentity | undefined = message;
    while (cursor && !settled.has(cursor.nativeMessageKey)) {
      if (path.has(cursor.nativeMessageKey)) { issue(list.path, "parent-cycle"); break; }
      path.add(cursor.nativeMessageKey);
      cursor = cursor.nativeParentKey === null ? undefined : byKey.get(cursor.nativeParentKey);
    }
    for (const key of path) settled.add(key);
  }
  if (diagnostics.issueCount) { diagnostics.ancestry = "invalid"; return result; }
  diagnostics.ancestry = !messages.length ? "empty" : diagnostics.boundaryCount || diagnostics.pagination ? "partial" : "complete";
  result.messages = messages;
  if (diagnostics.diagnosticVersion === 3) diagnostics.replyProbe = summarizeStoryReplyProbe(messages, list.value, layers, options.anchorId);
  return result;
}
