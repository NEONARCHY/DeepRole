import type { Locale } from "./types";
const copy = {
  ru: {
    behavior: "Поведение на разных стадиях", behaviorHint: "Опишите, что меняется в тоне и поступках. Заполните только нужные стадии; пустые поля не придумывают характер. Стадия — ориентир, не приказ и не согласие.",
    behaviorPlaceholder: "Например: охотнее делится планами, но не терпит давления.",
    required: "Обязательно для сближения", eventHint: "Важное событие можно оставить отдельным достижением. Включите условие ниже, только если без него сближение невозможно. Прежние условия сохранены.",
    bounds: "Границы состояний", boundsHint: "Низкое — до первой границы включительно, высокое — от второй. Между ними — среднее, без крайних эффектов. Для старых шкал используются 30 и 70; числа не изменятся.",
    lowAt: "Низкое до", highAt: "Высокое от", boundsInvalid: "Граница низкого значения должна быть меньше границы высокого.",
    low: "Низкое", middle: "Среднее", high: "Высокое",
    outlook: "Текущее состояние", outlookHint: "Сохранённые значения и их смысл передаются DeepSeek. Это ориентиры для истории, не обещание исхода и не награда за будущий выбор.",
    conditions: "Условия сближения", trustMissing: "Не хватает доверия", affinityMissing: "Не хватает симпатии", eventsMissing: "Нужны события", adultsMissing: "Совершеннолетие обоих персонажей не подтверждено", ready: "Настроенные условия выполнены. Желание, границы и обстоятельства всё ещё важны.",
    events: "Важные события", done: "Выполнено", pending: "Ещё не произошло", optional: "Достижение", mandatory: "Условие", paused: "Автоматические отношения и характеристики выключены. Ручное редактирование доступно; данные сохраняются.",
  },
  en: {
    behavior: "Behavior at each stage", behaviorHint: "Describe changes in tone and actions. Fill only the stages you need; blank fields invent no personality. A stage is guidance, not an order or consent.",
    behaviorPlaceholder: "For example: shares plans more readily, but still rejects pressure.",
    required: "Required for closeness", eventHint: "An important event can be a standalone achievement. Enable the condition below only when closeness requires it. Existing conditions are preserved.",
    bounds: "State boundaries", boundsHint: "Low includes the first boundary; high starts at the second. Between them is middle, without either extreme. Older scales use 30 and 70; values do not change.",
    lowAt: "Low up to", highAt: "High from", boundsInvalid: "The low boundary must be below the high boundary.",
    low: "Low", middle: "Middle", high: "High",
    outlook: "Current state", outlookHint: "Saved values and their meanings are shared with DeepSeek. Guidance for the story, not a promised outcome or a reward for a future choice.",
    conditions: "Conditions for closeness", trustMissing: "More trust needed", affinityMissing: "More affinity needed", eventsMissing: "Events still needed", adultsMissing: "Both characters are not confirmed adults", ready: "Configured conditions are met. Willingness, boundaries and circumstances still matter.",
    events: "Important events", done: "Completed", pending: "Has not happened yet", optional: "Achievement", mandatory: "Condition", paused: "Automatic relationships and characteristics are off. Manual editing remains available; data is kept.",
  },
} as const;
export type ImmersionCopyKey = keyof typeof copy.en;
export const immersionText = (locale: Locale, key: ImmersionCopyKey): string => copy[locale][key];
