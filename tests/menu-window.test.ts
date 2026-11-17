import { beforeEach, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { createMenuWindowHandler, type OpenMenuWindow } from "../src/adapters/menu-window";
import { menuTab, menuTabs } from "../src/adapters/menu-tab";
import { menuWindowSource } from "../src/core/menu-window";

const chatUrl = "https://chat.deepseek.com/a/chat/s/chat-a";
const panelUrl = "chrome-extension://test/sidepanel.html";
const request: OpenMenuWindow = { type: "DR_OPEN_MENU_WINDOW", sourceUrl: chatUrl };
const sender = { id: "test", url: chatUrl, frameId: 0, tab: { id: 7 } };
let source: { id: number; active: boolean; url: string; windowId: number };
let panels: { id: number; windowId: number; url: string }[];
let api: ReturnType<typeof makeApi>;
function makeApi() {
  return {
    runtime: { id: "test", getURL: vi.fn(() => panelUrl) },
    tabs: { get: vi.fn(async () => ({ ...source })), query: vi.fn(async () => panels), update: vi.fn(async () => ({})) },
    windows: { create: vi.fn(async (options: { url: string }) => { panels.push({ id: 50, windowId: 3, url: options.url }); return { id: 3 }; }), update: vi.fn(async () => ({})) },
  };
}
beforeEach(() => {
  history.replaceState(null, "", "/");
  source = { id: 7, active: true, url: chatUrl, windowId: 2 }; panels = []; api = makeApi();
  vi.mocked(browser.tabs.query).mockReset(); vi.mocked(browser.tabs.sendMessage).mockReset();
  Object.assign(browser.tabs, { get: api.tabs.get });
});
const handler = () => createMenuWindowHandler(api as unknown as typeof browser);
const pinned = () => history.replaceState(null, "", "/?" + new URLSearchParams({ sourceTab: "7", sourceUrl: chatUrl }));

it("opens outside the iframe and preserves the originating tab and reset review", async () => {
  expect(await handler()({ ...request, resetReview: "reset-1" }, sender)).toEqual({ ok: true });
  const options = api.windows.create.mock.calls[0]![0];
  const url = new URL(options.url);
  expect(url.pathname).toBe("/sidepanel.html");
  expect(menuWindowSource(url.search)).toEqual({ tabId: 7, url: chatUrl });
  expect(url.searchParams.get("resetReview")).toBe("reset-1");
  expect(url.searchParams.has("embedded")).toBe(false);
  expect(api.tabs.update).not.toHaveBeenCalled();
});
it("serializes double clicks and reuses the existing menu", async () => {
  const open = handler();
  expect(await Promise.all([open(request, sender), open(request, sender)])).toEqual([{ ok: true }, { ok: true }]);
  expect(api.windows.create).toHaveBeenCalledTimes(1);
  expect(api.tabs.update).toHaveBeenCalledWith(50, { active: true });
  expect(api.windows.update).toHaveBeenCalledWith(3, { focused: true });
});
it("accepts its own embedded panel but not an untrusted sender or lookalike URL", async () => {
  const open = handler();
  for (const bad of [{ ...sender, id: "other" }, { ...sender, frameId: 1 }, { ...sender, url: panelUrl + ".evil" }]) {
    expect(await open(request, bad)).toEqual({ ok: false });
  }
  expect(api.windows.create).not.toHaveBeenCalled();
  expect(await open({ ...request, sourceTabId: 7 }, { id: "test", url: panelUrl + "?embedded=1", tab: { id: 7 } })).toEqual({ ok: true });
});
it.each(["inactive", "changed", "closed", "navigating"])("does not open a menu for a %s source", async mode => {
  if (mode === "inactive") source.active = false;
  if (mode === "changed") source.url = "https://chat.deepseek.com/chat/s/chat-b";
  if (mode === "closed") api.tabs.get.mockRejectedValue(Error("closed"));
  if (mode === "navigating") api.tabs.get.mockResolvedValueOnce({ ...source }).mockResolvedValue({ ...source, url: "https://chat.deepseek.com/" });
  expect(await handler()(request, sender)).toEqual({ ok: false });
  expect(api.windows.create).not.toHaveBeenCalled();
});
it("recovers from a failed window creation on the next explicit attempt", async () => {
  const open = handler(); api.windows.create.mockRejectedValueOnce(Error("unavailable"));
  expect(await open(request, sender)).toEqual({ ok: false });
  expect(await open(request, sender)).toEqual({ ok: true });
});
it("does not report success when the browser returns no window", async () => {
  api.windows.create.mockResolvedValueOnce(undefined as any);
  expect(await handler()(request, sender)).toEqual({ ok: false });
});
it("resolves the pinned chat even while another window is active; supports DeepSeek URL aliases", async () => {
  pinned(); source.url = "https://chat.deepseek.com/chat/s/chat-a";
  expect((await menuTab())?.id).toBe(7);
  expect(await menuTabs.query({ active: true, currentWindow: true })).toEqual([source]);
  expect(browser.tabs.query).not.toHaveBeenCalled();
  await menuTabs.sendMessage(7, { type: "DR_GET_PAGE_STATE" });
  expect(browser.tabs.sendMessage).toHaveBeenCalledWith(7, { type: "DR_GET_PAGE_STATE" });
});
it("does not fall back or send a memory action when the pinned source becomes unavailable", async () => {
  pinned(); source.active = false;
  await expect(menuTabs.sendMessage(7, { type: "DR_STORY_GAME" })).rejects.toThrow("menu-source-unavailable");
  source.active = true; source.url = "https://chat.deepseek.com/chat/s/chat-b";
  await expect(menuTab()).rejects.toThrow("menu-source-unavailable");
  expect(browser.tabs.query).not.toHaveBeenCalled(); expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
});
it.each(["?sourceTab=7", "?sourceTab=-1&sourceUrl=https://chat.deepseek.com/", "?sourceTab=7&sourceUrl=https://evil.test/", "?sourceTab=7&sourceUrl=https://chat.deepseek.com/sign_in"])("rejects incomplete or unsafe context %s", async search => {
  history.replaceState(null, "", "/" + search);
  await expect(menuTab()).rejects.toThrow("menu-source-unavailable");
  expect(browser.tabs.query).not.toHaveBeenCalled();
});
it("preserves ordinary side-panel and embedded-menu selection", async () => {
  (browser.tabs.query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([source]);
  expect(await menuTab(false)).toEqual(source);
  (browser.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, tabId: 7 });
  expect(await menuTab(true)).toEqual(source);
});
