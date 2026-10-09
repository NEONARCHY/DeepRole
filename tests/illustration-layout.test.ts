import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { IllustrationLayout, illustrationBounds } from "../src/adapters/illustration-layout";

const rect = (left: number, width: number, top = 100, height = 200) => new DOMRect(left, top, width, height);
let layout: IllustrationLayout;
const observers: Array<{ callback: () => void; disconnect: ReturnType<typeof vi.fn> }> = [];
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)); };

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    disconnect = vi.fn(); observe = vi.fn(); unobserve = vi.fn();
    constructor(public callback: () => void) { observers.push(this); }
  });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => { frames.delete(id); });
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(1500);
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(900);
  layout = new IllustrationLayout(document);
});
afterEach(() => { layout.clear(); document.body.replaceChildren(); observers.splice(0); frames.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function composer() {
  const form = document.createElement("form"); form.style.cssText = "position:fixed;border-radius:16px";
  form.innerHTML = '<textarea>Keep my draft.</textarea><button type="button">Send</button>'; document.body.append(form);
  const bounds = vi.spyOn(form, "getBoundingClientRect").mockReturnValue(rect(150, 1200, 700, 160));
  vi.spyOn(form.querySelector("textarea")!, "getBoundingClientRect").mockReturnValue(rect(162, 1176, 712, 80));
  return { form, bounds };
}
function image(left = 500, width = 660, padding = 18) {
  const row = document.createElement("article"); row.style.cssText = `padding-left:${padding}px;border-left:1px solid`;
  const host = document.createElement("div"); host.dataset.deeproleIllustrations = "true"; row.append(host); document.body.append(row);
  vi.spyOn(row, "getBoundingClientRect").mockReturnValue(rect(left, width));
  return host;
}
function choices(left = 390, width = 720) {
  const host = document.createElement("div"); host.dataset.deeproleChoicesHost = "true";
  const section = document.createElement("section"); host.attachShadow({ mode: "open" }).append(section); document.body.append(host);
  const bounds = vi.spyOn(section, "getBoundingClientRect").mockReturnValue(rect(left, width));
  return { host, bounds };
}

test("illustrations use the shared input fit without a 720/768 px cap", () => {
  composer(); expect(illustrationBounds(document)).toEqual({ left: 150, width: 1200 });
  const host = image(); layout.sync([host]);
  expect(host.style.width).toBe("1200px"); expect(host.style.marginLeft).toBe("-369px");
  expect(document.querySelector("textarea")!.value).toBe("Keep my draft.");
});
test("every reply compensates its own native padding and border", () => {
  composer(); const first = image(), second = image(350, 720, 12); layout.sync([first, second]);
  expect(first.style.width).toBe(second.style.width); expect(first.style.marginLeft).toBe("-369px"); expect(second.style.marginLeft).toBe("-213px");
});
test("without a floating input, actual options are the geometry source", () => {
  const { host: option } = choices(); option.dataset.deeproleChoicesPinned = "true";
  const host = image(); layout.sync([host]);
  expect(host.style.width).toBe("720px"); expect(host.style.marginLeft).toBe("-129px");
});
test("without options or input, native story width is retained and stale sizing removed", () => {
  const { host: option } = choices(), host = image(); layout.sync([host]); option.remove(); layout.sync([host]);
  expect(illustrationBounds(document)).toBeNull(); expect(host.style.width).toBe(""); expect(host.style.marginLeft).toBe("");
});
test("a zero-size hidden options card is not used as a width", () => {
  choices().bounds.mockReturnValue(rect(0, 0)); expect(illustrationBounds(document)).toBeNull();
});
test("input resize updates all mounted illustrations with only one observer group", () => {
  const { bounds } = composer(), hosts = [image(), image(350), image(300)]; layout.sync(hosts);
  expect(observers).toHaveLength(2); // Common composer observer + shared illustration observer.
  layout.sync(hosts); expect(observers).toHaveLength(2);
  bounds.mockReturnValue(rect(300, 900, 700, 160)); observers.forEach(observer => observer.callback()); flush(); flush();
  hosts.forEach(host => expect(host.style.width).toBe("900px"));
  expect(hosts[0]!.style.marginLeft).toBe("-219px");
});
test("late or replaced options trigger resizing without another content sync", async () => {
  const host = image(); layout.sync([host]); const first = choices(); await Promise.resolve(); flush();
  expect(host.style.width).toBe("720px"); first.host.remove(); choices(450, 600); await Promise.resolve(); flush();
  expect(host.style.width).toBe("600px"); expect(host.style.marginLeft).toBe("-69px");
});
test("unchanged sync does not mutate hosts or poll in idle frames", async () => {
  composer(); const host = image(); layout.sync([host]);
  const observer = new MutationObserver(() => {}); observer.observe(host, { attributes: true });
  layout.sync([host]); expect(observer.takeRecords()).toHaveLength(0); observer.disconnect();
  await Promise.resolve(); flush(); flush(); expect(frames.size).toBe(0);
});
test("clearing cancels pending work, disconnects observers and detaches layout listeners", async () => {
  composer(); layout.sync([image()]); observers.forEach(observer => observer.callback());
  layout.clear(); expect(frames.size).toBe(0); observers.forEach(observer => expect(observer.disconnect).toHaveBeenCalled());
  for (const event of ["resize", "deeprole-layout-change", "deeprole-inline-layout", "deeprole-pinned-layout"]) window.dispatchEvent(new Event(event));
  choices(); await Promise.resolve(); expect(frames.size).toBe(0);
});
