import { readNativeStoryHistory } from "./story-native-history";
import type { StoryBaseline, StoryRecord, StoryRequest, StoryRevision } from "./story-records";
import { canonicalStoryValue, sameStoryValue } from "./story-value";
import { validNativeStoryId, validNativeStoryIdentity, validNativeStoryKey, type NativeStoryIdentity, type NativeStorySample } from "./story-transport";

/** Extension-owned transport association. Must come from explicit native response metadata
 * on the exact local request, NEVER a model echo, history ordering, or a unique candidate.
 * This is an internal contract; no actual site's response-field mapping is assumed here.
 */
export interface NativeStoryRequestLink {
  requestId: string;
  chatId: string;
  nativeParentKey: string | null;
  userMessageKey: string;
  assistantMessageKey: string;
}
/** A lifecycle adapter must capture this for the exact revision when its state is known.
 * A digest detects stale text; it is NOT authentication or proof of completion by itself.
 */
export interface NativeStoryTerminal {
  requestId: string;
  nativeMessageKey: string;
  completion: NativeStorySample["completion"];
  sampleDigest: string;
}
export interface NativeStoryExchange {
  requestId: string;
  chatId: string;
  metadata: NativeStoryIdentity[] | null;
  link: NativeStoryRequestLink | null;
  terminal: NativeStoryTerminal | null;
  user: NativeStorySample | null;
  assistant: NativeStorySample | null;
}
export type StoryExchangePauseCode = "invalid-input" | "scope-unavailable" | "request-missing" | "request-unaccepted" | "context-unknown" | "chat-mismatch" | "request-link-missing" | "request-link-invalid" | "request-link-mismatch" | "native-metadata-unavailable" | "native-metadata-invalid" | "native-message-missing" | "sample-unavailable" | "sample-invalid" | "sample-identity-mismatch" | "parent-unproven" | "source-conflict" | "native-message-ambiguous" | "lifecycle-unknown" | "lifecycle-invalid" | "lifecycle-mismatch" | "stale-sample";
export interface StoryExchangePause { status: "paused"; issue: { code: StoryExchangePauseCode; path: string } }
export interface MatchedStoryExchange {
  status: "matched";
  request: StoryRequest;
  user: NativeStorySample | null;
  assistant: NativeStorySample;
  /** Retry uses the stored user; a new user uses the request's exact parent. */
  parentRevisionId: string | null;
}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const shape = (value: unknown, fields: string[]): value is Record<string, unknown> => object(value) && Object.keys(value).every(field => fields.includes(field)) && fields.every(field => Object.prototype.hasOwnProperty.call(value, field));
const localId = (value: unknown): value is string => typeof value === "string" && !!value && value.length <= 160 && value === value.trim() && !["__proto__", "prototype", "constructor"].includes(value);
export function validNativeStoryRequestLink(value: unknown): value is NativeStoryRequestLink {
  return shape(value, ["requestId", "chatId", "nativeParentKey", "userMessageKey", "assistantMessageKey"]) && localId(value.requestId) && validNativeStoryId(value.chatId)
    && (value.nativeParentKey === null || validNativeStoryKey(value.nativeParentKey)) && validNativeStoryKey(value.userMessageKey) && validNativeStoryKey(value.assistantMessageKey)
    && value.userMessageKey !== value.assistantMessageKey;
}
export function validNativeStorySample(value: unknown): value is NativeStorySample {
  return shape(value, ["identity", "completion", "content"]) && validNativeStoryIdentity(value.identity)
    && (value.completion === "complete" || value.completion === "partial" || value.completion === "interrupted")
    && typeof value.content === "string" && !!value.content.trim() && value.content.length <= 250_000
    && !(value.identity.role === "user" && value.completion !== "complete")
    && !value.content.trimStart().startsWith("[DeepRole Service]") && !value.content.includes("<deeprole_character_mode>");
}
export async function nativeStorySampleDigest(value: unknown): Promise<string | null> {
  if (!validNativeStorySample(value)) return null;
  // Copy before the asynchronous crypto operation, so callers cannot change the hashed sample.
  const bytes = new TextEncoder().encode(canonicalStoryValue(value));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return "sha256:" + Array.from(hash, byte => byte.toString(16).padStart(2, "0")).join("");
}
const paused = (code: StoryExchangePauseCode, path: string): StoryExchangePause => ({ status: "paused", issue: { code, path } });

/** Pure matching of a validated local graph and a defensively captured native exchange.
 * computedDigest must be computed from that frozen assistant sample, not taken from the page.
 * Matching authorizes observation ONLY, never selection, candidate acceptance, or paid work.
 */
export function matchNativeStoryExchange(records: StoryRecord[], branchId: string, input: NativeStoryExchange, computedDigest: string | null): MatchedStoryExchange | StoryExchangePause {
  if (!shape(input, ["requestId", "chatId", "metadata", "link", "terminal", "user", "assistant"]) || !localId(input.requestId) || !validNativeStoryId(input.chatId)) return paused("invalid-input", "$");
  const branch = records.find(row => row.id === branchId);
  if (branch?.type !== "branch" || branch.worldId === null || branch.parentBranchId !== null) return paused("scope-unavailable", "branchId");
  const request = records.find(row => row.id === input.requestId);
  if (request?.type !== "request" || request.branchId !== branchId) return paused("request-missing", "requestId");
  if (request.delivery.status !== "accepted") return paused("request-unaccepted", "requestId");
  if (!request.context) return paused("context-unknown", "requestId");
  const baseline = records.find(row => row.id === branch.baselineId) as StoryBaseline;
  if (input.chatId !== request.chatId || input.chatId !== baseline.origin.chatId) return paused("chat-mismatch", "chatId");
  if (input.link === null) return paused("request-link-missing", "link");
  const link = input.link;
  if (!validNativeStoryRequestLink(link)) return paused("request-link-invalid", "link");
  if (link.requestId !== request.id) return paused("request-link-mismatch", "link.requestId");
  if (link.chatId !== request.chatId) return paused("request-link-mismatch", "link.chatId");
  if (link.nativeParentKey !== request.nativeParentKey) return paused("request-link-mismatch", "link.nativeParentKey");
  if (input.metadata === null) return paused("native-metadata-unavailable", "metadata");
  if (!Array.isArray(input.metadata) || input.metadata.length > 100_000 || !input.metadata.every(validNativeStoryIdentity)) return paused("native-metadata-invalid", "metadata");
  const nativeId = (key: string) => (JSON.parse(key) as [string, string])[1];
  const decoded = readNativeStoryHistory({ messages: input.metadata.map(identity => ({ id: nativeId(identity.nativeMessageKey), parent_id: identity.nativeParentKey === null ? null : nativeId(identity.nativeParentKey), role: identity.role })) }, input.chatId);
  if (!decoded.messages) return paused("native-metadata-invalid", "metadata");
  const byKey = new Map(decoded.messages.map(identity => [identity.nativeMessageKey, identity]));
  const nativeUser = byKey.get(link.userMessageKey), nativeAssistant = byKey.get(link.assistantMessageKey);
  if (!nativeUser || !nativeAssistant) return paused("native-message-missing", "metadata");
  if (nativeUser.role !== "user" || nativeAssistant.role !== "assistant" || nativeAssistant.nativeParentKey !== nativeUser.nativeMessageKey) return paused("request-link-mismatch", "metadata");
  const parent = records.find(row => row.id === request.parentRevisionId);
  if (parent?.type === "revision" && !parent.requestProof) return paused("parent-unproven", "requestId");
  const local = new Map(records.map(row => [row.id, row]));
  const prefix = new Set<string>();
  if (baseline.origin.nativeAnchor?.nativeMessageKey) prefix.add(baseline.origin.nativeAnchor.nativeMessageKey);
  let cursor = parent;
  while (cursor?.type === "revision") { prefix.add(cursor.nativeMessageKey); cursor = local.get(cursor.parentRevisionId ?? ""); }
  if (prefix.has(nativeAssistant.nativeMessageKey) || request.purpose === "user-turn" && prefix.has(nativeUser.nativeMessageKey)) return paused("source-conflict", "link");
  if (request.purpose === "assistant-retry") {
    if (parent?.type !== "revision" || parent.role !== "user" || parent.nativeMessageKey !== nativeUser.nativeMessageKey || !sameStoryValue(parent.requestProof, { nativeParentKey: nativeUser.nativeParentKey })) return paused("request-link-mismatch", "link.userMessageKey");
  } else if (nativeUser.nativeParentKey !== request.nativeParentKey) return paused("request-link-mismatch", "metadata");
  if (input.assistant === null) return paused("sample-unavailable", "assistant");
  if (request.purpose === "user-turn" && input.user === null) return paused("sample-unavailable", "user");
  if (!validNativeStorySample(input.assistant)) return paused("sample-invalid", "assistant");
  if (input.user !== null && !validNativeStorySample(input.user)) return paused("sample-invalid", "user");
  if (!sameStoryValue(input.assistant.identity, nativeAssistant)) return paused("sample-identity-mismatch", "assistant.identity");
  if (input.user !== null && !sameStoryValue(input.user.identity, nativeUser)) return paused("sample-identity-mismatch", "user.identity");
  if (request.purpose === "assistant-retry" && input.user !== null && input.user.content !== (parent as StoryRevision).content) return paused("source-conflict", "user");
  for (const identity of [nativeUser, nativeAssistant]) {
    const sources = records.filter((row): row is StoryRevision => row.type === "revision" && row.playthroughId === branch.playthroughId && row.nativeMessageKey === identity.nativeMessageKey);
    if (new Set(sources.map(row => row.messageId)).size > 1) return paused("native-message-ambiguous", "metadata");
    if (sources.some(row => row.role !== identity.role)) return paused("source-conflict", "metadata");
    const proven = records.filter((row): row is StoryRevision => row.type === "revision" && row.requestId === request.id && row.requestProof !== undefined && row.role === identity.role);
    if (proven.some(row => row.nativeMessageKey !== identity.nativeMessageKey || !sameStoryValue(row.requestProof, { nativeParentKey: identity.nativeParentKey })
      || identity.role === "user" && (row.content !== input.user?.content || row.completion !== input.user?.completion))) return paused("source-conflict", "samples");
  }
  if (input.terminal === null) return paused("lifecycle-unknown", "terminal");
  const terminal = input.terminal;
  if (!shape(terminal, ["requestId", "nativeMessageKey", "completion", "sampleDigest"]) || !localId(terminal.requestId) || !validNativeStoryKey(terminal.nativeMessageKey)
    || !(terminal.completion === "complete" || terminal.completion === "partial" || terminal.completion === "interrupted") || typeof terminal.sampleDigest !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(terminal.sampleDigest)) return paused("lifecycle-invalid", "terminal");
  if (terminal.requestId !== request.id) return paused("lifecycle-mismatch", "terminal.requestId");
  if (terminal.nativeMessageKey !== nativeAssistant.nativeMessageKey) return paused("lifecycle-mismatch", "terminal.nativeMessageKey");
  if (terminal.completion !== input.assistant.completion) return paused("lifecycle-mismatch", "terminal.completion");
  if (!computedDigest || terminal.sampleDigest !== computedDigest) return paused("stale-sample", "terminal.sampleDigest");
  return { status: "matched", request: structuredClone(request), user: request.purpose === "user-turn" ? structuredClone(input.user) : null, assistant: structuredClone(input.assistant), parentRevisionId: request.parentRevisionId };
}
