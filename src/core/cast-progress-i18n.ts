import type { Locale } from "./types";
export const castProgressText = (locale: Locale) => locale === "ru" ? {
  history:"История проверки ответов", ready:"Подготовка завершена успешно. Проверьте и сохраните выбранных персонажей.",
  resetReady:"План сброса подготовлен. Мир ещё не сброшен: проверьте предложения и подтвердите сброс.",
  applied:"Подготовленные изменения уже применены.",
  resolved:"Исправлено — подготовка продолжилась", repairing:"DeepSeek исправляет ответ",
  current:"Текущая ошибка — подготовка остановлена", previous:"Запись предыдущей попытки",
  historyHint:"Ниже сохранены предыдущие ошибки и попытки исправления. Они не означают, что готовый план отклонён.",
} : {
  history:"Reply validation history", ready:"Preparation completed successfully. Review and save the selected characters.",
  resetReady:"The reset plan is ready. The world has not been reset: review the proposals and confirm the reset.",
  applied:"The prepared changes have already been applied.",
  resolved:"Resolved — preparation continued", repairing:"DeepSeek is correcting the reply",
  current:"Current error — preparation stopped", previous:"Record from an earlier attempt",
  historyHint:"Earlier failures and correction attempts are kept below. They do not mean the completed plan was rejected.",
};
