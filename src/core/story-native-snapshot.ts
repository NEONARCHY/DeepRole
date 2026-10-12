import { readNativeStoryHistory, type NativeStoryHistoryDiagnostics } from "./story-native-history";
import { nativeStoryMessageKey, validNativeStoryId, type NativeStoryIdentity } from "./story-transport";

export const snapshotIssues = ["unsupported-schema", "chat-mismatch", "invalid-history", "selection-unavailable", "selection-outside-history", "selected-path-partial"] as const;
export const snapshotCompletions = ["complete", "in-progress", "interrupted", "unusable", "unknown", "not-applicable"] as const;
export interface NativeStorySnapshotDiagnostics {
  contract: "deepseek-web-history-2026-10";
  session: "matched" | "unknown" | "mismatch";
  /** Server history selection, NOT the current in-memory browser branch. */
  selection: "anchor" | "ancestor" | "different" | "unknown";
  selectedPath: "complete" | "partial" | "unknown";
  selectedMessageCount: number | null;
  anchorCompletion: typeof snapshotCompletions[number];
  issue: typeof snapshotIssues[number] | null;
}
export interface NativeStoryServerSnapshot {
  /** Private native identities. Never include these in a copied diagnostic report. */
  messages: NativeStoryIdentity[] | null;
  serverSelectedPath: NativeStoryIdentity[] | null;
  diagnostics: NativeStoryHistoryDiagnostics;
}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
function id(value: unknown): string | null {
  const normalized = typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? String(value) : value;
  return validNativeStoryId(normalized) ? normalized : null;
}
function emptySnapshot(): NativeStorySnapshotDiagnostics {
  return { contract: "deepseek-web-history-2026-10", session: "unknown", selection: "unknown", selectedPath: "unknown", selectedMessageCount: null, anchorCompletion: "unknown", issue: "unsupported-schema" };
}
function completion(row: Record<string, unknown> | undefined): NativeStorySnapshotDiagnostics["anchorCompletion"] {
  if (!row) return "unknown";
  if (row.role === "USER") return "not-applicable";
  if (row.role !== "ASSISTANT") return "unknown";
  if (row.status === "WIP") return "in-progress";
  if (row.status === "INCOMPLETE" || row.status === "TIMEOUT") return "interrupted";
  if (row.status === "CONTENT_FILTER" || row.status === "CONTEXT_LENGTH_EXCEEDED") return "unusable";
  // Verified client mapping FINISHED -> OK is not enough when a fragment is pending
  // or an alternate lifecycle field contradicts it. No fallback for unknown codes.
  return row.status === "FINISHED" && row.has_pending_fragment === false
    && (!own(row, "quasi_status") || row.quasi_status === null || row.quasi_status === "FINISHED")
    && (!own(row, "incomplete_message") || row.incomplete_message === null) ? "complete" : "unknown";
}

/** Narrow schema verified against the current public DeepSeek web client. Reads only
 * explicit chat_session.current_message_id; never adopts its max-ID fallback. A server
 * snapshot is evidence about that response, not request association, local selection,
 * event acceptance, or permission to mutate memory. Old shapes keep v3 diagnostics.
 */
export function readNativeStoryServerSnapshot(value: unknown, chatId: string, anchorId?: string | null): NativeStoryServerSnapshot {
  const history = readNativeStoryHistory(value, chatId, { collectReplyProbe: true, anchorId });
  const result: NativeStoryServerSnapshot = { messages: history.messages, serverSelectedPath: null, diagnostics: history.diagnostics };
  const biz = object(value) && object(value.data) && object(value.data.biz_data) ? value.data.biz_data : null;
  // Compatibility: legacy diagnostic reports remain valid observations, not evidence
  // for this site's selected-path contract.
  if (!biz || !own(biz, "chat_session")) return result;
  const summary = emptySnapshot();
  if (history.diagnostics.diagnosticVersion !== 3) return result;
  result.diagnostics = { ...history.diagnostics, diagnosticVersion: 4, nativeSnapshot: summary };
  if (!object(value) || value.code !== 0 || !object(value.data) || value.data.biz_code !== 0 || !object(biz.chat_session) || !Array.isArray(biz.chat_messages)) return result;
  const session = biz.chat_session;
  if (!validNativeStoryId(session.id)) return result;
  if (session.id !== chatId) { summary.session = "mismatch"; summary.issue = "chat-mismatch"; result.messages = null; return result; }
  summary.session = "matched";
  if (!history.messages) { summary.issue = "invalid-history"; return result; }
  // The private decoder requires canonical fields used by this client. Alternate
  // generic aliases remain diagnostic-only, even if their graph looks plausible.
  if (!biz.chat_messages.every(row => object(row) && id(row.message_id) !== null && own(row, "parent_id") && ["USER", "ASSISTANT"].includes(row.role as string))) { summary.issue = "unsupported-schema"; return result; }
  const anchor = validNativeStoryId(anchorId) ? history.messages.find(row => row.nativeMessageKey === nativeStoryMessageKey(anchorId)) : undefined;
  summary.anchorCompletion = completion(anchor ? biz.chat_messages.find(row => object(row) && id(row.message_id) === anchorId) as Record<string, unknown> | undefined : undefined);
  const tip = own(session, "current_message_id") ? id(session.current_message_id) : null;
  if (!tip) { summary.issue = "selection-unavailable"; return result; }
  const byKey = new Map(history.messages.map(row => [row.nativeMessageKey, row]));
  let cursor = byKey.get(nativeStoryMessageKey(tip));
  if (!cursor) { summary.issue = "selection-outside-history"; return result; }
  const path: NativeStoryIdentity[] = [];
  // The generic reader has already validated all parent links and cycles.
  while (cursor) {
    path.push({ ...cursor });
    if (cursor.nativeParentKey === null) break;
    cursor = byKey.get(cursor.nativeParentKey);
  }
  summary.selectedMessageCount = path.length;
  if (!cursor || history.diagnostics.pagination) { summary.selectedPath = "partial"; summary.issue = "selected-path-partial"; return result; }
  path.reverse(); result.serverSelectedPath = path;
  summary.selectedPath = "complete"; summary.issue = null;
  summary.selection = !anchor ? "unknown" : anchor.nativeMessageKey === path.at(-1)!.nativeMessageKey ? "anchor" : path.some(row => row.nativeMessageKey === anchor.nativeMessageKey) ? "ancestor" : "different";
  return result;
}

/** Privacy boundary, including cross-field invariants; never forward raw page values. */
export function readNativeSnapshotDiagnostics(value: unknown): NativeStorySnapshotDiagnostics | null {
  const keys = ["contract", "session", "selection", "selectedPath", "selectedMessageCount", "anchorCompletion", "issue"];
  if (!object(value) || Object.keys(value).length !== keys.length || !keys.every(key => own(value, key))
    || value.contract !== "deepseek-web-history-2026-10" || !["matched", "unknown", "mismatch"].includes(value.session as string)
    || !["anchor", "ancestor", "different", "unknown"].includes(value.selection as string) || !["complete", "partial", "unknown"].includes(value.selectedPath as string)
    || !snapshotCompletions.includes(value.anchorCompletion as NativeStorySnapshotDiagnostics["anchorCompletion"])
    || !(value.issue === null || snapshotIssues.includes(value.issue as typeof snapshotIssues[number]))) return null;
  const count = value.selectedMessageCount;
  if (value.selectedPath === "unknown" ? count !== null || value.selection !== "unknown" : typeof count !== "number" || !Number.isSafeInteger(count) || count < 1 || count > 100_000) return null;
  if (value.selectedPath === "partial" && (value.selection !== "unknown" || value.issue !== "selected-path-partial")
    || value.selectedPath === "complete" && value.issue !== null
    || value.selectedPath === "unknown" && (value.issue === null || value.issue === "selected-path-partial")) return null;
  if (value.session !== "matched" && (value.selectedPath !== "unknown" || value.anchorCompletion !== "unknown")
    || value.session === "mismatch" && value.issue !== "chat-mismatch" || value.session === "unknown" && value.issue !== "unsupported-schema"
    || value.session === "matched" && value.issue === "chat-mismatch") return null;
  return { contract: "deepseek-web-history-2026-10", session: value.session as NativeStorySnapshotDiagnostics["session"], selection: value.selection as NativeStorySnapshotDiagnostics["selection"],
    selectedPath: value.selectedPath as NativeStorySnapshotDiagnostics["selectedPath"], selectedMessageCount: count as number | null,
    anchorCompletion: value.anchorCompletion as NativeStorySnapshotDiagnostics["anchorCompletion"], issue: value.issue as NativeStorySnapshotDiagnostics["issue"] };
}
