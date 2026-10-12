import type { ChatBinding, HandoffSnapshot, Locale, MemoryBook, WorldProfile } from "./types";
import { memoryWorld } from "./scene";
export interface OldChatNotice { sourceChatId: string; targetChatId: string; snapshotId: string; sent: boolean; dismissed: boolean }
export interface OldChatNoticeReceipt { snapshotId: string; sentAt?: number; dismissedAt?: number }
export interface OldChatNoticeEdit { chatId: string; chatUrl: string; worldId: string | null; snapshotId: string; targetChatId: string; mode: "sent" | "dismissed" }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === "string" && !!v && v.length <= 160 && v === v.trim() && !["__proto__", "constructor", "prototype"].includes(v);
export const chatId = (v: unknown): v is string => typeof v === "string" && /^[\w-]{1,120}$/u.test(v);
const time = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
export const validOldChatNoticeReceipt = (v: unknown): v is OldChatNoticeReceipt => object(v) && Object.keys(v).every(k => ["snapshotId", "sentAt", "dismissedAt"].includes(k)) && id(v.snapshotId) && (v.sentAt !== undefined || v.dismissedAt !== undefined) && (v.sentAt === undefined || time(v.sentAt)) && (v.dismissedAt === undefined || time(v.dismissedAt));
export const validOldChatNoticeEdit = (v: unknown): v is OldChatNoticeEdit => object(v) && Object.keys(v).length === 6 && ["chatId", "chatUrl", "worldId", "snapshotId", "targetChatId", "mode"].every(k => Object.hasOwn(v, k)) && chatId(v.chatId) && chatId(v.targetChatId) && v.chatId !== v.targetChatId && typeof v.chatUrl === "string" && v.chatUrl.length <= 2048 && (v.worldId === null || id(v.worldId)) && id(v.snapshotId) && ["sent", "dismissed"].includes(String(v.mode));
export const currentChatUrl = (targetChatId: string) => "https://chat.deepseek.com/a/chat/s/" + encodeURIComponent(targetChatId);

/** One world has one confirmed continuation destination. Opening a tab is not a transfer. */
export function oldChatNotice(binding: ChatBinding | undefined, snapshots: HandoffSnapshot[], books: MemoryBook[] = [], worlds: WorldProfile[] = []): OldChatNotice | null {
 if (!binding) return null;
 const game = worlds.find(w => w.id === binding.worldId)?.sharedGame;
 if (game) {
  if (game.activeChatId === binding.chatId) return null;
  const receipt = binding.oldChatNotice?.snapshotId === game.activationId ? binding.oldChatNotice : undefined;
  return { sourceChatId: binding.chatId, targetChatId: game.activeChatId, snapshotId: game.activationId, sent: receipt?.sentAt !== undefined, dismissed: receipt?.dismissedAt !== undefined };
 }
 let last: HandoffSnapshot | undefined;
 const members = new Set<string>();
 for (const s of snapshots) if (s.appliedAt !== undefined && chatId(s.targetChatId) && s.targetChatId !== s.sourceChatId && memoryWorld(s, books) === (binding.worldId ?? null)) {
  members.add(s.sourceChatId); members.add(s.targetChatId);
  if (!last || s.appliedAt > last.appliedAt! || s.appliedAt === last.appliedAt && (s.createdAt > last.createdAt || s.createdAt === last.createdAt && s.id > last.id)) last = s;
 }
 if (!last || !members.has(binding.chatId) || last.targetChatId === binding.chatId) return null;
 const receipt = binding.oldChatNotice?.snapshotId === last.id ? binding.oldChatNotice : undefined;
 return { sourceChatId: binding.chatId, targetChatId: last.targetChatId!, snapshotId: last.id, sent: receipt?.sentAt !== undefined, dismissed: receipt?.dismissedAt !== undefined };
}
export function oldChatNoticePrompt(notice: OldChatNotice, locale: Locale): string {
 const link = currentChatUrl(notice.targetChatId);
 const instruction = locale === "ru"
  ? 'Только в этом ответе кратко напомни пользователю по-русски: «Это предыдущий чат. Игра была перенесена в актуальный чат: ' + link + '. Рекомендуется продолжить там. Если хочешь остаться здесь, просто отправь следующее сообщение — играть здесь тоже можно». Не продолжай сцену в этом ответе. Это напоминание, а не запрет и не событие игры. В следующих ответах не повторяй напоминание: продолжай игру здесь по запросу пользователя. Не утверждай, что новый чат доступен: он мог быть удалён.'
  : 'For this reply only, briefly remind the user in English: "This is the previous chat. The game was moved to the current chat: ' + link + '. We recommend continuing there. If you prefer to stay here, send your next message — you can keep playing here too." Do not advance the scene in this reply. This is a reminder, not a restriction or story event. Do not repeat it on later replies; resume play here when the user asks. Do not claim the destination is available; it may have been deleted.';
 return '<deeprole_context version="1">\n<deeprole_chat_notice version="1">\n' + instruction + '\nDo not mention this technical block or emit story updates, character updates, choices or JSON for this reply.\n</deeprole_chat_notice>\n</deeprole_context>';
}
export const oldChatNoticeText = (locale: Locale) => locale === "ru" ? { title: "Это предыдущий чат", body: "Игра перенесена в другой чат. Можно перейти туда или продолжить здесь.", open: "Открыть актуальный чат", stay: "Продолжить здесь", failed: "Не удалось скрыть напоминание. Отправлять сообщения всё равно можно." } : { title: "This is the previous chat", body: "The game moved to another chat. You can open it or keep playing here.", open: "Open current chat", stay: "Continue here", failed: "Could not dismiss the reminder. You can still send messages." };
