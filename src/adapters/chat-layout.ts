const OWN_UI = "deeprole-page-widget,.dr-root,.dr-context-anchor,.dr-widget-deck,[data-deeprole-choices-host],[data-deeprole-portrait-layer],.dr-menu-layer";
const SIDEBARS = "aside,nav,[role='navigation'],[data-testid*='sidebar' i],[class*='sidebar' i]";
const knownSidebars = new WeakMap<Document, HTMLElement>();

function sidebarCandidate(node: HTMLElement, doc: Document): boolean {
  if (node.closest(`${OWN_UI},[role='dialog'],[data-message-id]`)) return false;
  const rect = node.getBoundingClientRect(), height = doc.defaultView!.innerHeight;
  return rect.height >= height * .55 && rect.width >= 100 && rect.width <= Math.min(420, doc.defaultView!.innerWidth * .45)
    && rect.left <= 12 && rect.top <= 100;
}

/** The space occupied by the native history sidebar, not the header's icon row. */
export function nativeSidebar(doc: Document): HTMLElement | null {
  const known = knownSidebars.get(doc);
  if (known?.isConnected) return known;
  const candidates = [...doc.querySelectorAll<HTMLElement>(SIDEBARS)].filter(node => sidebarCandidate(node, doc));
  // DeepSeek also uses hashed div classes. Probe its left column and history links
  // instead of depending on a particular build's class names or translated labels.
  // Stay outside our panels (which begin at 8 px), even when history is empty.
  const seeds = [doc.elementFromPoint?.(2, doc.defaultView!.innerHeight / 2), ...doc.querySelectorAll("a[href*='/chat/']")];
  for (const seed of seeds) for (let node = seed as HTMLElement | null, depth = 0; node && node !== doc.body && depth < 10; node = node.parentElement, depth++) {
    if (sidebarCandidate(node, doc)) candidates.push(node);
  }
  candidates.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);
  const found = candidates[0] ?? null;
  if (found) knownSidebars.set(doc, found);
  return found;
}

export function nativeSidebarLeft(doc: Document): number | null {
  const node = nativeSidebar(doc);
  if (!node) return knownSidebars.has(doc) || doc.location.hostname === "chat.deepseek.com" ? 8 : null;
  const rect = node.getBoundingClientRect(), style = doc.defaultView!.getComputedStyle(node);
  if (!rect.width || !rect.height || style.visibility === "hidden" || style.display === "none" || style.opacity === "0") return 8;
  let right = rect.right;
  for (let parent = node.parentElement; parent && parent !== doc.body; parent = parent.parentElement) {
    const style = doc.defaultView!.getComputedStyle(parent);
    if (/hidden|clip/.test(style.overflowX)) right = Math.min(right, parent.getBoundingClientRect().right);
  }
  // Compositor transforms can finish at 263.999… px. Do not retain that tiny
  // offset in saved panel geometry or accumulate it across sidebar toggles.
  return Math.max(8, Math.round(right + 8));
}

/** Batch native layout changes; follow geometry only while a CSS transition runs. */
export function observeChatLayout(doc: Document, update: () => void): () => void {
  const win = doc.defaultView!;
  let frame = 0;
  const moving = new Map<Element, Set<string>>();
  const resize = new ResizeObserver(schedule);
  let sidebar: HTMLElement | null = null;
  function schedule() {
    if (frame) return;
    frame = win.requestAnimationFrame(() => {
      frame = 0;
      const next = nativeSidebar(doc);
      if (next !== sidebar) { if (sidebar) resize.unobserve(sidebar); sidebar = next; if (sidebar) resize.observe(sidebar); }
      for (const node of moving.keys()) if (!node.isConnected) moving.delete(node);
      update();
      if (moving.size) schedule();
    });
  }
  const mutations = new MutationObserver(records => {
    if (records.some(record => record.target instanceof Element && !record.target.closest(OWN_UI))) schedule();
  });
  mutations.observe(doc.documentElement, { attributes: true, attributeFilter: ["style", "class", "hidden", "aria-hidden"], childList: true, subtree: true });
  const transition = (event: TransitionEvent) => {
    const node = event.target as Element;
    if (node.closest(OWN_UI) || !/^(transform|translate|opacity|left|right|inset.*|.*width|margin.*|padding.*|flex.*|grid.*)$/.test(event.propertyName)) return;
    const properties = moving.get(node) ?? new Set<string>();
    if (event.type === "transitionrun") { properties.add(event.propertyName); moving.set(node, properties); }
    else { properties.delete(event.propertyName); if (!properties.size) moving.delete(node); }
    schedule();
  };
  win.addEventListener("resize", schedule);
  doc.addEventListener("transitionrun", transition); doc.addEventListener("transitionend", transition); doc.addEventListener("transitioncancel", transition);
  schedule();
  return () => {
    resize.disconnect(); mutations.disconnect(); win.cancelAnimationFrame(frame);
    win.removeEventListener("resize", schedule);
    doc.removeEventListener("transitionrun", transition); doc.removeEventListener("transitionend", transition); doc.removeEventListener("transitioncancel", transition);
  };
}
