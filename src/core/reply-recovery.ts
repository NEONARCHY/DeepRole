import type { Locale, RecoveredReply } from "./types";

export const MAX_RECOVERED_REPLY_HTML = 1_000_000;
export const MAX_RECOVERED_REPLIES = 200;
export const MAX_CHAT_RECOVERY_HTML = 8_000_000;
const refusal = "Sorry, that's beyond my current scope. Let's talk about something else.";
const normalize = (text: string) => text.replace(/[’‘]/gu, "'").replace(/\s+/gu, " ").trim().toLowerCase();
export const isReplacedReply = (text: string) => normalize(text) === normalize(refusal);
/** Ignore the refusal while it is itself streaming; it must not replace the candidate. */
export const isRefusalFragment = (text: string) => {
  const value = normalize(text);
  return value.length >= 8 && normalize(refusal).startsWith(value);
};

export function validRecoveredReply(value: unknown): value is RecoveredReply {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  if (typeof r.messageKey !== "string" || r.messageKey.length > 512 || typeof r.html !== "string" || !r.html.trim() || r.html.length > MAX_RECOVERED_REPLY_HTML) return false;
  try {
    const key: unknown = JSON.parse(r.messageKey);
    if (!Array.isArray(key) || key.length !== 2 || !["message", "virtual"].includes(key[0]) || typeof key[1] !== "string" || !key[1]) return false;
  } catch { return false; }
  return [r.capturedAt, r.recoveredAt].every(t => typeof t === "number" && Number.isSafeInteger(t) && t >= 0);
}

export function validRecoveredReplies(value: unknown): value is RecoveredReply[] {
  return Array.isArray(value) && value.length <= MAX_RECOVERED_REPLIES && value.every(validRecoveredReply)
    && new Set(value.map(r => r.messageKey)).size === value.length
    && value.reduce((size, r) => size + r.html.length, 0) <= MAX_CHAT_RECOVERY_HTML;
}

export function replyRecoveryText(locale: Locale) {
  return locale === "ru" ? {
    title: "Восстановление ответов", toggle: "Автоматически восстанавливать скрытые ответы",
    hint: "DeepRole возвращает последний видимый фрагмент, если DeepSeek заменяет ответ заглушкой. Локальная копия остаётся после перезагрузки; она может быть неполной. Ответы, которые расширение не видело, восстановить нельзя.",
    restored: "Восстановлено", unsaved: "Восстановлено · не сохранено",
    detail: "Локальная копия последнего видимого фрагмента. Ответ мог не успеть завершиться. История на сервере DeepSeek не изменена.",
    saveFailed: "Ответ восстановлен на странице, но локальную копию сохранить не удалось.",
  } : {
    title: "Reply recovery", toggle: "Automatically restore hidden replies",
    hint: "DeepRole restores the last visible fragment if DeepSeek replaces a reply with its refusal. The local copy survives reloads and may be incomplete. Replies the extension never saw cannot be recovered.",
    restored: "Restored", unsaved: "Restored · not saved",
    detail: "Local copy of the last visible fragment. The reply may be incomplete. DeepSeek's server history is unchanged.",
    saveFailed: "The reply was restored on this page, but its local copy could not be saved.",
  };
}
