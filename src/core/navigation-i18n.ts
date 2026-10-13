import type { Locale } from "./types";

const ru = {
  play: "Игра", worlds: "Миры", story: "Память игры", settings: "Настройки",
  intro: "Для обычной игры менять настройки не требуется. Выберите, что хотите настроить.",
  everyday: "Удобство", optional: "Дополнительные возможности", dataGroup: "Ваши данные",
  advanced: "Расширенные настройки", advancedHint: "Подбор памяти и диагностика. Открывайте, если хотите изменить работу памяти или разобраться со сбоем.",
  back: "Все настройки", app: "Интерфейс и язык", appHint: "Размер панелей, язык, индикаторы и напоминания.",
  appearance: "Отображение в чате", appearanceHint: "Портреты и показ размышлений DeepSeek.",
  characters: "Действия персонажей", charactersHint: "Стандартные состояния и действия в карточках.",
  images: "Генерация изображений", imagesHint: "Подключение сервиса изображений. Для текстовой игры не требуется.",
  data: "Резервные копии и защита", dataHint: "Экспорт, восстановление, шифрование и подтверждение удаления.",
  memory: "Подбор и обновление памяти", memoryHint: "Бюджет добавки, правила отбора и служебные инструкции.",
  diagnostics: "Диагностика", diagnosticsHint: "Проверки связи и отчёты служебных запросов.",
  globalScope: "Настройки интерфейса общие для всех миров и чатов.",
  worldScope: "Подбор памяти — для мира «{name}». Инструкции обновления — общие для всех миров.",
  characterScope: "Список действий — для мира «{name}». Остальные параметры карточек — общие.",
  defaultScope: "Общие настройки. Параметры отдельных миров могут их переопределять.",
  memoryNotice: "Эти параметры не увеличивают окно контекста DeepSeek. Режим сохранения новых событий выбирается в «Памяти игры».",
  dataNotice: "Перед восстановлением или изменением защиты сохраните резервную копию. Восстановление предложит выбрать способ применения данных.",
  openWorlds: "Открыть миры",
} as const;
const en: Record<keyof typeof ru, string> = {
  play: "Play", worlds: "Worlds", story: "Story memory", settings: "Settings",
  intro: "You do not need to change settings to play. Choose what you want to configure.",
  everyday: "Comfort", optional: "Optional features", dataGroup: "Your data",
  advanced: "Advanced settings", advancedHint: "Memory selection and diagnostics. Open these to adjust memory behavior or investigate a problem.",
  back: "All settings", app: "Interface and language", appHint: "Panel size, language, indicators and reminders.",
  appearance: "Chat display", appearanceHint: "Portraits and DeepSeek reasoning visibility.",
  characters: "Character actions", charactersHint: "Default states and actions in character cards.",
  images: "Image generation", imagesHint: "Connect an image service. Not required for text roleplay.",
  data: "Backups and protection", dataHint: "Export, restore, encryption and deletion confirmation.",
  memory: "Memory selection and updates", memoryHint: "Added-context budget, selection rules and service instructions.",
  diagnostics: "Diagnostics", diagnosticsHint: "Connection checks and service-request reports.",
  globalScope: "Interface settings apply to all worlds and chats.",
  worldScope: "Memory selection applies to {name}. Update instructions apply to all worlds.",
  characterScope: "The action list applies to {name}. Other character-card preferences are general settings.",
  defaultScope: "General settings. Individual worlds may override them.",
  memoryNotice: "These settings do not expand DeepSeek's context window. Choose how new events are saved in Story memory.",
  dataNotice: "Save a backup before restoring data or changing protection. Restore will let you choose how to apply the data.",
  openWorlds: "Open worlds",
};
export type SettingsSection = "home" | "app" | "appearance" | "characters" | "images" | "data" | "memory" | "diagnostics";
export function navigationText(locale: Locale, key: keyof typeof ru) { return (locale === "ru" ? ru : en)[key]; }
