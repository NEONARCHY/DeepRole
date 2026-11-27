// Closing motion must never block the close itself. Chromium can stop
// advancing transitions in a hidden or throttled window, so the callback also
// runs after the longest declared duration plus a short grace period.
export function afterWindowMotion(node: HTMLElement, onClosed: () => void) {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    if (node.isConnected) onClosed();
  };
  const animations = node.getAnimations();
  if (!animations.length) { queueMicrotask(finish); return; }
  const longest = Math.max(0, ...animations.map(animation => {
    const timing = animation.effect?.getComputedTiming();
    const end = typeof timing?.endTime === "number" ? timing.endTime : 0;
    return Number.isFinite(end) ? end : 0;
  }));
  window.setTimeout(finish, longest + 120);
  void Promise.allSettled(animations.map(animation => animation.finished)).then(finish);
}

export function dismissWindowLayer(node: HTMLElement | null, onClosed: () => void) {
  if (!node?.hasAttribute("data-window-layer")) { onClosed(); return; }
  if (node.hasAttribute("data-window-closing")) return;
  node.setAttribute("data-window-closing", "");
  node.inert = true;
  afterWindowMotion(node, onClosed);
}
