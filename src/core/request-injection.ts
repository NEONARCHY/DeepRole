export interface InjectionResult {
  changed: boolean;
  body: string;
}

/** Destination from the site's request, never from generated text or an old URL. */
export function outgoingChatId(body: string): string | null {
  try {
    const payload: unknown = JSON.parse(body);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const id = (payload as Record<string, unknown>).chat_session_id;
    return typeof id === "string" && /^[\w-]{1,120}$/u.test(id) ? id : null;
  } catch { return null; }
}

/** Read the exact outgoing draft even if the website already cleared its composer. */
export function outgoingUserText(body: string): string | null {
  try {
    const payload = JSON.parse(body) as Record<string, unknown>;
    if (typeof payload?.prompt === "string") return payload.prompt;
    for (const messages of findMessageArrays(payload)) {
      for (let index = messages.length - 1; index >= 0; index--) {
        const message = messages[index] as Record<string, unknown> | undefined;
        if (message?.role === "user" && typeof message.content === "string") return message.content;
      }
    }
  } catch { /* Unrecognized requests must remain untouched. */ }
  return null;
}

export function injectIntoJsonBody(body: string, memoryContext: string): InjectionResult {
  const payload = JSON.parse(body) as Record<string, unknown>;
  if (typeof payload.prompt === "string") {
    if (payload.prompt.includes("<deeprole_context") || payload.prompt.includes("<deeprole_choice_mode") || payload.prompt.includes("<deeprole_character_mode")) return { changed: false, body };
    payload.prompt = `${memoryContext}\n\n[User message]\n${payload.prompt}`;
    return { changed: true, body: JSON.stringify(payload) };
  }

  for (const messages of findMessageArrays(payload)) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index] as Record<string, unknown> | undefined;
      if (message?.role !== "user") continue;
      // Never move backwards into an older user turn on retries/unsupported content.
      if (typeof message.content === "string" && !message.content.includes("<deeprole_context") && !message.content.includes("<deeprole_choice_mode") && !message.content.includes("<deeprole_character_mode")) {
        message.content = `${memoryContext}\n\n[User message]\n${message.content}`;
        return { changed: true, body: JSON.stringify(payload) };
      }
      return { changed: false, body };
    }
  }
  return { changed: false, body };
}

/** Replace only the newest outgoing user message; preserve the rest of DeepSeek's payload. */
export function replaceOutgoingUserText(body: string, replacement: string): InjectionResult {
  try {
    const payload = JSON.parse(body) as Record<string, unknown>;
    if (typeof payload.prompt === "string") {
      payload.prompt = replacement;
      return { changed: true, body: JSON.stringify(payload) };
    }
    for (const messages of findMessageArrays(payload)) {
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index] as Record<string, unknown> | undefined;
        if (message?.role !== "user") continue;
        if (typeof message.content !== "string") return { changed: false, body };
        message.content = replacement;
        return { changed: true, body: JSON.stringify(payload) };
      }
    }
  } catch { /* Unknown payloads must remain untouched. */ }
  return { changed: false, body };
}

export function looksLikeChatUrl(url: string): boolean {
  try {
    const path = new URL(url, "https://chat.deepseek.com").pathname;
    return /(?:completion|\/messages?(?:\/|$))/i.test(path) && !/history|list|delete|feedback|upload/i.test(path);
  } catch { return false; }
}

export function isDeepRoleServiceBody(body: string): boolean {
  return outgoingUserText(body)?.trimStart().startsWith("[DeepRole Service]\n") ?? false;
}

export function deepRoleServiceRequestId(body: string): string | null {
  if (!isDeepRoleServiceBody(body)) return null;
  return outgoingUserText(body)?.trimStart().match(/^\[DeepRole Service\]\n\[Request ID: ([\w-]{1,120})\]\n/)?.[1] ?? null;
}

function findMessageArrays(value: unknown, depth = 0): unknown[][] {
  if (!value || typeof value !== "object" || depth > 3) return [];
  const result: unknown[][] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if ((key === "messages" || key === "message_list") && Array.isArray(child)) result.push(child);
    else if (child && typeof child === "object" && !Array.isArray(child)) {
      result.push(...findMessageArrays(child, depth + 1));
    }
  }
  return result;
}
