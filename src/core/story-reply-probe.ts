import { nativeStoryMessageKey, validNativeStoryId, type NativeStoryIdentity } from "./story-transport";
import { nativeStoryStatusStates, summarizeNativeStoryStatuses } from "./story-status-summary";

export const replyObservationFields = ["status", "message_status", "finish_reason", "is_finished", "is_complete", "finished_at", "is_selected", "is_current"] as const;
export const replyObservationTypes = ["null", "string", "number", "boolean", "array", "object", "other"] as const;
export const replyReferencePaths = ["$", "$.data", "$.biz_data", "$.data.biz_data"] as const;
export const replyReferenceFields = ["current_message_id", "selected_message_id", "last_message_id"] as const;
type Observation = { field: typeof replyObservationFields[number]; type: typeof replyObservationTypes[number]; state: string | null };
type Reference = { path: typeof replyReferencePaths[number]; field: typeof replyReferenceFields[number]; relation: "anchor" | "other-in-window" | "outside-window" | "null" | "invalid" };
export interface NativeStoryReplyProbe {
  /** Observations only. No field semantics or selected/completed revision is asserted. */
  selection: "unknown";
  completion: "unknown";
  anchor: "not-supplied" | "not-in-history" | "invalid-history" | "matched";
  role: "user" | "assistant" | "unknown";
  parent: "root" | "in-window" | "outside-window" | "unknown";
  siblingReplies: number | null;
  childMessages: number | null;
  fields: Observation[];
  references: Reference[];
}
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const own = (v: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(v, key);
const shape = (v: unknown, keys: string[]): v is Record<string, unknown> => object(v) && Object.keys(v).length === keys.length && keys.every(k => own(v, k));
function nativeId(v: unknown): string | null {
  const id = typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? String(v) : v;
  return validNativeStoryId(id) ? id : null;
}
function valueType(v: unknown): Observation["type"] {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  const type = typeof v;
  return ["string", "number", "boolean", "object"].includes(type) ? type as Observation["type"] : "other";
}
export function emptyStoryReplyProbe(anchor: NativeStoryReplyProbe["anchor"] = "invalid-history"): NativeStoryReplyProbe {
  return { selection: "unknown", completion: "unknown", anchor, role: "unknown", parent: "unknown", siblingReplies: null, childMessages: null, fields: [], references: [] };
}
/** Call only after the entire identity graph passed validation. The anchor is an exact
 * visible native ID, not a selected-leaf guess. References are candidate field observations,
 * not a documented DeepSeek schema; arbitrary values never leave the page.
 */
export function summarizeStoryReplyProbe(messages: NativeStoryIdentity[], rows: unknown[], layers: { value: Record<string, unknown>; path: string }[], anchorId?: string | null): NativeStoryReplyProbe {
  const key = validNativeStoryId(anchorId) ? nativeStoryMessageKey(anchorId) : null;
  const byKey = new Map(messages.map(m => [m.nativeMessageKey, m]));
  const anchor = key ? byKey.get(key) : undefined;
  const result = emptyStoryReplyProbe(!key ? "not-supplied" : !anchor ? "not-in-history" : "matched");
  // ID comparisons remain internal, including candidate references to other messages.
  for (const layer of layers) for (const field of replyReferenceFields) if (own(layer.value, field)) {
    const raw = layer.value[field], id = nativeId(raw), ref = id ? nativeStoryMessageKey(id) : null;
    result.references.push({ path: layer.path as Reference["path"], field,
      relation: raw === null ? "null" : !ref ? "invalid" : ref === key ? "anchor" : byKey.has(ref) ? "other-in-window" : "outside-window" });
  }
  if (!anchor) return result;
  result.role = anchor.role;
  result.parent = anchor.nativeParentKey === null ? "root" : byKey.has(anchor.nativeParentKey) ? "in-window" : "outside-window";
  // Includes the anchored reply; for a user/root message the comparison is not applicable.
  result.siblingReplies = anchor.role === "assistant" && anchor.nativeParentKey !== null
    ? messages.filter(m => m.role === "assistant" && m.nativeParentKey === anchor.nativeParentKey).length : null;
  result.childMessages = messages.filter(m => m.nativeParentKey === key).length;
  const row = rows.find(v => object(v) && nativeId(own(v, "message_id") ? v.message_id : v.id) === anchorId);
  if (!object(row)) return result;
  for (const field of replyObservationFields) if (own(row, field)) {
    const type = valueType(row[field]);
    let state: string | null = null;
    if (field === "status" || field === "message_status") state = summarizeNativeStoryStatuses([row]).find(s => s.field === field)!.state;
    else if (["is_finished", "is_complete", "is_selected", "is_current"].includes(field) && type === "boolean") state = row[field] === true ? "true" : "false";
    // finish_reason and finished_at expose types only: no speculative code allowlist.
    result.fields.push({ field, type, state });
  }
  return result;
}
/** Strict copy/display boundary: bounded fixed names, counts, types and privacy-safe codes. */
export function readStoryReplyProbe(value: unknown): NativeStoryReplyProbe | null {
  if (!shape(value, ["selection", "completion", "anchor", "role", "parent", "siblingReplies", "childMessages", "fields", "references"])
    || value.selection !== "unknown" || value.completion !== "unknown"
    || !["not-supplied", "not-in-history", "invalid-history", "matched"].includes(value.anchor as string)
    || !["user", "assistant", "unknown"].includes(value.role as string) || !["root", "in-window", "outside-window", "unknown"].includes(value.parent as string)) return null;
  const count = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 100_000;
  if (!(value.siblingReplies === null || count(value.siblingReplies)) || !(value.childMessages === null || count(value.childMessages))
    || !Array.isArray(value.fields) || value.fields.length > replyObservationFields.length || !value.fields.every(f => {
      if (!shape(f, ["field", "type", "state"]) || !replyObservationFields.includes(f.field as Observation["field"]) || !replyObservationTypes.includes(f.type as Observation["type"])) return false;
      if (f.field === "status" || f.field === "message_status") return f.type === "string"
        ? nativeStoryStatusStates.includes(f.state as typeof nativeStoryStatusStates[number]) && f.state !== "non-string" : f.state === "non-string";
      if (["is_finished", "is_complete", "is_selected", "is_current"].includes(f.field as string) && f.type === "boolean") return f.state === "true" || f.state === "false";
      return f.state === null;
    }) || new Set(value.fields.map(f => f.field)).size !== value.fields.length
    || !Array.isArray(value.references) || value.references.length > replyReferencePaths.length * replyReferenceFields.length
    || !value.references.every(r => shape(r, ["path", "field", "relation"]) && replyReferencePaths.includes(r.path as Reference["path"])
      && replyReferenceFields.includes(r.field as Reference["field"]) && ["anchor", "other-in-window", "outside-window", "null", "invalid"].includes(r.relation as string))
    || new Set(value.references.map(r => `${r.path}:${r.field}`)).size !== value.references.length) return null;
  if (value.anchor === "matched") {
    if (value.role === "unknown" || value.parent === "unknown" || !count(value.childMessages)
      || (value.role === "user" || value.parent === "root") && value.siblingReplies !== null
      || value.role === "assistant" && value.parent !== "root" && (!count(value.siblingReplies) || value.siblingReplies === 0)) return null;
  } else if (value.role !== "unknown" || value.parent !== "unknown" || value.siblingReplies !== null || value.childMessages !== null || value.fields.length) return null;
  if (value.anchor === "invalid-history" && value.references.length || value.anchor === "not-supplied" && value.references.some(r => r.relation === "anchor")) return null;
  return { selection: "unknown", completion: "unknown", anchor: value.anchor as NativeStoryReplyProbe["anchor"], role: value.role as NativeStoryReplyProbe["role"],
    parent: value.parent as NativeStoryReplyProbe["parent"], siblingReplies: value.siblingReplies as number | null, childMessages: value.childMessages as number | null,
    fields: value.fields.map(f => ({ field: f.field, type: f.type, state: f.state })), references: value.references.map(r => ({ path: r.path, field: r.field, relation: r.relation })) };
}
