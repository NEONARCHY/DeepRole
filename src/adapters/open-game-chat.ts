import { browser, type Browser } from "wxt/browser";
import { isSameDeepSeekChat } from "../core/chat-scope";
import { currentChatUrl } from "../core/old-chat-notice";

const opening = new Map<string, Promise<void>>();

export async function openGameChat(chatId: string, source?: Browser.tabs.Tab): Promise<void> {
  source ??= (await browser.tabs.query({ currentWindow: true, active: true }))[0];
  const key = JSON.stringify([Boolean(source?.incognito), chatId]);
  const existing = opening.get(key);
  if (existing) return existing;

  const task = focusOrCreate(chatId, source);
  opening.set(key, task);
  try { await task; }
  finally { opening.delete(key); }
}

async function focusOrCreate(chatId: string, source?: Browser.tabs.Tab) {
  const matches = (tab: Browser.tabs.Tab) => !("hidden" in tab && tab.hidden === true)
    && Boolean(tab.incognito) === Boolean(source?.incognito)
    && isSameDeepSeekChat(tab.url ?? "", tab.pendingUrl ?? tab.url ?? "", chatId);
  const tabs = (await browser.tabs.query({ url: "https://chat.deepseek.com/*", windowType: "normal" })).filter(matches);
  tabs.sort((a, b) => Number(b.windowId === source?.windowId) - Number(a.windowId === source?.windowId));
  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    const latest = await browser.tabs.get(tab.id).catch(() => undefined);
    if (!latest || !matches(latest)) continue;
    await browser.tabs.update(tab.id, { active: true });
    if (latest.windowId !== source?.windowId) await browser.windows.update(latest.windowId, { focused: true });
    return;
  }
  await browser.tabs.create({ url: currentChatUrl(chatId), windowId: source?.windowId, active: true });
}
