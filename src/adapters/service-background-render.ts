/** Rendering support only: this never authorizes a request, reply or deletion. */
export function serviceBackgroundJob(win: Window): string | undefined {
  const valid = (id: unknown): id is string => typeof id === "string" && /^(?:cast|field|repair|discover)_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(id);
  const url = new URL(win.location.href);
  for (const key of ["deeprole_cast_job", "deeprole_field_job"]) {
    const id = url.searchParams.get(key);
    if (id !== null) return valid(id) ? id : undefined;
  }
  for (const key of ["deeprole_cast_screen", "deeprole_field_screen"]) {
    try { const id: unknown = JSON.parse(win.sessionStorage.getItem(key) ?? "null")?.id; if (valid(id)) return id; }
    catch { /* A malformed optional presentation marker enables nothing. */ }
  }
}

/** Called only after the background coordinator has claimed the service job. */
export function setServiceBackgroundWork(id: string, enabled: boolean) {
  window.postMessage({ source: "deeprole-extension", type: "SERVICE_BACKGROUND_RENDER", id, enabled }, location.origin);
}

/**
 * DeepSeek's page can defer rendering through rAF, which browsers suspend while
 * minimized. Only an owned service surface gets a low-frequency hidden fallback.
 * Ordinary chats are untouched; visible service pages use native animation frames.
 * Timers can still be throttled/frozen by the browser or by OS sleep.
 */
export function installServiceBackgroundRender(win: Window = window): void {
  const id = serviceBackgroundJob(win); if (!id) return;
  const request = win.requestAnimationFrame.bind(win), cancel = win.cancelAnimationFrame.bind(win);
  const pending = new Map<number, { callback: FrameRequestCallback; native?: number }>();
  let next = -1, enabled = false, timer: number | undefined;
  const hidden = () => enabled && win.document.visibilityState === "hidden";
  const clearTimer = () => { if (timer !== undefined) win.clearTimeout(timer); timer = undefined; };
  const run = (handle: number, stamp: number) => {
    const entry = pending.get(handle); if (!entry) return;
    pending.delete(handle);
    if (entry.native !== undefined) cancel(entry.native);
    try { entry.callback.call(win, stamp); }
    catch (error) { win.setTimeout(() => { throw error; }, 0); }
  };
  const schedule = () => {
    if (!hidden() || !pending.size || timer !== undefined) return;
    timer = win.setTimeout(() => {
      timer = undefined;
      if (!hidden()) return;
      // Snapshot: callbacks scheduled during this frame run on the next tick.
      const handles = [...pending.keys()], stamp = win.performance.now();
      for (const handle of handles) run(handle, stamp);
      schedule();
    }, 1000);
  };
  const reconcile = () => {
    clearTimer();
    for (const [handle, entry] of pending) {
      if (hidden()) { if (entry.native !== undefined) cancel(entry.native); entry.native = undefined; }
      else if (entry.native === undefined) entry.native = request(stamp => run(handle, stamp));
    }
    schedule();
  };
  win.requestAnimationFrame = callback => {
    if (typeof callback !== "function") throw new TypeError("Animation frame callback must be a function");
    const handle = next--, entry: { callback: FrameRequestCallback; native?: number } = { callback };
    pending.set(handle, entry);
    if (!hidden()) entry.native = request(stamp => run(handle, stamp));
    else schedule();
    return handle;
  };
  win.cancelAnimationFrame = handle => {
    const entry = pending.get(handle);
    if (!entry) { cancel(handle); return; }
    if (entry.native !== undefined) cancel(entry.native);
    pending.delete(handle); if (!pending.size) clearTimer();
  };
  win.document.addEventListener("visibilitychange", reconcile);
  win.addEventListener("message", event => {
    if (event.source !== win || event.origin !== win.location.origin || event.data?.source !== "deeprole-extension" || event.data.type !== "SERVICE_BACKGROUND_RENDER" || event.data.id !== id || typeof event.data.enabled !== "boolean") return;
    enabled = event.data.enabled; reconcile();
  });
  // Keep cancellation handles valid after completion; disabled wrappers delegate
  // to native frames and have no polling timer. All state dies with this document.
}
