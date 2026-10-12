import type {Locale} from "./types";
const ru={
 title:"Что добавит DeepRole",estimate:"Приблизительный размер, не оставшийся контекст DeepSeek.",total:"Всего",limit:"Лимит",required:"Обязательная часть",lore:"Записи лора",profiles:"Фрагменты анкет",facts:"Игровые факты и задачи",continuation:"Фрагменты предыдущего чата",omitted:"Не включено в этот запрос",overflow:"Обязательные правила, текущая сцена или закреплённые данные превышают лимит. Они сохранены целиком. Увеличьте лимит в настройках памяти или вручную сократите закреплённые данные.",local:"Подбор локальный: слова, имена и настроенные связи. Это не поиск по смыслу и не гарантия, что модель учтёт сведения."
};
const en:Record<keyof typeof ru,string>={
 title:"What DeepRole adds",estimate:"Approximate size, not DeepSeek's remaining context.",total:"Total",limit:"Budget",required:"Required portion",lore:"Lore entries",profiles:"Profile excerpts",facts:"Game facts and tasks",continuation:"Previous-chat excerpts",omitted:"Not included in this request",overflow:"Required rules, current scene or pinned data exceed the budget. They are kept intact. Increase the memory budget or shorten pinned data manually.",local:"Local selection uses words, names and configured links. It is not semantic search or a guarantee that the model follows the details."
};
export const contextBudgetText=(locale:Locale)=>locale==="ru"?ru:en;
