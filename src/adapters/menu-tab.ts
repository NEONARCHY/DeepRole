import { browser } from "wxt/browser";
import { menuWindowSource, sameMenuChat } from "../core/menu-window";

/** Embedded menus belong to their host tab, even while another tab is active. */
export async function menuTab(embedded = new URLSearchParams(location.search).get("embedded") === "1") {
  const source = menuWindowSource(location.search);
  if (source) {
    const tab = await browser.tabs.get(source.tabId);
    if (!tab.active || !sameMenuChat(source.url, tab.url)) throw Error("menu-source-unavailable");
    return tab;
  }
  if (embedded) {
    const result = await browser.runtime.sendMessage({ type: "DR_MENU_TAB" });
    if (!result?.ok || !Number.isInteger(result.tabId)) throw Error("offsite");
    return browser.tabs.get(result.tabId);
  }
  return (await browser.tabs.query({ active: true, currentWindow: true }))[0];
}

/** Memory clients use the same target as the surrounding menu. */
export const menuTabs = {
  async query(_query: { active: boolean; currentWindow: boolean }) {
    const tab = await menuTab();
    return tab ? [tab] : [];
  },
  async sendMessage(tabId: number, message: unknown) {
    const current = await menuTab();
    if (current?.id !== tabId) throw Error("menu-source-unavailable");
    return browser.tabs.sendMessage(tabId, message);
  },
};

export async function openMenuWindow(resetReview?: string) {
  const tab = await menuTab();
  if (tab?.id === undefined || !tab.url) throw Error("menu-source-unavailable");
  const result = await browser.runtime.sendMessage({ type: "DR_OPEN_MENU_WINDOW", sourceTabId: tab.id, sourceUrl: tab.url, ...(resetReview ? { resetReview } : {}) });
  if (!result?.ok) throw Error("menu-source-unavailable");
}
