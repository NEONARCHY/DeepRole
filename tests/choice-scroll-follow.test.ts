import { afterEach, expect, test, vi } from 'vitest';
import { choiceInnerWheelCanScroll, choiceWheelPixels, observeChoiceScrollFollow } from '../src/adapters/choice-scroll-follow';

const disposals: (() => void)[] = [];
afterEach(() => { disposals.splice(0).forEach(dispose => dispose()); document.body.replaceChildren(); vi.restoreAllMocks(); });
function fixture(following = true, paused = false) {
  document.body.innerHTML = '<main style="overflow-y:auto;line-height:20px"><div id="story" tabindex="0"></div></main><div id="host"></div><div class="dr-root"><input></div>';
  const scroll = document.querySelector('main')!, story = document.querySelector<HTMLElement>('#story')!, host = document.querySelector<HTMLElement>('#host')!;
  Object.defineProperty(scroll, 'clientHeight', { configurable: true, value: 700 });
  Object.defineProperty(scroll, 'scrollHeight', { configurable: true, value: 1500 });
  scroll.scrollTop = 800;
  const follow = observeChoiceScrollFollow(host, scroll, following, paused); disposals.push(follow.dispose);
  const move = (top: number) => { scroll.scrollTop = top; scroll.dispatchEvent(new Event('scroll')); };
  const wheel = (deltaY: number) => story.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true }));
  return { scroll, host, story, follow, move, wheel };
}

test('tiny upward intent cannot be undone by near-bottom scroll/layout callbacks', () => {
  const { follow, wheel, move } = fixture();
  wheel(-.25); move(799.75); move(800);
  expect(follow.following).toBe(false);
  wheel(1); move(800); expect(follow.following).toBe(true);
});
test('returning downward resumes only after reaching the bottom zone', () => {
  const { follow, wheel, move } = fixture();
  wheel(-100); move(300); wheel(100); move(500);
  expect(follow.following).toBe(false);
  move(799); expect(follow.following).toBe(true);
});
test('a reader initially above may explicitly scroll to the end without a wheel', () => {
  const { follow, move } = fixture(false);
  move(200); expect(follow.following).toBe(false);
  move(800); expect(follow.following).toBe(true);
});
test('paused placement cannot be rearmed by geometry clamping alone', () => {
  const { follow, move } = fixture(false, true);
  move(800); expect(follow.following).toBe(false);
  follow.reveal(); expect(follow.following).toBe(true);
});
test.each(['ArrowUp', 'PageUp', 'Home', ' '])('upward keyboard input %s pauses immediately', key => {
  const { follow, story, move } = fixture();
  story.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey: key === ' ', bubbles: true })); move(795);
  expect(follow.following).toBe(false);
  story.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })); move(800);
  expect(follow.following).toBe(true);
});
test('unrelated panels and Ctrl-wheel do not affect chat following', () => {
  const { follow, story } = fixture();
  document.querySelector('input')!.dispatchEvent(new WheelEvent('wheel', { deltaY: -8, bubbles: true }));
  story.dispatchEvent(new WheelEvent('wheel', { deltaY: -8, ctrlKey: true, bubbles: true }));
  expect(follow.following).toBe(true);
});
test('touch direction pauses and resumes without stealing the browser gesture', () => {
  const { follow, story, move } = fixture();
  const touch = (type: string, y: number) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'touches', { value: [{ clientY: y }] }); story.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  };
  touch('touchstart', 300); touch('touchmove', 310); move(790);
  expect(follow.following).toBe(false);
  touch('touchmove', 295); move(800); expect(follow.following).toBe(true);
});
test('scrollbar dragging upward pauses; dragging downward to the end resumes', () => {
  const { follow, story, move } = fixture();
  story.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  move(792); expect(follow.following).toBe(false);
  move(799); expect(follow.following).toBe(true);
  story.dispatchEvent(new Event('pointercancel', { bubbles: true }));
});
test('overflow inside the Shadow DOM consumes wheel until its directional edge', () => {
  const { host, follow } = fixture();
  const section = document.createElement('section'); section.style.overflowY = 'auto';
  host.attachShadow({ mode: 'open' }).append(section);
  Object.defineProperty(section, 'clientHeight', { value: 100 }); Object.defineProperty(section, 'scrollHeight', { value: 300 });
  const consumed: boolean[] = [];
  host.addEventListener('wheel', event => { consumed.push(choiceInnerWheelCanScroll(host, event)); });
  const wheel = (deltaY: number) => section.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, composed: true }));
  section.scrollTop = 20; wheel(-8); expect(follow.following).toBe(true);
  section.scrollTop = 0; wheel(-8); expect(follow.following).toBe(false);
  section.scrollTop = 199; wheel(8); section.scrollTop = 200; wheel(8);
  expect(consumed).toEqual([true, false, true, false]);
});
test('line and page wheel modes use native line height and viewport height', () => {
  const { scroll } = fixture();
  expect(choiceWheelPixels(new WheelEvent('wheel', { deltaY: -2, deltaMode: 0 }), scroll)).toBe(-2);
  expect(choiceWheelPixels(new WheelEvent('wheel', { deltaY: -2, deltaMode: 1 }), scroll)).toBe(-40);
  expect(choiceWheelPixels(new WheelEvent('wheel', { deltaY: -1, deltaMode: 2 }), scroll)).toBe(-700);
});
test('replacing the scroll owner and disposal remove the old listeners', () => {
  const { scroll, follow, story, wheel } = fixture();
  const next = document.createElement('main'); next.style.overflowY = 'auto'; next.append(story); document.body.append(next);
  Object.defineProperty(next, 'clientHeight', { value: 700 }); Object.defineProperty(next, 'scrollHeight', { value: 1500 }); next.scrollTop = 800;
  follow.setScroller(next); scroll.dispatchEvent(new Event('scroll')); expect(follow.following).toBe(false);
  wheel(8); expect(follow.following).toBe(true);
  follow.dispose(); wheel(-8); expect(follow.following).toBe(true);
});
