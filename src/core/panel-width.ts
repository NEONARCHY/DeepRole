import type { Locale } from "./types";

export const DEFAULT_PANEL_WIDTH = 224;
export const MIN_PANEL_WIDTH = 200;
export const MAX_PANEL_WIDTH = 360;
export function panelWidth(value?: number): number {
  return Number.isFinite(value) ? Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, Math.round(value!))) : DEFAULT_PANEL_WIDTH;
}
export const panelWidthCopy = (locale: Locale) => ({
  ru: { title: "Ширина всех панелей", hint: "Одна ширина для панелей под названием чата. В узком окне они становятся компактными кнопками.", reset: "Стандартная ширина", saved: "Ширина сохранена", failed: "Не удалось сохранить ширину. Попробуйте снова.", unit: "px" },
  en: { title: "Width of all panels", hint: "One width for the panels below the chat title. In a narrow window, they become compact buttons.", reset: "Default width", saved: "Width saved", failed: "Couldn’t save the width. Try again.", unit: "px" },
}[locale]);
