import { isSameDeepSeekChat } from "./chat-scope";
import type { ChatBinding, Locale, WorldProfile } from "./types";

export interface SavedMemorySource {
  chatId: string;
  chatUrl: string;
  worldId: string;
}

export type SavedMemoryRequest = SavedMemorySource | { fromHome: true; worldId: string };

/** Resolve a selected world to its saved source using durable local state. */
export function savedMemoryBinding(world: WorldProfile, bindings: ChatBinding[]): ChatBinding | undefined {
  const game = world.sharedGame;
  const eligible = bindings.filter(binding => binding.worldId === world.id
    && (!game || (binding.id === game.activeBindingId && binding.chatId === game.activeChatId))
    && isSameDeepSeekChat(binding.chatUrl, binding.chatUrl, binding.chatId));
  return eligible.length === 1 ? eligible[0] : undefined;
}

export interface SavedMemoryPreview {
  version: string;
  scene: string | null;
  savedAt: number | null;
}

export interface SavedMemoryTransferState {
  scope: string;
  worlds?: Pick<WorldProfile, "id" | "name">[];
  blocked: boolean;
}

export const savedMemoryText = (locale: Locale) => locale === "ru" ? {
  title: "Продолжить из сохранённой памяти",
  resumeGame: (name: string) => `Продолжить «${name}»`,
  viewScene: "Посмотреть сохранённую сцену",
  preparing: "Подключаем сохранённую игру…",
  last: "Последний сохранённый фрагмент сцены",
  empty: "Сохранённой сцены нет. В новый чат подключатся лор, анкеты и доступная память мира.",
  hint: "DeepRole откроет новый чат без запроса в старый. События после сохранённого фрагмента могут отсутствовать. Первую реплику отправишь сам.",
  open: "Открыть новый чат",
  chooseWorld: "Выберите сохранённую игру",
  changeWorld: "Выбрать другую игру",
  connect: "Подключить сохранённую игру",
  homeHint: "События после сохранённого фрагмента могут отсутствовать. Первую реплику отправишь сам.",
  close: "Закрыть",
  failed: "Не удалось подготовить перенос. Игра сохранена. Попробуй ещё раз.",
  stale: "Сохранение изменилось. Открой просмотр заново.",
  retry: "Обновить просмотр",
  busy: "Дождись окончания текущего действия.",
  loading: "Загружаем сохранённую сцену…",
  draft: "Сохрани или очисти черновик перед переходом.",
  queued: "Сохранённая память подключена. Напиши первую реплику, чтобы продолжить.",
} : {
  title: "Continue from saved memory",
  resumeGame: (name: string) => `Continue “${name}”`,
  viewScene: "View saved scene",
  preparing: "Connecting your saved game…",
  last: "Last saved scene excerpt",
  empty: "No scene has been saved. The new chat will use the lore, profiles and available world memory.",
  hint: "DeepRole opens a new chat without asking the old one. Events after the saved excerpt may be missing. You send the first message.",
  open: "Open new chat",
  chooseWorld: "Choose a saved game",
  changeWorld: "Choose another game",
  connect: "Connect saved game",
  homeHint: "Events after the saved excerpt may be missing. You send the first message.",
  close: "Close",
  failed: "Could not prepare the transfer. Your game is saved. Try again.",
  stale: "The saved game has changed. Open the preview again.",
  retry: "Refresh preview",
  busy: "Wait for the current action to finish.",
  loading: "Loading the saved scene…",
  draft: "Save or clear your draft before leaving.",
  queued: "Saved memory is connected. Write your first message to continue.",
};
