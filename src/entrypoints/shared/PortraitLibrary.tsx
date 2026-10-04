import { useEffect, useRef, useState } from "react";
import { Check, Trash2, Upload } from "lucide-react";
import type { CharacterSheet, Locale } from "../../core/types";
import { emotionLabel, emotionOptionLabel } from "../../core/characters";
import { assignLibraryEmotions, libraryImages, MAX_UNASSIGNED_PORTRAITS, withPortraitLibrary } from "../../core/portrait-library";
import { portraitVariations } from "../../core/portrait-variations";
import { readPortrait } from "./portrait-file";

const copy = {
  ru: { more: "Ещё эмоции для этих картинок", shared: "Отметьте дополнительные эмоции — выбранные картинки будут доступны для каждой. Названия добавляются в настройках, по одному в строке.", title: "Библиотека изображений", upload: "Загрузить в библиотеку", hint: "Загрузите пачку, выберите картинки и назначьте эмоцию. Сохраняется вместе с карточкой.", empty: "Здесь будут все портреты персонажа. Можно загрузить несколько файлов сразу.", all: "Все", unassigned: "Без эмоции", select: "Выбрать изображение", remove: "Удалить из библиотеки", clear: "Снять выбор", assign: "Назначить эмоции", emotion: "Назначить эмоцию", noRoom: "В одной эмоции может быть до 12 изображений. Выберите меньше или освободите место.", full: "До 256 неназначенных изображений. Сначала назначьте эмоции или удалите лишнее.", emotionFull: "В карточке уже 64 набора эмоций. Уберите ненужный набор перед добавлением нового.", badImage: "Не удалось загрузить пачку. Проверьте файлы: PNG, JPG или WebP до 5 МБ. Прежние изображения сохранены.", selected: (n: number) => `Выбрано: ${n}`, progress: (n: number, total: number) => `Загружаем: ${n}/${total}`, assigned: (n: number, emotion: string) => `Назначено: ${n} · ${emotion}` },
  en: { more: "More emotions for these images", shared: "Choose extra emotions to use these images for each one. Add names in settings, one per line.", title: "Image library", upload: "Upload to library", hint: "Upload a batch, select images, then assign an emotion. Saved with the character sheet.", empty: "All this character’s portraits will appear here. Upload several files at once.", all: "All", unassigned: "Unassigned", select: "Select image", remove: "Delete from library", clear: "Clear selection", assign: "Assign to emotion", emotion: "Assign emotion", noRoom: "Each emotion holds up to 12 images. Select fewer or make room first.", full: "Up to 256 unassigned images. Assign emotions or remove unused images first.", emotionFull: "This sheet already has 64 emotion sets. Remove an unused set before adding another.", badImage: "Couldn’t load the batch. Check the files: PNG, JPG or WebP up to 5 MB. Existing images are unchanged.", selected: (n: number) => `Selected: ${n}`, progress: (n: number, total: number) => `Uploading: ${n}/${total}`, assigned: (n: number, emotion: string) => `Assigned: ${n} · ${emotion}` },
};
export const portraitLibraryTitle = (locale: Locale) => copy[locale].title;
export const portraitLibraryFull = (locale: Locale) => copy[locale].full;

export function PortraitLibrary({ sheet, locale, emotions, emotion, onEmotion, onChange, onBusy }: { sheet: CharacterSheet; locale: Locale; emotions: string[]; emotion: string; onEmotion: (value: string) => void; onChange: (sheet: CharacterSheet) => void; onBusy: (busy: boolean) => void }) {
  const t = copy[locale]; const input = useRef<HTMLInputElement>(null); const mounted = useRef(true);
  const [selected, setSelected] = useState<string[]>([]); const [filter, setFilter] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [extraEmotions, setExtraEmotions] = useState<string[]>([]);
  const targets = [...new Set([emotion, ...extraEmotions])].filter(value => emotions.includes(value));
  const [error, setError] = useState(""); const [status, setStatus] = useState("");
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const images = libraryImages(sheet);
  const assignments = (image: string) => Object.entries(sheet.sprites).filter(([, value]) => portraitVariations(value).includes(image)).map(([name]) => emotionLabel(locale, name));
  const picked = selected.filter(image => images.includes(image));
  const shown = images.filter(image => !filter || assignments(image).length === 0);
  const upload = async (files: File[]) => {
    if (!files.length) return;
    if (files.length > MAX_UNASSIGNED_PORTRAITS) { setError(t.full); return; }
    setError(""); setStatus(""); setProgress({ done: 0, total: files.length }); onBusy(true);
    try {
      const added: string[] = [];
      for (const file of files) {
        added.push(await readPortrait(file)); if (!mounted.current) return;
        setProgress({ done: added.length, total: files.length });
      }
      onChange(withPortraitLibrary(sheet, [...images, ...added]));
      setFilter(true); setSelected([]);
    } catch (error) { if (mounted.current) setError(error instanceof Error && error.message === "portrait-library-full" ? t.full : t.badImage); }
    finally { if (mounted.current) { setProgress(null); onBusy(false); } }
  };
  return <section className="dr-portrait-library" aria-label={t.title} aria-busy={!!progress}>
    <header><strong>{t.title} · {images.length}</strong><button type="button" onClick={() => input.current?.click()}><Upload size={16} />{t.upload}</button></header>
    <p className="dr-character-hint">{t.hint}</p>
    <input ref={input} hidden type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void upload(files); }} />
    <div className="dr-character-actions" role="group" aria-label={t.title}><button type="button" aria-pressed={!filter} onClick={() => setFilter(false)}>{t.all} · {images.length}</button><button type="button" aria-pressed={filter} onClick={() => setFilter(true)}>{t.unassigned} · {sheet.portraitLibrary?.length ?? 0}</button></div>
    <div className="dr-portrait-library-grid">{shown.map((image) => {
      const index = images.indexOf(image); const names = assignments(image); const active = picked.includes(image);
      return <article key={image}><button type="button" className="dr-library-image" aria-label={`${t.select} ${index + 1}`} aria-pressed={active} onClick={() => { setSelected(active ? picked.filter(value => value !== image) : [...picked, image]); setError(""); setStatus(""); }}><img src={image} alt="" loading="lazy" />{active && <span><Check size={16} /></span>}</button><small title={names.join(", ")}>{names.length ? names.join(", ") : t.unassigned}</small>{!names.length && <button type="button" aria-label={`${t.remove} ${index + 1}`} onClick={() => { onChange(withPortraitLibrary(sheet, images.filter(value => value !== image))); setSelected(picked.filter(value => value !== image)); }}><Trash2 size={14} /></button>}</article>;
    })}{!shown.length && <p className="dr-character-hint">{filter && images.length ? t.unassigned + ": 0" : t.empty}</p>}</div>
    <div className="dr-library-assign"><span>{t.selected(picked.length)}</span><button type="button" disabled={!picked.length} onClick={() => setSelected([])}>{t.clear}</button><label>{t.emotion}<select data-portrait-preview value={emotion} onChange={event => { onEmotion(event.target.value); setError(""); }}>{emotions.map(value => <option key={value} value={value}>{emotionOptionLabel(locale, value)}</option>)}</select></label><button type="button" disabled={!picked.length} onClick={() => {
      try { onChange(assignLibraryEmotions(sheet, targets, picked)); setSelected([]); setError(""); setStatus(t.assigned(picked.length, targets.map(value => emotionLabel(locale, value)).join(", "))); }
      catch (error) { setError(error instanceof Error && error.message === "portrait-emotions-full" ? t.emotionFull : t.noRoom); }
    }}>{t.assign}</button></div>
    <details className="dr-library-emotions"><summary>{t.more}{targets.length > 1 ? ` · ${targets.length}` : ""}</summary><p className="dr-character-hint">{t.shared}</p><div>{emotions.filter(value => value !== emotion).map(value => <label key={value} className="dr-character-check"><input type="checkbox" data-portrait-preview checked={extraEmotions.includes(value)} onChange={event => { setExtraEmotions(event.target.checked ? [...extraEmotions, value] : extraEmotions.filter(item => item !== value)); setError(""); setStatus(""); }} />{emotionOptionLabel(locale, value)}</label>)}</div></details>
    {error && <p className="error-text" role="alert">{error}</p>}
    <p className="dr-character-hint" role="status">{progress ? t.progress(progress.done, progress.total) : status}</p>
  </section>;
}
