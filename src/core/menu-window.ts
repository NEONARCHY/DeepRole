/** A detached menu stays with one tab and one chat, never with the last focused window. */
export function menuChatKey(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.origin !== "https://chat.deepseek.com") return null;
    if (url.pathname === "/") return "home";
    const chat = url.pathname.match(/^\/(?:a\/)?chat\/(?:s\/)?([^/]+)\/?$/)?.[1];
    return chat ? `chat:${chat}` : null;
  } catch { return null; }
}

export function menuWindowSource(search: string): { tabId: number; url: string } | null {
  const params = new URLSearchParams(search);
  if (!params.has("sourceTab") && !params.has("sourceUrl")) return null;
  const id = params.get("sourceTab") ?? "", url = params.get("sourceUrl") ?? "";
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || !menuChatKey(url)) throw Error("menu-source-unavailable");
  return { tabId: Number(id), url };
}

export function sameMenuChat(expected: string, actual?: string): boolean {
  const key = menuChatKey(expected);
  return key !== null && !!actual && menuChatKey(actual) === key;
}
