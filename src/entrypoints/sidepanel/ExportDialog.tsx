import { Select } from "../shared/Select";
import { useEffect, useId, useRef, useState } from "react";
import { exportText } from "../../core/export-i18n";
import type { Locale, WorldProfile } from "../../core/types";
import { createBackup, backupFileName } from "../../storage/backup";
import { repository } from "../../storage/repository";
import { exportWorld } from "../../storage/worlds";
import { importFileTooLarge } from "../../core/import-limits";
import "./export-dialog.css";

export function ExportDialog(props: { locale: Locale; worlds: WorldProfile[]; worldId?: string | null; onClose: () => void }) {
  const t = (key: Parameters<typeof exportText>[1]) => exportText(props.locale, key);
  const [scope, setScope] = useState<"world" | "backup">(props.worldId ? "world" : "backup");
  const [worldId, setWorldId] = useState(props.worldId ?? props.worlds[0]?.id ?? "");
  const [protectedFile, setProtectedFile] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"failed" | "worldTooLarge" | "backupTooLarge" | null>(null);
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
      const value = scope === "world" ? await exportWorld(worldId) : await createBackup(protectedFile ? password : undefined);
      if (!mounted.current || current !== generation.current || await repository.isLocked() || !mounted.current) return;
      const file = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
      if (importFileTooLarge(file.size, scope)) throw new Error(scope === "world" ? "worldTooLarge" : "backupTooLarge");
      const url = URL.createObjectURL(file);
      const link = document.createElement("a"); link.href = url;
      link.download = scope === "world" ? `deeprole-world-${Date.now()}.json` : backupFileName(protectedFile);
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      props.onClose();
    } catch (reason) { if (mounted.current) setError(reason instanceof Error && ["worldTooLarge", "backupTooLarge"].includes(reason.message) ? reason.message as "worldTooLarge" | "backupTooLarge" : "failed"); }
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
      {error && <p role="alert">{t(error)}</p>}
    </div>
    <footer><button type="button" className="button primary" disabled={busy || scope === "world" && !props.worlds.some(world => world.id === worldId) || scope === "backup" && protectedFile && !password} onClick={() => void download()}>{t(busy ? "saving" : "save")}</button></footer>
  </dialog>;
}
