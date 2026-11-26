import type { SceneClockTimeline } from "../core/story-scene-clock";
import { canonicalNativeMessageIdentity, nativeMessageIdentity, nativeMessageRows, isUserMessage, REASONING } from "./deepseek-message-dom";

const markerAttribute = "data-deeprole-scene-clock";

/** Decorate the existing heading rather than insert a duplicate into the chat. */
export function presentSceneClocks(doc: Document, chatId: string | null, timeline?: SceneClockTimeline) {
  const owned = new Map([...timeline?.markers.values() ?? []].filter(marker => marker.chatId === chatId).map(marker => [marker.nativeMessageKey, marker]));
  const confirmed = new Set<HTMLElement>();
  if (owned.size) for (const row of nativeMessageRows(doc)) {
    const id = nativeMessageIdentity(row);
    const marker = id && owned.get(canonicalNativeMessageIdentity(id));
    if (!marker || isUserMessage(row) || row.closest(REASONING)) continue;
    const heading = [...row.querySelectorAll<HTMLElement>("p, h1, h2, h3, h4, h5, h6")]
      .find(element => !element.closest(REASONING) && element.textContent?.trim() === marker.label);
    if (heading) {
      confirmed.add(heading);
      const role = marker.flashback ? "flashback" : "present";
      if (heading.getAttribute(markerAttribute) !== role) heading.setAttribute(markerAttribute, role);
    }
  }
  for (const previous of doc.querySelectorAll<HTMLElement>(`[${markerAttribute}]`)) {
    if (!confirmed.has(previous)) previous.removeAttribute(markerAttribute);
  }
  if (confirmed.size && !doc.getElementById("deeprole-scene-clock-style")) {
    const style = doc.createElement("style");
    style.id = "deeprole-scene-clock-style";
    style.textContent = `[${markerAttribute}] { font-size: .82em; font-weight: 650; color: var(--dr-muted, inherit); } [${markerAttribute}="flashback"] { font-style: italic; }`;
    doc.head.append(style);
  }
}
