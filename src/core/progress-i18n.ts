import type { Locale } from "./types";
const copy = {
  ru: {
    worldTracking: "Отношения и характеристики в этом мире", lockedShort: "зафиксировано",
    undo: "Отменить последнее изменение DeepSeek", undoHint: "Вернёт прежние значения в этом черновике. Нажмите «Сохранить персонажа», чтобы применить; запись события останется в журнале.",
    duplicate: "Названия характеристик должны отличаться.",
    title: "Характеристики", hint: "До 6 шкал от 0 до 100. Название и смысл общие для мира; текущее значение и фиксация — для этого чата. Текстовые показатели выше остаются отдельно.",
    name: "Название характеристики", initial: "Начало новых чатов", current: "Сейчас в этом чате", low: "Что значит низкое значение", high: "Что значит высокое значение", cap: "Максимальное изменение за ход", lock: "Зафиксировать в этом чате", add: "Добавить характеристику", remove: "Убрать характеристику", starter: "Добавить энергию и решимость", empty: "Числовых характеристик пока нет. DeepRole не переводит старые текстовые показатели в числа сам.", editHint: "Переименование меняет подпись, но сохраняет прогресс. Смену смысла шкалы лучше оформить новой характеристикой. Удаление убирает шкалу из активного контекста, не удаляя старый журнал.",
    setup: "Добавить герою энергию и решимость", setupHint: "Энергия 70, решимость 50. Это редактируемая отправная точка, не события из истории. Другие шкалы добавляются в карточке → В сцене.",
    consequences: "Последствия хода", unchanged: "Новых числовых изменений нет", unchangedHint: "DeepSeek не предложил подходящих изменений, значения зафиксированы или уже достигли границы. Это не означает, что действие не повлияло на сюжет.", rejected: "Часть изменений не принята", rejectedHint: "Проверка цитаты, повторного события, темпа или персонажа не прошла. Для этих изменений сохранены прежние числа. Проверьте журнал в карточке; исправить значения можно вручную.",
    evidence: "Событие в истории", event: "Важное событие", reactions: "На что персонаж реагирует", reactionsHint: "Например: уважает прямоту; доверие растёт после выполненных обещаний, давление вызывает отдаление. Это ориентир для характера, не гарантированная формула очков.", progress: "Прогресс", relationHint: "Доверие и симпатия могут меняться в разные стороны. Числа влияют на тон и допустимые действия, но не заменяют характер или согласие.",
  },
  en: {
    worldTracking: "Relationships and characteristics in this world", lockedShort: "locked",
    undo: "Undo the latest DeepSeek change", undoHint: "Restores previous values in this draft. Choose Save character to apply; the event remains in the journal.",
    duplicate: "Characteristic names must be distinct.",
    title: "Characteristics", hint: "Up to 6 scales from 0 to 100. Names and meanings belong to the world; current values and locks belong to this chat. Existing text stats stay separate.",
    name: "Characteristic name", initial: "New chats start here", current: "Now in this chat", low: "What a low value means", high: "What a high value means", cap: "Maximum change per turn", lock: "Lock in this chat", add: "Add characteristic", remove: "Remove characteristic", starter: "Add energy and resolve", empty: "No numeric characteristics yet. DeepRole does not convert old text stats to numbers automatically.", editHint: "Renaming changes the label, not progress. For a new meaning, create a new characteristic. Removing a scale excludes it from active context without deleting its old journal.",
    setup: "Give the protagonist energy and resolve", setupHint: "Energy 70, resolve 50. An editable starting point, not played events. Add other scales in Character → In scene.",
    consequences: "Turn consequences", unchanged: "No new numeric changes", unchangedHint: "DeepSeek proposed no applicable changes, values are locked, or a limit was reached. This does not mean your action had no effect on the story.", rejected: "Some changes were not applied", rejectedHint: "Quote, repeated event, pace or character checks failed. Those values were kept. Check the character journal; you can correct values manually.",
    evidence: "Event in the story", event: "Important event", reactions: "What this character responds to", reactionsHint: "For example: respects honesty; kept promises build trust, pressure creates distance. Guidance for personality, not a guaranteed points formula.", progress: "Progress", relationHint: "Trust and affinity can move in different directions. Values guide tone and available actions, but never replace personality or consent.",
  },
} as const;
export type ProgressCopyKey = keyof typeof copy.en;
export function progressText(locale: Locale, key: ProgressCopyKey): string { return copy[locale][key]; }
