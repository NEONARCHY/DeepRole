import type { Locale } from "./types";
const en = {
  saved: "The character profile was saved in this story.",
  prepare: "Prepare this profile from the story", preparing: "Preparing one character…", stopProfile: "Stop preparation", profileHint: "Uses bounded excerpts mentioning this name in the recorded selected story. Missing details are not invented. Review the proposal before adding the character; existing draft text is not replaced automatically.",
  profileStale: "The story has moved on. Prepare the profile again before adding it; your draft text is kept.", profileReady: "Profile proposal saved. Review and choose fields; nothing has been added yet.", profilePartial: "Only selected name-matching excerpts were supplied, not the whole conversation. Facts in omitted passages or under other names may be missed.", profileApply: "Use selected fields in this draft", profileApplied: "Selected fields copied into the draft. Check it, then add the character to the story.",
  title: "Missed characters", hint: "Search recorded messages in the selected story, after its starting point. Other answer variants and out-of-game messages are excluded. Nothing is added without your approval.",
  serviceHint: "This sends excerpts to DeepSeek in successive visible service windows. They close after cleanup. You can stop and resume the search; leave the game chat idle while it runs.",
  protected: "The profile or scene was changed manually. This addition was not removed, to preserve your edits.",
  dependent: "Later story updates depend on this character. This addition cannot be removed on its own; nothing was changed.",
  start: "Find new characters in the conversation", running: "Searching the conversation…", cancel: "Stop search", read: "Show found names", refresh: "Refresh results", progress: "Messages checked: {done} of {total}",
  finish: "Search finished. The model may still miss someone; this is not proof of a complete cast.", partial: "Search stopped. Completed batches and found names are kept; the next search resumes unfinished work.",
  empty: "No unreviewed names in the recorded selected story.", proposal: "Suggested name from the conversation — check that this is a character, not a place or organisation.",
  name: "Name", background: "About the character", quote: "Source quote", approve: "Add to this story", reject: "Skip this suggestion", added: "Added to this story", remove: "Remove this addition",
  edit: "Edit before adding", editHint: "Your saved name and description will be used in future play. This adds a profile to this playthrough, not to every world or chat. Age, scores and protagonist status are not invented.",
  prev: "Previous names", next: "More names", range: "Names {from}–{to} of {total}", error: "Search could not finish. Saved profiles and completed batches are unchanged.",
  known: "That name or alias already belongs to a saved character. Check the library or use a distinct name; nothing was merged.", changed: "The selected story changed. Refresh the results before reviewing them.", busy: "Another operation is running, or the chat has an unfinished reply or draft. Finish it before searching.", cleanup: "Results were saved, but temporary-chat cleanup needs checking. See wand diagnostics before resuming.",
};
const ru: Record<keyof typeof en, string> = {
  saved: "Карточка персонажа сохранена в этой истории.",
  prepare: "Подготовить эту анкету по истории", preparing: "Готовим одного персонажа…", stopProfile: "Остановить подготовку", profileHint: "Использует ограниченные выдержки с этим именем из записанной выбранной истории. Недостающее не придумывает. Перед добавлением проверьте предложение; уже написанный вами текст сам не заменится.",
  profileStale: "История продвинулась дальше. Подготовьте анкету снова перед добавлением; ваш черновик сохранён.", profileReady: "Предложение анкеты сохранено. Проверьте и выберите поля — персонаж пока не добавлен.", profilePartial: "Переданы только выдержки с упоминанием имени, не вся переписка. Сведения в пропущенных фрагментах или под другими именами могут не найтись.", profileApply: "Вставить выбранные поля в черновик", profileApplied: "Выбранные поля вставлены в черновик. Проверьте его, затем добавьте персонажа в историю.",
  title: "Пропущенные персонажи", hint: "Ищет в записанных сообщениях выбранной истории после исходной точки. Другие варианты ответов и сообщения вне игры исключены. Без вашего подтверждения никто не добавится.",
  serviceHint: "По очереди отправляет выдержки DeepSeek в видимых служебных окнах. Они закрываются после очистки. Поиск можно остановить и продолжить; пока он работает, оставьте игровой чат в покое.",
  protected: "Карточка или сцена изменены вручную. Добавление не отменено, чтобы сохранить ваши правки.",
  dependent: "От этого персонажа зависят более поздние изменения истории. Отменить только его добавление не удалось; ничего не изменено.",
  start: "Найти новых персонажей в переписке", running: "Ищем в переписке…", cancel: "Остановить поиск", read: "Показать найденные имена", refresh: "Обновить результаты", progress: "Проверено сообщений: {done} из {total}",
  finish: "Поиск завершён. Модель всё ещё может кого-то пропустить — это не доказательство полного состава.", partial: "Поиск остановлен. Готовые партии и найденные имена сохранены; следующий поиск продолжит незавершённое.",
  empty: "В записанной выбранной истории нет непроверенных имён.", proposal: "Предложение из переписки — проверьте, что это персонаж, а не место или организация.",
  name: "Имя", background: "О персонаже", quote: "Цитата из истории", approve: "Добавить в эту историю", reject: "Пропустить предложение", added: "Добавлен в эту историю", remove: "Убрать это добавление",
  edit: "Поправить перед добавлением", editHint: "Сохранённые вами имя и описание будут учитываться дальше в игре. Карточка добавляется в это прохождение, не во все миры и чаты. Возраст, числа и статус главного героя не придумываются.",
  prev: "Предыдущие имена", next: "Ещё имена", range: "Имена {from}–{to} из {total}", error: "Не удалось завершить поиск. Сохранённые анкеты и готовые партии не изменены.",
  known: "Это имя или псевдоним уже есть у сохранённого персонажа. Проверьте библиотеку или уточните имя — никто не объединён.", changed: "Выбранная история изменилась. Обновите результаты перед проверкой.", busy: "Уже выполняется операция, либо в чате есть незавершённый ответ или черновик. Завершите его перед поиском.", cleanup: "Результаты сохранены, но удаление временного чата требует проверки. Перед продолжением откройте диагностику палочек.",
};
export const characterDiscoveryText = (locale: Locale, key: keyof typeof en) => (locale === "ru" ? ru : en)[key];
export function characterDiscoveryError(error: unknown): keyof typeof en {
  const code = error instanceof Error ? error.message : error;
  return code === "character-discovery-known" ? "known" : ["story-state-conflict", "story-participant-missing"].includes(String(code)) ? "dependent" : ["story-profile-conflict", "story-manual-conflict"].includes(String(code)) ? "protected" : ["cancelled", "user-interrupted", "tab-closed"].includes(String(code)) ? "partial" : ["story-review-stale", "scene-changed", "story-binding-conflict"].includes(String(code)) ? "changed" : ["busy", "story-checkpoint-busy"].includes(String(code)) ? "busy" : ["cleanup-pending", "cleanup-required"].includes(String(code)) ? "cleanup" : "error";
}
