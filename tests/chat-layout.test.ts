import { afterEach, expect, test, vi } from "vitest";
import { nativeSidebar, nativeSidebarLeft } from "../src/adapters/chat-layout";
import { DeepSeekDomAdapter } from "../src/adapters/deepseek-dom";

const rect = (node: Element, x: number, y: number, width: number, height: number) => Object.defineProperty(node, "getBoundingClientRect", { configurable: true, value: () => new DOMRect(x, y, width, height) });
afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });

test("native sidebar boundary follows partial translation, hiding and replacement", () => {
  document.body.innerHTML = '<aside></aside>';
  const sidebar = document.querySelector("aside")!;
  rect(sidebar, 0, 0, 264, innerHeight);
  expect(nativeSidebarLeft(document)).toBe(272);
  rect(sidebar, -132, 0, 264, innerHeight);
  expect(nativeSidebarLeft(document)).toBe(140);
  rect(sidebar, -264, 0, 264, innerHeight);
  expect(nativeSidebarLeft(document)).toBe(8);
  sidebar.style.display = "none";
  expect(nativeSidebarLeft(document)).toBe(8);
  sidebar.remove();
  expect(nativeSidebarLeft(document)).toBe(8);
  const replacement = document.createElement("nav"); document.body.append(replacement); rect(replacement, 0, 0, 240, innerHeight);
  expect(nativeSidebarLeft(document)).toBe(248);
});

test("a hashed history column is identified without using the header's large inset", () => {
  document.body.innerHTML = '<div class="a12bf"><a href="/chat/s/story">Story</a></div><header style="height:60px"></header>';
  const column = document.querySelector(".a12bf")!, link = document.querySelector("a")!;
  rect(column, 0, 0, 264, innerHeight); rect(link, 12, 130, 230, 40);
  expect(nativeSidebar(document)).toBe(column);
  expect(nativeSidebarLeft(document)).toBe(272);
});

test("DeepRole and right-side asides do not become the native sidebar", () => {
  document.body.innerHTML = '<div class="dr-root"><aside></aside></div><aside id="right"></aside>';
  rect(document.querySelector("aside")!, 0, 0, 264, innerHeight);
  rect(document.querySelector("#right")!, 700, 0, 240, innerHeight);
  expect(nativeSidebar(document)).toBeNull();
});

test("an empty hashed sidebar can be detected outside DeepRole's left edge", () => {
  document.body.innerHTML = '<div class="a98fc"><span></span></div>';
  const column = document.querySelector(".a98fc")!, seed = column.firstElementChild!;
  rect(column, 0, 0, 264, innerHeight); rect(seed, 0, 100, 8, 40);
  const probe = vi.fn((x: number) => x < 8 ? seed : null);
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: probe });
  expect(nativeSidebar(document)).toBe(column);
  expect(probe).toHaveBeenCalledWith(2, innerHeight / 2);
  Reflect.deleteProperty(document, "elementFromPoint");
});

test("title anchor stays at the sidebar edge when the composer is temporarily disabled", () => {
  document.body.innerHTML = '<aside></aside><header><h1>Story</h1></header><textarea disabled></textarea>';
  rect(document.querySelector("aside")!, 0, 0, 264, innerHeight);
  rect(document.querySelector("h1")!, 280, 20, 120, 28);
  expect(new DeepSeekDomAdapter().getChatTitleAnchor()?.x).toBe(272);
});
