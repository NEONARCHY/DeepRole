import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { LoreImportItem } from "../../core/lore-import";
import { sceneText } from "../../core/scene-i18n";
import type { Locale } from "../../core/types";

const PAGE_SIZE = 20;

/** Preview only: search and pagination never change the records being imported. */
export function LoreImportPreview({ locale, items }: { locale: Locale; items: LoreImportItem[] }) {
  const t = (key: Parameters<typeof sceneText>[1], vars?: Record<string, string | number>) => sceneText(locale, key, vars);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const index = useMemo(() => items.map((item, i) => ({ item, i, text: [item.title, item.content, ...item.keywords].join("\n").toLocaleLowerCase(locale) })), [items, locale]);
  const filtered = useMemo(() => { const needle = query.trim().toLocaleLowerCase(locale); return needle ? index.filter(row => row.text.includes(needle)) : index; }, [index, query, locale]);
  const lastPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
  const current = Math.min(page, lastPage);
  const visible = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const number = (value: number) => value.toLocaleString(locale);
  return <section className="rp-import-browse" aria-label={t("importSearch")}>
    <label className="rp-import-search"><Search size={16} aria-hidden="true" /><input type="search" className="input" aria-label={t("importSearch")} placeholder={t("importSearch")} value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
    <p className="rp-hint">{t("importPreviewScope", { count: number(visible.length), total: number(items.length) })}</p>
    <div className="rp-import-preview" key={`${current}:${query}`}>
      {visible.map(({ item, i }) => <details key={i}><summary>{item.title} · {t(item.activation)}{!item.enabled ? " · " + t("importDisabled") : ""}</summary><pre>{item.content}</pre>{item.keywords.length > 0 && <p>{t("importKeys")}: {item.keywords.join(", ")}</p>}</details>)}
      {!visible.length && <p role="status">{t("importNoResults")}</p>}
    </div>
    {filtered.length > PAGE_SIZE && <nav className="rp-import-pages" aria-label={t("importSearch")}>
      <button type="button" className="button secondary small" disabled={current === 0} aria-label={t("importPrevious")} title={t("importPrevious")} onClick={() => setPage(current - 1)}><ChevronLeft size={16} /></button>
      <span role="status">{t("importRange", { from: number(current * PAGE_SIZE + 1), to: number(Math.min((current + 1) * PAGE_SIZE, filtered.length)), count: number(filtered.length) })}</span>
      <button type="button" className="button secondary small" disabled={current === lastPage} aria-label={t("importNext")} title={t("importNext")} onClick={() => setPage(current + 1)}><ChevronRight size={16} /></button>
    </nav>}
  </section>;
}
