import type { Locale } from "./types";
const ru = {
  title: "Исходная точка истории",
  hint: "Сохраните текущее состояние персонажей после конкретного ответа. Это будет опорой для будущего учёта событий и откатов.",
  limit: "Автоматическая хроника ещё не включена. Этот шаг не разбирает прежнюю переписку, не меняет лор и не отправляет запрос DeepSeek.",
  read: "Посмотреть текущий чат", again: "Обновить данные", reading: "Читаем сохранённые данные…", saving: "Сохраняем точку…", save: "Сохранить исходную точку",
  world: "Мир: {name}", scene: "Участников в сохранённой сцене: {count}", sceneDetails: "Сохранённое состояние персонажей",
  choose: "После какого ответа сохранить точку?", date: "Ответ сохранён {date}", draft: "Ваша реплика", answer: "Ответ DeepSeek", full: "Прочитать обмен целиком",
  confirm: "Сохранённое состояние сцены соответствует выбранному ответу.",
  empty: "В этой вкладке пока нет подтверждённого обмена. Завершите обычный игровой ход с выбранным миром, затем обновите данные.",
  recent: "Показаны последние {shown} из {total} сохранённых обменов этой вкладки. Это список для выбора, не порядок сюжета.",
  different: "Этот ответ не совпадает с вариантом, отмеченным сервером при чтении. Выбирайте его только если хотите начать именно после него.",
  ancestor: "На сервере после этого ответа есть продолжение. Проверьте, что сохранённая сцена относится именно к выбранному моменту.",
  unknown: "Серверный вариант не подтверждён. Выберите ответ самостоятельно; расширение не угадывает линию истории.",
  existing: "Исходная точка уже сохранена. Её нельзя сдвинуть повторным нажатием.", saved: "Исходная точка сохранена. Лор и сцена не изменены.",
  noScope: "Откройте чат DeepSeek с выбранным миром и попробуйте ещё раз.", locked: "Откройте сейф, затем обновите данные.", busy: "Дождитесь окончания генерации или служебного запроса.",
  changed: "Данные изменились. Обновите их и проверьте исходную точку ещё раз.", failed: "Не удалось сохранить или прочитать точку. Обновите данные и повторите попытку.",
  condition: "Состояние: {text}", goal: "Цель: {text}", noPeople: "В сохранённой сцене нет состояний персонажей.", unnamed: "Персонаж без сохранённого имени",
};
const en: Record<keyof typeof ru, string> = {
  title: "Story starting point",
  hint: "Save the current character state after a specific reply. This gives future event tracking and rollbacks a starting point.",
  limit: "Automatic story tracking is not enabled yet. This step does not process earlier messages, change lore or send a DeepSeek request.",
  read: "Review current chat", again: "Refresh data", reading: "Reading saved data…", saving: "Saving starting point…", save: "Save starting point",
  world: "World: {name}", scene: "Characters in the saved scene: {count}", sceneDetails: "Saved character state",
  choose: "Which reply should the starting point follow?", date: "Reply saved {date}", draft: "Your message", answer: "DeepSeek reply", full: "Read the full exchange",
  confirm: "The saved scene state matches the selected reply.",
  empty: "No confirmed exchange is saved for this tab yet. Complete a regular story turn with a world selected, then refresh the data.",
  recent: "Showing the latest {shown} of {total} saved exchanges from this tab. This is a list to choose from, not story order.",
  different: "This reply differs from the variant marked by the server when it was read. Choose it only if you want to start after this reply.",
  ancestor: "The server has later messages after this reply. Check that the saved scene belongs to the point you selected.",
  unknown: "The server variant is unconfirmed. Choose the reply yourself; the extension does not guess the story line.",
  existing: "A starting point is already saved. Repeated clicks cannot move it.", saved: "Starting point saved. Lore and scene are unchanged.",
  noScope: "Open a DeepSeek chat with a world selected, then try again.", locked: "Unlock the vault, then refresh the data.", busy: "Wait for generation or the service request to finish.",
  changed: "The data changed. Refresh it and review the starting point again.", failed: "Could not save or read the starting point. Refresh the data and try again.",
  condition: "State: {text}", goal: "Goal: {text}", noPeople: "No character states are saved in this scene.", unnamed: "Character without a saved name",
};
export type StoryCheckpointTextKey = keyof typeof ru;
export const storyCheckpointText = (locale: Locale, key: StoryCheckpointTextKey) => (locale === "ru" ? ru : en)[key];
export function storyCheckpointError(error: unknown): StoryCheckpointTextKey {
  const code = error instanceof Error ? error.message : "";
  if (code === "vault-locked") return "locked";
  if (code === "story-checkpoint-busy") return "busy";
  if (code === "story-checkpoint-no-scope") return "noScope";
  if (["story-binding-conflict", "story-manual-conflict", "story-anchor-conflict", "story-anchor-too-late", "story-checkpoint-source"].includes(code)) return "changed";
  return "failed";
}
