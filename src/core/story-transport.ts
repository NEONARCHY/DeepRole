export interface StoryTransportIdentity {
  chatId: string;
  /** null is an explicit root. Missing/unreadable is not a root. */
  nativeParentKey: string | null;
}
export interface NativeStoryIdentity {
  role: "user" | "assistant";
  nativeMessageKey: string;
  nativeParentKey: string | null;
}
export interface NativeStorySample {
  identity: NativeStoryIdentity;
  completion: "complete" | "partial" | "interrupted";
  content: string;
}
export function validNativeStoryIdentity(value: unknown): value is NativeStoryIdentity {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).every(key => ["role", "nativeMessageKey", "nativeParentKey"].includes(key))
    && (record.role === "user" || record.role === "assistant") && validNativeStoryKey(record.nativeMessageKey)
    && (record.nativeParentKey === null || validNativeStoryKey(record.nativeParentKey)) && record.nativeMessageKey !== record.nativeParentKey;
}
export const validNativeStoryId = (value: unknown): value is string => typeof value === "string" && /^[\w-]{1,120}$/u.test(value) && !["__proto__", "constructor", "prototype"].includes(value);
export function nativeStoryMessageKey(id: string): string {
  if (!validNativeStoryId(id)) throw new Error("story-native-id-invalid");
  return JSON.stringify(["message", id]);
}
export function validNativeStoryKey(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 160) return false;
  try {
    const key: unknown = JSON.parse(value);
    return Array.isArray(key) && key.length === 2 && key[0] === "message" && validNativeStoryId(key[1]) && value === nativeStoryMessageKey(key[1]);
  } catch { return false; }
}
export function validStoryTransportIdentity(value: unknown): value is StoryTransportIdentity {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).every(key => ["chatId", "nativeParentKey"].includes(key)) && validNativeStoryId(record.chatId) && (record.nativeParentKey === null || validNativeStoryKey(record.nativeParentKey));
}
/** Only explicit native request fields; no text/order/URL fallback. No secrets returned. */
export function readStoryTransportIdentity(body: string): StoryTransportIdentity | null {
  try {
    const record: unknown = JSON.parse(body);
    if (!record || typeof record !== "object" || Array.isArray(record)) return null;
    const { chat_session_id: chatId, parent_message_id: parent } = record as Record<string, unknown>;
    if (!validNativeStoryId(chatId)) return null;
    if (parent === null) return { chatId, nativeParentKey: null };
    const parentId = typeof parent === "number" && Number.isSafeInteger(parent) && parent >= 0 ? String(parent) : parent;
    return validNativeStoryId(parentId) ? { chatId, nativeParentKey: nativeStoryMessageKey(parentId) } : null;
  } catch { return null; }
}
