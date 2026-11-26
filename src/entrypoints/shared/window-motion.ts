export function afterWindowMotion(node: HTMLElement, onClosed: () => void) {
  void Promise.allSettled(node.getAnimations().map(animation => animation.finished)).then(() => {
    if (node.isConnected) onClosed();
  });
}

export function dismissWindowLayer(node: HTMLElement | null, onClosed: () => void) {
  if (!node?.hasAttribute("data-window-layer")) { onClosed(); return; }
  if (node.hasAttribute("data-window-closing")) return;
  node.setAttribute("data-window-closing", "");
  node.inert = true;
  afterWindowMotion(node, onClosed);
}
