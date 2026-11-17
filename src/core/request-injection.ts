export interface InjectionResult {
  changed: boolean;
  body: string;
  failure?: "invalid-json" | "unsupported-request-shape" | "memory-already-present";
}

// Local web-chat ceiling. Count decoded prompt text, including the separator,
// in UTF-16 code units; JSON escaping and attachment bytes are separate.
export const DEEPSEEK_PROMPT_CHAR_LIMIT = 40_000;
const USER_MESSAGE_SEPARATOR = "\n\n[User message]\n";

export function assembledPromptLength(draft: string, context: string): number {
  return draft.length + (context ? context.length + USER_MESSAGE_SEPARATOR.length : 0);
}

/** Spend more time refreshing a request only when a memory preview already exists. */
export function contextHandshakeTimeoutMs(hasPublishedContext: boolean, managedStory: boolean): number {
  return hasPublishedContext || managedStory ? 12_000 : 5_000;
}

const DEEPROLE_MARKER = /^\s*<(?:deeprole_context|deeprole_choice_mode|deeprole_character_mode|deeprole_story_memory|deeprole_story_update_mode|deeprole_recovered_reply)\b/iu;
const TEXT_PART_TYPES = new Set(["text", "input_text", "output_text", "request"]);

function isMarked(text: string): boolean { return DEEPROLE_MARKER.test(text); }

/** Read only textual parts; never stringify image/file payloads into the search query. */
function textContent(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const parts = value.map(textContent).filter((part): part is string => part !== null);
    return parts.length ? parts.join("\n") : null;
  }
  if (!value || typeof value !== "object") return null;
  const part = value as Record<string, unknown>;
  const type = typeof part.type === "string" ? part.type.toLowerCase() : "";
  if (typeof part.text === "string" && (!type || TEXT_PART_TYPES.has(type))) return part.text;
  if (typeof part.content === "string" && (!type || TEXT_PART_TYPES.has(type))) return part.content;
  return null;
}

/** Prepend memory to the first recognized text segment, preserving non-text parts. */
function prependText(value: unknown, prefix: string): boolean {
  if (typeof value === "string") return false;
  if (Array.isArray(value)) {
    for (const part of value) {
      if (!part || typeof part !== "object" || Array.isArray(part)) continue;
      const item = part as Record<string, unknown>;
      const type = typeof item.type === "string" ? item.type.toLowerCase() : "";
      const key = typeof item.text === "string" && (!type || TEXT_PART_TYPES.has(type))
        ? "text"
        : typeof item.content === "string" && (!type || TEXT_PART_TYPES.has(type)) ? "content" : null;
      if (!key) continue;
      if (isMarked(item[key] as string)) return false;
      item[key] = `${prefix}${USER_MESSAGE_SEPARATOR}${item[key] as string}`;
      return true;
    }
    return false;
  }
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  const type = typeof item.type === "string" ? item.type.toLowerCase() : "";
  const key = typeof item.text === "string" && (!type || TEXT_PART_TYPES.has(type))
    ? "text"
    : typeof item.content === "string" && (!type || TEXT_PART_TYPES.has(type)) ? "content" : null;
  if (!key || isMarked(item[key] as string)) return false;
  item[key] = `${prefix}${USER_MESSAGE_SEPARATOR}${item[key] as string}`;
  return true;
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

export function outgoingParentMessageId(body: string): string | undefined {
  try {
    const id: unknown = JSON.parse(body)?.parent_message_id;
    if (typeof id === "number" && Number.isSafeInteger(id) && id >= 0) return String(id);
    if (typeof id === "string" && /^[\w-]{1,120}$/u.test(id)) return id;
  } catch { /* Unknown history shape uses the latest recovery in the same chat. */ }
  return undefined;
}

/** Read the exact outgoing draft even if the website already cleared its composer. */
export function outgoingUserText(body: string): string | null {
  try {
    const payload = JSON.parse(body) as Record<string, unknown>;
    const prompt = textContent(payload?.prompt);
    if (prompt !== null) return prompt;
    for (const messages of findMessageArrays(payload)) {
      for (let index = messages.length - 1; index >= 0; index--) {
        const message = messages[index] as Record<string, unknown> | undefined;
        if (message?.role === "user") return textContent(message.content);
      }
    }
  } catch { /* Unrecognized requests must remain untouched. */ }
  return null;
}

export function injectIntoJsonBody(body: string, memoryContext: string): InjectionResult {
  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { changed: false, body, failure: "unsupported-request-shape" };
    payload = parsed as Record<string, unknown>;
  } catch { return { changed: false, body, failure: "invalid-json" }; }

  if (typeof payload.prompt === "string") {
    if (isMarked(payload.prompt)) return { changed: false, body, failure: "memory-already-present" };
    payload.prompt = `${memoryContext}${USER_MESSAGE_SEPARATOR}${payload.prompt}`;
    return { changed: true, body: JSON.stringify(payload) };
  }
  if (payload.prompt !== undefined) {
    const promptText = textContent(payload.prompt);
    if (promptText !== null && isMarked(promptText)) return { changed: false, body, failure: "memory-already-present" };
    if (prependText(payload.prompt, memoryContext)) return { changed: true, body: JSON.stringify(payload) };
  }

  for (const messages of findMessageArrays(payload)) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index] as Record<string, unknown> | undefined;
      if (message?.role !== "user") continue;
      // Never move backwards into an older user turn on retries/unsupported content.
      const content = message.content;
      const plainText = textContent(content);
      if (typeof content === "string") {
        if (isMarked(content)) return { changed: false, body, failure: "memory-already-present" };
        message.content = `${memoryContext}${USER_MESSAGE_SEPARATOR}${content}`;
        return { changed: true, body: JSON.stringify(payload) };
      }
      if (plainText !== null && isMarked(plainText)) return { changed: false, body, failure: "memory-already-present" };
      if (plainText !== null && prependText(content, memoryContext)) return { changed: true, body: JSON.stringify(payload) };
      return { changed: false, body, failure: "unsupported-request-shape" };
    }
  }
  return { changed: false, body, failure: "unsupported-request-shape" };
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
    return /(?:completion|\/messages?(?:\/|$)|\/api\/v0\/chat\/edit_message$)/i.test(path) && !/history|list|delete|feedback|upload/i.test(path);
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
