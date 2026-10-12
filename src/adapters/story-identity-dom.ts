import { nativeStoryMessageKey, validNativeStoryId, type NativeStoryIdentity, type NativeStorySample } from "../core/story-transport";
import { nativeMessageRow, REASONING } from "./deepseek-message-dom";

/** A conservative capability reader, not a guarantee that every site version supplies these fields.
 * Virtual-list position, preceding DOM siblings and generated protocol text are not ancestry.
 */
export function readNativeStoryIdentity(row: HTMLElement): NativeStoryIdentity | null {
  if (nativeMessageRow(row) !== row || row.closest(`${REASONING}, [data-deeprole-service-reply], [data-deeprole-memory-request]`)) return null;
  const id = row.getAttribute("data-message-id"), parent = row.getAttribute("data-parent-message-id");
  const roles = [row.getAttribute("data-role"), row.getAttribute("data-message-role")].filter(value => value !== null);
  const explicitRoot = row.getAttribute("data-parent-is-root") === "true";
  if (!validNativeStoryId(id) || roles.length === 0 || !roles.every(role => role === roles[0]) || !["user", "assistant"].includes(roles[0]!) || !explicitRoot && parent === null || explicitRoot && parent !== null || parent === id) return null;
  if ((row.textContent ?? "").trimStart().startsWith("[DeepRole Service]")) return null;
  // The adapter may mark a root only after observing an explicit null in native metadata.
  // Missing/empty parents and the string "null" are not interpreted as that null.
  const nativeParentKey = explicitRoot ? null : validNativeStoryId(parent) ? nativeStoryMessageKey(parent) : undefined;
  return nativeParentKey === undefined ? null : { role: roles[0] as NativeStoryIdentity["role"], nativeMessageKey: nativeStoryMessageKey(id), nativeParentKey };
}

/** A terminal sample only when the caller has an explicit lifecycle signal for THIS native
 * revision. A quiet DOM, missing Stop button or HTTP 200 is not such a signal.
 * Do not infer completion from this reader or change the user's DOM.
 */
export function readNativeStorySample(row: HTMLElement, completion: NativeStorySample["completion"] | null): NativeStorySample | null {
  if (!completion || !["complete", "partial", "interrupted"].includes(completion) || row.querySelector("[data-deeprole-recovered-reply]")) return null;
  const identity = readNativeStoryIdentity(row);
  if (!identity || identity.role === "user" && completion !== "complete") return null;
  const clone = row.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(`${REASONING}, script, style, template, iframe, object, embed, button, [role='button'], [role='toolbar'], svg, [data-deeprole-characters-summary], [data-deeprole-scene-photos], [data-deeprole-memory-card], [data-deeprole-choices-host], [data-deeprole-choices-loading], [data-deeprole-recovery-label]`).forEach(node => node.remove());
  const content = clone.textContent ?? "";
  if (!content.trim() || content.length > 250_000 || content.trimStart().startsWith("[DeepRole Service]") || content.includes("<deeprole_character_mode>")) return null;
  return { identity, completion, content };
}
