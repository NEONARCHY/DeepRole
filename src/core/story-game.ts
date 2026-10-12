import { finalText } from "./story-native-reply";
import { readNativeStoryServerSnapshot } from "./story-native-snapshot";
import { nativeStoryMessageKey, validNativeStoryId, validNativeStoryKey, validNativeStoryIdentity, type NativeStorySample } from "./story-transport";
export interface StoryGameSnapshot { chatId: string; selectedNativeKey: string | null; messages: NativeStorySample[] }
export interface StoryGameOutcome { active: boolean; changed: boolean; preparedParentKey?: string | null; update?: import("./story-update").StoryUpdateDiagnostic; revisionId?: string; repairAttempted?: boolean }
export interface StoryGameInput {
  chatId: string; worldId: string; expectedBase: string; operation: "start" | "restart" | "sync" | "resume" | "undo" | "parent" | "edit";
  snapshot: StoryGameSnapshot; nativeParentKey: string | null; manual: "stop" | "keep";
}
export function validStoryGameSnapshot(v: unknown): v is StoryGameSnapshot {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const s = v as StoryGameSnapshot;
  return Object.keys(s).length === 3 && validNativeStoryId(s.chatId) && (s.selectedNativeKey === null || validNativeStoryKey(s.selectedNativeKey))
    && Array.isArray(s.messages) && s.messages.length <= 10000 && Array.from(s.messages).every(m => !!m && typeof m === "object" && !Array.isArray(m)
      && Object.keys(m).length === 3 && ["identity", "completion", "content"].every(k => Object.hasOwn(m, k)) && validNativeStoryIdentity(m.identity)
      && ["complete", "partial", "interrupted"].includes(m.completion) && typeof m.content === "string" && !!m.content.trim() && m.content.length <= 250_000)
    && new Set(s.messages.map(m => m.identity.nativeMessageKey)).size === s.messages.length;
}
export function validStoryGameInput(v: unknown): v is StoryGameInput {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const s = v as StoryGameInput;
  return Object.keys(s).length === 7 && ["chatId", "worldId", "expectedBase", "operation", "snapshot", "nativeParentKey", "manual"].every(k => Object.hasOwn(s, k))
    && validNativeStoryId(s.chatId) && typeof s.worldId === "string" && !!s.worldId && s.worldId.length <= 160 && typeof s.expectedBase === "string" && !!s.expectedBase && s.expectedBase.length <= 160
    && ["start", "restart", "sync", "resume", "undo", "parent", "edit"].includes(s.operation) && ["stop", "keep"].includes(s.manual)
    && (s.nativeParentKey === null || validNativeStoryKey(s.nativeParentKey)) && validStoryGameSnapshot(s.snapshot) && s.snapshot.chatId === s.chatId;
}
/** Canonical site schema only. Text excludes THINK, controls and files. The current
 * server selection is checked against the complete parent graph, never date order. */
export function readStoryGameSnapshot(value: unknown, chatId: string): StoryGameSnapshot | null {
  const native = readNativeStoryServerSnapshot(value, chatId);
  const biz = (value as { data?: { biz_data?: { chat_session?: { id?: unknown; current_message_id?: unknown }; chat_messages?: Record<string, unknown>[] } } })?.data?.biz_data;
  if (!native.messages || !biz || biz.chat_session?.id !== chatId || !Array.isArray(biz.chat_messages)) return null;
  if (!biz.chat_messages.length && biz.chat_session.current_message_id === null) return { chatId, selectedNativeKey: null, messages: [] };
  if (!native.serverSelectedPath || native.diagnostics.diagnosticVersion !== 4 || native.diagnostics.nativeSnapshot?.issue !== null) return null;
  const messages: NativeStorySample[] = [];
  for (const identity of native.messages) {
    const row = biz.chat_messages.find(r => nativeStoryMessageKey(String(r.message_id)) === identity.nativeMessageKey)!;
    const complete = row.status === "FINISHED" && row.has_pending_fragment === false && (row.quasi_status === undefined || row.quasi_status === null || row.quasi_status === "FINISHED") && (row.incomplete_message === undefined || row.incomplete_message === null);
    const content = finalText(row, identity.role);
    if (content !== null) messages.push({ identity, completion: complete ? "complete" : "interrupted", content });
  }
  const selectedNativeKey = native.serverSelectedPath.at(-1)!.nativeMessageKey;
  // Completion belongs to each message. An unknown OLD status must not block a
  // new checkpoint; the client verifies the displayed anchor and the writer
  // requires completed sources only between that checkpoint and the chosen head.
  return { chatId, selectedNativeKey, messages };
}
