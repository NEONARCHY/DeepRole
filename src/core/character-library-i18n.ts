import type { Locale } from "./types";
const en = { group: "Library pages", prev: "Previous", next: "Next", range: "Showing {from}–{to} of {total}" };
const ru: Record<keyof typeof en, string> = { group: "Страницы библиотеки", prev: "Назад", next: "Дальше", range: "Показаны {from}–{to} из {total}" };
export const characterLibraryText = (locale: Locale, key: keyof typeof en) => (locale === "ru" ? ru : en)[key];
