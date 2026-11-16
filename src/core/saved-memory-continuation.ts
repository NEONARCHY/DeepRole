import type { Locale } from "./types";

export interface SavedMemorySource {
  chatId: string;
  chatUrl: string;
  worldId: string;
}

export interface SavedMemoryPreview {
  version: string;
  scene: string | null;
  savedAt: number | null;
}

export const savedMemoryText = (locale: Locale) => locale === "ru" ? {
  title: "Продолжить из сохранённой памяти",
  last: "Последний сохранённый фрагмент сцены",
  empty: "Сохранённой сцены нет. В новый чат подключатся лор, анкеты и доступная память мира.",
  hint: "DeepRole откроет новый чат без запроса в старый. События после сохранённого фрагмента могут отсутствовать. Первую реплику отправишь сам.",
  open: "Открыть новый чат",
  close: "Закрыть",
  failed: "Не удалось подготовить перенос. Игра сохранена. Попробуй ещё раз.",
  stale: "Сохранение изменилось. Открой просмотр заново.",
  draft: "Сохрани или очисти черновик перед переходом.",
  queued: "Сохранённая память подключена. Напиши первую реплику, чтобы продолжить.",
} : {
  title: "Continue from saved memory",
  last: "Last saved scene excerpt",
  empty: "No scene has been saved. The new chat will use the lore, profiles and available world memory.",
  hint: "DeepRole opens a new chat without asking the old one. Events after the saved excerpt may be missing. You send the first message.",
  open: "Open new chat",
  close: "Close",
  failed: "Could not prepare the transfer. Your game is saved. Try again.",
  stale: "The saved game has changed. Open the preview again.",
  draft: "Save or clear your draft before leaving.",
  queued: "Saved memory is connected. Write your first message to continue.",
};
