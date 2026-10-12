import { useId, useState } from "react";
import type { Locale } from "../../core/types";

/** Explicit disclosure: clicking help never changes the adjacent setting. */
export function SettingsHelp({ locale, title, text, heading = false }: { locale: Locale; title: string; text: string; heading?: boolean }) {
  const [open, setOpen] = useState(false), id = useId();
  return <div className="dr-settings-help">
    <div className="dr-settings-help-title"><button type="button" className="dr-settings-help-button" aria-label={(locale === "ru" ? "Подсказка: " : "Help: ") + title} aria-expanded={open} aria-controls={open ? id : undefined} onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(v => !v); }} onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); } }}>?</button>{heading ? <h2>{title}</h2> : <span>{title}</span>}</div>
    {open && <span id={id} className="dr-settings-help-copy" role="note">{text}</span>}
  </div>;
}
