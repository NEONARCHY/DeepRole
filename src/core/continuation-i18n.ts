import type { Locale } from "./types";

const copy = {
  ru: {
    title: "Продолжение истории", hint: "Одно нажатие: сохраняем состояние, открываем новый чат и отправляем продолжение. Лор, портреты, отношения и характеристики остаются в том же мире. Старый чат не удаляется.",
    detail: "В историю нового чата попадут прежний пересказ и доступная переписка до последнего события. Очень длинная или недоступная история может перенестись лишь частично.",
    saved: "Состояние сохранено", creating: "Сохраняем историю…", continue: "Продолжить в новом чате", recap: "Подготовить пересказ с DeepSeek",
    ready: "Сначала сохраните или отправьте черновик, затем повторите перенос. Черновик не изменён.",
    failed: "Не удалось подготовить перенос. Старый чат и память не изменены. Попробуйте ещё раз.",
    partial: "Часть переписки не вошла. Лор и прогресс сохранены; полная переписка остаётся в исходном чате.",
    history: "История получена из чата", page: "Только доступные на странице сообщения", source: "Открыть исходный чат",
    warnings: "Предупреждать о заполнении чата", warningHint: "Приблизительно при 90% и 97% выбранного объёма — один раз на каждом уровне для этого чата. Сообщения не блокируются.",
    capacity: "Ориентировочный объём чата, токенов", capacityHint: "Это ориентир для индикатора и предупреждений, не лимит подключённой памяти. DeepSeek может иметь другой предел.",
    warning: "Чат близок к заполнению", critical: "Места в чате почти не осталось",
    warningBody: "По нашей оценке, история занимает около {percent}% выбранного объёма. DeepSeek может перестать принимать продолжение. Лучше перенести историю заранее.",
    uncertain: "Это приблизительная оценка, не сообщение от DeepSeek. Точное число оставшихся сообщений неизвестно.",
    notNow: "Продолжить здесь", disable: "Не предупреждать", waiting: "Дождитесь завершения ответа — тогда можно перенести последнее событие.",
    carried: "Продолжение подготовлено. Первое сообщение отправьте сами — автоматическая отправка недоступна.",
    retry: "Отправить продолжение", pending: "История подключена к следующему сообщению. Если отправка не удалась, она остаётся готова к повторной попытке.",
  },
  en: {
    title: "Continue your story", hint: "One click saves the state, opens a new chat and sends a continuation. Lore, portraits, relationships and attributes stay in the same world. The old chat is not deleted.",
    detail: "The new chat receives the earlier recap and available conversation through the latest event. Very long or unavailable history may be carried over only partially.",
    saved: "Story state saved", creating: "Saving your story…", continue: "Continue in a new chat", recap: "Prepare a recap with DeepSeek",
    ready: "Save or send your draft, then try the transfer again. Your draft is untouched.",
    failed: "Could not prepare the transfer. Your old chat and memory are unchanged. Please try again.",
    partial: "Some messages did not fit. Lore and progress are preserved; the full conversation remains in the original chat.",
    history: "History read from the chat", page: "Only messages available on the page", source: "Open original chat",
    warnings: "Warn when a chat is filling up", warningHint: "At approximately 90% and 97% of your chosen capacity, once per level in this chat. Messages are never blocked.",
    capacity: "Estimated chat capacity, tokens", capacityHint: "A guide for the meter and warnings, not the attached-memory budget. DeepSeek may use a different limit.",
    warning: "This chat is nearly full", critical: "Very little room left in this chat",
    warningBody: "We estimate that the history uses about {percent}% of your chosen capacity. DeepSeek may stop accepting continuations. Consider moving your story first.",
    uncertain: "This is an estimate, not a notice from DeepSeek. The exact number of remaining messages is unknown.",
    notNow: "Stay in this chat", disable: "Turn off warnings", waiting: "Wait for the answer to finish so its latest event can be carried over.",
    carried: "Your continuation is ready. Send the first message yourself — automatic sending is unavailable.",
    retry: "Send continuation", pending: "Your story is attached to the next message. If sending fails, it stays ready for another attempt.",
  },
} as const;
export function continuationText(locale: Locale, key: keyof typeof copy.en, vars: Record<string, string | number> = {}): string {
  return Object.entries(vars).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), copy[locale][key] as string);
}
