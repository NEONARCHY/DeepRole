import { clamp } from "./portrait-layout";
import type { Locale } from "./types";

export const adaptiveCopy = {
  ru: { title: "Адаптивный размер", on: "Адаптивный размер: вкл", off: "Адаптивный размер: выкл", hint: "Подстраивает портреты, варианты и панели под ширину окна. В тесном окне панели сворачиваются в кнопки, а портреты собираются в ряд. Ручные размеры сохраняются." },
  en: { title: "Adaptive sizing", on: "Adaptive sizing: on", off: "Adaptive sizing: off", hint: "Fits portraits, options and panels to the window. In a tight space, panels become buttons and portraits form a row. Your manual sizes are kept." },
};
export const adaptiveText = (locale: Locale) => adaptiveCopy[locale];

/** Display geometry only. Never replace saved portrait sizes with fitted sizes. */
export function fitScene(width: number, left: number, center: number, count: number, preferred = 192) {
  const available = Math.max(1, width - left - 8);
  const compact = count > 0 && (available < 850 || count > 5);
  const portrait = compact ? clamp(available / Math.min(Math.max(count, 2), 5) - 6, 64, 96) : clamp((available - 400 - 48) / Math.max(2, count), 96, preferred);
  const leftGutter = count > 0 && !compact ? portrait + 24 : 0;
  const rightGutter = count > 1 && !compact ? (count - 1) * (portrait + 6) + 18 : 0;
  const choices = Math.min(720, Math.max(1, available - leftGutter - rightGutter));
  const x = clamp(center - choices / 2, left + leftGutter, width - 8 - rightGutter - choices);
  return { compact, portrait, choices, x };
}

/** Keep the native composer center; compact portraits rather than displacing the options. */
export function fitPinnedScene(width: number, left: number, center: number, count: number, composerWidth: number, preferred = 192) {
  const available = Math.max(1, width - left - 8);
  const viewportRoom = Math.max(1, 2 * Math.min(center - 8, width - 8 - center));
  const limit = Math.max(1, Math.min(composerWidth, viewportRoom));
  const compactFit = () => ({ compact: count > 0, portrait: clamp(limit / Math.min(Math.max(count, 2), 5) - 6, 64, 96), choices: limit, x: center - limit / 2 });
  if (!count) return compactFit();
  if (available < 850 || count > 5) return compactFit();
  const rightCount = Math.max(0, count - 1);
  // The input owns the options width. Fit portraits into the remaining gutters,
  // or use the compact strip; never silently narrow the options to make room.
  const portrait = Math.min(preferred, center - limit / 2 - left - 24, rightCount ? (width - 8 - center - limit / 2 - 24 - (rightCount - 1) * 6) / rightCount : preferred);
  if (portrait < 96) return compactFit();
  return { compact: false, portrait, choices: limit, x: center - limit / 2 };
}
