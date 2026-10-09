import { CastSetup } from "./CastSetup";
import { CharacterTextField } from "./CharacterTextField";
import { characterTextRequest, type CharacterTextRequest, type CharacterTextGenerator } from "../../core/character-text";
import { preventLabelActivation } from "./control-label";
import { SelfieCategories } from "./SelfieCategories";
import { CharacterReference } from "./CharacterReference";
import { SelfieAccess, SelfieStatus } from "./SelfieAccess";
import { SelfieRequest } from "./SelfieRequest";
import { DEFAULT_SELFIE_ACCESS } from "../../core/selfies";
import { selfieText } from "../../core/selfie-i18n";
import { openPortraitViewer, photoCopy } from "../../adapters/portrait-viewer";
import { validPortrait } from "../../core/portrait-variations";
import { Select } from "./Select";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { Plus, X, Upload, Trash2, Expand, Pencil, ArrowLeft } from "lucide-react";
import type { CharacterScene, CharacterSheet, CharacterStatus, DeepRoleSettings, Locale, SceneEntity } from "../../core/types";
import { characterText, type CharacterCopyKey, EMPTY_CHARACTER, EMPTY_STATUS, emotionLabel, emotionOptionLabel, emotionsFor, validEmotions, syncPortraitImage, characterHighlights, characterInterlocutors, characterSaveError, MAX_ACTIVE_EMOTIONS } from "../../core/characters";
import type { CharacterEdit, CharacterSaveResult } from "../../storage/characters";
import { MAX_PORTRAIT_VARIATIONS, portraitVariations, scenePortraitIndex } from "../../core/portrait-variations";
import { characterEditBaseline, type CharacterEditBaseline } from "../../core/character-edit";
import { libraryImages, unassignPortrait, withPortraitLibrary } from "../../core/portrait-library";
import { PortraitLibrary, portraitLibraryFull } from "./PortraitLibrary";
import { readPortraitFiles } from "./portrait-file";
import { portraitUploadError } from "../../core/portrait-upload-i18n";
import { EmotionList, NewEmotion, emotionControlCopy } from "./EmotionControls";
import { RelationshipEditor, RelationshipSettings, RelationshipSummary } from "./Relationships";
import { AttributeEditor, AttributeSummary } from "./Attributes";
import { ProgressFeedback } from "./ProgressFeedback";
import { ProgressOutlook } from "./ProgressOutlook";
import { relationshipText } from "../../core/relationship-i18n";
import { allowedCharacterEmotions, isCharacterEmotionAllowed, resolveCharacterEmotion } from "../../core/character-emotions";
import { emotionPolicyText } from "../../core/emotion-policy-i18n";
import { EmotionAvailability } from "./EmotionAvailability";

const editorCopy = (locale: Locale) => ({
  ru: { profile: "Анкета", scene: "В сцене", images: "Изображения", profileHint: "Постоянные сведения для всех чатов этого мира.", sceneHint: "Только этот чат. DeepSeek обновляет эти поля после ответа, если прислал изменения.", imagesHint: "Референс сохраняет внешность для генерации. Портреты и готовые селфи можно загрузить отдельно и назначить эмоциям или подборкам.", pending: "Есть несохранённые изменения", required: "Заполните отмеченное поле перед сохранением.", preview: "Портрет для эмоции", noImages: "Для этой эмоции пока нет изображений. Загрузите их или выберите в библиотеке ниже.", quickUpload: "Загрузить сразу для этой эмоции", library: "Библиотека изображений", previewHelp: "Настроить портрет", silhouette: "Силуэт без изображения" },
  en: { profile: "Profile", scene: "In scene", images: "Images", profileHint: "Lasting details shared by all chats in this world.", sceneHint: "This chat only. DeepSeek updates these fields after a reply if it sends changes.", imagesHint: "A reference keeps appearance consistent during generation. Upload portraits and ready selfies separately for emotions or collections.", pending: "Unsaved changes", required: "Fill in the highlighted field before saving.", preview: "Portrait for emotion", noImages: "No images for this emotion yet. Upload them or choose from the library below.", quickUpload: "Upload directly to this emotion", library: "Image library", previewHelp: "Set up portrait", silhouette: "Silhouette without an image" },
}[locale]);

function CharacterPortrait({ sheet, emotion, variation = 0, preview = false, locale, ...attributes }: Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & { sheet?: CharacterSheet; emotion?: string; variation?: number; preview?: boolean; locale: Locale }) {
  const image = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => { if (image.current) syncPortraitImage(image.current, sheet, emotion, variation, preview); }, [sheet, emotion, variation, preview]);
  const view = () => image.current && openPortraitViewer(image.current.ownerDocument, image.current.getAttribute("src") ?? "", attributes.alt ?? "", locale);
  const [available, setAvailable] = useState(false);
  useLayoutEffect(() => { setAvailable(validPortrait(image.current?.getAttribute("src"))); }, [sheet, emotion, variation, preview]);
  return <img {...attributes} ref={image} role={available ? "button" : undefined} aria-label={available ? photoCopy(locale).open + ": " + (attributes.alt ?? "") : attributes["aria-label"]} tabIndex={available ? 0 : undefined} title={available ? photoCopy(locale).open : attributes.title} style={{ ...attributes.style, ...(available ? { cursor: "zoom-in" } : {}) }} onClick={e => { if (view()) { e.preventDefault(); e.stopPropagation(); } }} onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && available) { e.preventDefault(); e.stopPropagation(); view(); } }} />;
}

export function CharacterSettings({ settings, onSettings, worldEmotions, onEmotions }: { settings: DeepRoleSettings; onSettings: (value: DeepRoleSettings) => void | Promise<void>; worldEmotions?: string[]; onEmotions?: (emotions: string[]) => Promise<void> }) {
  const emotionsId = useId();
  const t = (key: CharacterCopyKey) => characterText(settings.locale, key);
  const [draft, setDraft] = useState(emotionsFor(worldEmotions ?? settings.characterEmotions).join("\n"));
  const [error, setError] = useState(false); const [busy, setBusy] = useState(false);
  const [detachFull, setDetachFull] = useState(false);
  const [layoutError, setLayoutError] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(emotionsFor(worldEmotions ?? settings.characterEmotions).join("\n")), [worldEmotions?.join("\n"), settings.characterEmotions?.join("\n")]);
  const emotions = draft.split("\n").map(s => s.trim()).filter(Boolean);
  return <section className="dr-character-settings">
    <label className="toggle-row"><span>{t("enable")}</span><input type="checkbox" checked={!!settings.characterSheetsEnabled} onChange={e => void onSettings({ ...settings, characterSheetsEnabled: e.target.checked })} /></label>
    <p className="setting-copy">{t("enableHint")}</p>
    <RelationshipSettings settings={settings} onSettings={onSettings} />
    {settings.characterSheetsEnabled && <>
      <label className="toggle-row"><span>{t("sprites")}</span><input type="checkbox" checked={settings.characterSpritesEnabled !== false} onChange={e => void onSettings({ ...settings, characterSpritesEnabled: e.target.checked })} /></label>
      <p className="setting-copy">{t("floatingSettingHint")}</p>
      <button type="button" className="button secondary" disabled={busy} onClick={() => {
        setBusy(true); setLayoutError(false);
        void Promise.resolve(onSettings({ ...settings, portraitLayoutResetAt: Math.max(Date.now(), (settings.portraitLayoutResetAt ?? 0) + 1) })).catch(() => setLayoutError(true)).finally(() => setBusy(false));
      }}>{t("layoutResetAll")}</button>
      {layoutError && <p role="alert" className="error-text">{t("layoutFailed")}</p>}
      <div className="dr-emotion-settings"><strong>{t("emotions")} · {emotions.length}/{MAX_ACTIVE_EMOTIONS}</strong>
      <p className="setting-copy">{emotionControlCopy(settings.locale).hint}</p>
      <EmotionList locale={settings.locale} emotions={emotions} disabled={busy} onChange={next => { setDraft(next.join("\n")); setError(false); setSaved(false); }} />
      <NewEmotion locale={settings.locale} emotions={emotions} disabled={busy} onAdd={async name => { setDraft([...emotions, name].join("\n")); setError(false); setSaved(false); }} />
      <details className="dr-emotion-help"><summary>{emotionControlCopy(settings.locale).bulk}</summary><label className="field-label" htmlFor={emotionsId}>{t("emotions")}</label><textarea id={emotionsId} rows={6} maxLength={MAX_ACTIVE_EMOTIONS * 33} value={draft} disabled={busy} onChange={e => { setDraft(e.target.value); setError(false); setSaved(false); }} aria-describedby={`${emotionsId}-help`} /><p id={`${emotionsId}-help`} className="setting-copy">{t("emotionsHint")}</p></details>
      <p className="setting-copy">{emotionControlCopy(settings.locale).keepImages}</p><details className="dr-emotion-help"><summary>{t("emotionNames")}</summary><p className="setting-copy">{t("emotionKeys")}</p></details>
      {error && <p role="alert" className="error-text">{detachFull ? emotionPolicyText(settings.locale, "detachFull") : t(validEmotions(emotions) ? "failed" : "emotionError")}</p>}
      <button className="button primary" disabled={busy} onClick={() => { setDetachFull(false); if (!validEmotions(emotions)) { setError(true); return; } setBusy(true); setSaved(false); void Promise.resolve(onEmotions ? onEmotions(emotions) : onSettings({ ...settings, characterEmotions: emotions })).then(() => { setError(false); setSaved(true); }).catch(error => { setDetachFull(error instanceof Error && error.message === "portrait-library-full"); setError(true); }).finally(() => setBusy(false)); }}>{t("saveEmotions")}</button>{saved && <small role="status">{t("saveDone")}</small>}
      </div>
    </>}
  </section>;
}

export function CharacterPanel(props: { onAskSelfie?: (entityId: string) => Promise<void>; relationshipsEnabled?: boolean; relationshipDisplay?: DeepRoleSettings["relationshipDisplay"]; locale: Locale; entities: SceneEntity[]; scene?: CharacterScene; emotions: string[]; base: string; worldId: string; chatId: string; status: CharacterCopyKey; generating?: boolean; onAddEmotion?: (worldId: string, name: string) => Promise<string[]>; onSave: (edit: Omit<CharacterEdit, "chatUrl">) => Promise<CharacterSaveResult>; onGenerateText?: (request: CharacterTextRequest) => Promise<string>; onRequestFactChange?: (entityId: string, brief: string) => Promise<void>; onRetry: () => void; openId?: string | null; onOpened?: () => void }) {
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
  const hero = props.entities.find(person => person.characterSheet?.protagonist);
  const editor = edit && <CharacterEditor key={`${props.worldId}:${props.chatId}:${edit.session}`} hero={hero} relationshipsEnabled={props.relationshipsEnabled} embedded={gallery} locale={props.locale} entity={edit.entity} scene={edit.scene} interlocutor={edit.original.interlocutor} emotions={props.emotions} onAddEmotion={props.onAddEmotion ? name => props.onAddEmotion!(props.worldId, name) : undefined} onClose={() => setEdit(null)} onExit={() => { setEdit(null); setGallery(false); }} onGenerateText={props.onGenerateText} onRequestFactChange={props.onRequestFactChange} onSave={async (value) => { const saved = await props.onSave({ ...value, entityId: edit.entityId, base: edit.base, original: edit.original, worldId: props.worldId, chatId: props.chatId }); setEdit(current => current?.session === edit.session ? { ...current, entityId: saved.entityId, base: saved.base, original: saved.original } : current); return saved.original; }} />;
  return <section ref={panel} className="dr-characters" aria-label={t("title")}>
    <header><strong>{t("title")}</strong><div className="dr-character-header-actions"><CastSetup worldId={props.worldId} locale={props.locale} compact /><button type="button" aria-label={t("openGallery")} title={t("openGallery")} onClick={event => { galleryOrigin.current = event.currentTarget; editOrigin.current = null; setGallery(true); }}><Expand size={16} /></button><button type="button" aria-label={t("add")} title={t("add")} disabled={entities.length >= 40} onClick={() => openEdit(null)}><Plus size={16} /></button></div></header>
    <p className="dr-character-status" role="status">{t(props.generating ? "waiting" : props.status)}</p>
    {props.status === "autoFailed" && <button type="button" onClick={props.onRetry}>{t("retry")}</button>}
    {props.relationshipsEnabled !== false && <ProgressFeedback locale={props.locale} entities={props.entities} scene={props.scene} display={props.relationshipDisplay} />}
    {props.relationshipsEnabled !== false && <ProgressOutlook locale={props.locale} entities={props.entities} scene={props.scene} display={props.relationshipDisplay} />}
    {entities.length > 0 && <>
      <div className="dr-character-cast-view" role="group" aria-label={t("castView")}>
        <button type="button" aria-pressed={castView === "scene"} onClick={() => setCastView("scene")}>{t("sceneCast")} · {cast.length}</button>
        <button type="button" aria-pressed={castView === "all"} onClick={() => setCastView("all")}>{t("allCast")} · {entities.length}</button>
      </div>
      {castView === "all" && <input className="dr-character-search" type="search" aria-label={t("searchCast")} placeholder={t("searchCast")} value={query} maxLength={80} onChange={event => setQuery(event.target.value)} />}
      {!props.scene && castView === "scene" && <p className="dr-character-hint">{t("castFallback")}</p>}
    </>}
    {shown.length ? <div className="dr-character-list">{shown.map(entity => {
      const state = props.scene?.states[entity.id] ?? entity.characterSheet?.initialStatus;
      const highlights = characterHighlights(state);
      return <div key={entity.id} className="dr-character-person"><button className="dr-character-row" type="button" onClick={() => openEdit(entity)} title={`${t("edit")}: ${entity.name}. ${state?.condition || t("noState")}`}>
        <span><strong>{entity.name}</strong><small>{role(entity)}</small>{props.relationshipsEnabled !== false && <><RelationshipSummary locale={props.locale} person={entity} hero={hero} state={state} display={props.relationshipDisplay} /><AttributeSummary locale={props.locale} sheet={entity.characterSheet} state={state} /></>}{highlights.length > 0 && <span className="dr-character-highlights">{highlights.map((stat, index) => <span key={index} title={`${stat.label}: ${stat.value}`}>{stat.label}: {stat.value}</span>)}</span>}</span><small className="dr-character-row-mood">{state ? emotionLabel(props.locale, resolveCharacterEmotion(entity.characterSheet, state.emotion)) : t("noState")}</small>
      </button>{props.onAskSelfie && !entity.characterSheet?.protagonist && <SelfieRequest person={entity} hero={hero} scene={props.scene} locale={props.locale} tracking={props.relationshipsEnabled !== false} disabled={props.generating} onRequest={props.onAskSelfie} />}</div>;
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
          const state = props.scene?.states[entity.id] ?? entity.characterSheet?.initialStatus; const highlights = characterHighlights(state);
          return <article key={entity.id} className="dr-character-gallery-card"><CharacterPortrait locale={props.locale} width={144} height={192} loading="lazy" sheet={entity.characterSheet} emotion={state?.emotion} variation={scenePortraitIndex(entity, props.scene)} alt={entity.name} /><div className="dr-character-gallery-caption"><strong>{entity.name}</strong><button type="button" aria-label={`${t("editCharacter")}: ${entity.name}`} title={t("editCharacter")} onClick={event => { editOrigin.current = event.currentTarget; openEdit(entity); }}><Pencil size={16} /></button></div><small>{role(entity)}</small>{props.onAskSelfie && !entity.characterSheet?.protagonist && <SelfieRequest person={entity} hero={hero} scene={props.scene} locale={props.locale} tracking={props.relationshipsEnabled !== false} disabled={props.generating} onRequest={props.onAskSelfie} />}<small>{state ? emotionLabel(props.locale, resolveCharacterEmotion(entity.characterSheet, state.emotion)) : t("noState")}</small>{highlights.length > 0 && <span className="dr-character-highlights">{highlights.map((stat, index) => <span key={index} title={`${stat.label}: ${stat.value}`}>{stat.label}: {stat.value}</span>)}</span>}</article>;
        })}{!entities.length && <p>{t("empty")}</p>}{entities.length > 0 && !entities.some(entity => [entity.name, ...entity.aliases].some(name => name.toLocaleLowerCase().includes(galleryQuery.trim().toLocaleLowerCase()))) && <p>{t("noMatches")}</p>}</div>
      </div>{editor}
    </div></div> : editor, panel.current?.closest(".dr-root") ?? panel.current ?? document.body)}
  </section>;
}


export function CharacterEditor(props: { hero?: SceneEntity; relationshipsEnabled?: boolean; locale: Locale; entity: SceneEntity | null; scene?: CharacterScene; interlocutor?: boolean; emotions: string[]; embedded?: boolean; onAddEmotion?: (name: string) => Promise<string[]>; onClose: () => void; onExit?: () => void; onGenerateText?: (request: CharacterTextRequest) => Promise<string>; onRequestFactChange?: (entityId: string, brief: string) => Promise<void>; onSave: (value: { name: string; sheet: CharacterSheet; state: CharacterStatus; present: boolean; interlocutor?: boolean }) => Promise<CharacterEditBaseline> }) {
  const t = (key: CharacterCopyKey) => characterText(props.locale, key);
  const ui = editorCopy(props.locale);
  const [tab, setTab] = useState<"profile" | "scene" | "images" | "relationships">("profile"); const tabsId = useId();
  const [fieldError, setFieldError] = useState("");
  const [localEmotions, setLocalEmotions] = useState(props.emotions);
  useEffect(() => setLocalEmotions(props.emotions), [props.emotions]);
  const [name, setName] = useState(props.entity?.name ?? "");
  const [sheet, setSheet] = useState<CharacterSheet>(() => structuredClone(props.entity?.characterSheet ?? EMPTY_CHARACTER));
  const [state, setState] = useState<CharacterStatus>(() => structuredClone(props.scene?.states[props.entity?.id ?? ""] ?? props.entity?.characterSheet?.initialStatus ?? EMPTY_STATUS));
  const [present, setPresent] = useState(!!props.scene?.presentIds.includes(props.entity?.id ?? ""));
  const [interlocutor, setInterlocutor] = useState<boolean | null>(null);
  const selectedPartner = interlocutor ?? props.interlocutor ?? (!!props.entity && props.scene?.partnerId === props.entity.id);
  const generateText: CharacterTextGenerator | undefined = props.onGenerateText ? async (field, currentText) => { if (!name.trim()) throw new Error("character-name"); return props.onGenerateText!(characterTextRequest(field, currentText, name.trim(), props.entity, sheet, state)); } : undefined;
  const partnerHelp = useId();
  const [emotion, setEmotion] = useState(state.emotion); const [busy, setBusy] = useState(false); const [uploading, setUploading] = useState(false);
  const [variation, setVariation] = useState(0);
  const [libraryError, setLibraryError] = useState("");
  const variations = portraitVariations(sheet.sprites[emotion]);
  useEffect(() => setVariation(0), [emotion]);
  const [error, setError] = useState<CharacterCopyKey | null>(null); const [dirty, setDirty] = useState(false); const [saved, setSaved] = useState(false);
  const [factBrief, setFactBrief] = useState(""); const [factBusy, setFactBusy] = useState(false); const [factError, setFactError] = useState("");
  const dialog = useRef<HTMLDivElement>(null); const input = useRef<HTMLInputElement>(null); const mounted = useRef(true);
  const manageEmotions = () => {
    setTab("profile");
    requestAnimationFrame(() => {
      const section = dialog.current?.querySelector<HTMLElement>("[data-emotion-policy]");
      const details = section?.querySelector("details"); if (details) details.open = true;
      section?.scrollIntoView({ block: "start" });
      section?.querySelector<HTMLInputElement>("input[type=search]")?.focus({ preventScroll: true });
    });
  };
  useLayoutEffect(() => { const body = dialog.current?.querySelector<HTMLElement>(".dr-character-editor-body"); if (body) body.scrollTop = 0; }, [tab]);
  const close = () => { if (!busy && !uploading && (!dirty || window.confirm(t("discard")))) props.onClose(); };
  const exit = () => { if (!busy && !uploading && (!dirty || window.confirm(t("discard")))) (props.onExit ?? props.onClose)(); };
  useLayoutEffect(() => {
    mounted.current = true;
    let previous = dialog.current?.ownerDocument.activeElement as HTMLElement | null;
    while (previous?.shadowRoot?.activeElement) previous = previous.shadowRoot.activeElement as HTMLElement;
    dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => { mounted.current = false; previous?.isConnected && previous.focus(); };
  }, []);
  const options = allowedCharacterEmotions(sheet, [...localEmotions, state.emotion]);
  const portraitOptions = [...new Set(["neutral", ...localEmotions])];
  const assignmentOptions = allowedCharacterEmotions(sheet, portraitOptions);
  useEffect(() => { if (!portraitOptions.includes(emotion)) setEmotion("neutral"); }, [localEmotions, emotion]);
  return <div className={props.embedded ? "dr-character-editor-view" : "dr-character-dialog-layer"} onClickCapture={preventLabelActivation} onKeyDown={e => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    if (e.key === "Tab") {
      const items = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') ?? [])].filter(el => el.getClientRects().length);
      const active = (dialog.current?.getRootNode() as Document | ShadowRoot)?.activeElement;
      if (e.shiftKey && active === items[0]) { e.preventDefault(); items.at(-1)?.focus(); }
      if (!e.shiftKey && active === items.at(-1)) { e.preventDefault(); items[0]?.focus(); }
    }
  }}><div ref={dialog} className={props.embedded ? "dr-character-editor" : "dr-character-dialog"} role={props.embedded ? undefined : "dialog"} aria-modal={props.embedded ? undefined : true} aria-labelledby={props.embedded ? undefined : "dr-character-editor-title"}>
    <header>{props.embedded && <button type="button" aria-label={t("backGallery")} title={t("backGallery")} disabled={busy || uploading} onClick={close}><ArrowLeft size={18} /></button>}<h2 id="dr-character-editor-title">{name || t("add")}</h2><button type="button" aria-label={t("cancel")} disabled={busy || uploading} onClick={exit}><X size={20} /></button></header>
    <nav className="dr-editor-tabs" role="tablist" aria-label={t("editCharacter")}>{(["profile", "scene", "relationships", "images"] as const).map(id => <button key={id} type="button" id={tabsId + "-" + id} role="tab" aria-selected={tab === id} aria-controls={tabsId + "-panel-" + id} tabIndex={tab === id ? 0 : -1} onClick={() => { setTab(id); setFieldError(""); }} onKeyDown={event => { const order = ["profile", "scene", "relationships", "images"] as const; const index = order.indexOf(id); const next = event.key === "ArrowRight" ? order[(index + 1) % order.length] : event.key === "ArrowLeft" ? order[(index + order.length - 1) % order.length] : event.key === "Home" ? order[0] : event.key === "End" ? order.at(-1) : null; if (next) { event.preventDefault(); event.stopPropagation(); setTab(next); document.getElementById(tabsId + "-" + next)?.focus(); dialog.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]').forEach(button => { if(button.id === tabsId + "-" + next) button.focus(); }); } }}>{id === "relationships" ? relationshipText(props.locale, "title") : ui[id]}</button>)}</nav>
    <form noValidate onChange={e => { const target = e.target as HTMLElement; if (!target.hasAttribute("data-portrait-preview") && !target.hasAttribute("data-fact-request") && target.getAttribute("type") !== "file") setDirty(true); }} onSubmit={e => { e.preventDefault(); if (busy || uploading) return; const invalid = e.currentTarget.querySelector<HTMLInputElement | HTMLTextAreaElement>("input:invalid, textarea:invalid, select:invalid"); if (invalid) { const section = invalid.closest<HTMLElement>("[data-editor-section]")?.dataset.editorSection as typeof tab; setTab(section ?? "profile"); setFieldError(ui.required); requestAnimationFrame(() => invalid.focus()); return; } setFieldError(""); setBusy(true); setSaved(false); setError(null); setLibraryError(""); void props.onSave({ name, sheet, state, present, ...(interlocutor !== null ? { interlocutor } : {}) }).then(snapshot => { if (!mounted.current) return; setName(snapshot.name); setSheet(structuredClone(snapshot.sheet)); setState(structuredClone(snapshot.state)); setPresent(snapshot.present); setInterlocutor(snapshot.interlocutor); setDirty(false); setSaved(true); }).catch(error => { if (mounted.current) setError(characterSaveError(error)); }).finally(() => { if (mounted.current) setBusy(false); }); }}>
      <div className="dr-character-editor-body">
        <section data-editor-section="profile" id={tabsId + "-panel-profile"} role="tabpanel" aria-labelledby={tabsId + "-profile"} hidden={tab !== "profile"}><p className="dr-character-hint">{ui.profileHint}</p>
        <fieldset disabled={busy}><legend>{t("profile")}</legend>
          <label>{t("name")}<input required value={name} maxLength={80} onChange={e => setName(e.target.value)} /></label>
          <label className="dr-character-check"><input type="checkbox" checked={sheet.protagonist} onChange={e => { setSheet({ ...sheet, protagonist: e.target.checked }); if (e.target.checked && selectedPartner) setInterlocutor(false); }} />{t("protagonist")}</label>
          {(["appearance", "personality", "goals", "background"] as const).map(key => <CharacterTextField key={key} field={{ key, label: t(key), maxLength: 1200, scope: "profile" }} locale={props.locale} value={sheet[key]} onChange={value => { setSheet({ ...sheet, [key]: value }); setDirty(true); }} onGenerate={generateText} disabled={busy} />)}
          {props.entity?.description && <details><summary>{t("background")}</summary><p className="dr-character-original">{props.entity.description}</p></details>}
        </fieldset>
        <EmotionAvailability locale={props.locale} sheet={sheet} emotions={localEmotions} disabled={busy || uploading} onChange={next => { setSheet(next); setDirty(true); }} />
        {props.entity && props.onRequestFactChange && <details className="dr-character-fact-request"><summary>{props.locale === "ru" ? "Изменить постоянный факт" : "Correct a lasting fact"}</summary><p className="dr-character-hint">{props.locale === "ru" ? "DeepRole проверит весь лор этого мира. DeepSeek предложит замены; вы увидите «было → станет» до сохранения." : "DeepRole checks this world's lore. DeepSeek suggests replacements; you review before saving."}</p><label>{props.locale === "ru" ? "Что должно быть теперь?" : "What should be true now?"}<textarea data-fact-request rows={3} maxLength={6000} disabled={factBusy || busy} value={factBrief} onChange={event => setFactBrief(event.target.value)} placeholder={props.locale === "ru" ? "Например: теперь у Элис чёрные волосы вместо рыжих" : "For example: Alice now has black hair instead of red hair"} /></label><button type="button" disabled={factBusy || busy || uploading || !factBrief.trim()} onClick={() => { if (dirty) { setFactError(props.locale === "ru" ? "Сначала сохраните правки карточки." : "Save your profile edits first."); return; } setFactBusy(true); setFactError(""); void props.onRequestFactChange!(props.entity!.id, factBrief.trim()).then(() => { if (mounted.current) (props.onExit ?? props.onClose)(); }).catch(cause => { if (mounted.current) { const code = cause instanceof Error ? cause.message : ""; setFactError(code === "character-world-too-large" ? props.locale === "ru" ? "Лор слишком велик для одной безопасной проверки. Ничего не изменено." : "This world is too large for one safe review. Nothing changed." : code === "busy" ? props.locale === "ru" ? "Дождитесь окончания ответа DeepSeek." : "Wait for DeepSeek to finish." : props.locale === "ru" ? "Не удалось начать проверку. Память не изменена." : "Could not start the review. Memory is unchanged."); } }).finally(() => { if (mounted.current) setFactBusy(false); }); }}>{factBusy ? props.locale === "ru" ? "Готовим запрос…" : "Preparing…" : props.locale === "ru" ? "Попросить DeepSeek" : "Ask DeepSeek"}</button>{factError && <p role="alert">{factError}</p>}</details>}
        </section><section data-editor-section="scene" id={tabsId + "-panel-scene"} role="tabpanel" aria-labelledby={tabsId + "-scene"} hidden={tab !== "scene"}><p className="dr-character-hint">{ui.sceneHint}</p>
        <fieldset disabled={busy}><legend>{t("state")}</legend>
          <details className="dr-character-hint"><summary>{t("stateHelp")}</summary><p>{t("stateAuto")}</p></details>
          <label className="dr-character-check"><input type="checkbox" checked={present} onChange={e => { setPresent(e.target.checked); if (!e.target.checked && selectedPartner) setInterlocutor(false); }} />{t("present")}</label>
          <small className="dr-character-hint">{t("presentHint")}</small>
          {!sheet.protagonist && <div className="dr-character-partner-control"><label className="dr-character-check"><input type="checkbox" aria-describedby={partnerHelp} checked={selectedPartner} onChange={e => { setInterlocutor(e.target.checked); if (e.target.checked) setPresent(true); }} />{t("interlocutor")}</label><small id={partnerHelp} className="dr-character-hint">{t("interlocutorHint")}</small></div>}
          <label>{t("emotion")}<Select aria-label={t("emotion")} value={resolveCharacterEmotion(sheet, state.emotion)} onChange={e => setState({ ...state, emotion: e.target.value })}>{options.map(value => <option key={value} value={value}>{emotionOptionLabel(props.locale, value)}</option>)}</Select></label>
          <button type="button" onClick={manageEmotions}>{emotionPolicyText(props.locale, "manage")}</button>
          {(["condition", "goal", "relationship"] as const).map(key => <CharacterTextField key={key} field={{ key, label: t(key), maxLength: 240, scope: "scene" }} locale={props.locale} value={state[key]} onChange={value => { setState({ ...state, [key]: value }); setDirty(true); }} onGenerate={generateText} disabled={busy} />)}
          <strong>{t("stats")}</strong>
          {state.stats.map((stat, i) => <div className="dr-character-stat" key={i}><input aria-label={`${t("statName")} ${i + 1}`} placeholder={t("statName")} required maxLength={40} value={stat.label} onChange={e => setState({ ...state, stats: state.stats.map((s, n) => n === i ? { ...s, label: e.target.value } : s) })} /><input aria-label={`${t("statValue")} ${i + 1}`} placeholder={t("statValue")} maxLength={80} value={stat.value} onChange={e => setState({ ...state, stats: state.stats.map((s, n) => n === i ? { ...s, value: e.target.value } : s) })} /><button type="button" aria-label={`${t("remove")} ${stat.label || i + 1}`} onClick={() => { setDirty(true); setState({ ...state, stats: state.stats.filter((_, n) => n !== i) }); }}><Trash2 size={16} /></button></div>)}
          <button type="button" disabled={state.stats.length >= 6} onClick={() => { setDirty(true); setState({ ...state, stats: [...state.stats, { label: "", value: "" }] }); }}><Plus size={16} />{t("addStat")}</button>
        </fieldset>
        <AttributeEditor onGenerate={generateText} locale={props.locale} sheet={sheet} state={state} enabled={props.relationshipsEnabled} disabled={busy} onSheet={next => { setSheet(next); setDirty(true); }} onState={next => { setState(next); setDirty(true); }} />
        </section><section data-editor-section="relationships" id={tabsId + "-panel-relationships"} role="tabpanel" aria-labelledby={tabsId + "-relationships"} hidden={tab !== "relationships"}><RelationshipEditor onGenerate={generateText} locale={props.locale} entity={props.entity} hero={props.hero} enabled={props.relationshipsEnabled} notice={props.scene?.relationshipNotice} sheet={sheet} state={state} disabled={busy} onSheet={next => { setSheet(next); setDirty(true); }} onState={next => { setState(next); setDirty(true); }} /></section><section data-editor-section="images" id={tabsId + "-panel-images"} role="tabpanel" aria-labelledby={tabsId + "-images"} hidden={tab !== "images"}><p className="dr-character-hint">{ui.imagesHint}</p>
        <section className="dr-selfie-methods" aria-label={selfieText(props.locale, "methods")}><h3>{selfieText(props.locale, "methods")}</h3><div><h4>{selfieText(props.locale, "uploadedMethod")}</h4><p className="dr-character-hint">{selfieText(props.locale, "uploadedHint")}</p></div><div><h4>{selfieText(props.locale, "generatedMethod")}</h4><p className="dr-character-hint">{selfieText(props.locale, "generatedHint")}</p></div><p className="dr-character-hint">{selfieText(props.locale, "manualHint")}</p></section>
        <CharacterReference sheet={sheet} name={name} locale={props.locale} disabled={busy || uploading} onBusy={setUploading} onChange={next => { setSheet(previous => ({ ...previous, imageGeneration: next.imageGeneration, portraitLibrary: next.portraitLibrary, sprites: next.sprites })); setDirty(true); }} />
        {!sheet.protagonist && <section className="dr-generated-selfie-settings"><h3>{selfieText(props.locale, "generated")}</h3>{props.entity && <SelfieStatus person={{ ...props.entity, characterSheet: sheet }} hero={props.hero} scene={props.scene} locale={props.locale} tracking={props.relationshipsEnabled !== false} />}<SelfieAccess locale={props.locale} value={sheet.selfieAccess ?? DEFAULT_SELFIE_ACCESS} disabled={busy || uploading} onChange={selfieAccess => { setSheet(previous => ({ ...previous, selfieAccess })); setDirty(true); }} /><p className="dr-character-hint">{selfieText(props.locale, "requestHint")}</p></section>}
        <EmotionAvailability expanded locale={props.locale} sheet={sheet} emotions={localEmotions} disabled={busy || uploading} onChange={next => { setSheet(next); setDirty(true); setVariation(0); }} />
        <fieldset disabled={busy || uploading}><legend>{t("portraits")}</legend><div className="dr-character-portrait-editor">
          <CharacterPortrait locale={props.locale} preview sheet={sheet} emotion={emotion} variation={variation} alt={name} width={176} height={235} />
          <div><label>{t("portraitEmotion")}<Select aria-label={t("portraitEmotion")} data-portrait-preview value={emotion} onChange={e => setEmotion(e.target.value)}>{portraitOptions.map(value => <option key={value} value={value}>{emotionOptionLabel(props.locale, value)}{sheet.sprites[value] ? " ✓" : ""}</option>)}</Select></label><small className="dr-character-hint">{t("previewOnly")}</small></div>
        </div>
        {!isCharacterEmotionAllowed(sheet, emotion) && <div className="dr-emotion-policy-notice"><small className="dr-character-hint">{emotionPolicyText(props.locale, "unavailable")}</small><button type="button" onClick={manageEmotions}>{emotionPolicyText(props.locale, "manage")}</button></div>}
        {!variations.length && <p className="dr-character-hint">{ui.noImages}</p>}
        {props.onAddEmotion && <details className="dr-emotion-help"><summary>{emotionControlCopy(props.locale).add}</summary><NewEmotion locale={props.locale} emotions={localEmotions} disabled={busy || uploading} onAdd={async name => { const next = await props.onAddEmotion!(name); if (mounted.current) { setLocalEmotions(next); setEmotion(name); } }} /><p className="dr-character-hint">{emotionControlCopy(props.locale).scope}</p></details>}
        <div className="dr-portrait-variations" role="group" aria-label={t("variations")}>{variations.map((src, index) => <div key={src}><button type="button" aria-label={`${t("variations")} ${index + 1}`} aria-pressed={index === variation} onClick={() => setVariation(index)}><img src={src} alt="" /><span>{index + 1}</span></button><button type="button" aria-label={`${t("remove")} ${t("variations")} ${index + 1}`} onClick={() => { try { setSheet(unassignPortrait(sheet, emotion, index)); setVariation(0); setDirty(true); setLibraryError(""); } catch { setLibraryError(portraitLibraryFull(props.locale)); } }}><Trash2 size={14} /></button></div>)}</div>
        <div className="dr-character-actions"><button type="button" disabled={!isCharacterEmotionAllowed(sheet, emotion) || variations.length >= MAX_PORTRAIT_VARIATIONS} onClick={() => input.current?.click()}><Upload size={16} />{ui.quickUpload} · {variations.length}/{MAX_PORTRAIT_VARIATIONS}</button></div>
        <input ref={input} className="dr-portrait-upload" hidden type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ""; if (!files.length) return; if (files.length + variations.length > MAX_PORTRAIT_VARIATIONS) { setError("variationLimit"); return; } setUploading(true); setError(null); setLibraryError(""); void readPortraitFiles(files).then(images => { if (mounted.current) { setSheet(previous => withPortraitLibrary({ ...previous, sprites: { ...previous.sprites, [emotion]: [...new Set([...portraitVariations(previous.sprites[emotion]), ...images])] } }, previous.portraitLibrary ?? [])); setDirty(true); } }).catch(cause => { if (mounted.current) setLibraryError(portraitUploadError(props.locale, cause, t("imageError"))); }).finally(() => { if (mounted.current) setUploading(false); }); }} />
        <PortraitLibrary sheet={sheet} locale={props.locale} emotions={assignmentOptions} emotion={assignmentOptions.includes(emotion) ? emotion : "neutral"} onEmotion={setEmotion} onBusy={setUploading} onChange={next => { setSheet(previous => withPortraitLibrary({ ...previous, sprites: next.sprites }, next.portraitLibrary ?? [])); setDirty(true); setError(null); setLibraryError(""); setVariation(0); }} />
        <details className="dr-selfie-collections"><summary>{selfieText(props.locale, "collections")}</summary><p className="dr-character-hint">{selfieText(props.locale, "collectionsHint")}</p><SelfieCategories onGenerate={generateText} locale={props.locale} value={sheet.selfieCategories ?? []} library={libraryImages(sheet)} disabled={busy || uploading} onBusy={setUploading} onChange={next => { setSheet(previous => ({ ...previous, selfieCategories: next })); setDirty(true); }} /></details>
        <details className="dr-emotion-help"><summary>{ui.silhouette}</summary><label>{t("gender")}<Select aria-label={t("gender")} value={sheet.gender} onChange={e => setSheet({ ...sheet, gender: e.target.value as CharacterSheet["gender"] })}>{(["neutral", "male", "female"] as const).map(value => <option key={value} value={value}>{t(value)}</option>)}</Select></label></details>
        <details className="dr-emotion-help"><summary>{t("variations")}</summary><p className="dr-character-hint">{t("variationHint")}</p></details>
        </fieldset></section>
      </div>
      <footer>{dirty && <small className="dr-editor-unsaved">{ui.pending}</small>}{fieldError && <p role="alert">{fieldError}</p>}{saved && !dirty && <small role="status">{t("saveDone")}</small>}{(error || libraryError) && <p role="alert">{error ? t(error) : libraryError}</p>}<button type="button" disabled={busy || uploading} onClick={close}>{t(props.embedded ? "backGallery" : "cancel")}</button><button className="dr-character-primary" type="submit" disabled={busy || uploading || !name.trim()}>{t(busy ? "saving" : "save")}</button></footer>
    </form>
  </div></div>;
}
