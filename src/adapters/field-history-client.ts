import { validNativeStoryId } from "../core/story-transport";
import { validFieldHistoryReference, type FieldHistoryQuery, type FieldHistoryReference } from "../core/field-history";
import { nativeMessageRows, REASONING } from "./deepseek-message-dom";

export function fieldHistoryAnchor(root: ParentNode = document, diagnosticVirtualKey = false): string | null {
  const shown = (row: HTMLElement) => {
    for (let cursor: HTMLElement | null = row; cursor; cursor = cursor.parentElement) if (cursor.hidden || cursor.getAttribute("aria-hidden") === "true" || getComputedStyle(cursor).display === "none" || getComputedStyle(cursor).visibility === "hidden") return false;
    return true;
  };
  const rows = nativeMessageRows(root).filter(r => !r.closest(REASONING) && !r.matches("[data-deeprole-service-reply], [data-deeprole-memory-request], [data-deeprole-character-text-hidden]") && shown(r) && !r.textContent?.trimStart().startsWith("[DeepRole Service]"));
  const key = (row: HTMLElement) => {
    const id = row.getAttribute("data-message-id"), virtual = diagnosticVirtualKey ? row.closest("[data-virtual-list-item-key]")?.getAttribute("data-virtual-list-item-key") : null;
    // The virtual key is a diagnostic candidate only, never proof of selection.
    // Disagreeing explicit/native keys are ambiguous. Do not strip prefixes or
    // guess an ID from a list position, prose, DOM id or numeric suffix.
    if (id !== null && virtual != null && id !== virtual) return null;
    return id ?? virtual;
  };
  const id = rows.at(-1) ? key(rows.at(-1)!) : null;
  return validNativeStoryId(id) && rows.filter(r => key(r) === id).length === 1 ? id : null;
}
/** Listener belongs to one explicit field click; no background polling or storage writes. */
export async function requestFieldHistory(chatId: string | null, query: FieldHistoryQuery, inScope: () => boolean, root: ParentNode = document, signal?: AbortSignal): Promise<FieldHistoryReference | null> {
  const anchorId = fieldHistoryAnchor(root); if (!chatId || !anchorId || !inScope() || signal?.aborted) return null;
  const url = location.href, requestId = "field_history_" + crypto.randomUUID();
  return new Promise(resolve => {
    const finish = (result: FieldHistoryReference | null) => { window.clearTimeout(timer); window.removeEventListener("message", listener); signal?.removeEventListener("abort", abort); resolve(result); };
    const abort = () => finish(null);
    const listener = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin || event.data?.source !== "deeprole-page-bridge" || event.data.type !== "FIELD_HISTORY_RESULT" || event.data.requestId !== requestId) return;
      finish(event.data.chatId === chatId && event.data.anchorId === anchorId && location.href === url && inScope() && fieldHistoryAnchor(root) === anchorId && validFieldHistoryReference(event.data.reference) ? event.data.reference : null);
    };
    const timer = window.setTimeout(() => finish(null), 6500);
    window.addEventListener("message", listener);
    signal?.addEventListener("abort", abort, { once: true });
    window.postMessage({ source: "deeprole-extension", type: "FIELD_HISTORY_REQUEST", requestId, chatId, anchorId, query }, location.origin);
  });
}
