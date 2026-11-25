import type { Locale } from "./types";
import { IS_DESKTOP } from "./chat-host";
const ru = {
 loading: "Проверяем состояние…", unavailable: "Не удалось обновить состояние. Последние полученные данные сохранены.", refresh: "Обновить состояние",
 title: "Дополнительная проверка памяти", intro: "DeepSeek дополнительно проверяет записанные сцены небольшими порциями. Обычно после 12 ходов, при большом объёме или смене сцены — раньше.",
 cost: "Расходует запросы DeepSeek. Подготовка идёт во временном окне, которое закроется после очистки. По умолчанию выключена.",
 enabled: "Включено", disabled: "Выключено", paused: "На паузе", enable: "Включить дополнительную проверку", pause: "Приостановить", resume: "Возобновить", disable: "Выключить",
 run: "Проверить накопленные сцены сейчас", retry: "Повторить незавершённый разбор", cancel: "Отменить разбор", pending: "Ходов ожидает проверки", processed: "Фрагментов полностью проверено",
 waiting: "Накапливаем новые сцены. Обычная память продолжает сохраняться.", running: "Разбор выполняется в служебном окне.", failed: "Разбор прерван. Память и необработанные сцены сохранены; автоматического повтора нет.", ready: "Партия готова. Разбор начнётся, когда чат свободен и черновик пуст.",
 inactive: "Завершите обычный игровой ход и возобновите сопровождение или запись сцен.", "service-busy": "Другая служебная операция ещё работает или ждёт очистки. Завершите её; новая партия пока не отправляется.", start: "Сначала включите сопровождение игры выше.", error: "Не удалось выполнить действие. Проверьте актуальный чат и служебное окно; память сохранена.", saved: "Настройка сохранена",
};
const en: Record<keyof typeof ru, string> = {
 loading: "Checking status…", unavailable: "Could not refresh the status. The last received data is kept.", refresh: "Refresh status",
 title: "Extra memory review", intro: "DeepSeek reviews recorded scenes in small batches, usually after 12 turns or earlier for large excerpts or a scene change.",
 cost: "Uses additional DeepSeek requests. Preparation runs in a temporary window that closes after cleanup. Off by default.",
 enabled: "Enabled", disabled: "Disabled", paused: "Paused", enable: "Enable extra memory review", pause: "Pause", resume: "Resume", disable: "Disable",
 run: "Review pending scenes now", retry: "Retry unfinished review", cancel: "Cancel review", pending: "Turns waiting for review", processed: "Fully reviewed excerpts",
 waiting: "Collecting new scenes. Normal memory is still saved.", running: "Review is running in the service window.", failed: "Review interrupted. Memory and unprocessed scenes are kept; there is no automatic retry.", ready: "A batch is ready. Review starts when the chat is idle and the draft is empty.",
 inactive: "Complete an ordinary game turn and resume accompaniment or scene recording.", "service-busy": "Another service operation is running or awaiting cleanup. Finish it first; no new batch is sent yet.", start: "Enable game accompaniment above first.", error: "Could not complete the action. Check the current chat and service window; memory is kept.", saved: "Setting saved",
};
const desktop = {
 ru: {
  cost: "Проверка использует дополнительные запросы к модели и выполняется в фоне. По умолчанию выключена.",
  running: "Проверяем сцены в фоне.",
  error: "Не удалось выполнить действие. Проверьте, открыт ли актуальный чат. Память сохранена.",
 },
 en: {
  cost: "Review uses additional model requests and runs in the background. Off by default.",
  running: "Reviewing scenes in the background.",
  error: "Could not complete the action. Check that the current chat is open. Memory is kept.",
 },
};
export const memoryBatchText = (locale: Locale) => {
 const copy = locale === "ru" ? ru : en;
 return IS_DESKTOP ? { ...copy, ...desktop[locale] } : copy;
};
