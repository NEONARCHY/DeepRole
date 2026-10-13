import type { Locale } from "./types";

/** Presentation only. Never used to authorize a request, reply or cleanup. */
export interface FieldServicePresentation { locale: Locale; fieldLabel: string; characterName: string; kind?: "profile" | "repair" | "discovery" | "memory" }
export type FieldServiceScreenStage = "opening" | "preparing" | "reading" | "sending" | "waiting" | "thinking" | "generating" | "validating" | "repairing" | "cleanup" | "done" | "failed" | "cleanup-failed";
export function validFieldServicePresentation(value: unknown): value is FieldServicePresentation {
 if (!value || typeof value !== "object" || Array.isArray(value)) return false;
 const v = value as FieldServicePresentation;
 return Object.keys(v).length === (v.kind === "profile" || v.kind === "repair" || v.kind === "discovery" || v.kind === "memory" ? 4 : 3) && Object.keys(v).every(k => ["locale", "fieldLabel", "characterName", "kind"].includes(k)) && (v.kind === undefined || v.kind === "profile" || v.kind === "repair" || v.kind === "discovery" || v.kind === "memory") && ["ru", "en"].includes(v.locale)
  && typeof v.fieldLabel === "string" && !!v.fieldLabel.trim() && v.fieldLabel.length <= 200
  && typeof v.characterName === "string" && !!v.characterName.trim() && v.characterName.length <= 80;
}
export const fieldServiceScreenCopy = (locale: Locale) => ({
 ru: {
  title: "Подготовка поля", request: "Запрос", response: "DeepSeek", generic: "Подготовь поле персонажа",
  brief: (field: string, name: string) => `Сгенерируй описание поля «${field}» персонажа «${name}»`,
  hint: "Оставьте это окно видимым. После очистки оно закроется, а текст появится в карточке персонажа.",
  privacy: "Технический запрос, ответ и размышления скрыты в этом окне.", cancel: "Отменить запрос", reveal: "Открыть интерфейс DeepSeek",
  review: "Автоматическая очистка не подтверждена. Можно открыть DeepSeek и проверить временный чат вручную — технические данные станут видны.",
  failed: "Запрос остановлен. Подробности доступны в карточке персонажа и диагностике палочек.",
  stages: { opening: "Открываем служебный чат", preparing: "Подготавливаем выдержки и запрос", reading: "Передаём выдержки", sending: "Отправляем запрос", waiting: "Ожидаем ответ", thinking: "Размышляю", generating: "Генерирую описание", validating: "Проверяем ответ", repairing: "Исправляем формат ответа", cleanup: "Удаляем временный чат", done: "Готово", failed: "Подготовка остановлена", "cleanup-failed": "Нужна проверка временного чата" },
 },
 en: {
  title: "Preparing a field", request: "Request", response: "DeepSeek", generic: "Prepare a character field",
  brief: (field: string, name: string) => `Generate a description for “${field}” for the character “${name}”`,
  hint: "Keep this window visible. It will close after cleanup, and the text will appear in the character profile.",
  privacy: "The technical request, reply and reasoning are hidden in this window.", cancel: "Cancel request", reveal: "Open DeepSeek interface",
  review: "Automatic cleanup is not confirmed. You can open DeepSeek and check the temporary chat manually — the technical content will become visible.",
  failed: "The request stopped. Details are available in the character profile and wand diagnostics.",
  stages: { opening: "Opening the service chat", preparing: "Preparing excerpts and the request", reading: "Sending excerpts", sending: "Sending the request", waiting: "Waiting for a reply", thinking: "Thinking", generating: "Generating the description", validating: "Checking the reply", repairing: "Correcting the reply format", cleanup: "Deleting the temporary chat", done: "Done", failed: "Preparation stopped", "cleanup-failed": "Check the temporary chat" },
 },
}[locale]);

export function profileServiceScreenCopy(locale: Locale) {
 const base = fieldServiceScreenCopy(locale);
 return locale === "ru" ? { ...base, title: "Подготовка анкеты", generic: "Подготовь анкету персонажа", brief: (_field: string, name: string) => `Подготовь анкету персонажа «${name}»`,
  hint: "Оставьте окно видимым. После очистки оно закроется, а варианты появятся в расширении для проверки. Анкета не принимается автоматически.", stages: { ...base.stages, generating: "Генерируем анкету", done: "Анкета готова к проверке" },
 } : { ...base, title: "Preparing a profile", generic: "Prepare a character profile", brief: (_field: string, name: string) => `Prepare a profile for “${name}”`,
  hint: "Keep this window visible. It will close after cleanup, and suggestions will appear in the extension for review. The profile is not accepted automatically.", stages: { ...base.stages, generating: "Generating the profile", done: "Profile ready for review" },
 };
}
export function repairServiceScreenCopy(locale: Locale) {
 const base = fieldServiceScreenCopy(locale);
 return locale === "ru" ? { ...base, title: "Проверка данных ответа", generic: "Исправь данные сохранённого ответа", brief: (_field: string, _name: string) => "Исправь данные сохранённого ответа, не меняя сюжет", hint: "Оставьте окно видимым. После очистки оно закроется; пригодные данные появятся в истории DeepRole.", failed: "Коррекция остановлена. Сюжет и пригодные данные сохранены; подробности — в истории DeepRole.", stages: { ...base.stages, generating: "Уточняем данные ответа" } }
 : { ...base, title: "Checking reply metadata", generic: "Correct the saved reply metadata", brief: (_field: string, _name: string) => "Correct the saved reply metadata without changing the story", hint: "Keep this window visible. It will close after cleanup; valid data will appear in DeepRole story history.", failed: "Correction stopped. The story and valid data remain saved; see DeepRole story history for details.", stages: { ...base.stages, generating: "Checking reply metadata" } };
}
export function discoveryServiceScreenCopy(locale: Locale) {
 const base = fieldServiceScreenCopy(locale);
 return locale === "ru" ? { ...base, title: "Поиск персонажей", generic: "Найди пропущенных персонажей в переписке", brief: (_field: string, _name: string) => "Найди пропущенных персонажей в выбранной истории", hint: "Оставьте окно видимым. После очистки оно закроется; найденные имена появятся для проверки в истории DeepRole.", failed: "Поиск остановлен. Сохранённый прогресс и анкеты не изменены.", stages: { ...base.stages, reading: "Читаем выдержки истории", generating: "Ищем персонажей", done: "Имена готовы к проверке" } }
 : { ...base, title: "Finding characters", generic: "Find missed characters in the conversation", brief: (_field: string, _name: string) => "Find missed characters in the selected story", hint: "Keep this window visible. It will close after cleanup; found names will be ready to review in DeepRole story history.", failed: "Search stopped. Saved progress and profiles are unchanged.", stages: { ...base.stages, reading: "Reading story excerpts", generating: "Finding characters", done: "Names ready for review" } };
}

export function memoryServiceScreenCopy(locale: Locale) {
 const base = fieldServiceScreenCopy(locale);
 return locale === "ru" ? { ...base, title: "Проверка памяти", generic: "Проверь новые сыгранные сцены", brief: (_field: string, _name: string) => "Проверь новые сыгранные сцены и дополни память", hint: "Это отдельный запрос DeepSeek. Оставьте окно видимым: после проверки и очистки оно закроется. Пригодные сведения сохранятся, спорные появятся в «Нужно проверить».", failed: "Разбор остановлен. Прежняя память сохранена; повтор доступен в разделе «История».", stages: { ...base.stages, reading: "Читаем новые сцены", generating: "Проверяем события и персонажей", done: "Память проверена" } }
 : { ...base, title: "Checking memory", generic: "Review new played scenes", brief: (_field: string, _name: string) => "Review new played scenes and fill memory gaps", hint: "This is an extra DeepSeek request. Keep the window visible; it closes after validation and cleanup. Suitable details are saved; uncertain proposals appear under Review needed.", failed: "Analysis stopped. Existing memory is kept; retry in Story.", stages: { ...base.stages, reading: "Reading new scenes", generating: "Checking events and characters", done: "Memory reviewed" } };
}

/** The same surface, without field/name or per-profile promises for a roster. */
export function castServiceScreenCopy(locale: Locale) {
 const base = fieldServiceScreenCopy(locale);
 return locale === "ru" ? { ...base,
  title: "Персонажи из лора", generic: "Подготовь персонажей по лору",
  hint: "Оставьте окно видимым. После очистки оно закроется, а анкеты появятся для проверки в DeepRole.",
  failed: "Подготовка остановлена. Сохранённые анкеты не изменились. Подробности — в разделе «Персонажи из лора».",
  stages: { ...base.stages, reading: "Читаем лор", generating: "Генерируем анкеты", repairing: "Исправляем формат анкет", done: "Анкеты готовы к проверке" },
 } : { ...base,
  title: "Characters from lore", generic: "Prepare characters from the lore",
  hint: "Keep this window visible. It will close after cleanup, and the profiles will be available for review in DeepRole.",
  failed: "Preparation stopped. Saved profiles are unchanged. Details are in Characters from lore.",
  stages: { ...base.stages, reading: "Reading the lore", generating: "Generating profiles", repairing: "Correcting the profile format", done: "Profiles ready for review" },
 };
}

/** Preparing a proposal is never the destructive reset itself. */
export function resetServiceScreenCopy(locale: Locale) {
 const base = fieldServiceScreenCopy(locale);
 return locale === "ru" ? { ...base,
  title: "Подготовка сброса мира", generic: "Подготовь план возврата мира к началу истории",
  hint: "Оставьте окно видимым. После очистки оно закроется, а план появится в DeepRole. Мир пока не меняется: после проверки нужны два подтверждения.",
  failed: "План сброса не подготовлен. Мир не изменён. Подробности — в окне «Полный сброс мира по лору».",
  stages: { ...base.stages, preparing: "Готовим запрос сброса", reading: "Проверяем исходный лор", generating: "Готовим исходные состояния и очистку памяти", repairing: "Исправляем формат плана сброса", done: "План сброса готов к проверке", failed: "Подготовка сброса остановлена" },
 } : { ...base,
  title: "Preparing a world reset", generic: "Prepare a plan to return the world to the story opening",
  hint: "Keep this window visible. It will close after cleanup, and the plan will appear in DeepRole. The world is unchanged: review and two confirmations are required.",
  failed: "The reset plan could not be prepared. The world is unchanged. See Full world reset from lore for details.",
  stages: { ...base.stages, preparing: "Preparing the reset request", reading: "Checking the original lore", generating: "Preparing starting states and memory cleanup", repairing: "Correcting the reset plan format", done: "Reset plan ready for review", failed: "Reset preparation stopped" },
 };
}
