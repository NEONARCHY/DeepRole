import type { Locale } from "./types";
const ru = {
 title: "Дополнительная проверка памяти", intro: "Отдельный запрос DeepSeek проверяет небольшую партию новых записанных сцен. Обычно после 12 игровых ходов; при большом объёме или смене сцены — раньше. Весь лор не отправляется.",
 cost: "Использует дополнительные запросы и лимиты DeepSeek. Откроется видимое служебное окно с плашками; после очистки оно закроется. По умолчанию выключено.",
 enabled: "Включено", disabled: "Выключено", paused: "На паузе", enable: "Включить дополнительную проверку", pause: "Приостановить", resume: "Возобновить", disable: "Выключить",
 run: "Проверить накопленные сцены сейчас", retry: "Повторить незавершённый разбор", cancel: "Отменить разбор", pending: "Ходов ожидает проверки", processed: "Фрагментов полностью проверено",
 waiting: "Накапливаем новые сцены. Обычная память продолжает сохраняться.", running: "Разбор выполняется в служебном окне.", failed: "Разбор прерван. Память и необработанные сцены сохранены; автоматического повтора нет.", ready: "Партия готова. Разбор начнётся, когда чат свободен и черновик пуст.",
 inactive: "Завершите обычный игровой ход и возобновите сопровождение или запись сцен.", "service-busy": "Другая служебная операция ещё работает или ждёт очистки. Завершите её; новая партия пока не отправляется.", start: "Сначала включите сопровождение игры выше.", error: "Не удалось выполнить действие. Проверьте актуальный чат и служебное окно; память сохранена.", saved: "Настройка сохранена",
};
const en: Record<keyof typeof ru, string> = {
 title: "Extra memory review", intro: "An extra DeepSeek request reviews a small batch of newly recorded scenes. Usually after 12 game turns; earlier for large excerpts or a scene change. It does not send the whole lore.",
 cost: "Uses additional DeepSeek requests and limits. A visible service window with progress cards opens and closes after cleanup. Disabled by default.",
 enabled: "Enabled", disabled: "Disabled", paused: "Paused", enable: "Enable extra memory review", pause: "Pause", resume: "Resume", disable: "Disable",
 run: "Review pending scenes now", retry: "Retry unfinished review", cancel: "Cancel review", pending: "Turns waiting for review", processed: "Fully reviewed excerpts",
 waiting: "Collecting new scenes. Normal memory is still saved.", running: "Review is running in the service window.", failed: "Review interrupted. Memory and unprocessed scenes are kept; there is no automatic retry.", ready: "A batch is ready. Review starts when the chat is idle and the draft is empty.",
 inactive: "Complete an ordinary game turn and resume accompaniment or scene recording.", "service-busy": "Another service operation is running or awaiting cleanup. Finish it first; no new batch is sent yet.", start: "Enable game accompaniment above first.", error: "Could not complete the action. Check the current chat and service window; memory is kept.", saved: "Setting saved",
};
export const memoryBatchText = (locale: Locale) => locale === "ru" ? ru : en;
