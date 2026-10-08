import { useState } from "react";
import type { BackupPayload } from "../../core/types";
import type { MessageKey } from "../../core/i18n";
import { Modal } from "./Modal";

export function BackupRestore(props: { t: (key: MessageKey, vars?: Record<string, string | number>) => string; fileName: string; payload: BackupPayload; onClose: () => void; returnFocus?: HTMLElement | null; onRestore: (mode: "merge" | "replace") => Promise<void> }) {
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const t = props.t;
  return <Modal title={t("restoreTitle")} closeLabel={t("close")} returnFocus={props.returnFocus} onClose={() => { if (!busy) props.onClose(); }}>
    <strong className="restore-file">{props.fileName}</strong>
    <p className="setting-copy">{t("restorePreview", { worlds: props.payload.records.filter((r) => r.kind === "world").length, books: props.payload.records.filter((r) => r.kind === "book").length, entries: props.payload.records.filter((r) => r.kind === "entry").length })}</p>
    <fieldset className="restore-modes" disabled={busy}><legend>{t("restoreChoose")}</legend>
      {(["merge", "replace"] as const).map((value) => <label key={value} className="rp-check"><input type="radio" name="restore-mode" value={value} checked={mode === value} onChange={() => { setMode(value); setConsent(false); }} /><span><strong>{t(value === "merge" ? "restoreAdd" : "restoreReplace")}</strong><small>{t(value === "merge" ? "restoreAddHint" : "restoreReplaceHint")}</small></span></label>)}
      {mode === "replace" && <label className="rp-check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />{t("restoreConsent")}</label>}
    </fieldset>
    {error && <p className="error-text" role="alert">{t("restoreFailed")}</p>}
    <div className="modal-actions"><button className="button secondary" disabled={busy} onClick={props.onClose}>{t("cancel")}</button><button className={`button ${mode === "replace" ? "danger-button" : "primary"}`} disabled={busy || mode === "replace" && !consent} onClick={() => { setBusy(true); setError(false); void props.onRestore(mode).catch(() => setError(true)).finally(() => setBusy(false)); }}>{t(mode === "merge" ? "restoreAdd" : "restoreReplace")}</button></div>
  </Modal>;
}
