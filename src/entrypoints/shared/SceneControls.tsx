import { useEffect, useRef, useState } from "react";
import type { Locale, MemoryBook, SceneEntity, SceneState, WorldProfile } from "../../core/types";
import { sceneText } from "../../core/scene-i18n";
import { SectionGuide } from "./Help";
import { experienceText } from "../../core/experience-i18n";

export function SceneControls(input: { locale: Locale; worlds: WorldProfile[]; entities: SceneEntity[]; books: MemoryBook[]; scene: SceneState; onChange: (scene: SceneState) => void | Promise<boolean>; compact?: boolean; worldLocked?: boolean }) {
  const [scene, setScene] = useState(input.scene);
  const latest = useRef(input.scene); latest.current = input.scene;
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => setScene(input.scene), [input.scene.worldId, input.scene.bookId, input.scene.focusIds.join("|")]);
  const props = { ...input, scene, onChange: (next: SceneState) => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setFailed(false);
    setScene(next);
    void Promise.resolve().then(async () => await input.onChange(next)).then((ok) => { if (ok === false) { setScene(latest.current); setFailed(true); } }, () => { setScene(latest.current); setFailed(true); }).finally(() => { saving.current = false; setBusy(false); });
  } };
  const t = (key: Parameters<typeof sceneText>[1]) => sceneText(props.locale, key);
  const [expanded, setExpanded] = useState(false);
  const entities = props.entities.filter((e) => e.worldId === props.scene.worldId);
  const focus = entities.filter((e) => props.scene.focusIds.includes(e.id));
  const books = props.books.filter((b) => (b.worldId ?? null) === props.scene.worldId && b.active);
  return <fieldset disabled={busy} className={`scene-controls ${props.compact ? "is-compact" : ""}`} aria-busy={busy}>
    <div className="scene-controls-line">
      {!props.worldLocked && <label className="scene-world"><span>{t("world")}</span><select aria-label={t("world")} value={props.scene.worldId ?? ""} onChange={(e) => props.onChange({ worldId: e.target.value || null, focusIds: [], bookId: null })}><option value="">{t("unassigned")}</option>{props.worlds.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>}
      
      <button type="button" className="scene-focus-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{t("scene")} · {focus.length ? focus.map((e) => e.name).join(", ") : t("automatic")}</button>
      
    </div>
    {expanded && <div className="scene-focus-panel">
      <SectionGuide locale={props.locale} text={t("sceneHint")} />
      <label>{t("books")} <select aria-label={t("books")} value={props.scene.bookId ?? ""} onChange={(e) => props.onChange({ ...props.scene, bookId: e.target.value || null })}><option value="">{props.scene.worldId ? t("allBooks") : t("unassigned")}</option>{books.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      {!entities.length && <p>{t("noEntities")}</p>}
      {(["character", "location", "group"] as const).map((kind) => <div key={kind} className="scene-focus-group">{entities.some((e) => e.kind === kind) && <small>{t(kind)}</small>}{entities.filter((e) => e.kind === kind).map((entity) => <label className="scene-chip" key={entity.id}><input type="checkbox" checked={props.scene.focusIds.includes(entity.id)} onChange={(e) => props.onChange({ ...props.scene, focusIds: e.target.checked ? [...props.scene.focusIds, entity.id] : props.scene.focusIds.filter((id) => id !== entity.id) })} />{entity.name}</label>)}</div>)}
      {focus.length > 0 && <button type="button" className="scene-clear" onClick={() => props.onChange({ ...props.scene, focusIds: [] })}>{t("clearFocus")}</button>}
    </div>}
    {busy && <small role="status">{experienceText(props.locale, "sceneSaving")}</small>}
    {failed && <small role="alert">{experienceText(props.locale, "sceneFailed")}</small>}
  </fieldset>;
}
