import { browser } from "wxt/browser";

/** Embedded menus belong to their host tab, even while another tab is active. */
export async function menuTab(embedded = new URLSearchParams(location.search).get("embedded") === "1") {
  if (embedded) {
    const result = await browser.runtime.sendMessage({ type: "DR_MENU_TAB" });
    if (!result?.ok || !Number.isInteger(result.tabId)) throw Error("offsite");
    return browser.tabs.get(result.tabId);
  }
  return (await browser.tabs.query({ active: true, currentWindow: true }))[0];
}
