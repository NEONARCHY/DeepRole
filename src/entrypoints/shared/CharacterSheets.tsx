import { useEffect, useId, useLayoutEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { Plus, X, Upload, Trash2 } from "lucide-react";
import type { CharacterScene, CharacterSheet, CharacterStatus, DeepRoleSettings, Locale, SceneEntity } from "../../core/types";
import { characterText, type CharacterCopyKey, EMPTY_CHARACTER, EMPTY_STATUS, emotionLabel, emotionsFor, validEmotions, syncPortraitImage, validSprite, characterHighlights } from "../../core/characters";
import type { CharacterEdit } from "../../storage/characters";

function CharacterPortrait({ sheet, emotion, ...attributes }: Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & { sheet?: CharacterSheet; emotion?: string }) {
  const image = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => { if (image.current) syncPortraitImage(image.current, sheet, emotion); }, [sheet, emotion]);
  return <img {...attributes} ref={image} />;
}

export function CharacterSettings({ settings, onSettings }: { settings: DeepRoleSettings; onSettings: (value: DeepRoleSettings) => void | Promise<void> }) {
  const emotionsId = useId();
  const t = (key: CharacterCopyKey) => characterText(settings.locale, key);
  const [draft, setDraft] = useState(emotionsFor(settings.characterEmotions).join("\n"));
  const [error, setError] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(emotionsFor(settings.characterEmotions).join("\n")), [settings.characterEmotions?.join("\n")]);
  const emotions = draft.split("\n").map(s => s.trim()).filter(Boolean);
  return <section className="dr-character-settings">
    <label className="toggle-row"><span>{t("enable")}</span><input type="checkbox" checked={!!settings.characterSheetsEnabled} onChange={e => void onSettings({ ...settings, characterSheetsEnabled: e.target.checked })} /></label>
    <p className="setting-copy">{t("enableHint")}</p>
    {settings.characterSheetsEnabled && <>
      <label className="toggle-row"><span>{t("sprites")}</span><input type="checkbox" checked={settings.characterSpritesEnabled !== false} onChange={e => void onSettings({ ...settings, characterSpritesEnabled: e.target.checked })} /></label>
      <label className="field-label" htmlFor={emotionsId}>{t("emotions")}</label><textarea id={emotionsId} rows={6} maxLength={396} value={draft} onChange={e => { setDraft(e.target.value); setError(false); }} aria-describedby="dr-emotions-help" />
      <p id="dr-emotions-help" className="setting-copy">{t("emotionsHint")}</p>
      {error && <p role="alert" className="error-text">{t(validEmotions(emotions) ? "failed" : "emotionError")}</p>}
      <button className="button secondary" disabled={busy} onClick={() => { if (!validEmotions(emotions)) { setError(true); return; } setBusy(true); void Promise.resolve(onSettings({ ...settings, characterEmotions: emotions })).catch(() => setError(true)).finally(() => setBusy(false)); }}>{t("saveEmotions")}</button>
    </>}
  </section>;
}

export function CharacterPanel(props: { locale: Locale; entities: SceneEntity[]; scene?: CharacterScene; emotions: string[]; base: string; worldId: string; chatId: string; status: CharacterCopyKey; generating?: boolean; onSave: (edit: Omit<CharacterEdit, "chatUrl">) => Promise<void>; onRetry: () => void; openId?: string | null; onOpened?: () => void }) {
  const panel = useRef<HTMLElement>(null);
  const t = (key: CharacterCopyKey) => characterText(props.locale, key);
  const [edit, setEdit] = useState<{ entity: SceneEntity | null; scene?: CharacterScene; base: string } | null>(null);
  const [castView, setCastView] = useState<"scene" | "all">("scene"); const [query, setQuery] = useState("");
  useEffect(() => { setEdit(null); setCastView("scene"); setQuery(""); }, [props.worldId, props.chatId]);
  useEffect(() => {
    if (!props.openId) return;
    const entity = props.entities.find(e => e.id === props.openId);
    if (entity) setEdit({ entity, scene: props.scene, base: props.base });
    props.onOpened?.();
  }, [props.openId]);
  const entities = [...props.entities].sort((a, b) => Number(!!b.characterSheet?.protagonist) - Number(!!a.characterSheet?.protagonist) || Number(props.scene?.presentIds.includes(b.id)) - Number(props.scene?.presentIds.includes(a.id)) || a.name.localeCompare(b.name));
  const cast = props.scene ? entities.filter(entity => entity.characterSheet?.protagonist || props.scene!.presentIds.includes(entity.id)) : entities;
  const shown = (castView === "all" ? entities : cast).filter(entity => castView !== "all" || [entity.name, ...entity.aliases].some(name => name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  return <section ref={panel} className="dr-characters" aria-label={t("title")}>
    <header><strong>{t("title")}</strong><button type="button" aria-label={t("add")} title={t("add")} disabled={entities.length >= 40} onClick={() => setEdit({ entity: null, scene: props.scene, base: props.base })}><Plus size={16} /></button></header>
    <p className="dr-character-status" role="status">{t(props.generating ? "waiting" : props.status)}</p>
    {props.status === "autoFailed" && <button type="button" onClick={props.onRetry}>{t("retry")}</button>}
    {entities.length > 0 && <>
      <div className="dr-character-cast-view" role="group" aria-label={t("castView")}>
        <button type="button" aria-pressed={castView === "scene"} onClick={() => setCastView("scene")}>{t("sceneCast")} · {cast.length}</button>
        <button type="button" aria-pressed={castView === "all"} onClick={() => setCastView("all")}>{t("allCast")} · {entities.length}</button>
      </div>
      {castView === "all" && <input className="dr-character-search" type="search" aria-label={t("searchCast")} placeholder={t("searchCast")} value={query} maxLength={80} onChange={event => setQuery(event.target.value)} />}
      {!props.scene && castView === "scene" && <p className="dr-character-hint">{t("castFallback")}</p>}
    </>}
    {shown.length ? <div className="dr-character-list">{shown.map(entity => {
      const state = props.scene?.states[entity.id]; const present = props.scene?.presentIds.includes(entity.id); const highlights = characterHighlights(state);
      return <button key={entity.id} className="dr-character-row" type="button" onClick={() => setEdit({ entity, scene: props.scene, base: props.base })} title={`${t("edit")}: ${entity.name}. ${state?.condition || t("noState")}`}>
        <CharacterPortrait width={144} height={192} loading="lazy" sheet={entity.characterSheet} emotion={state?.emotion} alt="" />
        <span><strong>{entity.name}</strong><small>{state ? emotionLabel(props.locale, state.emotion) : t("noState")}</small></span>
        {highlights.length > 0 && <span className="dr-character-highlights">{highlights.map((stat, index) => <span key={index} title={`${stat.label}: ${stat.value}`}>{stat.label}: {stat.value}</span>)}</span>}
        <span className={`dr-character-presence ${present ? "is-present" : ""}`} aria-label={t(present ? "present" : "absent")} title={t(present ? "present" : "absent")} />
      </button>;
    })}</div> : <p>{t(entities.length ? castView === "all" ? "noMatches" : "noCast" : "empty")}</p>}
    <small className="dr-character-hint">{t("hint")}</small>
    {entities.length > 0 && !entities.some(e => e.characterSheet?.protagonist) && <small className="dr-character-hint">{t("heroHint")}</small>}
    {edit && createPortal(<CharacterEditor key={`${props.worldId}:${props.chatId}:${edit.entity?.id ?? "new"}`} locale={props.locale} entity={edit.entity} scene={edit.scene} emotions={props.emotions} onClose={() => setEdit(null)} onSave={async (value) => { await props.onSave({ ...value, entityId: edit.entity?.id ?? null, base: edit.base, worldId: props.worldId, chatId: props.chatId }); setEdit(null); }} />, panel.current?.closest(".dr-root") ?? panel.current ?? document.body)}
  </section>;
}

async function readPortrait(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5_000_000) throw new Error("image-invalid");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    if (image.naturalWidth * image.naturalHeight > 25_000_000 || !image.naturalWidth || !image.naturalHeight) throw new Error("image-invalid");
    const scale = Math.min(1, 384 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d"); if (!context) throw new Error("image-invalid");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/webp", .8);
    if (!validSprite(data)) throw new Error("image-invalid");
    return data;
  } finally { URL.revokeObjectURL(url); }
}

export function CharacterEditor(props: { locale: Locale; entity: SceneEntity | null; scene?: CharacterScene; emotions: string[]; onClose: () => void; onSave: (value: { name: string; sheet: CharacterSheet; state: CharacterStatus; present: boolean }) => Promise<void> }) {
  const t = (key: CharacterCopyKey) => characterText(props.locale, key);
  const [name, setName] = useState(props.entity?.name ?? "");
  const [sheet, setSheet] = useState<CharacterSheet>(() => structuredClone(props.entity?.characterSheet ?? EMPTY_CHARACTER));
  const [state, setState] = useState<CharacterStatus>(() => structuredClone(props.scene?.states[props.entity?.id ?? ""] ?? EMPTY_STATUS));
  const [present, setPresent] = useState(!!props.scene?.presentIds.includes(props.entity?.id ?? ""));
  const [emotion, setEmotion] = useState(state.emotion); const [busy, setBusy] = useState(false); const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<CharacterCopyKey | null>(null); const [dirty, setDirty] = useState(false);
  const dialog = useRef<HTMLDivElement>(null); const input = useRef<HTMLInputElement>(null); const mounted = useRef(true);
  const close = () => { if (!busy && !uploading && (!dirty || window.confirm(t("discard")))) props.onClose(); };
  useEffect(() => {
    mounted.current = true;
    let previous = dialog.current?.ownerDocument.activeElement as HTMLElement | null;
    while (previous?.shadowRoot?.activeElement) previous = previous.shadowRoot.activeElement as HTMLElement;
    dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => { mounted.current = false; previous?.isConnected && previous.focus(); };
  }, []);
  const options = [...new Set([...props.emotions, state.emotion])];
  const portraitOptions = [...new Set([...props.emotions, state.emotion, ...Object.keys(sheet.sprites)])];
  return <div className="dr-character-dialog-layer" onKeyDown={e => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    if (e.key === "Tab") {
      const items = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') ?? [])].filter(el => el.getClientRects().length);
      const active = (dialog.current?.getRootNode() as Document | ShadowRoot)?.activeElement;
      if (e.shiftKey && active === items[0]) { e.preventDefault(); items.at(-1)?.focus(); }
      if (!e.shiftKey && active === items.at(-1)) { e.preventDefault(); items[0]?.focus(); }
    }
  }}><div ref={dialog} className="dr-character-dialog" role="dialog" aria-modal="true" aria-labelledby="dr-character-editor-title">
    <header><h2 id="dr-character-editor-title">{props.entity?.name ?? t("add")}</h2><button type="button" aria-label={t("cancel")} disabled={busy || uploading} onClick={close}><X size={20} /></button></header>
    <form onChange={e => { const target = e.target as HTMLElement; if (!target.hasAttribute("data-portrait-preview") && target.getAttribute("type") !== "file") setDirty(true); }} onSubmit={e => { e.preventDefault(); if (busy || uploading) return; setBusy(true); setError(null); void props.onSave({ name, sheet, state, present }).catch(() => { if (mounted.current) setError("failed"); }).finally(() => { if (mounted.current) setBusy(false); }); }}>
      <div className="dr-character-editor-body">
        <p className="dr-character-hint">{t("scope")}</p>
        <fieldset disabled={busy}><legend>{t("profile")}</legend>
          <label>{t("name")}<input required value={name} maxLength={80} onChange={e => setName(e.target.value)} /></label>
          <label className="dr-character-check"><input type="checkbox" checked={sheet.protagonist} onChange={e => setSheet({ ...sheet, protagonist: e.target.checked })} />{t("protagonist")}</label>
          {(["appearance", "personality", "goals", "background"] as const).map(key => <label key={key}>{t(key)}<textarea rows={2} maxLength={1200} value={sheet[key]} onChange={e => setSheet({ ...sheet, [key]: e.target.value })} /></label>)}
          {props.entity?.description && <details><summary>{t("background")}</summary><p className="dr-character-original">{props.entity.description}</p></details>}
        </fieldset>
        <fieldset disabled={busy}><legend>{t("state")}</legend>
          <label className="dr-character-check"><input type="checkbox" checked={present} onChange={e => setPresent(e.target.checked)} />{t("present")}</label>
          <label>{t("emotion")}<select aria-label={t("emotion")} value={state.emotion} onChange={e => setState({ ...state, emotion: e.target.value })}>{options.map(value => <option key={value} value={value}>{emotionLabel(props.locale, value)}</option>)}</select></label>
          {(["condition", "goal", "relationship"] as const).map(key => <label key={key}>{t(key)}<textarea rows={2} maxLength={240} value={state[key]} onChange={e => setState({ ...state, [key]: e.target.value })} /></label>)}
          <strong>{t("stats")}</strong>
          {state.stats.map((stat, i) => <div className="dr-character-stat" key={i}><input aria-label={`${t("statName")} ${i + 1}`} placeholder={t("statName")} required maxLength={40} value={stat.label} onChange={e => setState({ ...state, stats: state.stats.map((s, n) => n === i ? { ...s, label: e.target.value } : s) })} /><input aria-label={`${t("statValue")} ${i + 1}`} placeholder={t("statValue")} maxLength={80} value={stat.value} onChange={e => setState({ ...state, stats: state.stats.map((s, n) => n === i ? { ...s, value: e.target.value } : s) })} /><button type="button" aria-label={`${t("remove")} ${stat.label || i + 1}`} onClick={() => { setDirty(true); setState({ ...state, stats: state.stats.filter((_, n) => n !== i) }); }}><Trash2 size={16} /></button></div>)}
          <button type="button" disabled={state.stats.length >= 6} onClick={() => { setDirty(true); setState({ ...state, stats: [...state.stats, { label: "", value: "" }] }); }}><Plus size={16} />{t("addStat")}</button>
        </fieldset>
        <fieldset disabled={busy || uploading}><legend>{t("portraits")}</legend><div className="dr-character-portrait-editor">
          <CharacterPortrait sheet={sheet} emotion={emotion} alt={name} width={176} height={235} />
          <div><label>{t("gender")}<select aria-label={t("gender")} value={sheet.gender} onChange={e => setSheet({ ...sheet, gender: e.target.value as CharacterSheet["gender"] })}>{(["neutral", "male", "female"] as const).map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
          <label>{t("portraitEmotion")}<select aria-label={t("portraitEmotion")} data-portrait-preview value={emotion} onChange={e => setEmotion(e.target.value)}>{portraitOptions.map(value => <option key={value} value={value}>{emotionLabel(props.locale, value)}{sheet.sprites[value] ? " ✓" : ""}</option>)}</select></label><small className="dr-character-hint">{t("previewOnly")}</small></div>
        </div><p className="dr-character-hint">{t("uploadHint")}</p><div className="dr-character-actions"><button type="button" onClick={() => input.current?.click()}><Upload size={16} />{t("upload")}</button>{sheet.sprites[emotion] && <button type="button" onClick={() => { const sprites = { ...sheet.sprites }; delete sprites[emotion]; setSheet({ ...sheet, sprites }); setDirty(true); }}>{t("remove")}</button>}</div>
        <input ref={input} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; setUploading(true); setError(null); void readPortrait(file).then(src => { if (mounted.current) { setSheet(previous => ({ ...previous, sprites: { ...previous.sprites, [emotion]: src } })); setDirty(true); } }).catch(() => { if (mounted.current) setError("imageError"); }).finally(() => { if (mounted.current) setUploading(false); }); }} />
        </fieldset>
      </div>
      <footer>{error && <p role="alert">{t(error)}</p>}<button type="button" disabled={busy || uploading} onClick={close}>{t("cancel")}</button><button className="dr-character-primary" type="submit" disabled={busy || uploading || !name.trim()}>{t(busy ? "saving" : "save")}</button></footer>
    </form>
  </div></div>;
}
