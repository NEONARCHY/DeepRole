import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { bindInlineChoices, choiceScrollContainer, unbindInlineChoices } from "../src/adapters/inline-choices";
import { composerBounds, fitComposerInlineChoices } from "../src/adapters/pinned-choices";

const rect = (node: Element, x: number, y: number, width: number, height: number) => vi.spyOn(node, "getBoundingClientRect").mockReturnValue(new DOMRect(x, y, width, height));
beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { document.querySelectorAll<HTMLElement>("[data-deeprole-choices-host]").forEach(unbindInlineChoices); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function fixture() {
  document.body.innerHTML = '<div id="scroll" style="overflow-y:auto"><div id="conversation"><div data-deeprole-choices-host></div></div></div><form style="position:fixed;border-radius:20px"><textarea></textarea><button>Send</button></form>';
  const scroll = document.querySelector<HTMLElement>("#scroll")!, host = document.querySelector<HTMLElement>("[data-deeprole-choices-host]")!, form = document.querySelector("form")!;
  Object.defineProperty(scroll, "clientHeight", { configurable: true, value: 700 });
  Object.defineProperty(scroll, "scrollHeight", { configurable: true, value: 1500 });
  Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: 1500 });
  scroll.scrollTop = 700;
  rect(scroll, 0, 50, 1500, 700); rect(document.querySelector("#conversation")!, 400, 50, 720, 800); rect(host, 400, 400, 720, 300);
  rect(form, 120, 600, 740, 140); rect(document.querySelector("textarea")!, 132, 612, 716, 80);
  vi.spyOn(host, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  return { scroll, host, form };
}

test("an empty auto-scroll viewport is still the owner before options add overflow", () => {
  const { scroll, host } = fixture();
  Object.defineProperty(scroll, "scrollHeight", { configurable: true, value: 700 });
  expect(choiceScrollContainer(host)).toBe(scroll);
});

test("normal-flow inputs do not receive floating-input geometry", () => {
  const { form } = fixture();
  form.style.position = "static";
  rect(form, 120, innerHeight - 140, 740, 140);
  expect(composerBounds(document, true)).toBeNull();
});

test("inline width uses the input center, not a displaced message wrapper", () => {
  const { host } = fixture();
  expect(fitComposerInlineChoices(host)).toBe(true);
  expect(host.style.width).toBe("720px"); expect(host.style.marginLeft).toBe("-270px");
});

test("adaptive inline options narrow symmetrically to clear left-side HUDs", () => {
  const { host } = fixture(); host.dataset.deeproleAdaptive = "true";
  const deck = document.createElement("div"); deck.className = "dr-widget-deck"; deck.dataset.minimumLeft = "8";
  const tile = document.createElement("div"); tile.className = "dr-widget-tile"; deck.append(tile); document.body.append(deck);
  rect(tile, 40, 80, 224, 350);
  expect(fitComposerInlineChoices(host)).toBe(true);
  expect(host.style.width).toBe("420px"); expect(host.style.marginLeft).toBe("-120px");
});

test("only missing native footer space is added and cleanup removes it", () => {
  const { host } = fixture();
  bindInlineChoices(host);
  expect(document.querySelector<HTMLElement>("[data-deeprole-choices-spacer]")?.style.height).toBe("12px");
  expect(host.dataset.deeproleChoicesInline).toBe("true");
  unbindInlineChoices(host);
  expect(document.querySelector("[data-deeprole-choices-spacer]")).toBeNull();
  expect(host.hasAttribute("data-deeprole-choices-inline")).toBe(false);
});
