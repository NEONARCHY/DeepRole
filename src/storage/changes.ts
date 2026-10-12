import { browser } from "wxt/browser";
import type { RecordKind } from "../core/types";

export const LIBRARY_CHANGE_KEY = "deeprole_library_change";

/** Only a change token is published here, never titles, lore, or decrypted records. */
export async function announceLibraryChange(kinds: RecordKind[] = []): Promise<void> {
  // Internal service progress and outgoing journal updates are not lore/profile edits. Do not reload editors,
  // invalidate their queues or trigger automatic cast preparation for it.
  // Story-only writes are source/receipt observations too. A selected projection
  // changes its binding in the same transaction and still announces that change.
  if (kinds.length && kinds.every(kind => kind === "service" || kind === "dispatch" || kind === "story")) return;
  try {
    await browser.storage.local.set({ [LIBRARY_CHANGE_KEY]: { token: crypto.randomUUID(), kinds: [...new Set(kinds)], at: Date.now() } });
  } catch {
    // A committed transaction must not appear to have failed just because a listener
    // notification failed. The next send reads an authoritative snapshot anyway.
    // A fallback reader may need the lock held by the committing writer. Deliver
    // asynchronously instead of waiting for that reader from inside the lock.
    try { void browser.runtime.sendMessage({ type: "DR_DATA_CHANGED" }).catch(() => undefined); } catch { /* extension shutting down */ }
  }
}
