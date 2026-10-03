import type { Locale } from "./types";
const copy = {
  ru: { title: "Экспорт", world: "Этот мир", worldHint: "Лор, персонажи, портреты и эмоции. Без текущей сцены чата.", backup: "Полная резервная копия", backupHint: "Все миры, настройки и сохранённые состояния чатов.", choose: "Мир для экспорта", password: "Защитить паролем", passwordLabel: "Пароль для копии", save: "Скачать файл", saving: "Готовим файл…", close: "Закрыть", failed: "Не удалось создать файл. Попробуйте ещё раз.", emotionScope: "Эмоции мира: {name}" },
  en: { title: "Export", world: "This world", worldHint: "Lore, characters, portraits and emotions. Excludes the current chat scene.", backup: "Full backup", backupHint: "All worlds, settings and saved chat states.", choose: "World to export", password: "Protect with a password", passwordLabel: "Backup password", save: "Download file", saving: "Preparing file…", close: "Close", failed: "Couldn’t create the file. Try again.", emotionScope: "World emotions: {name}" },
} as const;
export const exportText = (locale: Locale, key: keyof typeof copy.en) => copy[locale][key];
