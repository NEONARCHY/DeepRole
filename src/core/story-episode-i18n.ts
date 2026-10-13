import type { Locale } from "./types";
export const storyEpisodeText = (locale: Locale) => locale === "ru" ? {
  title: "Сводки эпизодов", hint: "Собираются автоматически из принятой памяти по 12 записанным репликам. Номер эпизода — порядок сцен, а не игровой день.",
  history: "Давние позиции и действия относятся к своим сценам. Обещания и незавершённые дела сохраняются до подтверждённого изменения.",
  time: "Последняя метка времени", timeUnknown: "Игровое время пока не подтверждено.", elapsed: "Это переход из исходной сцены. Точная дата из него не вычисляется.",
  earlierScene: "Временное состояние из прежней сцены", lastKnown: "Временное: последнее известное состояние", persistent: "Постоянные сведения", timeUnplaced: "Время этого состояния неизвестно",
  ended: "Обстоятельство завершено в истории",
  empty: "Сводки появятся после сохранения игровых фактов.", episode: "Эпизод {number}", unplaced: "Ранее сохранённая память", unknown: "Порядок исходных сцен пока неизвестен.",
  turns: "Записанных реплик: {count}", facts: "Фактов в сводке: {count}", source: "Исходная реплика", more: "Показать более ранние эпизоды", search: "Найти в сводках", noMatch: "Подходящих фактов не найдено.",
} : {
  title: "Episode summaries", hint: "Built automatically from accepted memory in portions of 12 recorded turns. Episode numbers mark scene order, not game days.",
  history: "Earlier positions and actions belong to their source scenes. Promises and unfinished tasks remain until a confirmed change.",
  time: "Latest time marker", timeUnknown: "Game time has not been confirmed yet.", elapsed: "This is a transition from its source scene. It does not establish an exact date.",
  earlierScene: "Temporary state from an earlier scene", lastKnown: "Temporary: last known state", persistent: "Lasting information", timeUnplaced: "The time of this state is unknown",
  ended: "Circumstance ended in the story",
  empty: "Summaries appear after game facts are saved.", episode: "Episode {number}", unplaced: "Previously saved memory", unknown: "The order of these source scenes is not known yet.",
  turns: "Recorded turns: {count}", facts: "Facts in summary: {count}", source: "Original turn", more: "Show earlier episodes", search: "Find in summaries", noMatch: "No matching facts found.",
};
