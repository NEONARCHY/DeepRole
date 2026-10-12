import { Select } from "./Select";
import { usePortraitUploadChoice } from "./PortraitUploadChoice";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Trash2, Upload, Maximize2, X } from "lucide-react";
import type { CharacterSheet, Locale } from "../../core/types";
import { actionLabel, actionOptionLabel } from "../../core/characters";
import { assignLibraryActions, libraryImages, withPortraitLibrary } from "../../core/portrait-library";
import { portraitVariations } from "../../core/portrait-variations";
import { searchPortraitActions } from "../../core/portrait-action-search";
import { readPortraitFiles } from "./portrait-file";
import { getSettings, updateSettings } from "../../storage/settings";
import { DEFAULT_PORTRAIT_PREVIEW_SIZE, validPortraitPreviewSize } from "../../core/portrait-upload";
import { portraitUploadError, portraitUploadText } from "../../core/portrait-upload-i18n";
import { openPortraitViewer, photoCopy } from "../../adapters/portrait-viewer";
import type { CSSProperties } from "react";

const copy = {
  ru: { more: "Ещё действия для этих картинок", shared: "Отметьте дополнительные действия — выбранные картинки будут доступны для каждого из них. Новые названия можно добавить здесь, выше.", title: "Библиотека изображений", upload: "Загрузить в библиотеку", hint: "Загрузите пачку, выберите картинки и назначьте действие. Сохраняется вместе с карточкой.", empty: "Здесь будут все портреты персонажа. Можно загрузить несколько файлов сразу.", all: "Все", unassigned: "Без назначения", select: "Выбрать изображение", remove: "Удалить из библиотеки", clear: "Снять выбор", assign: "Назначить действия", action: "Назначить действие", noRoom: "Не удалось назначить изображения. Проверьте выбранное действие.", full: "Не удалось обновить библиотеку.", actionFull: "Не удалось создать набор изображений для действия.", badImage: "Не удалось загрузить пачку. Проверьте файлы: PNG, JPG или WebP. Прежние изображения сохранены.", selected: (n: number) => `Выбрано: ${n}`, progress: (n: number, total: number) => `Загружаем: ${n}/${total}`, assigned: (n: number, action: string) => `Назначено: ${n} · ${action}` },
  en: { more: "More actions for these images", shared: "Choose extra actions to use these images for each one. Add new names above.", title: "Image library", upload: "Upload to library", hint: "Upload a batch, select images, then assign an action. Saved with the character sheet.", empty: "All this character’s portraits will appear here. Upload several files at once.", all: "All", unassigned: "Unassigned", select: "Select image", remove: "Delete from library", clear: "Clear selection", assign: "Assign to action", action: "Assign action", noRoom: "Could not assign images. Check the selected action.", full: "Could not update the library.", actionFull: "Could not create the action image set.", badImage: "Couldn’t load the batch. Check the files: PNG, JPG or WebP. Existing images are unchanged.", selected: (n: number) => `Selected: ${n}`, progress: (n: number, total: number) => `Uploading: ${n}/${total}`, assigned: (n: number, action: string) => `Assigned: ${n} · ${action}` },
};
export const portraitLibraryTitle = (locale: Locale) => copy[locale].title;
export const portraitLibraryFull = (locale: Locale) => copy[locale].full;
const selectionCopy = (locale: Locale) => ({
  ru: { search: "Найти эмоцию или действие", clearSearch: "Сбросить поиск эмоций", noMatches: "Ничего не найдено", matches: "Найдено", targets: "К назначению", kept: "уже выбрано", all: "Выбрать видимые", ready: "Картинки загружены. Выберите действие и нажмите «Назначить действия».", selection: "Выбранные изображения", assigned: "Уже с действиями", formats: "PNG, JPG, WebP" },
  en: { search: "Find an emotion or action", clearSearch: "Clear emotion search", noMatches: "No matches", matches: "Matches", targets: "Assigning to", kept: "already selected", all: "Select visible", ready: "Images uploaded. Choose an action, then assign the images.", selection: "Selected images", assigned: "Assigned", formats: "PNG, JPG, WebP" },
}[locale]);

export function PortraitLibrary({ sheet, locale, actions, action, onAction, onChange, onBusy }: { sheet: CharacterSheet; locale: Locale; actions: string[]; action: string; onAction: (value: string) => void; onChange: (sheet: CharacterSheet) => void; onBusy: (busy: boolean) => void }) {
  const t = copy[locale]; const input = useRef<HTMLInputElement>(null); const mounted = useRef(true);
  const ui = selectionCopy(locale);
  const uploadChoice = usePortraitUploadChoice(locale);
  const [selected, setSelected] = useState<string[]>([]); const [filter, setFilter] = useState(false);
  const [previewSize, setPreviewSize] = useState(DEFAULT_PORTRAIT_PREVIEW_SIZE), previewSaved = useRef(DEFAULT_PORTRAIT_PREVIEW_SIZE), previewSaving = useRef(false), previewTouched = useRef(false), previewPending = useRef<number | undefined>(undefined);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [extraActions, setExtraActions] = useState<string[]>([]);
  const targets = [...new Set([action, ...extraActions])].filter(value => actions.includes(value));
  const [actionQuery, setActionQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const matchedActions = useMemo(() => searchPortraitActions(actions, actionQuery), [actions, actionQuery]);
  // A filter must not silently choose a different action or remove hidden choices.
  const assignmentOptions = actions.includes(action) && !matchedActions.includes(action) ? [...matchedActions, action] : matchedActions;
  const [error, setError] = useState(""); const [status, setStatus] = useState("");
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { void getSettings().then(settings => {
    if (mounted.current && !previewTouched.current && validPortraitPreviewSize(settings.portraitPreviewSize)) { setPreviewSize(settings.portraitPreviewSize); previewSaved.current = settings.portraitPreviewSize; }
  }).catch(() => {}); }, []);
  const savePreviewSize = async () => {
    previewPending.current = previewSize;
    if (previewSaving.current) return;
    previewSaving.current = true;
    try {
      while (previewPending.current !== undefined) {
        const next = previewPending.current; previewPending.current = undefined;
        if (next !== previewSaved.current) { await updateSettings({ portraitPreviewSize: next }); previewSaved.current = next; }
      }
    }
    catch { if (mounted.current) setError(portraitUploadText(locale, "previewFailed")); }
    finally { previewSaving.current = false; }
  };
  const images = useMemo(() => libraryImages(sheet), [sheet.sprites, sheet.portraitLibrary]);
  const assignedNames = useMemo(() => {
    const names = new Map<string, string[]>();
    for (const [name, value] of Object.entries(sheet.sprites)) for (const image of portraitVariations(value)) names.set(image, [...(names.get(image) ?? []), actionLabel(locale, name)]);
    return names;
  }, [sheet.sprites, locale]);
  const assignments = (image: string) => assignedNames.get(image) ?? [];
  const picked = selected.filter(image => images.includes(image));
  const shown = images.filter(image => !filter || assignments(image).length === 0);
  const upload = async (files: File[]) => {
    if (!files.length) return;
    setError(""); setStatus(""); onBusy(true);
    try {
      const mode = await uploadChoice.choose(files); if (!mode || !mounted.current) return;
      setProgress({ done: 0, total: files.length });
      const added = await readPortraitFiles(files, done => { if (mounted.current) setProgress({ done, total: files.length }); }, mode);
      if (!mounted.current) return;
      onChange(withPortraitLibrary(sheet, [...images, ...added]));
      setFilter(true); setSelected([...new Set(added)]); setStatus(ui.ready);
    } catch (error) { if (mounted.current) setError(portraitUploadError(locale, error, t.badImage)); }
    finally { if (mounted.current) { setProgress(null); onBusy(false); } }
  };
  return <section className="dr-portrait-library" aria-label={t.title} aria-busy={!!progress}>
    {uploadChoice.dialog}
    <header><strong>{t.title} · {images.length}</strong><button type="button" onClick={() => input.current?.click()}><Upload size={16} />{t.upload}</button></header>
    <p className="dr-character-hint">{ui.formats}</p>
    <label className="dr-library-size"><span>{portraitUploadText(locale, "preview")}</span><output>{previewSize} px</output><input data-portrait-preview aria-label={portraitUploadText(locale, "preview")} type="range" min={96} max={280} step={1} value={previewSize} onChange={event => { previewTouched.current = true; setPreviewSize(Number(event.target.value)); }} onPointerUp={() => void savePreviewSize()} onKeyUp={() => void savePreviewSize()} onBlur={() => void savePreviewSize()} /></label>
    <p className="dr-character-hint">{portraitUploadText(locale, "previewHint")}</p>
    <input ref={input} hidden type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void upload(files); }} />
    <div className="dr-character-actions" role="group" aria-label={t.title}><button type="button" aria-pressed={!filter} onClick={() => setFilter(false)}>{t.all} · {images.length}</button><button type="button" aria-pressed={filter} onClick={() => setFilter(true)}>{t.unassigned} · {sheet.portraitLibrary?.length ?? 0}</button><button type="button" disabled={!shown.length} onClick={() => { setSelected([...new Set([...picked, ...shown])]); setError(""); setStatus(""); }}>{ui.all}</button></div>
    <div className="dr-portrait-library-grid" style={{ "--dr-library-tile": `${previewSize}px` } as CSSProperties}>{shown.map((image) => {
      const index = images.indexOf(image); const names = assignments(image); const active = picked.includes(image);
      return <article key={image}><button type="button" className="dr-library-image" aria-label={`${t.select} ${index + 1}`} aria-pressed={active} onClick={() => { setSelected(active ? picked.filter(value => value !== image) : [...picked, image]); setError(""); setStatus(""); }}><img src={image} alt="" loading="lazy" />{active && <span><Check size={16} /></span>}</button><button type="button" className="dr-library-view" aria-label={`${photoCopy(locale).open} ${index + 1}`} onClick={event => openPortraitViewer(event.currentTarget.ownerDocument, image, names.join(", ") || t.title, locale)}><Maximize2 size={14} />{portraitUploadText(locale, "view")}</button><small title={names.join(", ")}>{names.length ? names.join(", ") : t.unassigned}</small>{!names.length && <button type="button" aria-label={`${t.remove} ${index + 1}`} onClick={() => { onChange(withPortraitLibrary(sheet, images.filter(value => value !== image))); setSelected(picked.filter(value => value !== image)); }}><Trash2 size={14} /></button>}</article>;
    })}{!shown.length && <p className="dr-character-hint">{filter && images.length ? t.unassigned + ": 0" : t.empty}</p>}</div>
    <div className="dr-library-action-search">
      <input ref={searchInput} type="search" data-portrait-preview aria-label={ui.search} placeholder={ui.search} value={actionQuery} maxLength={80} onChange={event => setActionQuery(event.target.value)} onKeyDown={event => {
        if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); }
        if (event.key === "Escape" && actionQuery) { event.preventDefault(); event.stopPropagation(); setActionQuery(""); }
      }} />
      <button type="button" aria-label={ui.clearSearch} title={ui.clearSearch} disabled={!actionQuery} onClick={() => { setActionQuery(""); searchInput.current?.focus({ preventScroll: true }); }}><X size={16} aria-hidden="true" /></button>
    </div>
    {actionQuery.trim() && <p className="dr-character-hint" role="status">{matchedActions.length ? `${ui.matches}: ${matchedActions.length}` : ui.noMatches}</p>}
    <div className="dr-library-assign" role="group" aria-label={ui.selection}><span>{t.selected(picked.length)}</span><button type="button" disabled={!picked.length} onClick={() => setSelected([])}>{t.clear}</button><label>{t.action}<Select data-portrait-preview value={action} onChange={event => { onAction(event.target.value); setError(""); }}>{assignmentOptions.map(value => <option key={value} value={value}>{actionOptionLabel(locale, value)}{!matchedActions.includes(value) ? ` · ${ui.kept}` : ""}</option>)}</Select></label><button type="button" className={picked.length ? "dr-library-primary" : undefined} disabled={!picked.length} onClick={() => {
      try { if (!targets.length) return; onChange(assignLibraryActions(sheet, targets, picked)); setSelected([]); setError(""); setStatus(t.assigned(picked.length, targets.map(value => actionLabel(locale, value)).join(", "))); }
      catch (error) { setError(error instanceof Error && error.message === "portrait-actions-full" ? t.actionFull : t.noRoom); }
    }}>{t.assign}</button></div>
    {(actionQuery.trim() || targets.length > 1) && <p className="dr-character-hint dr-library-targets">{ui.targets}: {targets.map(value => actionLabel(locale, value)).join(", ")}</p>}
    <details className="dr-library-actions"><summary>{t.more}{targets.length > 1 ? ` · ${targets.length}` : ""}</summary><p className="dr-character-hint">{t.shared}</p><div>{matchedActions.filter(value => value !== action).map(value => <label key={value} className="dr-character-check"><input type="checkbox" data-portrait-preview checked={extraActions.includes(value)} onChange={event => { setExtraActions(event.target.checked ? [...extraActions, value] : extraActions.filter(item => item !== value)); setError(""); setStatus(""); }} />{actionOptionLabel(locale, value)}</label>)}</div></details>
    {error && <p className="error-text" role="alert">{error}</p>}
    <p className="dr-character-hint" role="status">{progress ? t.progress(progress.done, progress.total) : status}</p>
  </section>;
}
