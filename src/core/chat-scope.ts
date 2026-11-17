export function isDeepSeekHome(value: string): boolean {
  try { const url = new URL(value); return url.origin === "https://chat.deepseek.com" && url.pathname === "/"; }
  catch { return false; }
}

/** DeepSeek exposes the same chat at /chat/s/id and /a/chat/s/id. */
export function isSameDeepSeekChat(first: string, second: string, chatId: string): boolean {
  const read = (value: string) => {
    try {
      const url = new URL(value);
      if (url.origin !== "https://chat.deepseek.com") return null;
      return url.pathname.match(/^\/(?:a\/)?chat\/(?:s\/)?([^/]+)\/?$/)?.[1] ?? null;
    } catch { return null; }
  };
  return !!chatId && read(first) === chatId && read(second) === chatId;
}

export function isDeepSeekFirstChatRoute(from: string, to: string, chatId: string): boolean {
  return isDeepSeekHome(from) && isSameDeepSeekChat(to, to, chatId);
}
