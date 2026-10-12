import { validNativeStoryRequestLink, validNativeStorySample, type NativeStoryRequestLink } from "./story-exchange";
import { readNativeStoryServerSnapshot } from "./story-native-snapshot";
import { validNativeStoryId, validStoryTransportIdentity, type NativeStorySample, type StoryTransportIdentity } from "./story-transport";
import { sameStoryValue } from "./story-value";

export interface NativeStoryReplyQuery { requestId: string; identity: StoryTransportIdentity; link: NativeStoryRequestLink }
export interface NativeStoryReplyResult extends NativeStoryReplyQuery {
  /** Ephemeral equality check. Never store a second copy of the injected user text. */
  wireUserText: string;
  assistant: NativeStorySample;
  /** Snapshot evidence only. NOT the locally selected browser variant. */
  serverSelection: "anchor" | "ancestor" | "different" | "unknown";
}
export interface StoryDispatchReply {
  contract: "deepseek-web-history-2026-10";
  assistant: NativeStorySample;
  serverSelection: NativeStoryReplyResult["serverSelection"];
  observedAt: number;
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const shape = (v: unknown, keys: string[]): v is Record<string, unknown> => object(v) && Object.keys(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v, k));
const selection = (v: unknown) => ["anchor", "ancestor", "different", "unknown"].includes(v as string);
export function validNativeStoryReplyQuery(v: unknown): v is NativeStoryReplyQuery {
  return shape(v, ["requestId", "identity", "link"]) && validNativeStoryId(v.requestId) && validStoryTransportIdentity(v.identity)
    && validNativeStoryRequestLink(v.link) && v.link.requestId === v.requestId && v.link.chatId === v.identity.chatId && v.link.nativeParentKey === v.identity.nativeParentKey;
}
export function validStoryDispatchReply(v: unknown): v is StoryDispatchReply {
  return shape(v, ["contract", "assistant", "serverSelection", "observedAt"]) && v.contract === "deepseek-web-history-2026-10"
    && validNativeStorySample(v.assistant) && v.assistant.identity.role === "assistant" && v.assistant.completion === "complete" && selection(v.serverSelection)
    && typeof v.observedAt === "number" && Number.isFinite(v.observedAt) && v.observedAt >= 0;
}
export function validNativeStoryReplyResult(v: unknown): v is NativeStoryReplyResult {
  return shape(v, ["requestId", "identity", "link", "wireUserText", "assistant", "serverSelection"])
    && validNativeStoryReplyQuery({ requestId: v.requestId, identity: v.identity, link: v.link }) && typeof v.wireUserText === "string" && v.wireUserText.length <= 600_020
    && validStoryDispatchReply({ contract: "deepseek-web-history-2026-10", assistant: v.assistant, serverSelection: v.serverSelection, observedAt: 0 })
    && sameStoryValue((v.assistant as NativeStorySample).identity, { role: "assistant", nativeMessageKey: (v.link as NativeStoryRequestLink).assistantMessageKey, nativeParentKey: (v.link as NativeStoryRequestLink).userMessageKey });
}
export type NativeStoryReplyRead = { status: "read"; result: NativeStoryReplyResult } | { status: "unavailable"; code: "schema" | "pair" | "completion" | "text" };
/** Only canonical text fragments used by the verified native client. No content/text
 * alias fallbacks, no reasoning, no file/image contents, no guessed transcript tail. */
export function finalText(row: Record<string, unknown>, role: "user" | "assistant"): string | null {
  if (!Array.isArray(row.fragments) || row.fragments.length > 1000) return null;
  let output = "", requests = 0, responses = 0;
  for (const fragment of row.fragments) {
    if (!object(fragment)) return null;
    if (role === "assistant" && fragment.type === "THINK") continue;
    if (fragment.type !== (role === "user" ? "REQUEST" : "RESPONSE") || typeof fragment.content !== "string") return null;
    requests += role === "user" ? 1 : 0; responses += role === "assistant" ? 1 : 0;
    output += fragment.content;
    if (output.length > (role === "user" ? 600_020 : 250_000)) return null;
  }
  return (role === "user" ? requests === 1 : responses > 0) && output.trim() ? output : null;
}
export function readNativeStoryReply(value: unknown, query: NativeStoryReplyQuery): NativeStoryReplyRead {
  const unavailable = (code: Extract<NativeStoryReplyRead, { status: "unavailable" }>["code"]): NativeStoryReplyRead => ({ status: "unavailable", code });
  if (!validNativeStoryReplyQuery(query)) return unavailable("pair");
  const anchorId = (JSON.parse(query.link.assistantMessageKey) as [string, string])[1];
  const snapshot = readNativeStoryServerSnapshot(value, query.identity.chatId, anchorId);
  const info = snapshot.diagnostics.diagnosticVersion === 4 ? snapshot.diagnostics.nativeSnapshot : null;
  if (!info || info.session !== "matched" || info.issue === "unsupported-schema" || !snapshot.messages) return unavailable("schema");
  const user = snapshot.messages.find(r => r.nativeMessageKey === query.link.userMessageKey), assistant = snapshot.messages.find(r => r.nativeMessageKey === query.link.assistantMessageKey);
  if (!user || !assistant || user.role !== "user" || user.nativeParentKey !== query.identity.nativeParentKey
    || assistant.role !== "assistant" || assistant.nativeParentKey !== user.nativeMessageKey) return unavailable("pair");
  if (info.anchorCompletion !== "complete") return unavailable("completion");
  const rows = (value as { data: { biz_data: { chat_messages: Record<string, unknown>[] } } }).data.biz_data.chat_messages;
  const nativeId = (key: string) => (JSON.parse(key) as [string, string])[1];
  const userRow = rows.find(r => String(r.message_id) === nativeId(user.nativeMessageKey))!, replyRow = rows.find(r => String(r.message_id) === anchorId)!;
  // A user request itself must be committed; an optimistic fake row is not a source.
  if (userRow.status !== "FINISHED" || userRow.has_pending_fragment !== false
    || userRow.quasi_status !== undefined && userRow.quasi_status !== null && userRow.quasi_status !== "FINISHED"
    || userRow.incomplete_message !== undefined && userRow.incomplete_message !== null) return unavailable("completion");
  const wireUserText = finalText(userRow, "user"), content = finalText(replyRow, "assistant");
  if (wireUserText === null || content === null) return unavailable("text");
  const result: NativeStoryReplyResult = { ...structuredClone(query), wireUserText, assistant: { identity: assistant, completion: "complete", content }, serverSelection: info.selection };
  return validNativeStoryReplyResult(result) ? { status: "read", result } : unavailable("text");
}
