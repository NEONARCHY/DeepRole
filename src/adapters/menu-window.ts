import { browser, type Browser } from "wxt/browser";
import { menuChatKey, sameMenuChat } from "../core/menu-window";

export interface OpenMenuWindow { type: "DR_OPEN_MENU_WINDOW"; sourceUrl: string; sourceTabId?: number; resetReview?: string }
type MenuSender = Pick<Browser.runtime.MessageSender, "id" | "url" | "frameId"> & { tab?: { id?: number } };

export function createMenuWindowHandler(api = browser) {
  let tail: Promise<unknown> = Promise.resolve();
  const open = async (message: OpenMenuWindow, sender: MenuSender) => {
    const panelUrl = api.runtime.getURL("/sidepanel.html");
    const fromPanel = sender.url?.split(/[?#]/u, 1)[0] === panelUrl;
    const fromChat = sender.frameId === 0 && !!sender.url && menuChatKey(sender.url) !== null;
    if (sender.id !== api.runtime.id || (!fromPanel && !fromChat)) throw Error("untrusted");
    const tabId = fromPanel ? message.sourceTabId ?? sender.tab?.id : sender.tab?.id;
    if (!Number.isSafeInteger(tabId) || tabId! < 0 || !sameMenuChat(message.sourceUrl, fromChat ? sender.url : message.sourceUrl)) throw Error("menu-source-unavailable");
    if (message.resetReview !== undefined && (typeof message.resetReview !== "string" || !message.resetReview || message.resetReview.length > 200)) throw Error("invalid-review");
    const source = await api.tabs.get(tabId!);
    if (!source.active || !sameMenuChat(message.sourceUrl, source.url)) throw Error("menu-source-unavailable");
    const url = new URL(panelUrl);
    url.searchParams.set("sourceTab", String(tabId));
    url.searchParams.set("sourceUrl", message.sourceUrl);
    if (message.resetReview) url.searchParams.set("resetReview", message.resetReview);
    const existing = (await api.tabs.query({})).find(tab => tab.url === url.href);
    // Recheck after querying: a navigation must not silently retarget a requested menu.
    const current = await api.tabs.get(tabId!);
    if (!current.active || !sameMenuChat(message.sourceUrl, current.url)) throw Error("menu-source-unavailable");
    if (existing?.id !== undefined && existing.windowId !== undefined) {
      await api.tabs.update(existing.id, { active: true });
      await api.windows.update(existing.windowId, { focused: true });
    } else {
      const opened = await api.windows.create({ url: url.href, type: "popup", width: 480, height: 800, focused: true });
      if (opened?.id === undefined) throw Error("menu-window-unavailable");
    }
    return { ok: true };
  };
  return (message: OpenMenuWindow, sender: MenuSender) => {
    const result = tail.then(() => open(message, sender)).catch(() => ({ ok: false }));
    tail = result;
    return result;
  };
}
