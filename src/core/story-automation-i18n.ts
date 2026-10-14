import type { Locale } from "./types";
const ru = {
  loading: "Проверяем новые предложения…",
  title: "Сопровождение игры", mode: "Как сохранять новые сведения", automatic: "Автоматически", review: "С подтверждением", off: "Пауза",
  intro: "Новые сведения приходят вместе с обычным ответом DeepSeek. Дополнительных запросов и служебных окон нет.",
  automaticHint: "Подходящие факты и сведения о персонажах сохраняются сами. Противоречия и неоднозначные имена остаются на проверке; исходный лор сохраняется.",
  reviewHint: "DeepSeek предлагает факты и дополнения. Вы выбираете, что сохранить. Текущее состояние сцены обновляется отдельно.", offHint: "Автоматическое накопление памяти и дополнения анкет приостановлены. Уже сохранённые данные и обновление текущей сцены остаются.",
  start: "Включить автоматическую память", startHint: "Запись начнётся с текущего момента. Старые сцены не считаются заново. Разобрать прежнюю историю можно отдельно.",
  saving: "Сохраняем…", saved: "Режим сохранён", failed: "Не удалось сменить режим. Проверьте открытый чат и повторите; данные сохранены.",
  superseded: "Заменено более поздним значением. Сохраняется в журнале; в текущую память не подставляется.", autoSaved: "Сохранено автоматически", check: "Требуется проверка", duplicate: "Уже есть в памяти", dismissed: "Отклонено вами", new: "Есть прямая цитата из сыгранной сцены", manual: "Решение остаётся за вами", uncertain: "Смысл или уверенность требуют проверки", conflict: "Есть противоречие с сохранёнными сведениями", protected: "Затронут возраст или защищённое поле", unverified: "Недостаточно данных для автоматического принятия", limit: "Дополнение не помещается в поле", identity: "Не удалось однозначно определить персонажа",
  fact: "Новый факт", personTarget: "Кому добавить сведения", newPerson: "Новый персонаж", personName: "Имя нового персонажа", addFields: "Добавить выбранные сведения к анкете", searchPeople: "Найти существующего персонажа", search: "Найти",
  protect: "Защита анкеты", protectHint: "Выберите поля, которые нужно менять только вручную или после проверки. Автоматические дополнения не изменят их. Применяется после сохранения персонажа.",
  inbox: "Нужно проверить", inboxHint: "Эти предложения ждут вашего решения и пока не меняют текущую память. Проверьте источник и выберите, что сохранить.",
  accept: "Сохранить", decline: "Пропустить", refresh: "Обновить", source: "Цитата из истории", empty: "Новых вопросов на проверку нет", next: "Следующие предложения", readyScene: "Сначала завершите обычную сцену в этом чате, чтобы связать решение с текущей историей.",
};
const en: Record<keyof typeof ru, string> = {
  loading: "Checking new proposals…",
  title: "Game accompaniment", mode: "How to save new details", automatic: "Automatic", review: "With confirmation", off: "Paused",
  intro: "New details arrive with normal DeepSeek replies. No extra requests or service windows.",
  automaticHint: "Suitable facts and character details are saved automatically. Conflicts and ambiguous names await review; original lore is preserved.", reviewHint: "DeepSeek proposes facts and additions. You choose what to save. Current scene state updates separately.", offHint: "Automatic memory accumulation and profile additions are paused. Saved data and current scene updates remain available.",
  start: "Enable automatic memory", startHint: "Recording begins at the current moment. Earlier scenes are not counted again. You can analyze previous history separately.", saving: "Saving…", saved: "Mode saved", failed: "Could not change mode. Check the open chat and retry; data is preserved.",
  superseded: "Superseded by a later value. Kept in the journal; not inserted as current memory.", autoSaved: "Saved automatically", check: "Needs review", duplicate: "Already in memory", dismissed: "Dismissed by you", new: "Supported by an exact played-scene quote", manual: "Your decision is needed", uncertain: "Meaning or certainty needs checking", conflict: "Conflicts with saved details", protected: "Touches an age or protected field", unverified: "Insufficient evidence for automatic acceptance", limit: "The addition does not fit the field", identity: "The character could not be identified unambiguously",
  fact: "New fact", personTarget: "Add details to", newPerson: "New character", personName: "New character name", addFields: "Append selected details to the profile", searchPeople: "Find an existing character", search: "Find",
  protect: "Profile protection", protectHint: "Choose fields to change only manually or after review. Automatic additions will not modify them. Applies when you save the character.",
  inbox: "Review needed", inboxHint: "These proposals await your decision and do not change current memory yet. Check the source and choose what to save.", accept: "Save", decline: "Skip", refresh: "Refresh", source: "Story quote", empty: "No new items need review", next: "Next proposals", readyScene: "Complete an ordinary scene in this chat first, so the decision can be linked to the current story.",
};
export const storyAutomationText = (locale: Locale) => locale === "ru" ? ru : en;
