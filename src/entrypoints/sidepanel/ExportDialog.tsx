import { Select } from "../shared/Select";
import { useEffect, useId, useRef, useState } from "react";
import { exportText } from "../../core/export-i18n";
import type { Locale, WorldProfile } from "../../core/types";
import { backupFileName } from "../../storage/backup";
import { repository } from "../../storage/repository";
import { createExportFile, type ExportStage } from "../../storage/export-file";
import { importFileTooLarge } from "../../core/import-limits";
import "./export-dialog.css";

export function ExportDialog(props: { locale: Locale; worlds: WorldProfile[]; worldId?: string | null; onClose: () => void }) {
  const t = (key: Parameters<typeof exportText>[1]) => exportText(props.locale, key);
  const [scope, setScope] = useState<"world" | "backup">(props.worldId ? "world" : "backup");
  const [worldId, setWorldId] = useState(props.worldId ?? props.worlds[0]?.id ?? "");
  const [protectedFile, setProtectedFile] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress,setProgress] = useState<{ stage: ExportStage; done?: number; total?: number }>({stage:"records"});
  const [error, setError] = useState<"failed" | "worldTooLarge" | "backupTooLarge" | "photoMissing" | "locked" | "resource" | "history" | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    mounted.current = true; dialog.current?.showModal();
    return () => { mounted.current = false; generation.current++; dialog.current?.close(); previous?.isConnected && previous.focus({ preventScroll: true }); };
  }, []);
  async function download() {
    if (busy || scope === "world" && !worldId || scope === "backup" && protectedFile && !password) return;
    const current = ++generation.current;
    setBusy(true); setError(null);
    try {
      const file = await createExportFile(scope,worldId,scope === "backup" && protectedFile ? password : undefined,repository,(stage,done,total)=>{if(mounted.current && current === generation.current)setProgress({stage,done,total});});
      if (!mounted.current || current !== generation.current || await repository.isLocked() || !mounted.current) return;

      if (importFileTooLarge(file.size, scope)) throw new Error(scope === "world" ? "worldTooLarge" : "backupTooLarge");
      const url = URL.createObjectURL(file);
      const link = document.createElement("a"); link.href = url;
      link.download = scope === "world" ? `deeprole-world-${Date.now()}.json` : backupFileName(protectedFile);
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      props.onClose();
    } catch (reason) {
      if (mounted.current) {
        const message=reason instanceof Error ? reason.message : "";
        setError(message==="photo-missing" || message==="photo-invalid" ? "photoMissing" : /vault.*locked|vault is locked/iu.test(message) ? "locked" : reason instanceof RangeError ? "resource" : /^(?:story-|dispatch-)/u.test(message) ? "history" : ["worldTooLarge","backupTooLarge"].includes(message) ? message as "worldTooLarge"|"backupTooLarge" : "failed");
      }
    }
    finally { if (mounted.current) setBusy(false); }
  }
  return <dialog ref={dialog} className="dr-export-dialog" aria-labelledby={`${id}-title`} onCancel={e => { e.preventDefault(); props.onClose(); }}>
    <header><h2 id={`${id}-title`}>{t("title")}</h2><button type="button" className="icon-button" aria-label={t("close")} onClick={props.onClose}>×</button></header>
    <div className="dr-export-body">
      <fieldset disabled={busy} className="dr-export-options">
        <label className={`dr-export-choice${scope === "world" ? " is-selected" : ""}`}><input type="radio" name={id} checked={scope === "world"} disabled={!props.worlds.length} onChange={() => setScope("world")} /><span><strong>{t("world")}</strong><small>{t("worldHint")}</small></span></label>
        <label className={`dr-export-choice${scope === "backup" ? " is-selected" : ""}`}><input type="radio" name={id} checked={scope === "backup"} onChange={() => setScope("backup")} /><span><strong>{t("backup")}</strong><small>{t("backupHint")}</small></span></label>
        {scope === "world" && <label className="field-label">{t("choose")}<Select className="input" value={worldId} onChange={e => setWorldId(e.target.value)}>{props.worlds.map(world => <option key={world.id} value={world.id}>{world.name}</option>)}</Select></label>}
        {scope === "backup" && <><label className="rp-check"><input type="checkbox" checked={protectedFile} onChange={e => setProtectedFile(e.target.checked)} />{t("password")}</label>{protectedFile && <label className="field-label">{t("passwordLabel")}<input className="input" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label>}</>}
      </fieldset>
      {busy && <p role="status">{t(progress.stage === "photos" ? "photos" : progress.stage === "file" ? "building" : "collecting").replace("{done}",String(progress.done ?? 0)).replace("{total}",String(progress.total ?? 0))}</p>}
      {error && <p role="alert">{t(error)}</p>}
    </div>
    <footer><button type="button" className="button primary" disabled={busy || scope === "world" && !props.worlds.some(world => world.id === worldId) || scope === "backup" && protectedFile && !password} onClick={() => void download()}>{t(busy ? "saving" : "save")}</button></footer>
  </dialog>;
}
