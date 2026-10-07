import { browser } from "wxt/browser";
/** Chrome's documented bounded-operation pattern, never an always-on worker.
 * No network, new permissions or stored platform information; cleared on every exit.
 * https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers
 */
export async function imageWorkerOperation<T>(operation: () => Promise<T>, keepAlive: () => Promise<unknown> = () => browser.runtime.getPlatformInfo()): Promise<T> {
  const timer = setInterval(() => { void keepAlive().catch(() => undefined); }, 25_000);
  try { return await operation(); } finally { clearInterval(timer); }
}
