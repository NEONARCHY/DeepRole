import type { Locale } from "../../core/types";
import { characterLibraryText } from "../../core/character-library-i18n";
export const CHARACTER_PAGE_SIZE = 40;
export const characterPage = (page: number, count: number) => Math.max(0, Math.min(page, Math.ceil(count / CHARACTER_PAGE_SIZE) - 1));
export function CharacterPagination({ locale, page, count, onPage }: { locale: Locale; page: number; count: number; onPage: (page: number) => void }) {
  if (count <= CHARACTER_PAGE_SIZE) return null;
  const current = characterPage(page, count), number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const t = (key: Parameters<typeof characterLibraryText>[1]) => characterLibraryText(locale, key);
  return <div className="dr-character-pagination" role="group" aria-label={t("group")}><small>{t("range").replace("{from}", number(current * CHARACTER_PAGE_SIZE + 1)).replace("{to}", number(Math.min(count, (current + 1) * CHARACTER_PAGE_SIZE))).replace("{total}", number(count))}</small><button type="button" disabled={current === 0} onClick={() => onPage(current - 1)}>{t("prev")}</button><button type="button" disabled={(current + 1) * CHARACTER_PAGE_SIZE >= count} onClick={() => onPage(current + 1)}>{t("next")}</button></div>;
}
