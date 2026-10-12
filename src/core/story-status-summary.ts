/** Privacy allowlist only: these literals do NOT define DeepSeek lifecycle semantics.
 * Unknown strings/numbers/objects are never copied, trimmed, parsed or interpolated.
 */
export const nativeStoryStatusCodes = ["FINISHED", "COMPLETED", "STOPPED", "INTERRUPTED", "ERROR", "FAILED", "STREAMING", "PENDING", "WAITING", "GENERATING", "RUNNING", "CANCELLED", "CANCELED", "IN_PROGRESS", "WIP", "INCOMPLETE", "TIMEOUT", "CONTENT_FILTER", "CONTEXT_LENGTH_EXCEEDED"] as const;
export const nativeStoryStatusStates = [...nativeStoryStatusCodes, "unrecognized-string", "non-string"] as const;
export const nativeStoryStatusFields = ["status", "message_status"] as const;
export const nativeStoryStatusRoles = ["user", "assistant", "unknown"] as const;
export const maxNativeStoryStatusRows = nativeStoryStatusFields.length * nativeStoryStatusRoles.length * nativeStoryStatusStates.length;
export interface NativeStoryStatusCount {
  field: typeof nativeStoryStatusFields[number];
  role: typeof nativeStoryStatusRoles[number];
  state: typeof nativeStoryStatusStates[number];
  count: number;
}
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const key = (field: string, role: string, state: string) => `${field}:${role}:${state}`;

/** Input is the already size-bounded history list. Aggregate every record, including
 * invalid identities; count presence/types, not selected branches or completed replies.
 */
export function summarizeNativeStoryStatuses(messages: readonly unknown[]): NativeStoryStatusCount[] {
  const counts = new Map<string, number>();
  for (const input of messages) {
    if (!input || typeof input !== "object" || Array.isArray(input)) continue;
    const message = input as Record<string, unknown>;
    const roleValue = own(message, "role") && typeof message.role === "string" ? message.role.toLowerCase() : "";
    const role = roleValue === "user" || roleValue === "assistant" ? roleValue : "unknown";
    for (const field of nativeStoryStatusFields) {
      if (!own(message, field)) continue;
      const value = message[field];
      const state = typeof value !== "string" ? "non-string" : nativeStoryStatusCodes.find(code => code === value) ?? "unrecognized-string";
      const identity = key(field, role, state);
      counts.set(identity, (counts.get(identity) ?? 0) + 1);
    }
  }
  const result: NativeStoryStatusCount[] = [];
  for (const field of nativeStoryStatusFields) for (const role of nativeStoryStatusRoles) for (const state of nativeStoryStatusStates) {
    const count = counts.get(key(field, role, state));
    if (count) result.push({ field, role, state, count });
  }
  return result;
}
