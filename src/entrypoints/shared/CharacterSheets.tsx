import { SettingsHelp } from "./SettingsHelp";
import { CharacterUpdateNotice } from "./CharacterUpdateNotice";
import { ProfileProtection } from "./ProfileProtection";
import { CastSetup } from "./CastSetup";
import { profileSupplementText } from "../../core/profile-supplement-i18n";
import { CharacterPagination, CHARACTER_PAGE_SIZE, characterPage } from "./CharacterPagination";
import { photoImageSource } from "../../core/photo-assets";
import { CharacterTextField } from "./CharacterTextField";
import { CharacterProfileGenerator } from "./CharacterProfileGenerator";
import { characterTextRequest, type CharacterTextRequestGenerator, type CharacterTextGenerator } from "../../core/character-text";
import { CharacterTextQueue, fieldCancellation } from "../../core/character-text-queue";
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
import { useEffect, useId, useLayoutEffect, useRef, useState, type ImgHTMLAttributes, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { Plus, X, Upload, Trash2, Expand, Pencil, ArrowLeft } from "lucide-react";
import type { CharacterScene, CharacterSheet, CharacterStatus, DeepRoleSettings, Locale, SceneEntity } from "../../core/types";
import { characterText, type CharacterCopyKey, EMPTY_CHARACTER, EMPTY_STATUS, actionLabel, actionOptionLabel, actionsFor, validActions, syncPortraitImage, characterHighlights, characterInterlocutors, characterSaveError, MAX_ACTIVE_ACTIONS } from "../../core/characters";
import type { CharacterEdit, CharacterSaveResult } from "../../storage/characters";
import { portraitVariations, scenePortraitIndex } from "../../core/portrait-variations";
import { characterEditBaseline, type CharacterEditBaseline } from "../../core/character-edit";
import { libraryImages, unassignPortrait, withPortraitLibrary } from "../../core/portrait-library";
import { PortraitLibrary, portraitLibraryFull } from "./PortraitLibrary";
import { readPortraitFiles } from "./portrait-file";
import { usePortraitUploadChoice } from "./PortraitUploadChoice";
import { portraitUploadError } from "../../core/portrait-upload-i18n";
import { ActionList, NewAction, actionControlCopy, actionRenameHint } from "./ActionControls";
import { RelationshipEditor, RelationshipSettings, RelationshipSummary } from "./Relationships";
import { AttributeEditor, AttributeSummary } from "./Attributes";
import { ProgressFeedback } from "./ProgressFeedback";
import { ProgressOutlook } from "./ProgressOutlook";
import { relationshipText } from "../../core/relationship-i18n";
import { allowedCharacterActions, isCharacterActionAllowed, resolveCharacterAction, matchCharacterAction } from "../../core/character-actions";
import { actionPolicyText } from "../../core/action-policy-i18n";
import { ActionAvailability } from "./ActionAvailability";
import type { ActionRenames } from "../../core/action-renames";

const editorCopy = (locale: Locale) => ({
  ru: { profile: "Анкета", scene: "В сцене", images: "Изображения", profileHint: "Постоянные сведения для всех чатов этого мира.", sceneHint: "Общий прогресс этого лора. DeepSeek обновляет поля после ответа в активном чате; при продолжении в другом чате значения сохраняются.", imagesHint: "Референс сохраняет внешность для генерации. Портреты и готовые селфи можно загрузить отдельно и назначить действиям или подборкам.", pending: "Есть несохранённые изменения", required: "Заполните отмеченное поле перед сохранением.", preview: "Портрет для действия", noImages: "Для этого действия пока нет изображений. Загрузите их или выберите в библиотеке ниже.", quickUpload: "Загрузить сразу для этого действия", library: "Библиотека изображений", previewHelp: "Настроить портрет", silhouette: "Силуэт без изображения" },
  en: { profile: "Profile", scene: "In scene", images: "Images", profileHint: "Lasting details shared by all chats in this world.", sceneHint: "Shared progress for this lore. DeepSeek updates fields after a reply in the active chat; values stay when you continue in another chat.", imagesHint: "A reference keeps appearance consistent during generation. Upload portraits and ready selfies separately for actions or collections.", pending: "Unsaved changes", required: "Fill in the highlighted field before saving.", preview: "Portrait for action", noImages: "No images for this action yet. Upload them or choose from the library below.", quickUpload: "Upload directly to this action", library: "Image library", previewHelp: "Set up portrait", silhouette: "Silhouette without an image" },
}[locale]);

function CharacterPortrait({ sheet, action, variation = 0, preview = false, locale, ...attributes }: Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & { sheet?: CharacterSheet; action?: string; variation?: number; preview?: boolean; locale: Locale }) {
  const image = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => { if (image.current) syncPortraitImage(image.current, sheet, action, variation, preview); }, [sheet, action, variation, preview]);
  const view = () => image.current && openPortraitViewer(image.current.ownerDocument, photoImageSource(image.current), attributes.alt ?? "", locale);
  const [available, setAvailable] = useState(false);
  useLayoutEffect(() => { setAvailable(!!image.current && validPortrait(photoImageSource(image.current))); }, [sheet, action, variation, preview]);
  return <img {...attributes} ref={image} role={available ? "button" : undefined} aria-label={available ? photoCopy(locale).open + ": " + (attributes.alt ?? "") : attributes["aria-label"]} tabIndex={available ? 0 : undefined} title={available ? photoCopy(locale).open : attributes.title} style={{ ...attributes.style, ...(available ? { cursor: "zoom-in" } : {}) }} onClick={e => { if (view()) { e.preventDefault(); e.stopPropagation(); } }} onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && available) { e.preventDefault(); e.stopPropagation(); view(); } }} />;
}

export function CharacterSettings({ settings, onSettings, worldActions, onActions }: { settings: DeepRoleSettings; onSettings: (value: DeepRoleSettings) => void | Promise<void>; worldActions?: string[]; onActions?: (actions: string[], renames: ActionRenames) => Promise<void> }) {
  const actionsId = useId();
  const t = (key: CharacterCopyKey) => characterText(settings.locale, key);
  const [draft, setDraft] = useState(actionsFor(worldActions ?? settings.characterActions).join("\n"));
  const [error, setError] = useState(false); const [busy, setBusy] = useState(false);
  const [detachFull, setDetachFull] = useState(false);
  const [layoutError, setLayoutError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [renames, setRenames] = useState<ActionRenames>({});
  useEffect(() => { setDraft(actionsFor(worldActions ?? settings.characterActions).join("\n")); setRenames({}); }, [worldActions?.join("\n"), settings.characterActions?.join("\n")]);
  const actions = draft.split("\n").map(s => s.trim()).filter(Boolean);
  return <section className="dr-character-settings">
    <div className="toggle-row"><SettingsHelp locale={settings.locale} title={t("enable")} text={t("enableHint")}/><input aria-label={t("enable")} type="checkbox" checked={!!settings.characterSheetsEnabled} onChange={e => void onSettings({ ...settings, characterSheetsEnabled: e.target.checked })} /></div>

    <RelationshipSettings settings={settings} onSettings={onSettings} />
    {settings.characterSheetsEnabled && <>
      <div className="toggle-row"><SettingsHelp locale={settings.locale} title={t("sprites")} text={t("floatingSettingHint")}/><input aria-label={t("sprites")} type="checkbox" checked={settings.characterSpritesEnabled !== false} onChange={e => void onSettings({ ...settings, characterSpritesEnabled: e.target.checked })} /></div>

      <button type="button" className="button secondary" disabled={busy} onClick={() => {
        setBusy(true); setLayoutError(false);
        void Promise.resolve(onSettings({ ...settings, portraitLayoutResetAt: Math.max(Date.now(), (settings.portraitLayoutResetAt ?? 0) + 1) })).catch(() => setLayoutError(true)).finally(() => setBusy(false));
      }}>{t("layoutResetAll")}</button>
      {layoutError && <p role="alert" className="error-text">{t("layoutFailed")}</p>}
      <div className="dr-action-settings"><SettingsHelp locale={settings.locale} title={t("actions") + " · " + actions.length + "/" + MAX_ACTIVE_ACTIONS} text={[actionControlCopy(settings.locale).hint, actionControlCopy(settings.locale).keepImages, actionRenameHint(settings.locale), t("actionKeys")].join("\n\n")}/>

      <ActionList hideHint locale={settings.locale} actions={actions} disabled={busy} onChange={next => { setDraft(next.join("\n")); setError(false); setSaved(false); }} onRename={onActions ? (from, to) => {
        const original = Object.entries(renames).find(([, current]) => current === from)?.[0] ?? from;
        const next = { ...renames };
        if (original === to) delete next[original]; else next[original] = to;
        setRenames(next); setDraft(actions.map(key => key === from ? to : key).join("\n")); setError(false); setSaved(false);
      } : undefined} />
      <NewAction locale={settings.locale} actions={actions} disabled={busy} onAdd={async name => { setDraft([...actions, name].join("\n")); setError(false); setSaved(false); }} />
      <details className="dr-action-help"><summary>{actionControlCopy(settings.locale).bulk}</summary><label className="field-label" htmlFor={actionsId}>{t("actions")}</label><textarea id={actionsId} rows={6} maxLength={MAX_ACTIVE_ACTIONS * 33} value={draft.split("\n").map(key => actionOptionLabel(settings.locale,key)).join("\n")} disabled={busy} onChange={e => { const known=[...new Set([...actions,...actionsFor(worldActions ?? settings.characterActions)])];setDraft(e.target.value.split("\n").map(key => matchCharacterAction(key,known) ?? key).join("\n")); setError(false); setSaved(false); }} aria-describedby={`${actionsId}-help`} /><p id={`${actionsId}-help`} className="setting-copy">{t("actionsHint")}</p></details>

      {error && <p role="alert" className="error-text">{detachFull ? actionPolicyText(settings.locale, "detachFull") : t(validActions(actions) ? "actionSaveFailed" : "actionError")}</p>}
      <button className="button primary" disabled={busy} onClick={() => { setDetachFull(false); if (!validActions(actions)) { setError(true); return; } setBusy(true); setSaved(false); void Promise.resolve(onActions ? onActions(actions, Object.fromEntries(Object.entries(renames).filter(([, to]) => actions.includes(to)))) : onSettings({ ...settings, characterActions: actions })).then(() => { setError(false); setSaved(true); }).catch(error => { setDetachFull(error instanceof Error && error.message === "portrait-library-full"); setError(true); }).finally(() => setBusy(false)); }}>{t("saveActions")}</button>{saved && <small role="status">{t("saveDone")}</small>}
      </div>
    </>}
  </section>;
}

export function CharacterPanel(props: { storyProfileIds?: string[]; generationScope?: string; onAskSelfie?: (entityId: string) => Promise<void>; relationshipsEnabled?: boolean; relationshipDisplay?: DeepRoleSettings["relationshipDisplay"]; locale: Locale; entities: SceneEntity[]; scene?: CharacterScene; actions: string[]; base: string; worldId: string; chatId: string; status: CharacterCopyKey; generating?: boolean; onAddAction?: (worldId: string, name: string) => Promise<string[]>; onSave: (edit: Omit<CharacterEdit, "chatUrl">) => Promise<CharacterSaveResult>; onGenerateText?: CharacterTextRequestGenerator; onRequestFactChange?: (entityId: string, brief: string) => Promise<void>; onRetry: () => void; openId?: string | null; onOpened?: () => void }) {
  const panel = useRef<HTMLElement>(null);
  const t = (key: CharacterCopyKey) => characterText(props.locale, key);
  const [edit, setEdit] = useState<{ entity: SceneEntity | null; entityId: string | null; session: number; scene?: CharacterScene; base: string; original: CharacterEditBaseline } | null>(null);
  const editSession = useRef(0);
  const openEdit = (entity: SceneEntity | null) => setEdit({ entity, entityId: entity?.id ?? null, session: ++editSession.current, scene: props.scene, base: props.base, original: characterEditBaseline(entity, props.entities, props.scene) });
  const [gallery, setGallery] = useState(false); const [galleryQuery, setGalleryQuery] = useState("");
  const galleryRef = useRef<HTMLDivElement>(null); const galleryOrigin = useRef<HTMLElement | null>(null); const editOrigin = useRef<HTMLElement | null>(null);
  const [castView, setCastView] = useState<"scene" | "all">("scene"); const [query, setQuery] = useState("");
  const [listPage, setListPage] = useState(0), [galleryPage, setGalleryPage] = useState(0);
  useEffect(() => setListPage(0), [props.worldId, props.chatId, castView, query]);
  useEffect(() => setGalleryPage(0), [props.worldId, props.chatId, galleryQuery]);
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
  const galleryMatches = entities.filter(entity => [entity.name, ...entity.aliases].some(name => name.toLocaleLowerCase().includes(galleryQuery.trim().toLocaleLowerCase())));
  const partners = new Set(characterInterlocutors(props.entities, props.scene).map(person => person.id));
  const role = (entity: SceneEntity) => t(entity.characterSheet?.protagonist ? "portraitHero" : partners.has(entity.id) ? "portraitPartner" : props.scene?.presentIds.includes(entity.id) ? "present" : "absent");
  const hero = props.entities.find(person => person.characterSheet?.protagonist);
const editor = edit && <CharacterEditor key={`${props.worldId}:${props.chatId}:${edit.session}`} hasStoryProfile={props.storyProfileIds?.includes(edit.entityId ?? "")} hero={hero} relationshipsEnabled={props.relationshipsEnabled} embedded={gallery} locale={props.locale} entity={edit.entity} scene={edit.scene} interlocutor={edit.original.interlocutor} actions={props.actions} onAddAction={props.onAddAction ? name => props.onAddAction!(props.worldId, name) : undefined} onClose={() => setEdit(null)} onExit={() => { setEdit(null); setGallery(false); }} onGenerateText={props.onGenerateText} generationScope={props.generationScope} onRequestFactChange={props.onRequestFactChange} onSave={async (value) => { const saved = await props.onSave({ ...value, entityId: edit.entityId, base: edit.base, original: edit.original, worldId: props.worldId, chatId: props.chatId }); setEdit(current => current?.session === edit.session ? { ...current, entityId: saved.entityId, base: saved.base, original: saved.original } : current); return saved.original; }} />;
  return <section ref={panel} className="dr-characters" aria-label={t("title")}>
    <header><strong>{t("title")}</strong><div className="dr-character-header-actions"><CastSetup worldId={props.worldId} locale={props.locale} compact /><button type="button" aria-label={t("openGallery")} title={t("openGallery")} onClick={event => { galleryOrigin.current = event.currentTarget; editOrigin.current = null; setGallery(true); }}><Expand size={16} /></button><button type="button" aria-label={t("add")} title={t("add")} onClick={() => openEdit(null)}><Plus size={16} /></button></div></header>
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
    {shown.length ? <div className="dr-character-list">{shown.slice(characterPage(listPage, shown.length) * CHARACTER_PAGE_SIZE, (characterPage(listPage, shown.length) + 1) * CHARACTER_PAGE_SIZE).map(entity => {
      const state = props.scene?.states[entity.id] ?? entity.characterSheet?.initialStatus;
      const highlights = characterHighlights(state);
      return <div key={entity.id} className="dr-character-person"><button className="dr-character-row" type="button" onClick={() => openEdit(entity)} title={`${t("edit")}: ${entity.name}. ${state?.condition || t("noState")}`}>
        <span><strong>{entity.name}</strong><small>{role(entity)}</small>{props.relationshipsEnabled !== false && <><RelationshipSummary locale={props.locale} person={entity} hero={hero} state={state} display={props.relationshipDisplay} /><AttributeSummary locale={props.locale} sheet={entity.characterSheet} state={state} /></>}{highlights.length > 0 && <span className="dr-character-highlights">{highlights.map((stat, index) => <span key={index} title={`${stat.label}: ${stat.value}`}>{stat.label}: {stat.value}</span>)}</span>}</span><small className="dr-character-row-action">{state ? actionLabel(props.locale, resolveCharacterAction(entity.characterSheet, state.action)) : t("noState")}</small>
      </button>{props.onAskSelfie && !entity.characterSheet?.protagonist && <SelfieRequest person={entity} hero={hero} scene={props.scene} locale={props.locale} tracking={props.relationshipsEnabled !== false} disabled={props.generating} onRequest={props.onAskSelfie} />}</div>;
    })}</div> : <p>{t(entities.length ? castView === "all" ? "noMatches" : "noCast" : "empty")}</p>}
    <CharacterPagination locale={props.locale} page={listPage} count={shown.length} onPage={setListPage} />
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
        <header><h2 id="dr-character-gallery-title">{t("gallery")}</h2><div className="dr-character-header-actions"><button type="button" aria-label={t("add")} onClick={event => { editOrigin.current = event.currentTarget; openEdit(null); }}><Plus size={18} /></button><button type="button" aria-label={t("cancel")} onClick={() => setGallery(false)}><X size={20} /></button></div></header>
        <div className="dr-character-gallery-search"><input className="dr-character-search" type="search" aria-label={t("searchCast")} placeholder={t("searchCast")} value={galleryQuery} maxLength={80} onChange={event => setGalleryQuery(event.target.value)} /></div>
        <div className="dr-character-gallery-grid">{galleryMatches.slice(characterPage(galleryPage, galleryMatches.length) * CHARACTER_PAGE_SIZE, (characterPage(galleryPage, galleryMatches.length) + 1) * CHARACTER_PAGE_SIZE).map(entity => {
          const state = props.scene?.states[entity.id] ?? entity.characterSheet?.initialStatus; const highlights = characterHighlights(state);
          return <article key={entity.id} className="dr-character-gallery-card"><CharacterPortrait locale={props.locale} width={144} height={192} loading="lazy" sheet={entity.characterSheet} action={state?.action} variation={scenePortraitIndex(entity, props.scene)} alt={entity.name} /><div className="dr-character-gallery-caption"><strong>{entity.name}</strong><button type="button" aria-label={`${t("editCharacter")}: ${entity.name}`} title={t("editCharacter")} onClick={event => { editOrigin.current = event.currentTarget; openEdit(entity); }}><Pencil size={16} /></button></div><small>{role(entity)}</small>{props.onAskSelfie && !entity.characterSheet?.protagonist && <SelfieRequest person={entity} hero={hero} scene={props.scene} locale={props.locale} tracking={props.relationshipsEnabled !== false} disabled={props.generating} onRequest={props.onAskSelfie} />}<small>{state ? actionLabel(props.locale, resolveCharacterAction(entity.characterSheet, state.action)) : t("noState")}</small>{highlights.length > 0 && <span className="dr-character-highlights">{highlights.map((stat, index) => <span key={index} title={`${stat.label}: ${stat.value}`}>{stat.label}: {stat.value}</span>)}</span>}</article>;
        })}{!entities.length && <p>{t("empty")}</p>}{entities.length > 0 && !galleryMatches.length && <p>{t("noMatches")}</p>}</div>
        <CharacterPagination locale={props.locale} page={galleryPage} count={galleryMatches.length} onPage={setGalleryPage} />
      </div>{editor}
    </div></div> : editor, panel.current?.closest(".dr-root") ?? panel.current ?? document.body)}
  </section>;
}


export function CharacterEditor(props: { hasStoryProfile?: boolean; generationScope?: string; hero?: SceneEntity; relationshipsEnabled?: boolean; locale: Locale; entity: SceneEntity | null; scene?: CharacterScene; interlocutor?: boolean; actions: string[]; embedded?: boolean; onAddAction?: (name: string) => Promise<string[]>; onClose: () => void; onExit?: () => void; onGenerateText?: CharacterTextRequestGenerator; onRequestFactChange?: (entityId: string, brief: string) => Promise<void>; onSave: (value: { name: string; sheet: CharacterSheet; state: CharacterStatus; present: boolean; interlocutor?: boolean }) => Promise<CharacterEditBaseline> }) {
  const t = (key: CharacterCopyKey) => characterText(props.locale, key);
  const ui = editorCopy(props.locale);
  const uploadChoice = usePortraitUploadChoice(props.locale);
  const [tab, setTab] = useState<"profile" | "scene" | "images" | "relationships">("profile"); const tabsId = useId();
  const [fieldError, setFieldError] = useState("");
  const [localActions, setLocalActions] = useState(props.actions);
  useEffect(() => setLocalActions(props.actions), [props.actions]);
  const [name, setName] = useState(props.entity?.name ?? "");
  const [sheet, updateSheet] = useState<CharacterSheet>(() => structuredClone(props.entity?.characterSheet ?? EMPTY_CHARACTER));
  const [state, updateState] = useState<CharacterStatus>(() => structuredClone(props.scene?.states[props.entity?.id ?? ""] ?? props.entity?.characterSheet?.initialStatus ?? EMPTY_STATUS));
  const latestDraft = useRef({ name, sheet, state, entity: props.entity, generate: props.onGenerateText }); latestDraft.current = { name, sheet, state, entity: props.entity, generate: props.onGenerateText };
  const setSheet = (next: SetStateAction<CharacterSheet>) => { latestDraft.current.sheet = typeof next === "function" ? next(latestDraft.current.sheet) : next; updateSheet(latestDraft.current.sheet); };
  const setState = (next: SetStateAction<CharacterStatus>) => { latestDraft.current.state = typeof next === "function" ? next(latestDraft.current.state) : next; updateState(latestDraft.current.state); };
  const textQueue = useRef<CharacterTextQueue | null>(null); if (!textQueue.current) textQueue.current = new CharacterTextQueue();
  useEffect(() => () => textQueue.current?.cancelAll(), []);
  const textScope = useRef(props.generationScope);
  useEffect(() => { if (textScope.current !== props.generationScope) { textScope.current = props.generationScope; textQueue.current?.cancelAll("scene-changed"); } }, [props.generationScope]);
  const [present, setPresent] = useState(!!props.scene?.presentIds.includes(props.entity?.id ?? ""));
  const [interlocutor, setInterlocutor] = useState<boolean | null>(null);
  const selectedPartner = interlocutor ?? props.interlocutor ?? (!!props.entity && props.scene?.partnerId === props.entity.id);
  const generateText: CharacterTextGenerator | undefined = props.onGenerateText ? (field, currentText, options) => textQueue.current!.enqueue(async signal => {
    fieldCancellation(signal); const draft = latestDraft.current;
    if (!draft.name.trim()) throw new Error("character-name");
    if (!draft.generate) throw new Error("cancelled");
    return draft.generate(characterTextRequest(field, currentText, draft.name.trim(), draft.entity, draft.sheet, draft.state), { signal });
  }, options) : undefined;
  const partnerHelp = useId();
  const [action, setAction] = useState(state.action); const [busy, setBusy] = useState(false); const [uploading, setUploading] = useState(false);
  const [variation, setVariation] = useState(0);
  const [libraryError, setLibraryError] = useState("");
  const variations = portraitVariations(sheet.sprites[action]);
  useEffect(() => setVariation(0), [action]);
  const [error, setError] = useState<CharacterCopyKey | null>(null); const [dirty, setDirty] = useState(false); const [saved, setSaved] = useState(false);
  const [factBrief, setFactBrief] = useState(""); const [factBusy, setFactBusy] = useState(false); const [factError, setFactError] = useState("");
  const dialog = useRef<HTMLDivElement>(null); const input = useRef<HTMLInputElement>(null); const mounted = useRef(true);
  const manageActions = () => {
    setTab("profile");
    requestAnimationFrame(() => {
      const section = dialog.current?.querySelector<HTMLElement>("[data-action-policy]");
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
  const options = allowedCharacterActions(sheet, [...localActions, state.action]);
  const portraitOptions = [...new Set(["neutral", ...localActions])];
  const assignmentOptions = allowedCharacterActions(sheet, portraitOptions);
  useEffect(() => { if (!portraitOptions.includes(action)) setAction("neutral"); }, [localActions, action]);
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
    {uploadChoice.dialog}
    <form noValidate onChange={e => { const target = e.target as HTMLElement; if (!target.hasAttribute("data-portrait-preview") && !target.hasAttribute("data-fact-request") && target.getAttribute("type") !== "file") setDirty(true); }} onSubmit={e => { e.preventDefault(); if (busy || uploading) return; const invalid = e.currentTarget.querySelector<HTMLInputElement | HTMLTextAreaElement>("input:invalid, textarea:invalid, select:invalid"); if (invalid) { const section = invalid.closest<HTMLElement>("[data-editor-section]")?.dataset.editorSection as typeof tab; setTab(section ?? "profile"); setFieldError(ui.required); requestAnimationFrame(() => invalid.focus()); return; } setFieldError(""); setBusy(true); setSaved(false); setError(null); setLibraryError(""); void props.onSave({ name, sheet, state, present, ...(interlocutor !== null ? { interlocutor } : {}) }).then(snapshot => { if (!mounted.current) return; setName(snapshot.name); setSheet(structuredClone(snapshot.sheet)); setState(structuredClone(snapshot.state)); setPresent(snapshot.present); setInterlocutor(snapshot.interlocutor); setDirty(false); setSaved(true); }).catch(error => { if (mounted.current) setError(characterSaveError(error)); }).finally(() => { if (mounted.current) setBusy(false); }); }}>
      <div className="dr-character-editor-body">
        <section data-editor-section="profile" id={tabsId + "-panel-profile"} role="tabpanel" aria-labelledby={tabsId + "-profile"} hidden={tab !== "profile"}><CharacterUpdateNotice locale={props.locale} kind="profile" />{props.hasStoryProfile && <p className="dr-character-hint">{profileSupplementText(props.locale, "editorHint")}</p>}
        <fieldset disabled={busy}><legend>{t("profile")}</legend>
          <label>{t("name")}<input required value={name} maxLength={80} onChange={e => setName(e.target.value)} /></label>
          <label className="dr-character-check"><input type="checkbox" checked={sheet.protagonist} onChange={e => { setSheet({ ...sheet, protagonist: e.target.checked }); if (e.target.checked && selectedPartner) setInterlocutor(false); }} />{t("protagonist")}</label>
          {generateText && <CharacterProfileGenerator locale={props.locale} name={name} values={sheet} disabled={busy || uploading} scope={props.generationScope} onGenerate={generateText} onApply={changes => { setSheet(previous => { const next = { ...previous }; for (const change of changes) if (previous[change.key] === change.expected) next[change.key] = change.text; return next; }); setDirty(true); }} />}
          {(["appearance", "personality", "goals", "background"] as const).map(key => <CharacterTextField key={key} field={{ key, label: t(key), maxLength: 1200, scope: "profile" }} locale={props.locale} value={sheet[key]} onChange={value => { setSheet(previous => ({ ...previous, [key]: value })); setDirty(true); }} onGenerate={generateText} disabled={busy} />)}
          <ProfileProtection locale={props.locale} sheet={sheet} disabled={busy} onChange={next => { setSheet(next); setDirty(true); }} />
          {props.entity?.description && <details><summary>{t("background")}</summary><p className="dr-character-original">{props.entity.description}</p></details>}
        </fieldset>
        <ActionAvailability locale={props.locale} sheet={sheet} actions={localActions} disabled={busy || uploading} onChange={next => { setSheet(next); setDirty(true); }} />
        {props.entity && props.onRequestFactChange && <details className="dr-character-fact-request"><summary>{props.locale === "ru" ? "Изменить постоянный факт" : "Correct a lasting fact"}</summary><p className="dr-character-hint">{props.locale === "ru" ? "DeepRole проверит весь лор этого мира. DeepSeek предложит замены; вы увидите «было → станет» до сохранения." : "DeepRole checks this world's lore. DeepSeek suggests replacements; you review before saving."}</p><label>{props.locale === "ru" ? "Что должно быть теперь?" : "What should be true now?"}<textarea data-fact-request rows={3} maxLength={6000} disabled={factBusy || busy} value={factBrief} onChange={event => setFactBrief(event.target.value)} placeholder={props.locale === "ru" ? "Например: теперь у Элис чёрные волосы вместо рыжих" : "For example: Alice now has black hair instead of red hair"} /></label><button type="button" disabled={factBusy || busy || uploading || !factBrief.trim()} onClick={() => { if (dirty) { setFactError(props.locale === "ru" ? "Сначала сохраните правки карточки." : "Save your profile edits first."); return; } setFactBusy(true); setFactError(""); void props.onRequestFactChange!(props.entity!.id, factBrief.trim()).then(() => { if (mounted.current) (props.onExit ?? props.onClose)(); }).catch(cause => { if (mounted.current) { const code = cause instanceof Error ? cause.message : ""; setFactError(code === "character-world-too-large" ? props.locale === "ru" ? "Лор слишком велик для одной безопасной проверки. Ничего не изменено." : "This world is too large for one safe review. Nothing changed." : code === "busy" ? props.locale === "ru" ? "Дождитесь окончания ответа DeepSeek." : "Wait for DeepSeek to finish." : props.locale === "ru" ? "Не удалось начать проверку. Память не изменена." : "Could not start the review. Memory is unchanged."); } }).finally(() => { if (mounted.current) setFactBusy(false); }); }}>{factBusy ? props.locale === "ru" ? "Готовим запрос…" : "Preparing…" : props.locale === "ru" ? "Попросить DeepSeek" : "Ask DeepSeek"}</button>{factError && <p role="alert">{factError}</p>}</details>}
        </section><section data-editor-section="scene" id={tabsId + "-panel-scene"} role="tabpanel" aria-labelledby={tabsId + "-scene"} hidden={tab !== "scene"}>
        <fieldset disabled={busy}><legend>{t("state")}</legend>
          <CharacterUpdateNotice locale={props.locale} kind="scene" />
          <label className="dr-character-check"><input type="checkbox" checked={present} onChange={e => { setPresent(e.target.checked); if (!e.target.checked && selectedPartner) setInterlocutor(false); }} />{t("present")}</label>
          <small className="dr-character-hint">{t("presentHint")}</small>
          {!sheet.protagonist && <div className="dr-character-partner-control"><label className="dr-character-check"><input type="checkbox" aria-describedby={partnerHelp} checked={selectedPartner} onChange={e => { setInterlocutor(e.target.checked); if (e.target.checked) setPresent(true); }} />{t("interlocutor")}</label><small id={partnerHelp} className="dr-character-hint">{t("interlocutorHint")}</small></div>}
          <label>{t("action")}<Select aria-label={t("action")} value={resolveCharacterAction(sheet, state.action)} onChange={e => setState({ ...state, action: e.target.value })}>{options.map(value => <option key={value} value={value}>{actionOptionLabel(props.locale, value)}</option>)}</Select></label>
          <button type="button" onClick={manageActions}>{actionPolicyText(props.locale, "manage")}</button>
          {(["condition", "goal", "relationship"] as const).map(key => <CharacterTextField key={key} field={{ key, label: t(key), maxLength: 240, scope: "scene" }} locale={props.locale} value={state[key]} onChange={value => { setState(previous => ({ ...previous, [key]: value })); setDirty(true); }} onGenerate={generateText} disabled={busy} />)}
          <strong>{t("stats")}</strong>
          {state.stats.map((stat, i) => <div className="dr-character-stat" key={i}><input aria-label={`${t("statName")} ${i + 1}`} placeholder={t("statName")} required maxLength={40} value={stat.label} onChange={e => setState({ ...state, stats: state.stats.map((s, n) => n === i ? { ...s, label: e.target.value } : s) })} /><input aria-label={`${t("statValue")} ${i + 1}`} placeholder={t("statValue")} maxLength={80} value={stat.value} onChange={e => setState({ ...state, stats: state.stats.map((s, n) => n === i ? { ...s, value: e.target.value } : s) })} /><button type="button" aria-label={`${t("remove")} ${stat.label || i + 1}`} onClick={() => { setDirty(true); setState({ ...state, stats: state.stats.filter((_, n) => n !== i) }); }}><Trash2 size={16} /></button></div>)}
          <button type="button" disabled={state.stats.length >= 6} onClick={() => { setDirty(true); setState({ ...state, stats: [...state.stats, { label: "", value: "" }] }); }}><Plus size={16} />{t("addStat")}</button>
        </fieldset>
        <AttributeEditor onGenerate={generateText} locale={props.locale} sheet={sheet} state={state} enabled={props.relationshipsEnabled} disabled={busy} onSheet={next => { setSheet(next); setDirty(true); }} onState={next => { setState(next); setDirty(true); }} />
        </section><section data-editor-section="relationships" id={tabsId + "-panel-relationships"} role="tabpanel" aria-labelledby={tabsId + "-relationships"} hidden={tab !== "relationships"}><RelationshipEditor onGenerate={generateText} locale={props.locale} entity={props.entity} hero={props.hero} enabled={props.relationshipsEnabled} notice={props.scene?.relationshipNotice} sheet={sheet} state={state} disabled={busy} onSheet={next => { setSheet(next); setDirty(true); }} onState={next => { setState(next); setDirty(true); }} /></section><section data-editor-section="images" id={tabsId + "-panel-images"} role="tabpanel" aria-labelledby={tabsId + "-images"} hidden={tab !== "images"}><p className="dr-character-hint">{ui.imagesHint}</p>
        <section className="dr-selfie-methods" aria-label={selfieText(props.locale, "methods")}><h3>{selfieText(props.locale, "methods")}</h3><div><h4>{selfieText(props.locale, "uploadedMethod")}</h4><p className="dr-character-hint">{selfieText(props.locale, "uploadedHint")}</p></div><div><h4>{selfieText(props.locale, "generatedMethod")}</h4><p className="dr-character-hint">{selfieText(props.locale, "generatedHint")}</p></div><p className="dr-character-hint">{selfieText(props.locale, "manualHint")}</p></section>
        <CharacterReference sheet={sheet} name={name} locale={props.locale} disabled={busy || uploading} onBusy={setUploading} onChange={next => { setSheet(previous => ({ ...previous, imageGeneration: next.imageGeneration, portraitLibrary: next.portraitLibrary, sprites: next.sprites })); setDirty(true); }} />
        {!sheet.protagonist && <section className="dr-generated-selfie-settings"><h3>{selfieText(props.locale, "generated")}</h3>{props.entity && <SelfieStatus person={{ ...props.entity, characterSheet: sheet }} hero={props.hero} scene={props.scene} locale={props.locale} tracking={props.relationshipsEnabled !== false} />}<SelfieAccess locale={props.locale} value={sheet.selfieAccess ?? DEFAULT_SELFIE_ACCESS} disabled={busy || uploading} onChange={selfieAccess => { setSheet(previous => ({ ...previous, selfieAccess })); setDirty(true); }} /><p className="dr-character-hint">{selfieText(props.locale, "requestHint")}</p></section>}
        <ActionAvailability expanded locale={props.locale} sheet={sheet} actions={localActions} disabled={busy || uploading} onChange={next => { setSheet(next); setDirty(true); setVariation(0); }} />
        <fieldset disabled={busy || uploading}><legend>{t("portraits")}</legend><div className="dr-character-portrait-editor">
          <CharacterPortrait locale={props.locale} preview sheet={sheet} action={action} variation={variation} alt={name} width={176} height={235} />
          <div><label>{t("portraitAction")}<Select aria-label={t("portraitAction")} data-portrait-preview value={action} onChange={e => setAction(e.target.value)}>{portraitOptions.map(value => <option key={value} value={value}>{actionOptionLabel(props.locale, value)}{sheet.sprites[value] ? " ✓" : ""}</option>)}</Select></label><small className="dr-character-hint">{t("previewOnly")}</small></div>
        </div>
        {!isCharacterActionAllowed(sheet, action) && <div className="dr-action-policy-notice"><small className="dr-character-hint">{actionPolicyText(props.locale, "unavailable")}</small><button type="button" onClick={manageActions}>{actionPolicyText(props.locale, "manage")}</button></div>}
        {!variations.length && <p className="dr-character-hint">{ui.noImages}</p>}
        {props.onAddAction && <details className="dr-action-help"><summary>{actionControlCopy(props.locale).add}</summary><NewAction locale={props.locale} actions={localActions} disabled={busy || uploading} onAdd={async name => { const next = await props.onAddAction!(name); if (mounted.current) { setLocalActions(next); setAction(name); } }} /><p className="dr-character-hint">{actionControlCopy(props.locale).scope}</p></details>}
        <div className="dr-portrait-variations" role="group" aria-label={t("variations")}>{variations.map((src, index) => <div key={src}><button type="button" aria-label={`${t("variations")} ${index + 1}`} aria-pressed={index === variation} onClick={() => setVariation(index)}><img src={src} alt="" /><span>{index + 1}</span></button><button type="button" aria-label={`${t("remove")} ${t("variations")} ${index + 1}`} onClick={() => { try { setSheet(unassignPortrait(sheet, action, index)); setVariation(0); setDirty(true); setLibraryError(""); } catch { setLibraryError(portraitLibraryFull(props.locale)); } }}><Trash2 size={14} /></button></div>)}</div>
        <div className="dr-character-actions"><button type="button" disabled={!isCharacterActionAllowed(sheet, action)} onClick={() => input.current?.click()}><Upload size={16} />{ui.quickUpload} · {variations.length}</button></div>
        <input ref={input} className="dr-portrait-upload" hidden type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ""; if (!files.length) return; setUploading(true); setError(null); setLibraryError(""); void uploadChoice.choose(files).then(async mode => { if (!mode || !mounted.current) return; const images = await readPortraitFiles(files, undefined, mode); if (mounted.current) { setSheet(previous => withPortraitLibrary({ ...previous, sprites: { ...previous.sprites, [action]: [...new Set([...portraitVariations(previous.sprites[action]), ...images])] } }, previous.portraitLibrary ?? [])); setDirty(true); } }).catch(cause => { if (mounted.current) setLibraryError(portraitUploadError(props.locale, cause, t("imageError"))); }).finally(() => { if (mounted.current) setUploading(false); }); }} />
        <PortraitLibrary sheet={sheet} locale={props.locale} actions={assignmentOptions} action={assignmentOptions.includes(action) ? action : "neutral"} onAction={setAction} onBusy={setUploading} onChange={next => { setSheet(previous => withPortraitLibrary({ ...previous, sprites: next.sprites }, next.portraitLibrary ?? [])); setDirty(true); setError(null); setLibraryError(""); setVariation(0); }} />
        <details className="dr-selfie-collections"><summary>{selfieText(props.locale, "collections")}</summary><p className="dr-character-hint">{selfieText(props.locale, "collectionsHint")}</p><SelfieCategories onGenerate={generateText} locale={props.locale} value={sheet.selfieCategories ?? []} library={libraryImages(sheet)} disabled={busy || uploading} onBusy={setUploading} onChange={next => { setSheet(previous => ({ ...previous, selfieCategories: next })); setDirty(true); }} /></details>
        <details className="dr-action-help"><summary>{ui.silhouette}</summary><label>{t("gender")}<Select aria-label={t("gender")} value={sheet.gender} onChange={e => setSheet({ ...sheet, gender: e.target.value as CharacterSheet["gender"] })}>{(["neutral", "male", "female"] as const).map(value => <option key={value} value={value}>{t(value)}</option>)}</Select></label></details>
        <details className="dr-action-help"><summary>{t("variations")}</summary><p className="dr-character-hint">{t("variationHint")}</p></details>
        </fieldset></section>
      </div>
      <footer>{dirty && <small className="dr-editor-unsaved">{ui.pending}</small>}{fieldError && <p role="alert">{fieldError}</p>}{saved && !dirty && <small role="status">{t("saveDone")}</small>}{(error || libraryError) && <p role="alert">{error ? t(error) : libraryError}</p>}<button type="button" disabled={busy || uploading} onClick={close}>{t(props.embedded ? "backGallery" : "cancel")}</button><button className="dr-character-primary" type="submit" disabled={busy || uploading || !name.trim()}>{t(busy ? "saving" : "save")}</button></footer>
    </form>
  </div></div>;
}
