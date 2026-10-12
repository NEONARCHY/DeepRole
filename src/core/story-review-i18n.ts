import type { Locale } from "./types";
const ru = {
  title: "История событий", hint: "Посмотрите реплики, записанные после исходной точки в этом чате.",
  limit: "Просмотр и предпросмотр ничего не меняют. Автоматическая история включается отдельно и не отправляет новые запросы модели.",
  startGame: "Включить историю с этой сцены", syncGame: "Учесть ответ, выбранный в чате", synced: "История и карточки обновлены.",
  gameHint: "После включения играйте как обычно. Варианты ответа выбирайте стрелками DeepSeek: расширение пересчитает карточки по показанной линии. Старую переписку оно не меняет.",
  newStart: "Новая исходная сцена", newStartHint: "Текущий прогресс станет новой исходной точкой записи этой же игры. Прежняя хроника сохранится в архиве, но кнопки возврата к нему пока нет. Старые ответы не войдут в новую линию. Переписка DeepSeek останется на месте.", restart: "Начать отслеживание заново отсюда",
  undo: "Отменить последнее изменение", undoDone: "Карточки возвращены к предыдущей сцене. Автоматическая запись приостановлена. Выберите нужную линию в DeepSeek, затем нажмите «Учесть ответ, выбранный в чате».",
  paused: "После отмены история приостановлена. Выберите нужную линию в DeepSeek и нажмите «Учесть ответ, выбранный в чате».",
  nonStory: "Вопрос вне игры", nonStoryHint: "Следующую отправку можно исключить из игровых изменений — например, если отправляете отчёт или обсуждаете правила. Текст сохранится, но карточки от этого ответа не обновятся. Повторное нажатие снимает отметку.", markNonStory: "Переключить отметку следующей реплики", nonStoryMarked: "Отметка следующей отправки переключена. Проверьте её в описании запроса перед отправкой.",
  nonStoryOn: "Следующая отправка — вне игры. Ответ не изменит карточки.", nonStoryOff: "Следующая отправка снова считается игровой.", clearNonStory: "Снова считать следующую реплику игровой",
  keepManual: "Продолжить, сохранив мои правки", keepHint: "Сохранится разница, внесённая вами в карточки. Отменённые игровые изменения не переносятся. Проверьте выбранный ответ в чате перед продолжением.",
  sourceUnavailable: "Не удалось подтвердить выбранный ответ. Ничего не заменено. Откройте нужный вариант в DeepSeek, дождитесь окончания ответа и повторите обновление.",
  startStale: "Сохранённая исходная точка уже отличается от текущей сцены. Она не перезаписана. Пока продолжайте обычную игру: нужна новая исходная точка.",
  read: "Посмотреть историю", refresh: "Обновить историю", next: "Следующая страница", reading: "Читаем историю…", checking: "Считаем последствия…",
  world: "Мир: {name}", missing: "Сначала сохраните исходную точку в разделе выше. Прежняя переписка не добавляется автоматически.",
  empty: "После исходной точки пока нет записанных реплик. Завершите обычный игровой ход, затем обновите историю.",
  order: "Показаны записи {from}–{to} из {total}, по времени сохранения. Это не восстановленный порядок сюжета.",
  user: "Ваша реплика", assistant: "Ответ DeepSeek", complete: "Завершён", partial: "Неполный", interrupted: "Прерван",
  selected: "В выбранной линии", observed: "Записан, но не выбран для сюжета", parent: "Следует за репликой: {text}",
  fromBaseline: "Начинается после исходной точки.", full: "Прочитать целиком", events: "Событий предложено: {candidates}; учтено: {applied}.",
  preview: "Посмотреть последствия выбора", baseline: "Посмотреть возврат к исходной точке", previewTitle: "Предпросмотр без сохранения",
  previewLimit: "Учитываются только ранее одобренные события. Сам текст ответа не становится фактом; новые предложения не применяются.",
  delta: "Учтённых событий добавится: {added}; отменится: {removed}.",
  conflict: "Текущая сцена отличается от сохранённой линии — например, после ручной правки или обновления персонажей. Предпросмотр не заменяет эти данные.",
  unchanged: "Текущая сцена совпадает с сохранённой линией. Предпросмотр ничего не меняет.",
  snapshot: "Состояние в предпросмотре", condition: "Состояние: {text}", goal: "Цель: {text}", noPeople: "Состояний персонажей нет.", unnamed: "Персонаж без сохранённого имени",
  stale: "История или выбранный мир изменились. Обновите историю перед просмотром последствий.",
  locked: "Откройте сейф, затем обновите историю.", busy: "Дождитесь окончания генерации или служебного запроса.",
  inactive: "Игра продолжена в другом чате. Сначала нажмите «Продолжить здесь» в разделе «История».", resetChanged: "Новая игра уже изменена. Быстрая отмена сброса недоступна; текущий прогресс сохранён.", noScope: "Откройте чат DeepSeek с выбранным миром и попробуйте ещё раз.", failed: "Не удалось прочитать историю. Обновите её и повторите попытку.",
};
const en: Record<keyof typeof ru, string> = {
  title: "Story history", hint: "Review messages saved after the starting point in this chat.",
  limit: "Review and preview do not change anything. Automatic story tracking is enabled separately and sends no new model requests.",
  startGame: "Track the story from this scene", syncGame: "Apply the reply shown in chat", synced: "Story and character states updated.",
  gameHint: "Once enabled, play normally. Use DeepSeek’s arrows to choose a reply: character states follow the displayed line. Earlier chat messages are not changed.",
  newStart: "New starting scene", newStartHint: "Current progress becomes a new recording checkpoint of the same game. The earlier chronicle is archived; there is no button to return to it yet. Old replies are not part of the new line. DeepSeek messages stay in place.", restart: "Restart tracking from here",
  undo: "Undo the latest change", undoDone: "Character states returned to the previous scene. Automatic tracking is paused. Choose the intended line in DeepSeek, then use “Apply the reply shown in chat”.",
  paused: "Tracking is paused after undo. Choose the intended line in DeepSeek, then use “Apply the reply shown in chat”.",
  nonStory: "Out-of-character question", nonStoryHint: "Exclude the next send from story changes, for example a report or a question about rules. Its text is saved, but its reply does not update character states. Click again to clear the mark.", markNonStory: "Toggle the next message’s mark", nonStoryMarked: "The next-send mark was toggled. Check the request description before sending.",
  nonStoryOn: "The next send is out of character. Its reply will not change character states.", nonStoryOff: "The next send counts as a story message again.", clearNonStory: "Count the next message as story again",
  keepManual: "Continue and keep my edits", keepHint: "Your character edits are kept as a separate change. Cancelled story changes are not carried over. Check the displayed reply before continuing.",
  sourceUnavailable: "Could not confirm the displayed reply. Nothing was replaced. Open the intended reply in DeepSeek, wait for it to finish, then refresh.",
  startStale: "The saved starting point no longer matches this scene. It was not overwritten. Continue normal play for now: a new starting point is required.",
  read: "Review saved story", refresh: "Refresh story", next: "Next page", reading: "Reading story…", checking: "Checking consequences…",
  world: "World: {name}", missing: "Save a starting point in the section above first. Earlier messages are not added automatically.",
  empty: "No messages have been saved after the starting point yet. Finish a regular story turn, then refresh the story.",
  order: "Showing records {from}–{to} of {total}, ordered by save time. This is not a reconstructed story sequence.",
  user: "Your message", assistant: "DeepSeek reply", complete: "Complete", partial: "Incomplete", interrupted: "Interrupted",
  selected: "In the selected line", observed: "Saved, not selected for the story", parent: "Follows this message: {text}",
  fromBaseline: "Starts after the starting point.", full: "Read in full", events: "Events proposed: {candidates}; applied: {applied}.",
  preview: "Preview this choice", baseline: "Preview return to starting point", previewTitle: "Preview without saving",
  previewLimit: "Only previously approved events are included. Reply text alone does not become fact; new proposals are not applied.",
  delta: "Applied events to add: {added}; to undo: {removed}.",
  conflict: "The current scene differs from the saved line, for example after a manual edit or a character update. This preview does not replace those changes.",
  unchanged: "The current scene matches the saved line. This preview changes nothing.",
  snapshot: "Previewed state", condition: "State: {text}", goal: "Goal: {text}", noPeople: "No character states.", unnamed: "Character without a saved name",
  stale: "The story or selected world changed. Refresh the story before previewing consequences.",
  locked: "Unlock the vault, then refresh the story.", busy: "Wait for generation or the service request to finish.",
  inactive: "This game continues in another chat. Choose Continue here in Story first.", resetChanged: "The new game has already changed. Quick reset undo is unavailable; current progress is kept.", noScope: "Open a DeepSeek chat with a world selected, then try again.", failed: "Could not read the story. Refresh it and try again.",
};
export type StoryReviewTextKey = keyof typeof ru;
export const storyReviewText = (locale: Locale, key: StoryReviewTextKey) => (locale === "ru" ? ru : en)[key];
export function storyReviewError(error: unknown): StoryReviewTextKey {
  const code = error instanceof Error ? error.message : "";
  if (code === "story-game-inactive") return "inactive";
  if (code === "story-game-reset-changed") return "resetChanged";
  if (code === "vault-locked") return "locked";
  if (code === "story-checkpoint-busy") return "busy";
  if (code === "story-checkpoint-no-scope") return "noScope";
  if (["story-manual-conflict", "story-profile-conflict", "story-manual-baseline-conflict", "story-effects-untracked"].includes(code)) return "conflict";
  if (["story-native-line-unavailable", "story-source-incomplete"].includes(code)) return "sourceUnavailable";
  if (code === "story-start-stale") return "startStale";
  if (code === "story-game-paused") return "paused";
  if (["story-review-stale", "story-binding-conflict", "story-source-incomplete", "story-game-stale"].includes(code)) return "stale";
  return "failed";
}
