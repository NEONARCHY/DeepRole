import { composerBounds, observeChoiceComposer } from "./pinned-choices";
import { choiceScrollContainer, flowTail } from "./inline-choices";
import { choiceInnerWheelCanScroll, choiceWheelPixels, observeChoiceScrollFollow } from "./choice-scroll-follow";

const bindings = new WeakMap<HTMLElement, { anchor: HTMLElement; dispose: () => void }>();

export function unbindPinnedChoiceSpace(host: HTMLElement): void {
  bindings.get(host)?.dispose(); bindings.delete(host);
}

/** Reserve the overlay's footprint after the last story, not over its text.
 * Only our placeholder changes; native message styles and drafts stay untouched.
 * Older scenes can still scroll behind the fixed overlay deliberately.
 */
export function bindPinnedChoiceSpace(host: HTMLElement, anchor: HTMLElement): void {
  if (bindings.get(host)?.anchor === anchor) return;
  unbindPinnedChoiceSpace(host);
  const doc = host.ownerDocument, win = doc.defaultView!;
  let scroller = choiceScrollContainer(anchor), disposed = false;
  const nearBottom = () => scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 48;
  const follow = observeChoiceScrollFollow(host, scroller, nearBottom());
  // The pinned host is outside the chat's scroll tree. At an inner edge,
  // route the wheel to the source chat instead of the body's empty background.
  const forwardWheel = (event: WheelEvent) => {
    if (event.defaultPrevented || !event.cancelable || event.ctrlKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY) || choiceInnerWheelCanScroll(host, event)) return;
    event.preventDefault();
    scroller.scrollTop = Math.max(0, Math.min(scroller.scrollHeight - scroller.clientHeight, scroller.scrollTop + choiceWheelPixels(event, scroller)));
  };
  const update = () => {
    if (disposed) return;
    if (!host.isConnected || !anchor.isConnected || host.dataset.deeproleChoicesPinned !== "true") { unbindPinnedChoiceSpace(host); return; }
    const next = choiceScrollContainer(anchor);
    if (next !== scroller) {
      scroller = next; follow.setScroller(next);
    }
    if (!composerBounds(doc) || !host.getClientRects().length) { anchor.style.height = "0px"; return; }
    const contentTop = scroller === doc.scrollingElement ? 0 : scroller.getBoundingClientRect().top + scroller.clientTop;
    const viewportBottom = Math.min(win.innerHeight, win.visualViewport ? win.visualViewport.offsetTop + win.visualViewport.height : win.innerHeight);
    const scrollBottom = Math.min(contentTop + scroller.clientHeight, viewportBottom);
    const card = host.getBoundingClientRect(), rect = anchor.getBoundingClientRect();
    const nativeTail = scroller.scrollHeight > scroller.clientHeight + 1
      ? scroller.scrollHeight - scroller.scrollTop - (rect.top - contentTop) - rect.height
      : flowTail(anchor, scroller, 0);
    const missing = Math.max(0, Math.ceil(scrollBottom - card.top + 12 - nativeTail));
    if (Math.abs(rect.height - missing) > .5) anchor.style.height = `${missing}px`;
    if (follow.following) scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  };
  host.addEventListener("wheel", forwardWheel, { passive: false });
  const stopObserving = observeChoiceComposer(host, update, [anchor, ...(anchor.parentElement ? [anchor.parentElement] : [])]);
  bindings.set(host, { anchor, dispose: () => {
    disposed = true; stopObserving(); follow.dispose(); host.removeEventListener("wheel", forwardWheel);
    anchor.style.height = "0px";
  } });
  update();
}
