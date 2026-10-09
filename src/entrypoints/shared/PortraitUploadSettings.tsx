import { useEffect, useId, useState } from "react";
import type { DeepRoleSettings } from "../../core/types";
import { DEFAULT_PORTRAIT_MAX_EDGE, validPortraitMaxEdge } from "../../core/portrait-upload";
import { portraitUploadText } from "../../core/portrait-upload-i18n";

export function PortraitUploadSettings({ settings, onSettings }: { settings: DeepRoleSettings; onSettings: (settings: DeepRoleSettings) => Promise<void> }) {
  const value = validPortraitMaxEdge(settings.portraitMaxEdge) ? settings.portraitMaxEdge : DEFAULT_PORTRAIT_MAX_EDGE;
  const id = useId(), [draft, setDraft] = useState(String(value)), [busy, setBusy] = useState(false), [status, setStatus] = useState("");
  const t = (key: Parameters<typeof portraitUploadText>[1]) => portraitUploadText(settings.locale, key);
  useEffect(() => setDraft(String(value)), [value]);
  const next = Number(draft), valid = draft.trim() !== "" && validPortraitMaxEdge(next);
  return <div className="dr-portrait-quality">
    <p className="setting-copy">{t("hint")}</p>
    <div className="segmented">{[1280, 1920, 2560, 4096].map(edge => <button key={edge} type="button" disabled={busy} aria-pressed={next === edge} onClick={() => { setDraft(String(edge)); setStatus(""); }}>{edge} px</button>)}</div>
    <label htmlFor={id}>{t("edge")}</label><input id={id} className="input" type="number" min={256} max={4096} step={1} value={draft} disabled={busy} onChange={event => { setDraft(event.target.value); setStatus(""); }} aria-invalid={!valid} />
    {!valid && <p className="error-text" role="alert">{t("invalid")}</p>}
    <p className="setting-copy">{t("budget")}</p>
    <button type="button" className="button primary" disabled={busy || !valid} onClick={() => {
      if (busy || !valid) return; setBusy(true); setStatus("");
      void onSettings({ ...settings, portraitMaxEdge: next }).then(() => setStatus(t("saved"))).catch(() => setStatus(t("failed"))).finally(() => setBusy(false));
    }}>{t("save")}</button><p className="setting-copy" role="status">{status}</p>
  </div>;
}
