import { isSameDeepSeekChat } from "./chat-scope";
import type { ChatBinding, Locale, WorldProfile } from "./types";

export interface SavedMemorySource {
  chatId: string;
  chatUrl: string;
  worldId: string;
}

export type SavedMemoryRequest = SavedMemorySource | { fromHome: true; worldId: string };
export type SavedMemoryAttempt = "waitingForReply" | "checkFirstTurn" | "movedGame" | "savingTurn";

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

export function isBackgroundBuildFailure(error: unknown) {
  return error instanceof Error && (error.message === "handoff-build-mismatch" || error.message === "handoff-background-unavailable");
}

export const savedMemoryText = (locale: Locale) => locale === "ru" ? {
  transferMismatch: "Перенос приостановлен. На странице расширений нажмите ↻ у DeepRole, затем обновите вкладку DeepSeek.",
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
  updated: "Игра успела сохраниться ещё раз. Проверь обновлённый фрагмент и подтверди перенос.",
  inactiveTab: "Перейди на вкладку с этой игрой и подтверди перенос ещё раз.",
  movedSource: "Игра уже продолжается в другом чате. Открой её актуальный чат.",
  retry: "Обновить просмотр",
  busy: "Дождись окончания текущего действия.",
  loading: "Загружаем сохранённую сцену…",
  draft: "Сохрани или очисти черновик перед переходом.",
  queued: "Сохранённая память подключена. Напиши первую реплику, чтобы продолжить.",
  waitingForReply: "Первая реплика отправляется. DeepRole ждёт ответ для переноса игры.",
  checkFirstTurn: "Перенос пока не подтверждён. Проверь ответ DeepSeek в чате с первой репликой.",
  movedGame: "Игра продолжается в другом чате. Эта реплика не добавлена в игровой журнал.",
  savingTurn: "DeepSeek принял реплику. Осталось сохранить перенос на этом устройстве.",
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
  transferMismatch: "Transfer paused. Reload DeepRole on the extensions page, then refresh your DeepSeek tab.",
  stale: "The saved game has changed. Open the preview again.",
  updated: "The game was saved again. Review the updated excerpt and confirm the transfer.",
  inactiveTab: "Switch to the tab with this game and confirm the transfer again.",
  movedSource: "This game has moved to another chat. Open its current chat.",
  retry: "Refresh preview",
  busy: "Wait for the current action to finish.",
  loading: "Loading the saved scene…",
  draft: "Save or clear your draft before leaving.",
  queued: "Saved memory is connected. Write your first message to continue.",
  waitingForReply: "The first message is being sent. DeepRole is waiting for a reply to finish the transfer.",
  checkFirstTurn: "The transfer is still unconfirmed. Check the DeepSeek reply in the chat with your first message.",
  movedGame: "The game continues in another chat. This turn has not been added to the game journal.",
  savingTurn: "DeepSeek accepted the message. The transfer still needs to be saved on this device.",
};
