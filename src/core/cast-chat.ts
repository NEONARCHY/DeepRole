const validId = (id: unknown): id is string => typeof id === "string" && /^[\w-]{1,120}$/u.test(id) && id !== "s";

export function castChatId(pathname: unknown): string | undefined {
 const id = typeof pathname === "string" ? pathname.match(/^\/(?:a\/)?chat\/(?:s\/)?([\w-]{1,120})\/?$/u)?.[1] : undefined;
 return validId(id) ? id : undefined;
}

/** Keep the route actually observed in the owned tab, not a guessed launcher.
 * Service query markers are stripped so inspecting a chat cannot restart a job. */
export function castChatReference(value: unknown): { id: string; url: string } | undefined {
 if (typeof value !== "string" || value.length > 2048) return;
 try {
  const url = new URL(value);
  if (url.origin !== "https://chat.deepseek.com" || url.username || url.password) return;
  const id = castChatId(url.pathname);
  if (!id) return;
  return { id, url: url.origin + url.pathname };
 } catch { return; }
}

export function castChatLink(chatId?: string, savedUrl?: string): string | undefined {
 if (!validId(chatId)) return;
 if (savedUrl !== undefined) {
  const reference = castChatReference(savedUrl);
  return reference?.id === chatId ? reference.url : undefined;
 }
 // Old jobs stored only the ID. Use the same native route as chat continuation;
 // a missing/invalid ID never falls back to DeepSeek's new-chat page.
 return "https://chat.deepseek.com/a/chat/s/" + chatId;
}
