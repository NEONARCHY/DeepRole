import { CHAT_ORIGIN, DEEPSEEK_ORIGIN, IS_DESKTOP } from "./chat-host";
export function isDeepSeekHome(value: string): boolean {
  try { const url = new URL(value); return url.origin === CHAT_ORIGIN && url.pathname === "/"; }
  catch { return false; }
}

function readChatId(value: string, origin: string): string | null {
  try {
    const url = new URL(value);
    if (url.origin !== origin || url.username || url.password) return null;
    return url.pathname.match(/^\/(?:a\/)?chat\/(?:s\/)?([^/]+)\/?$/)?.[1] ?? null;
  } catch { return null; }
}

/** DeepSeek exposes the same chat at /chat/s/id and /a/chat/s/id. */
export function isSameDeepSeekChat(first: string, second: string, chatId: string): boolean {
  return !!chatId && readChatId(first, CHAT_ORIGIN) === chatId && readChatId(second, CHAT_ORIGIN) === chatId;
}

/** The desktop can resume a locally backed-up browser game without accessing that browser chat. */
export function isSavedChatSource(url: string, chatId: string): boolean {
  return !!chatId && (readChatId(url, CHAT_ORIGIN) === chatId || IS_DESKTOP && readChatId(url, DEEPSEEK_ORIGIN) === chatId);
}

export function isDeepSeekFirstChatRoute(from: string, to: string, chatId: string): boolean {
  return isDeepSeekHome(from) && isSameDeepSeekChat(to, to, chatId);
}
