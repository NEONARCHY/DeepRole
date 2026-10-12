import type { Locale } from "./types";

const en = {
 worker: "Last worker step", workerVisibility: "Page visibility", workerAt: "Step recorded",
 worker_opening: "Opening service window", worker_ready: "Composer found", worker_sending: "Dispatch claimed before clicking Send", worker_waitingReply: "Waiting for reply in the page", worker_replyReceived: "Reply read; validation follows", worker_cleanup: "Removing temporary chat", worker_finished: "Worker finished cleanup attempt",
 visibility_visible: "Visible page", visibility_hidden: "Hidden page", visibility_unknown: "Not recorded",
 title: "Wand and character preparation diagnostics",
 hint: "Reads local operation records, including records kept after temporary chats are deleted. Does not send requests, retry work or change data.",
 limit: "These are local records, not proof that a DeepSeek reply finished or that a profile was saved. Saved validation reasons are included when available. Missing information or conflicting sources do not mean a technical failure.",
 validation: "Reply validation reasons", validationHint: "These are rejected attempts, including format correction. A later successful result does not erase them.",
 validationAttempt: "Step {step} · {attempt}", validationOriginal: "Original reply", validationRepair: "Format correction", validationRule: "Protocol rule", validationActual: "Received shape",
 validationFieldAttempt: "Field reply check", validationFieldHint: "Reasons why this text was not accepted. These records do not change your field or repeat the request.",
 validationExcluded: "Checks excluded by the safety filter: {count}", validationMissing: "A detailed reason was not saved for this operation. Do not infer it from the general error code.",
 check: "Read operation report", again: "Refresh report", checking: "Reading records…", copy: "Copy report", copied: "Report copied",
 manual: "Copying is unavailable. Select and copy the report below.", report: "Operation diagnostic report",
 privacy: "The report contains categories, stages, allowed error codes, times, random request IDs and fixed validation rules with field paths and value types or lengths. No values, lore, profiles, replies, chat or world IDs, URLs or tokens.",
 checked: "Snapshot: {date}", snapshotHint: "Records can change during the check. Saved records and the queue are shown separately; their counts are not added together.",
 journal: "Saved records", pending: "Updates in the queue", invalid: "Records excluded by the safety check",
 journalRead: "Saved operation records read", locked: "The vault is locked. Unlock it and refresh to read saved records. Pending updates can still be checked.",
 journalUnavailable: "Saved records could not be read. Refresh the report; do not repeat generation just for this check.",
 pendingUnavailable: "Queued updates could not be read. An empty queue has not been confirmed.",
 pendingHint: "Updates remain in the queue; some may already be in the journal. This check does not deliver or remove them, or retry generation.",
 invalidHint: "Some records failed the safety check. Their contents are excluded from the screen and report.",
 empty: "No registered operations or pending updates were found. Older tools without records are not included.",
 details: "Operation details", journalDetails: "Saved operation records", pendingDetails: "Queued operation updates",
 restoredHint: "Restored from backup: historical record only, not active work. Refreshing does not restart it.",
 omitted: "Showing {shown} of {total} records, newest first. This report limit does not limit your library.",
 unknown: "Unavailable", request: "Request", legacyId: "Legacy ID omitted", phase: "Stage", cleanup: "Temporary chat cleanup", error: "Error code",
 operation_characterField: "Character field", operation_castPreparation: "Character preparation", operation_storyRepair: "Story metadata correction", operation_characterDiscovery: "Finding missed characters",
 phase_prepared: "Registered", phase_dispatching: "Sending started locally", phase_result: "Prepared result received", phase_failed: "Stopped with an error",
 cleanup_pending: "Not confirmed", cleanup_done: "Confirmed", cleanup_failed: "Failed",
 mode_history: "Use existing facts", mode_suggest: "Suggest new text",
 scope_profile: "Profile", scope_scene: "Scene", scope_relationship: "Relationship", scope_attribute: "Attribute", scope_selfie: "Image plan", scope_milestone: "Milestone", scope_cast: "Cast", scope_story: "Story reply",
 error_validation: "The reply failed the format or evidence check.", error_partial: "The reply was incomplete. Check the preparation window for any recovered profiles.",
 error_locked: "The operation stopped while the vault was locked.", error_cancelled: "The operation was cancelled or interrupted.",
 error_context: "The chat, world or available facts did not meet the operation requirements.",
 error_timeout: "A usable reply was not received in time.", error_cleanup: "Temporary chat cleanup needs attention.",
 error_other: "The operation could not finish. The fixed code below helps identify the cause.",
 error_missingFacts: "DeepSeek did not find enough information in the supplied sources. The field is unchanged.", error_conflict: "DeepSeek reported conflicting sources. The field is unchanged.", error_long: "The reply exceeds the field limit. The field is unchanged.",
} as const;
const ru: Record<keyof typeof en, string> = {
 worker: "Последний шаг палочки", workerVisibility: "Видимость страницы", workerAt: "Шаг отмечен",
 worker_opening: "Открытие служебного окна", worker_ready: "Поле сообщения найдено", worker_sending: "Отправка зарегистрирована до нажатия кнопки", worker_waitingReply: "Ожидание ответа на странице", worker_replyReceived: "Ответ прочитан; далее проверка", worker_cleanup: "Удаление временного чата", worker_finished: "Попытка очистки закончена",
 visibility_visible: "Страница видима", visibility_hidden: "Страница скрыта", visibility_unknown: "Не отмечена",
 title: "Диагностика палочек и подготовки персонажей",
 hint: "Читает локальные отметки операций, в том числе после удаления временных чатов. Не отправляет запросы, не повторяет работу и не меняет данные.",
 limit: "Это локальные отметки, а не доказательство завершения ответа DeepSeek или сохранения анкеты. Сохранённые причины проверки включены, если они есть. Нехватка сведений или противоречия в источниках не означают техническую поломку.",
 validation: "Причины проверки ответа", validationHint: "Это отклонённые попытки, включая исправление формата. Более поздний успех их не стирает.",
 validationAttempt: "Шаг {step} · {attempt}", validationOriginal: "Первый ответ", validationRepair: "Исправление формата", validationRule: "Правило протокола", validationActual: "Полученная структура",
 validationFieldAttempt: "Проверка ответа палочки", validationFieldHint: "Причины, по которым текст не был принят. Эти отметки не меняют поле и не повторяют запрос.",
 validationExcluded: "Исключено проверкой безопасности: {count}", validationMissing: "Подробная причина для этой операции не сохранена. Не стоит угадывать её по общему коду ошибки.",
 check: "Прочитать отчёт операций", again: "Обновить отчёт", checking: "Читаем отметки…", copy: "Скопировать отчёт", copied: "Отчёт скопирован",
 manual: "Копирование недоступно. Выделите и скопируйте отчёт ниже.", report: "Отчёт диагностики операций",
 privacy: "В отчёте — категории, этапы, разрешённые коды ошибок, время, случайные ID запросов и фиксированные правила проверки: путь поля, тип или длина значения. Без самих значений, лора, анкет, ответов, ID чатов и миров, адресов и токенов.",
 checked: "Снимок: {date}", snapshotHint: "Во время проверки отметки могут обновиться. Журнал и очередь показаны отдельно; их количества не складываются.",
 journal: "Сохранено операций", pending: "Отметки в очереди", invalid: "Записи, исключённые проверкой безопасности",
 journalRead: "Сохранённые отметки прочитаны", locked: "Сейф закрыт. Откройте его и обновите отчёт, чтобы прочитать журнал. Ожидающие записи можно проверить и сейчас.",
 journalUnavailable: "Не удалось прочитать журнал. Обновите отчёт; повторять генерацию ради этой проверки не нужно.",
 pendingUnavailable: "Не удалось прочитать очередь отметок. Пустая очередь не подтверждена.",
 pendingHint: "В очереди есть отметки; часть уже может быть в журнале. Проверка не доставляет и не удаляет их, не повторяет генерацию.",
 invalidHint: "Некоторые записи не прошли проверку безопасности. Их содержимое исключено из экрана и отчёта.",
 empty: "Зарегистрированных операций и ожидающих записей не найдено. Старые инструменты без отметок сюда не входят.",
 details: "Подробности операций", journalDetails: "Сохранённые операции", pendingDetails: "Очередь служебных отметок",
 restoredHint: "Восстановлено из резервной копии: только история, не текущая работа. Обновление отчёта её не запускает.",
 omitted: "Показано {shown} из {total}, сначала новые. Ограничен только отчёт, не ваша библиотека.",
 unknown: "Недоступно", request: "Запрос", legacyId: "Старый ID не включён", phase: "Этап", cleanup: "Удаление временного чата", error: "Код ошибки",
 operation_characterField: "Поле персонажа", operation_castPreparation: "Подготовка персонажей", operation_storyRepair: "Коррекция данных ответа", operation_characterDiscovery: "Поиск пропущенных персонажей",
 phase_prepared: "Зарегистрировано", phase_dispatching: "Отправка начата локально", phase_result: "Получен подготовленный результат", phase_failed: "Остановлено с ошибкой",
 cleanup_pending: "Не подтверждено", cleanup_done: "Подтверждено", cleanup_failed: "Не удалось",
 mode_history: "Взять известные факты", mode_suggest: "Предложить новый текст",
 scope_profile: "Анкета", scope_scene: "Сцена", scope_relationship: "Отношения", scope_attribute: "Характеристика", scope_selfie: "План изображения", scope_milestone: "Событие", scope_cast: "Состав", scope_story: "Ответ истории",
 error_validation: "Ответ не прошёл проверку формата или подтверждений.", error_partial: "Ответ был неполным. Готовые части, если они есть, доступны в окне подготовки.",
 error_locked: "Операция остановлена при закрытом сейфе.", error_cancelled: "Операция отменена или прервана.",
 error_context: "Чат, мир или доступные факты не соответствовали условиям операции.",
 error_timeout: "Не удалось вовремя получить пригодный ответ.", error_cleanup: "Удаление временного чата требует проверки.",
 error_other: "Не удалось завершить операцию. Фиксированный код ниже поможет определить причину.",
 error_missingFacts: "DeepSeek не нашёл достаточно сведений в переданных источниках. Поле не изменено.", error_conflict: "DeepSeek сообщил о противоречии в источниках. Поле не изменено.", error_long: "Ответ длиннее лимита поля. Поле не изменено.",
};
export type ServiceDiagnosticsTextKey = keyof typeof en;
export const serviceDiagnosticsText = (locale: Locale, key: ServiceDiagnosticsTextKey): string => (locale === "ru" ? ru : en)[key];
export function serviceDiagnosticErrorKey(code: string): ServiceDiagnosticsTextKey {
 if (code === "facts-not-found") return "error_missingFacts";
 if (code === "conflicting-facts") return "error_conflict";
 if (code === "text-too-long") return "error_long";
 if (["invalid-result", "invalid-evidence", "invalid-brief"].includes(code)) return "error_validation";
 if (code === "partial-reply") return "error_partial";
 if (code === "vault-locked") return "error_locked";
 if (["cancelled", "interrupted", "user-interrupted", "tab-closed"].includes(code)) return "error_cancelled";
 if (["reply-timeout", "request-failed"].includes(code)) return "error_timeout";
 if (["cleanup-pending", "cleanup-required"].includes(code)) return "error_cleanup";
 if (["scene-changed", "chat-changed", "world-unavailable", "world-missing", "facts-not-found", "conflicting-facts", "not-empty-chat", "draft-not-empty"].includes(code)) return "error_context";
 return "error_other";
}
