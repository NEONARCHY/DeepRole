import type { Locale } from "./types";
const en = {
 title: "Names and aliases", hint: "Names approved in this lore’s shared game, including names carried between chats. World profiles stay unchanged.",
 read: "Show linked names", refresh: "Refresh names", inherited: "Carried from the starting point", current: "Linked in this story", empty: "No borrowed names yet.",
 active: "Used in this story", disabled: "Turned off in this story", changed: "The profile was renamed or its aliases changed. Review this link again.", ambiguous: "Another person also claims this name. It is not used for matching.", missing: "The original profile is unavailable.", canonical: "This name belongs to the world profile. Edit it in that profile.",
 enable: "Use this name", disable: "Stop using this name", paused: "Recording is paused. Resume it before changing names.", scope: "This changes the shared game of this lore, including continuation chats. Original world aliases are kept.",
 prev: "Previous names", next: "More names", saved: "Name preference saved", error: "Could not change the link. Refresh the list and try again.", busy: "Working…",
};
const ru: Record<keyof typeof en, string> = {
 title: "Имена и псевдонимы", hint: "Имена, подтверждённые в общей игре этого лора, включая перенесённые между чатами. Анкеты мира остаются прежними.",
 read: "Показать связанные имена", refresh: "Обновить имена", inherited: "Перенесено из исходной точки", current: "Связано в этой истории", empty: "Пока нет заимствованных имён.",
 active: "Используется в этой истории", disabled: "Отключено в этой истории", changed: "Название или псевдонимы анкеты изменились. Проверьте связь заново.", ambiguous: "Это имя есть и у другого персонажа. Оно не используется для подбора.", missing: "Исходная анкета недоступна.", canonical: "Это имя принадлежит анкете мира. Менять его нужно в самой анкете.",
 enable: "Использовать это имя", disable: "Не использовать это имя", paused: "Запись приостановлена. Возобновите её перед изменением имён.", scope: "Изменится общая игра этого лора, включая чаты продолжения. Исходные псевдонимы анкет сохранятся.",
 prev: "Предыдущие имена", next: "Ещё имена", saved: "Настройка имени сохранена", error: "Не удалось изменить связь. Обновите список и попробуйте снова.", busy: "Обрабатываем…",
};
export const storyIdentityText = (locale: Locale, key: keyof typeof en) => (locale === "ru" ? ru : en)[key];
