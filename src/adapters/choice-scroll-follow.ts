/** Reader intent must outlive the first scroll event inside the near-bottom zone.
 * A layout callback is not permission to resume after an upward gesture.
 */
export function observeChoiceScrollFollow(host: HTMLElement, initialScroller: Element, initialFollowing: boolean, initialPaused = false) {
  const doc = host.ownerDocument, win = doc.defaultView!;
  let scroller = initialScroller, following = initialFollowing, paused = initialPaused;
  let lastTop = scroller.scrollTop, pointerDown = false, resumeRequested = false, touchY: number | null = null;
  const target = () => scroller === doc.scrollingElement ? win : scroller;
  const nearBottom = () => scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 48;
  const inChat = (event: Event) => {
    const path = event.composedPath();
    if (path.includes(host)) return true;
    if (path.some(node => node instanceof Element && node.matches('.dr-root,deeprole-page-widget,[role="dialog"]'))) return false;
    return path.includes(scroller);
  };
  const intent = (delta: number) => {
    if (delta < 0) { following = false; paused = true; resumeRequested = false; }
    else if (delta > 0) {
      resumeRequested = true;
      if (nearBottom()) { following = true; paused = false; resumeRequested = false; }
    }
  };
  const onScroll = () => {
    const delta = scroller.scrollTop - lastTop;
    if (pointerDown && delta < -.5) intent(-1);
    else if (nearBottom() && (!paused || delta > .5 && (resumeRequested || pointerDown))) {
      following = true; paused = false; resumeRequested = false;
    } else if (!nearBottom()) following = false;
    lastTop = scroller.scrollTop;
  };
  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey && !event.defaultPrevented && inChat(event) && !choiceInnerWheelCanScroll(host, event)) intent(event.deltaY);
  };
  const onKey = (event: KeyboardEvent) => {
    if (!inChat(event) || event.composedPath().some(node => node instanceof Element && node.matches('input,textarea,select,[contenteditable]:not([contenteditable="false"]),.grid button'))) return;
    if (['ArrowUp', 'PageUp', 'Home'].includes(event.key) || event.key === ' ' && event.shiftKey) intent(-1);
    else if (['ArrowDown', 'PageDown', 'End', ' '].includes(event.key)) intent(1);
  };
  const onPointerDown = (event: PointerEvent) => { pointerDown = inChat(event); };
  const onPointerUp = () => { pointerDown = false; };
  const onTouchStart = (event: TouchEvent) => { touchY = inChat(event) && event.touches.length === 1 ? event.touches[0]?.clientY ?? null : null; };
  const onTouchMove = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (touchY === null || event.touches.length !== 1 || !touch) return;
    const y = touch.clientY;
    intent(touchY - y); touchY = y;
  };
  const onTouchEnd = () => { touchY = null; pointerDown = false; };
  target().addEventListener('scroll', onScroll);
  doc.addEventListener('wheel', onWheel, { capture: true, passive: true });
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('pointerdown', onPointerDown, true);
  doc.addEventListener('pointerup', onPointerUp, true); doc.addEventListener('pointercancel', onPointerUp, true);
  doc.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
  doc.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
  doc.addEventListener('touchend', onTouchEnd, true); doc.addEventListener('touchcancel', onTouchEnd, true);
  return {
    get following() { return following; },
    reveal() { following = true; paused = false; resumeRequested = false; },
    setScroller(next: Element) {
      if (next === scroller) return;
      target().removeEventListener('scroll', onScroll); scroller = next; lastTop = next.scrollTop;
      following = false; paused = true; resumeRequested = false;
      target().addEventListener('scroll', onScroll);
    },
    dispose() {
      target().removeEventListener('scroll', onScroll);
      doc.removeEventListener('wheel', onWheel, true); doc.removeEventListener('keydown', onKey, true);
      doc.removeEventListener('pointerdown', onPointerDown, true);
      doc.removeEventListener('pointerup', onPointerUp, true); doc.removeEventListener('pointercancel', onPointerUp, true);
      doc.removeEventListener('touchstart', onTouchStart, true); doc.removeEventListener('touchmove', onTouchMove, true);
      doc.removeEventListener('touchend', onTouchEnd, true); doc.removeEventListener('touchcancel', onTouchEnd, true);
    },
  };
}

/** Keep native scrolling inside an overflowing card until it reaches an edge.
 * composedPath is necessary because the choices live inside a Shadow DOM.
 */
export function choiceInnerWheelCanScroll(host: HTMLElement, event: WheelEvent): boolean {
  const path = event.composedPath();
  if (!path.includes(host)) return false;
  for (const node of path) {
    if (node === host) break;
    if (!(node instanceof Element)) continue;
    if (!['auto', 'scroll'].includes(host.ownerDocument.defaultView!.getComputedStyle(node).overflowY)) continue;
    if (event.deltaY < 0 && node.scrollTop > .5 || event.deltaY > 0 && node.scrollHeight - node.clientHeight - node.scrollTop > .5) return true;
  }
  return false;
}

export function choiceWheelPixels(event: WheelEvent, scroller: Element): number {
  const style = scroller.ownerDocument.defaultView!.getComputedStyle(scroller);
  const lineHeight = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) || 16) * 1.2;
  return event.deltaY * (event.deltaMode === 1 ? lineHeight : event.deltaMode === 2 ? scroller.clientHeight : 1);
}
