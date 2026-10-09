import { useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import type { Locale } from "../../core/types";
import { validPortrait } from "../../core/portrait-variations";
import { selfieText, type SelfieCopyKey } from "../../core/selfie-i18n";

const PAGE_SIZE = 24;

export function SelfieLibraryPicker({ id, library, images, locale, disabled, onAdd, onCancel }: {
  id: string; library: string[]; images: string[]; locale: Locale; disabled: boolean;
  onAdd: (selected: string[]) => void; onCancel: () => void;
}) {
  const t = (key: SelfieCopyKey) => selfieText(locale, key);
  const sources = useMemo(() => [...new Set(library.filter(validPortrait))], [library]);
  const existing = new Set(images), available = new Set(sources);
  const [selection, setSelection] = useState<string[]>([]), [visible, setVisible] = useState(PAGE_SIZE);
  // Ignore removed/already assigned sources rather than submitting stale selection.
  const selected = selection.filter(src => available.has(src) && !existing.has(src));
  const selectedSet = new Set(selected);
  return <div id={id} className="dr-selfie-library-picker" role="group" aria-label={t("library")} onKeyDown={e => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); }
  }}>
    <h4>{t("library")}</h4>
    <p className="dr-character-hint">{sources.length ? t("libraryHint") : t("libraryEmpty")}</p>
    {!!sources.length && <>
      <div className="dr-selfie-library-grid">{sources.slice(0, visible).map((src, index) => {
        const added = existing.has(src), checked = selectedSet.has(src);
        return <button type="button" key={src} aria-label={t("libraryPhoto") + " " + (index + 1)}
          aria-pressed={checked} disabled={disabled || added}
          title={added ? t("alreadyAdded") : undefined}
          data-added={added || undefined} onClick={() => setSelection(checked ? selected.filter(image => image !== src) : [...selected, src])}>
          <img src={src} alt="" loading="lazy" />
          {(added || checked) && <span className="dr-selfie-library-check"><Check size={16} /></span>}
          {added && <span className="dr-selfie-library-added">{t("alreadyAdded")}</span>}
        </button>;
      })}</div>
      {sources.length > visible && <button type="button" disabled={disabled} onClick={() => setVisible(count => count + PAGE_SIZE)}>{t("more")} · {Math.min(visible, sources.length)}/{sources.length}</button>}
      <p className="dr-character-hint" role="status">{t("selected")}: {selected.length}</p>
    </>}
    <div className="dr-selfie-actions">
      {!!sources.length && <button type="button" className="dr-character-primary" disabled={disabled || !selected.length} onClick={() => onAdd(selected)}><Plus size={16} />{t("addSelected")} · {selected.length}</button>}
      <button type="button" disabled={disabled} onClick={onCancel}>{t("cancelSelection")}</button>
    </div>
  </div>;
}
