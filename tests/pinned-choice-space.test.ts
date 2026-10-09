import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { bindPinnedChoiceSpace, unbindPinnedChoiceSpace } from "../src/adapters/pinned-choice-space";

let observers: (() => void)[] = [];
beforeEach(() => {
  observers = []; vi.useFakeTimers();
  vi.stubGlobal("ResizeObserver", class { constructor(update: () => void) { observers.push(update); } observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => {
  document.querySelectorAll<HTMLElement>('[data-deeprole-choices-host]').forEach(unbindPinnedChoiceSpace);
  document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});
function fixture() {
  document.body.innerHTML = '<div id="scroll" style="overflow-y:auto"><div id="story"></div><div id="anchor"></div></div><div data-deeprole-choices-host data-deeprole-choices-pinned="true"></div><form style="position:fixed;border-radius:20px"><textarea></textarea><button>Send</button></form>';
  const scroll = document.querySelector<HTMLElement>('#scroll')!, anchor = document.querySelector<HTMLElement>('#anchor')!, host = document.querySelector<HTMLElement>('[data-deeprole-choices-host]')!;
  let cardTop = 300;
  Object.defineProperty(scroll, 'clientHeight', { configurable: true, value: 700 });
  Object.defineProperty(scroll, 'scrollHeight', { configurable: true, get: () => 1000 + (parseFloat(anchor.style.height) || 0) });
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 1500 });
  scroll.scrollTop = 300;
  vi.spyOn(scroll, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 50, 1500, 700));
  vi.spyOn(anchor, 'getBoundingClientRect').mockImplementation(() => new DOMRect(400, 950 - scroll.scrollTop, 740, parseFloat(anchor.style.height) || 0));
  vi.spyOn(host, 'getBoundingClientRect').mockImplementation(() => new DOMRect(120, cardTop, 740, 588 - cardTop));
  vi.spyOn(host, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  vi.spyOn(document.querySelector('form')!, 'getBoundingClientRect').mockReturnValue(new DOMRect(120, 600, 740, 140));
  vi.spyOn(document.querySelector('textarea')!, 'getBoundingClientRect').mockReturnValue(new DOMRect(132, 612, 716, 80));
  return { scroll, anchor, host, grow: () => { cardTop -= 40; }, update: () => { observers.forEach(update => update()); vi.runOnlyPendingTimers(); } };
}
test('reserved space places the last story above the overlay and remains stable', () => {
  const { scroll, anchor, host, update } = fixture();
  bindPinnedChoiceSpace(host, anchor);
  expect(anchor.style.height).toBe('362px');
  expect(anchor.getBoundingClientRect().top).toBe(host.getBoundingClientRect().top - 12);
  const position = scroll.scrollTop;
  for (let i = 0; i < 5; i++) update();
  expect(anchor.style.height).toBe('362px'); expect(scroll.scrollTop).toBe(position);
});
test('reading above is preserved; scrolling back down resumes following a taller overlay', () => {
  const { scroll, anchor, host, grow, update } = fixture();
  bindPinnedChoiceSpace(host, anchor);
  scroll.scrollTop = 100; scroll.dispatchEvent(new Event('scroll')); grow(); update();
  expect(scroll.scrollTop).toBe(100); expect(anchor.style.height).toBe('402px');
  scroll.scrollTop = scroll.scrollHeight - scroll.clientHeight; scroll.dispatchEvent(new Event('scroll')); grow(); update();
  expect(anchor.getBoundingClientRect().top).toBe(host.getBoundingClientRect().top - 12);
});
test('a new pin while reading does not jump to the end', () => {
  const { scroll, anchor, host } = fixture(); scroll.scrollTop = 100;
  bindPinnedChoiceSpace(host, anchor);
  expect(scroll.scrollTop).toBe(100); expect(parseFloat(anchor.style.height)).toBeGreaterThan(0);
});

test('the first small upward wheel stays paused even inside the near-bottom zone', () => {
  const { scroll, anchor, host, grow, update } = fixture();
  bindPinnedChoiceSpace(host, anchor);
  scroll.dispatchEvent(new WheelEvent('wheel', { deltaY: -8, bubbles: true }));
  scroll.scrollTop -= 8; scroll.dispatchEvent(new Event('scroll'));
  const readingTop = scroll.scrollTop;
  update(); grow(); update();
  expect(scroll.scrollTop).toBe(readingTop);
  // Explicit downward input can return to the bottom and re-enable following.
  scroll.dispatchEvent(new WheelEvent('wheel', { deltaY: 80, bubbles: true }));
  scroll.scrollTop = scroll.scrollHeight - scroll.clientHeight; scroll.dispatchEvent(new Event('scroll'));
  grow(); update();
  expect(anchor.getBoundingClientRect().top).toBe(host.getBoundingClientRect().top - 12);
});

test('wheel over the fixed card reaches its source chat, not the document behind it', () => {
  const { scroll, anchor, host, update } = fixture();
  bindPinnedChoiceSpace(host, anchor);
  const before = scroll.scrollTop;
  const event = new WheelEvent('wheel', { deltaY: -8, bubbles: true, cancelable: true });
  host.dispatchEvent(event); update();
  expect(event.defaultPrevented).toBe(true);
  expect(scroll.scrollTop).toBe(before - 8);
});
test('unpin and removal dispose the placeholder without writing native input styles', () => {
  const { anchor, host, update } = fixture();
  const inputStyle = document.querySelector('textarea')!.getAttribute('style');
  bindPinnedChoiceSpace(host, anchor); host.dataset.deeproleChoicesPinned = 'false'; update();
  expect(anchor.style.height).toBe('0px');
  expect(document.querySelector('textarea')!.getAttribute('style')).toBe(inputStyle);
  host.dataset.deeproleChoicesPinned = 'true'; bindPinnedChoiceSpace(host, anchor); host.remove(); update();
  expect(anchor.style.height).toBe('0px');
});
