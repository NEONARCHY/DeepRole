import { nativeStoryMessageKey, validNativeStoryId } from "../core/story-transport";
import { validFieldHistoryReference, type FieldHistoryQuery, type FieldHistoryReference } from "../core/field-history";
import { isUserMessage, nativeMessageRows, REASONING } from "./deepseek-message-dom";

const shown = (row: HTMLElement) => {
  for (let cursor: HTMLElement | null = row; cursor; cursor = cursor.parentElement) if (cursor.hidden || cursor.getAttribute("aria-hidden") === "true" || getComputedStyle(cursor).display === "none" || getComputedStyle(cursor).visibility === "hidden") return false;
  return true;
};

/** UI guard only, not proof of an empty server history. A first send can already
 * show its exact user text and one empty assistant placeholder before POST. */
export function firstStoryTurnView(draft: string, root: ParentNode = document): boolean {
  const rows = nativeMessageRows(root).filter(row => !row.closest(REASONING) && shown(row));
  let users = 0, placeholders = 0;
  return rows.every(row => isUserMessage(row)
    ? ++users <= 1 && row.textContent?.trim() === draft.trim()
    : ++placeholders <= 1 && !row.textContent?.trim());
}

function historyRows(root: ParentNode) {
  return nativeMessageRows(root).filter(r => !r.closest(REASONING) && !r.matches("[data-deeprole-service-reply], [data-deeprole-memory-request], [data-deeprole-character-text-hidden]") && shown(r) && !r.textContent?.trimStart().startsWith("[DeepRole Service]"));
}

function historyRowKey(row: HTMLElement, diagnosticVirtualKey: boolean) {
  const id = row.getAttribute("data-message-id"), virtual = diagnosticVirtualKey ? row.closest("[data-virtual-list-item-key]")?.getAttribute("data-virtual-list-item-key") : null;
  // A virtual key needs server confirmation. Conflicting explicit keys are ambiguous.
  if (id !== null && virtual != null && id !== virtual) return null;
  return id ?? virtual;
}

export function fieldHistoryAnchor(root: ParentNode = document, diagnosticVirtualKey = false): string | null {
  const rows = historyRows(root);
  const last = rows.at(-1);
  const id = last && historyRowKey(last, diagnosticVirtualKey);
  return validNativeStoryId(id) && rows.filter(r => historyRowKey(r, diagnosticVirtualKey) === id).length === 1 ? id : null;
}

/** DeepSeek may paint the submitted draft before the POST. The visible reply
 * immediately before it must still be the same parent selected by the server. */
export function continuedTurnView(parent: string, draft: string, root: ParentNode = document): boolean {
  const rows = historyRows(root);
  const matches = rows.filter(row => {
    const key = historyRowKey(row, true);
    return validNativeStoryId(key) && nativeStoryMessageKey(key) === parent;
  });
  const reply = matches[0];
  if (matches.length !== 1 || !reply || isUserMessage(reply) || !reply.textContent?.trim()) return false;
  const pending = rows.slice(rows.indexOf(reply) + 1);
  if (!pending.length) return true;
  return pending.length <= 2 && isUserMessage(pending[0]!) && pending[0]!.textContent?.trim() === draft.trim()
    && (!pending[1] || !isUserMessage(pending[1]) && !pending[1].textContent?.trim());
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
