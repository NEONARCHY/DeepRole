import { fitAdaptiveChoices } from "./adaptive-layout";
import { composerBounds, observeChoiceComposer } from "./pinned-choices";

const bindings = new WeakMap<HTMLElement, { dispose: () => void; reveal: () => void }>();
const GAP = 12;

export function choiceScrollContainer(row: HTMLElement): Element {
  const doc = row.ownerDocument;
  for (let node = row.parentElement; node && node !== doc.body; node = node.parentElement) {
    const overflow = doc.defaultView?.getComputedStyle(node).overflowY;
    // A short conversation may not overflow yet. Its fixed-height viewport is
    // still the scroll owner once the reserved footer space is inserted.
    if ((overflow === "auto" || overflow === "scroll") && node.clientHeight > 0) return node;
  }
  return doc.scrollingElement ?? doc.documentElement;
}

export function unbindInlineChoices(host: HTMLElement): void {
  bindings.get(host)?.dispose(); bindings.delete(host);
}

function flowTail(host: HTMLElement, scroller: Element, ownHeight: number): number {
  const win = host.ownerDocument.defaultView!;
  let bottom = host.getBoundingClientRect().bottom;
  for (let node: HTMLElement | null = host; node && node !== scroller; node = node.parentElement) {
    for (let sibling = node.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
      const style = win.getComputedStyle(sibling);
      if (style.display !== "none" && !["fixed", "absolute"].includes(style.position)) bottom = Math.max(bottom, sibling.getBoundingClientRect().bottom + (parseFloat(style.marginBottom) || 0));
    }
    const parent = node.parentElement;
    if (!parent) break;
    bottom += parseFloat(win.getComputedStyle(parent).paddingBottom) || 0;
    if (parent === host.ownerDocument.body) break;
  }
  return Math.max(0, bottom - host.getBoundingClientRect().bottom - ownHeight);
}

/** Reserve only the missing footer space. Never edit DeepSeek's styles or draft. */
export function bindInlineChoices(host: HTMLElement, reveal = false): void {
  const existing = bindings.get(host);
  if (existing) { if (reveal) existing.reveal(); return; }
  if (!host.isConnected) return;
  const doc = host.ownerDocument, win = doc.defaultView!;
  let scroller = choiceScrollContainer(host), disposed = false;
  // Capture the native bottom before reserving space, including a short chat.
  let following = reveal || scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 48;
  const spacer = doc.createElement("div");
  spacer.dataset.deeproleChoicesSpacer = "true"; spacer.setAttribute("aria-hidden", "true");
  spacer.style.cssText = "height:0;min-height:0;margin:0;padding:0;border:0;flex:none;pointer-events:none;overflow-anchor:none";
  const set = (key: string, value: string) => { if (host.style.getPropertyValue(key) !== value) host.style.setProperty(key, value); };
  const nearBottom = () => scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 48;
  const onScroll = () => { following = nearBottom(); };
  const stopReading = (event: WheelEvent) => { if (event.deltaY < 0) following = false; };
  const onKey = (event: KeyboardEvent) => {
    if (event.target instanceof Element && event.target.closest("input,textarea,select,[contenteditable]")) return;
    if (["ArrowUp", "PageUp", "Home"].includes(event.key)) following = false;
  };
  const scrollTarget = () => scroller === doc.scrollingElement ? win : scroller;
  const update = () => {
    if (disposed) return;
    if (!host.isConnected || host.dataset.deeproleChoicesPinned === "true") { unbindInlineChoices(host); return; }
    const next = choiceScrollContainer(host);
    if (next !== scroller) { scrollTarget().removeEventListener("scroll", onScroll); scroller = next; scrollTarget().addEventListener("scroll", onScroll); following = false; }
    const composer = composerBounds(doc, true);
    if (!composer || !host.getClientRects().length) {
      spacer.remove(); host.removeAttribute("data-deeprole-choices-inline"); set("--dr-inline-max-height", "");
      fitAdaptiveChoices(host); return;
    }
    host.dataset.deeproleChoicesInline = "true";
    if (host.nextElementSibling !== spacer) host.after(spacer);
    fitAdaptiveChoices(host);
    const documentScroll = scroller === doc.scrollingElement;
    const contentTop = documentScroll ? 0 : scroller.getBoundingClientRect().top + scroller.clientTop;
    const scrollBottom = contentTop + scroller.clientHeight;
    const visibleBottom = Math.min(win.innerHeight, win.visualViewport ? win.visualViewport.offsetTop + win.visualViewport.height : win.innerHeight);
    const safeBottom = Math.min(composer.top - GAP, scrollBottom - GAP, visibleBottom - GAP);
    const section = host.shadowRoot?.querySelector("section");
    const extras = Math.max(0, host.getBoundingClientRect().height - (section?.getBoundingClientRect().height ?? 0));
    set("--dr-inline-max-height", `${Math.max(96, safeBottom - Math.max(60, contentTop) - extras)}px`);
    const rect = host.getBoundingClientRect();
    const ownHeight = spacer.getBoundingClientRect().height;
    // scrollHeight includes unused viewport space in a short chat. Treating that
    // as a real footer would leave a growing input covering the options again.
    const nativeTail = scroller.scrollHeight > scroller.clientHeight + 1
      ? scroller.scrollHeight - scroller.scrollTop - (rect.bottom - contentTop) - ownHeight
      : flowTail(host, scroller, ownHeight);
    const missing = Math.max(0, Math.ceil(scrollBottom - safeBottom - nativeTail));
    if (Math.abs(ownHeight - missing) > .5) spacer.style.height = `${missing}px`;
    // A reader above the last scene keeps their scroll position. Resizing the
    // draft only follows the card while the reader is already at the bottom.
    if (following) {
      const delta = host.getBoundingClientRect().bottom - safeBottom;
      if (delta > .5) scroller.scrollTop += delta;
    }
    win.dispatchEvent(new Event("deeprole-inline-layout"));
  };
  scrollTarget().addEventListener("scroll", onScroll);
  doc.addEventListener("wheel", stopReading, true); doc.addEventListener("keydown", onKey, true);
  const stopObserving = observeChoiceComposer(host, update, [host, ...(host.parentElement ? [host.parentElement] : [])]);
  bindings.set(host, {
    reveal: () => { following = true; update(); },
    dispose: () => {
      disposed = true; stopObserving(); scrollTarget().removeEventListener("scroll", onScroll);
      doc.removeEventListener("wheel", stopReading, true); doc.removeEventListener("keydown", onKey, true);
      spacer.remove(); host.removeAttribute("data-deeprole-choices-inline"); set("--dr-inline-max-height", "");
    },
  });
  update();
}
