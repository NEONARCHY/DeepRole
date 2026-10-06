import { useEffect, useId, useRef, useState } from "react";
import type { Locale } from "../../core/types";
import { DEFAULT_PANEL_WIDTH, MAX_PANEL_WIDTH, MIN_PANEL_WIDTH, panelWidth, panelWidthCopy } from "../../core/panel-width";

/** Preview locally; persist once on release, blur or keyboard commit. */
export function PanelWidthControl({ locale, value, onSave, onPreview }: { locale: Locale; value?: number; onSave: (width: number) => Promise<void>; onPreview?: (width: number | null) => void }) {
  const t = panelWidthCopy(locale); const id = useId();
  const [draft, setDraft] = useState(panelWidth(value)); const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  const saving = useRef(false);
  useEffect(() => { setDraft(panelWidth(value)); }, [value]);
  useEffect(() => () => onPreview?.(null), []);
  const save = async (next: number) => {
    if (saving.current || next === panelWidth(value)) return;
    saving.current = true; setBusy(true); setError(false);
    try { await onSave(next); }
    catch { setDraft(panelWidth(value)); setError(true); }
    finally { onPreview?.(null); setBusy(false); saving.current = false; }
  };
  return <div className="dr-panel-width-control" data-no-widget-drag>
    <label htmlFor={id}><span>{t.title}</span><output>{draft} {t.unit}</output></label>
    <input id={id} aria-label={t.title} type="range" min={MIN_PANEL_WIDTH} max={MAX_PANEL_WIDTH} step={1} disabled={busy} value={draft} onChange={event => { const next = Number(event.target.value); setDraft(next); onPreview?.(next); }} onPointerUp={() => void save(draft)} onKeyUp={event => { if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) void save(draft); }} onBlur={() => void save(draft)} />
    <p className="setting-copy">{t.hint}</p><button type="button" disabled={busy || draft === DEFAULT_PANEL_WIDTH} onClick={() => { setDraft(DEFAULT_PANEL_WIDTH); onPreview?.(DEFAULT_PANEL_WIDTH); void save(DEFAULT_PANEL_WIDTH); }}>{t.reset}</button>
    {error && <p className="error-text" role="alert">{t.failed}</p>}
  </div>;
}
