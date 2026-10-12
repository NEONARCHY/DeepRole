import type { Locale } from "./types";
const ru = {
 title:"Сюжетные задачи",hint:"Обещания и планы остаются открытыми, пока выбранная история не подтвердит выполнение или отмену. Сомнения — в «Нужно проверить».",unlinked:"Обещания и планы без связи с задачей",unlinkedHint:"Эти прежние записи ещё не сопоставлены с выполнением. Они не считаются ни открытыми, ни завершёнными задачами.",
 empty:"Открытых задач пока нет",search:"Найти сюжетную задачу",open:"Не завершено",completed:"Выполнено",cancelled:"Отменено",closed:"Завершённые и отменённые",source:"Цитата из истории",more:"Показать ещё",noMatch:"Ничего не найдено",
 before:"Ранее в памяти",after:"Новое предложение",replace:"Принять новую версию",keep:"Оставить прежнюю",replaceHint:"Новая версия заменит показанные записи только в памяти этой игры. Цитаты и исходный лор сохранятся.",taskChanged:"Состояние задачи изменилось"
};
const en: Record<keyof typeof ru,string> = {
 title:"Story tasks",hint:"Promises and plans remain open until the selected story confirms fulfillment or cancellation. Uncertain changes appear in Review needed.",unlinked:"Promises and plans not linked to a task",unlinkedHint:"These earlier records have not been matched to fulfillment. They count as neither open nor completed tasks.",
 empty:"No open tasks yet",search:"Find a story task",open:"Unfinished",completed:"Completed",cancelled:"Cancelled",closed:"Completed and cancelled",source:"Story quote",more:"Show more",noMatch:"Nothing found",
 before:"Previously in memory",after:"New proposal",replace:"Use the new version",keep:"Keep the previous version",replaceHint:"The new version replaces the shown records in this game's memory only. Quotes and original lore remain intact.",taskChanged:"Task status changed"
};
export const storyTaskText = (locale: Locale) => locale === "ru" ? ru : en;
