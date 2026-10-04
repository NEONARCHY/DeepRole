import { useEffect, useId, useLayoutEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { Plus, X, Upload, Trash2, Expand, Pencil, ArrowLeft } from "lucide-react";
import type { CharacterScene, CharacterSheet, CharacterStatus, DeepRoleSettings, Locale, SceneEntity } from "../../core/types";
import { characterText, type CharacterCopyKey, EMPTY_CHARACTER, EMPTY_STATUS, emotionLabel, emotionOptionLabel, emotionsFor, validEmotions, syncPortraitImage, characterHighlights, characterInterlocutors, characterSaveError, MAX_ACTIVE_EMOTIONS } from "../../core/characters";
import type { CharacterEdit, CharacterSaveResult } from "../../storage/characters";
import { MAX_PORTRAIT_VARIATIONS, portraitVariations, scenePortraitIndex } from "../../core/portrait-variations";
import { characterEditBaseline, type CharacterEditBaseline } from "../../core/character-edit";
import { libraryImages, unassignPortrait, withPortraitLibrary } from "../../core/portrait-library";
import { PortraitLibrary, portraitLibraryTitle, portraitLibraryFull } from "./PortraitLibrary";
import { readPortrait } from "./portrait-file";

function CharacterPortrait({ sheet, emotion, variation = 0, ...attributes }: Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & { sheet?: CharacterSheet; emotion?: string; variation?: number }) {
  const image = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => { if (image.current) syncPortraitImage(image.current, sheet, emotion, variation); }, [sheet, emotion, variation]);
  return <img {...attributes} ref={image} />;
}

export function CharacterSettings({ settings, onSettings, worldEmotions, onEmotions }: { settings: DeepRoleSettings; onSettings: (value: DeepRoleSettings) => void | Promise<void>; worldEmotions?: string[]; onEmotions?: (emotions: string[]) => Promise<void> }) {
  const emotionsId = useId();
  const t = (key: CharacterCopyKey) => characterText(settings.locale, key);
  const [draft, setDraft] = useState(emotionsFor(worldEmotions ?? settings.characterEmotions).join("\n"));
  const [error, setError] = useState(false); const [busy, setBusy] = useState(false);
  const [layoutError, setLayoutError] = useState(false);
  useEffect(() => setDraft(emotionsFor(worldEmotions ?? settings.characterEmotions).join("\n")), [worldEmotions?.join("\n"), settings.characterEmotions?.join("\n")]);
  const emotions = draft.split("\n").map(s => s.trim()).filter(Boolean);
  return <section className="dr-character-settings">
    <label className="toggle-row"><span>{t("enable")}</span><input type="checkbox" checked={!!settings.characterSheetsEnabled} onChange={e => void onSettings({ ...settings, characterSheetsEnabled: e.target.checked })} /></label>
    <p className="setting-copy">{t("enableHint")}</p>
    {settings.characterSheetsEnabled && <>
      <label className="toggle-row"><span>{t("sprites")}</span><input type="checkbox" checked={settings.characterSpritesEnabled !== false} onChange={e => void onSettings({ ...settings, characterSpritesEnabled: e.target.checked })} /></label>
      <p className="setting-copy">{t("floatingSettingHint")}</p>
      <button type="button" className="button secondary" disabled={busy} onClick={() => {
        setBusy(true); setLayoutError(false);
        void Promise.resolve(onSettings({ ...settings, portraitLayoutResetAt: Math.max(Date.now(), (settings.portraitLayoutResetAt ?? 0) + 1) })).catch(() => setLayoutError(true)).finally(() => setBusy(false));
      }}>{t("layoutResetAll")}</button>
      {layoutError && <p role="alert" className="error-text">{t("layoutFailed")}</p>}
      <label className="field-label" htmlFor={emotionsId}>{t("emotions")}</label><textarea id={emotionsId} rows={6} maxLength={MAX_ACTIVE_EMOTIONS * 33} value={draft} onChange={e => { setDraft(e.target.value); setError(false); }} aria-describedby="dr-emotions-help" />
      <p id="dr-emotions-help" className="setting-copy">{t("emotionsHint")}</p><details className="dr-emotion-help"><summary>{t("emotionNames")}</summary><p className="setting-copy">{t("emotionKeys")}</p></details>
      {error && <p role="alert" className="error-text">{t(validEmotions(emotions) ? "failed" : "emotionError")}</p>}
      <button className="button secondary" disabled={busy} onClick={() => { if (!validEmotions(emotions)) { setError(true); return; } setBusy(true); void Promise.resolve(onEmotions ? onEmotions(emotions) : onSettings({ ...settings, characterEmotions: emotions })).catch(() => setError(true)).finally(() => setBusy(false)); }}>{t("saveEmotions")}</button>
    </>}
  </section>;
}

export function CharacterPanel(props: { locale: Locale; entities: SceneEntity[]; scene?: CharacterScene; emotions: string[]; base: string; worldId: string; chatId: string; status: CharacterCopyKey; generating?: boolean; onSave: (edit: Omit<CharacterEdit, "chatUrl">) => Promise<CharacterSaveResult>; onRetry: () => void; openId?: string | null; onOpened?: () => void }) {
  const panel = useRef<HTMLElement>(null);
  const t = (key: CharacterCopyKey) => characterText(props.locale, key);
  const [edit, setEdit] = useState<{ entity: SceneEntity | null; entityId: string | null; session: number; scene?: CharacterScene; base: string; original: CharacterEditBaseline } | null>(null);
  const editSession = useRef(0);
  const openEdit = (entity: SceneEntity | null) => setEdit({ entity, entityId: entity?.id ?? null, session: ++editSession.current, scene: props.scene, base: props.base, original: characterEditBaseline(entity, props.entities, props.scene) });
  const [gallery, setGallery] = useState(false); const [galleryQuery, setGalleryQuery] = useState("");
  const galleryRef = useRef<HTMLDivElement>(null); const galleryOrigin = useRef<HTMLElement | null>(null); const editOrigin = useRef<HTMLElement | null>(null);
  const [castView, setCastView] = useState<"scene" | "all">("scene"); const [query, setQuery] = useState("");
  useEffect(() => { setEdit(null); setGallery(false); setGalleryQuery(""); setCastView("scene"); setQuery(""); }, [props.worldId, props.chatId]);
  useEffect(() => {
    if (!gallery) return;
    galleryRef.current?.querySelector<HTMLInputElement>("input[type=search]")?.focus();
    return () => { if (galleryOrigin.current?.isConnected) galleryOrigin.current.focus({ preventScroll: true }); };
  }, [gallery]);
  useLayoutEffect(() => { if (gallery && !edit) editOrigin.current?.isConnected && editOrigin.current.focus({ preventScroll: true }); }, [edit]);
  useEffect(() => {
    if (!props.openId) return;
    const entity = props.entities.find(e => e.id === props.openId);
    if (entity) openEdit(entity);
    props.onOpened?.();
  }, [props.openId]);
  const entities = [...props.entities].sort((a, b) => Number(!!b.characterSheet?.protagonist) - Number(!!a.characterSheet?.protagonist) || Number(props.scene?.presentIds.includes(b.id)) - Number(props.scene?.presentIds.includes(a.id)) || a.name.localeCompare(b.name));
  const cast = props.scene ? entities.filter(entity => entity.characterSheet?.protagonist || props.scene!.presentIds.includes(entity.id)) : entities;
  const shown = (castView === "all" ? entities : cast).filter(entity => castView !== "all" || [entity.name, ...entity.aliases].some(name => name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  const partners = new Set(characterInterlocutors(props.entities, props.scene).map(person => person.id));
  const role = (entity: SceneEntity) => t(entity.characterSheet?.protagonist ? "portraitHero" : partners.has(entity.id) ? "portraitPartner" : props.scene?.presentIds.includes(entity.id) ? "present" : "absent");
  const editor = edit && <CharacterEditor key={`${props.worldId}:${props.chatId}:${edit.session}`} embedded={gallery} locale={props.locale} entity={edit.entity} scene={edit.scene} interlocutor={edit.original.interlocutor} emotions={props.emotions} onClose={() => setEdit(null)} onExit={() => { setEdit(null); setGallery(false); }} onSave={async (value) => { const saved = await props.onSave({ ...value, entityId: edit.entityId, base: edit.base, original: edit.original, worldId: props.worldId, chatId: props.chatId }); setEdit(current => current?.session === edit.session ? { ...current, entityId: saved.entityId, base: saved.base, original: saved.original } : current); return saved.original; }} />;
  return <section ref={panel} className="dr-characters" aria-label={t("title")}>
    <header><strong>{t("title")}</strong><div className="dr-character-header-actions"><button type="button" aria-label={t("openGallery")} title={t("openGallery")} onClick={event => { galleryOrigin.current = event.currentTarget; editOrigin.current = null; setGallery(true); }}><Expand size={16} /></button><button type="button" aria-label={t("add")} title={t("add")} disabled={entities.length >= 40} onClick={() => openEdit(null)}><Plus size={16} /></button></div></header>
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
      const state = props.scene?.states[entity.id];
      return <button key={entity.id} className="dr-character-row" type="button" onClick={() => openEdit(entity)} title={`${t("edit")}: ${entity.name}. ${state?.condition || t("noState")}`}>
        <span><strong>{entity.name}</strong><small>{role(entity)}</small></span><small className="dr-character-row-mood">{state ? emotionLabel(props.locale, state.emotion) : t("noState")}</small>
      </button>;
    })}</div> : <p>{t(entities.length ? castView === "all" ? "noMatches" : "noCast" : "empty")}</p>}
    {(gallery || edit) && createPortal(gallery ? <div className="dr-character-dialog-layer" onKeyDown={event => {
      if (edit) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setGallery(false); }
      if (event.key === "Tab") {
        const items = [...(galleryRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? [])].filter(el => el.getClientRects().length);
        const active = (galleryRef.current?.getRootNode() as Document | ShadowRoot)?.activeElement;
        if (event.shiftKey && active === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
        if (!event.shiftKey && active === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
      }
    }}><div ref={galleryRef} className="dr-character-dialog dr-character-gallery" role="dialog" aria-modal="true" aria-labelledby={edit ? "dr-character-editor-title" : "dr-character-gallery-title"}>
      <div className="dr-character-gallery-view" hidden={!!edit}>
        <header><h2 id="dr-character-gallery-title">{t("gallery")}</h2><div className="dr-character-header-actions"><button type="button" aria-label={t("add")} disabled={entities.length >= 40} onClick={event => { editOrigin.current = event.currentTarget; openEdit(null); }}><Plus size={18} /></button><button type="button" aria-label={t("cancel")} onClick={() => setGallery(false)}><X size={20} /></button></div></header>
        <div className="dr-character-gallery-search"><input className="dr-character-search" type="search" aria-label={t("searchCast")} placeholder={t("searchCast")} value={galleryQuery} maxLength={80} onChange={event => setGalleryQuery(event.target.value)} /></div>
        <div className="dr-character-gallery-grid">{entities.filter(entity => [entity.name, ...entity.aliases].some(name => name.toLocaleLowerCase().includes(galleryQuery.trim().toLocaleLowerCase()))).map(entity => {
          const state = props.scene?.states[entity.id]; const highlights = characterHighlights(state);
          return <article key={entity.id} className="dr-character-gallery-card"><CharacterPortrait width={144} height={192} loading="lazy" sheet={entity.characterSheet} emotion={state?.emotion} variation={scenePortraitIndex(entity, props.scene)} alt={entity.name} /><div className="dr-character-gallery-caption"><strong>{entity.name}</strong><button type="button" aria-label={`${t("editCharacter")}: ${entity.name}`} title={t("editCharacter")} onClick={event => { editOrigin.current = event.currentTarget; openEdit(entity); }}><Pencil size={16} /></button></div><small>{role(entity)}</small><small>{state ? emotionLabel(props.locale, state.emotion) : t("noState")}</small>{highlights.length > 0 && <span className="dr-character-highlights">{highlights.map((stat, index) => <span key={index} title={`${stat.label}: ${stat.value}`}>{stat.label}: {stat.value}</span>)}</span>}</article>;
        })}{!entities.length && <p>{t("empty")}</p>}{entities.length > 0 && !entities.some(entity => [entity.name, ...entity.aliases].some(name => name.toLocaleLowerCase().includes(galleryQuery.trim().toLocaleLowerCase()))) && <p>{t("noMatches")}</p>}</div>
      </div>{editor}
    </div></div> : editor, panel.current?.closest(".dr-root") ?? panel.current ?? document.body)}
  </section>;
}


export function CharacterEditor(props: { locale: Locale; entity: SceneEntity | null; scene?: CharacterScene; interlocutor?: boolean; emotions: string[]; embedded?: boolean; onClose: () => void; onExit?: () => void; onSave: (value: { name: string; sheet: CharacterSheet; state: CharacterStatus; present: boolean; interlocutor?: boolean }) => Promise<CharacterEditBaseline> }) {
  const t = (key: CharacterCopyKey) => characterText(props.locale, key);
  const [name, setName] = useState(props.entity?.name ?? "");
  const [sheet, setSheet] = useState<CharacterSheet>(() => structuredClone(props.entity?.characterSheet ?? EMPTY_CHARACTER));
  const [state, setState] = useState<CharacterStatus>(() => structuredClone(props.scene?.states[props.entity?.id ?? ""] ?? EMPTY_STATUS));
  const [present, setPresent] = useState(!!props.scene?.presentIds.includes(props.entity?.id ?? ""));
  const [interlocutor, setInterlocutor] = useState<boolean | null>(null);
  const selectedPartner = interlocutor ?? props.interlocutor ?? (!!props.entity && props.scene?.partnerId === props.entity.id);
  const partnerHelp = useId();
  const [emotion, setEmotion] = useState(state.emotion); const [busy, setBusy] = useState(false); const [uploading, setUploading] = useState(false);
  const [variation, setVariation] = useState(0);
  const [libraryOpen, setLibraryOpen] = useState(false); const [libraryError, setLibraryError] = useState("");
  const variations = portraitVariations(sheet.sprites[emotion]);
  useEffect(() => setVariation(0), [emotion]);
  const [error, setError] = useState<CharacterCopyKey | null>(null); const [dirty, setDirty] = useState(false); const [saved, setSaved] = useState(false);
  const dialog = useRef<HTMLDivElement>(null); const input = useRef<HTMLInputElement>(null); const mounted = useRef(true);
  const close = () => { if (!busy && !uploading && (!dirty || window.confirm(t("discard")))) props.onClose(); };
  const exit = () => { if (!busy && !uploading && (!dirty || window.confirm(t("discard")))) (props.onExit ?? props.onClose)(); };
  useEffect(() => {
    mounted.current = true;
    let previous = dialog.current?.ownerDocument.activeElement as HTMLElement | null;
    while (previous?.shadowRoot?.activeElement) previous = previous.shadowRoot.activeElement as HTMLElement;
    dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => { mounted.current = false; previous?.isConnected && previous.focus(); };
  }, []);
  const options = [...new Set([...props.emotions, state.emotion])];
  const portraitOptions = [...new Set([...props.emotions, state.emotion, ...Object.keys(sheet.sprites)])];
  return <div className={props.embedded ? "dr-character-editor-view" : "dr-character-dialog-layer"} onKeyDown={e => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    if (e.key === "Tab") {
      const items = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') ?? [])].filter(el => el.getClientRects().length);
      const active = (dialog.current?.getRootNode() as Document | ShadowRoot)?.activeElement;
      if (e.shiftKey && active === items[0]) { e.preventDefault(); items.at(-1)?.focus(); }
      if (!e.shiftKey && active === items.at(-1)) { e.preventDefault(); items[0]?.focus(); }
    }
  }}><div ref={dialog} className={props.embedded ? "dr-character-editor" : "dr-character-dialog"} role={props.embedded ? undefined : "dialog"} aria-modal={props.embedded ? undefined : true} aria-labelledby={props.embedded ? undefined : "dr-character-editor-title"}>
    <header>{props.embedded && <button type="button" aria-label={t("backGallery")} title={t("backGallery")} disabled={busy || uploading} onClick={close}><ArrowLeft size={18} /></button>}<h2 id="dr-character-editor-title">{name || t("add")}</h2><button type="button" aria-label={t("cancel")} disabled={busy || uploading} onClick={exit}><X size={20} /></button></header>
    <form onChange={e => { const target = e.target as HTMLElement; if (!target.hasAttribute("data-portrait-preview") && target.getAttribute("type") !== "file") setDirty(true); }} onSubmit={e => { e.preventDefault(); if (busy || uploading) return; setBusy(true); setSaved(false); setError(null); setLibraryError(""); void props.onSave({ name, sheet, state, present, ...(interlocutor !== null ? { interlocutor } : {}) }).then(snapshot => { if (!mounted.current) return; setName(snapshot.name); setSheet(structuredClone(snapshot.sheet)); setState(structuredClone(snapshot.state)); setPresent(snapshot.present); setInterlocutor(snapshot.interlocutor); setDirty(false); setSaved(true); }).catch(error => { if (mounted.current) setError(characterSaveError(error)); }).finally(() => { if (mounted.current) setBusy(false); }); }}>
      <div className="dr-character-editor-body">
        <p className="dr-character-hint">{t("scope")}</p>
        <fieldset disabled={busy}><legend>{t("profile")}</legend>
          <label>{t("name")}<input required value={name} maxLength={80} onChange={e => setName(e.target.value)} /></label>
          <label className="dr-character-check"><input type="checkbox" checked={sheet.protagonist} onChange={e => { setSheet({ ...sheet, protagonist: e.target.checked }); if (e.target.checked && selectedPartner) setInterlocutor(false); }} />{t("protagonist")}</label>
          {(["appearance", "personality", "goals", "background"] as const).map(key => <label key={key}>{t(key)}<textarea aria-label={t(key)} rows={2} maxLength={1200} value={sheet[key]} onChange={e => setSheet({ ...sheet, [key]: e.target.value })} /></label>)}
          {props.entity?.description && <details><summary>{t("background")}</summary><p className="dr-character-original">{props.entity.description}</p></details>}
        </fieldset>
        <fieldset disabled={busy}><legend>{t("state")}</legend>
          <details className="dr-character-hint"><summary>{t("stateHelp")}</summary><p>{t("stateAuto")}</p></details>
          <label className="dr-character-check"><input type="checkbox" checked={present} onChange={e => { setPresent(e.target.checked); if (!e.target.checked && selectedPartner) setInterlocutor(false); }} />{t("present")}</label>
          <small className="dr-character-hint">{t("presentHint")}</small>
          {!sheet.protagonist && <div className="dr-character-partner-control"><label className="dr-character-check"><input type="checkbox" aria-describedby={partnerHelp} checked={selectedPartner} onChange={e => { setInterlocutor(e.target.checked); if (e.target.checked) setPresent(true); }} />{t("interlocutor")}</label><small id={partnerHelp} className="dr-character-hint">{t("interlocutorHint")}</small></div>}
          <label>{t("emotion")}<select aria-label={t("emotion")} value={state.emotion} onChange={e => setState({ ...state, emotion: e.target.value })}>{options.map(value => <option key={value} value={value}>{emotionOptionLabel(props.locale, value)}</option>)}</select></label>
          {(["condition", "goal", "relationship"] as const).map(key => <label key={key}>{t(key)}<textarea aria-label={t(key)} rows={2} maxLength={240} value={state[key]} onChange={e => setState({ ...state, [key]: e.target.value })} /></label>)}
          <strong>{t("stats")}</strong>
          {state.stats.map((stat, i) => <div className="dr-character-stat" key={i}><input aria-label={`${t("statName")} ${i + 1}`} placeholder={t("statName")} required maxLength={40} value={stat.label} onChange={e => setState({ ...state, stats: state.stats.map((s, n) => n === i ? { ...s, label: e.target.value } : s) })} /><input aria-label={`${t("statValue")} ${i + 1}`} placeholder={t("statValue")} maxLength={80} value={stat.value} onChange={e => setState({ ...state, stats: state.stats.map((s, n) => n === i ? { ...s, value: e.target.value } : s) })} /><button type="button" aria-label={`${t("remove")} ${stat.label || i + 1}`} onClick={() => { setDirty(true); setState({ ...state, stats: state.stats.filter((_, n) => n !== i) }); }}><Trash2 size={16} /></button></div>)}
          <button type="button" disabled={state.stats.length >= 6} onClick={() => { setDirty(true); setState({ ...state, stats: [...state.stats, { label: "", value: "" }] }); }}><Plus size={16} />{t("addStat")}</button>
        </fieldset>
        <fieldset disabled={busy || uploading}><legend>{t("portraits")}</legend><div className="dr-character-portrait-editor">
          <CharacterPortrait sheet={sheet} emotion={emotion} variation={variation} alt={name} width={176} height={235} />
          <div><label>{t("gender")}<select aria-label={t("gender")} value={sheet.gender} onChange={e => setSheet({ ...sheet, gender: e.target.value as CharacterSheet["gender"] })}>{(["neutral", "male", "female"] as const).map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
          <label>{t("portraitEmotion")}<select aria-label={t("portraitEmotion")} data-portrait-preview value={emotion} onChange={e => setEmotion(e.target.value)}>{portraitOptions.map(value => <option key={value} value={value}>{emotionOptionLabel(props.locale, value)}{sheet.sprites[value] ? " ✓" : ""}</option>)}</select></label><small className="dr-character-hint">{t("previewOnly")}</small></div>
        </div><p className="dr-character-hint">{t("variationHint")}</p>
        <div className="dr-portrait-variations" role="group" aria-label={t("variations")}>{variations.map((src, index) => <div key={src}><button type="button" aria-label={`${t("variations")} ${index + 1}`} aria-pressed={index === variation} onClick={() => setVariation(index)}><img src={src} alt="" /><span>{index + 1}</span></button><button type="button" aria-label={`${t("remove")} ${t("variations")} ${index + 1}`} onClick={() => { try { setSheet(unassignPortrait(sheet, emotion, index)); setVariation(0); setDirty(true); setLibraryError(""); } catch { setLibraryError(portraitLibraryFull(props.locale)); } }}><Trash2 size={14} /></button></div>)}</div>
        <div className="dr-character-actions"><button type="button" disabled={variations.length >= MAX_PORTRAIT_VARIATIONS} onClick={() => input.current?.click()}><Upload size={16} />{t("addVariations")} · {variations.length}/{MAX_PORTRAIT_VARIATIONS}</button></div>
        <input ref={input} hidden type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ""; if (!files.length) return; if (files.length + variations.length > MAX_PORTRAIT_VARIATIONS) { setError("variationLimit"); return; } setUploading(true); setError(null); void (async () => { const images: string[] = []; for (const file of files) images.push(await readPortrait(file)); return images; })().then(images => { if (mounted.current) { setSheet(previous => withPortraitLibrary({ ...previous, sprites: { ...previous.sprites, [emotion]: [...new Set([...portraitVariations(previous.sprites[emotion]), ...images])] } }, previous.portraitLibrary ?? [])); setDirty(true); } }).catch(() => { if (mounted.current) setError("imageError"); }).finally(() => { if (mounted.current) setUploading(false); }); }} />
        <button type="button" aria-expanded={libraryOpen} onClick={() => setLibraryOpen(!libraryOpen)}>{portraitLibraryTitle(props.locale)} · {libraryImages(sheet).length}</button>
        {libraryOpen && <PortraitLibrary sheet={sheet} locale={props.locale} emotions={portraitOptions} emotion={emotion} onEmotion={setEmotion} onBusy={setUploading} onChange={next => { setSheet(previous => withPortraitLibrary({ ...previous, sprites: next.sprites }, next.portraitLibrary ?? [])); setDirty(true); setError(null); setLibraryError(""); setVariation(0); }} />}
        </fieldset>
      </div>
      <footer>{saved && !dirty && <small role="status">{t("saveDone")}</small>}{(error || libraryError) && <p role="alert">{error ? t(error) : libraryError}</p>}<button type="button" disabled={busy || uploading} onClick={close}>{t(props.embedded ? "backGallery" : "cancel")}</button><button className="dr-character-primary" type="submit" disabled={busy || uploading || !name.trim()}>{t(busy ? "saving" : "save")}</button></footer>
    </form>
  </div></div>;
}
