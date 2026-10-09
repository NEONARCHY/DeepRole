import { CharacterTextField } from "./CharacterTextField";
import type { CharacterTextGenerator } from "../../core/character-text";
import { preventLabelActivation } from "./control-label";
import { SelfieAccess } from "./SelfieAccess";
import { SelfieLibraryPicker } from "./SelfieLibraryPicker";
import { useId, useRef, useState } from "react";
import { Plus, Upload, Trash2, Images } from "lucide-react";
import type { Locale, SelfieCategory } from "../../core/types";
import { createId } from "../../core/id";
import { addSelfieLibraryImages } from "../../core/selfies";
import { selfieText } from "../../core/selfie-i18n";
import { readPortraitFiles } from "./portrait-file";
import { portraitUploadError } from "../../core/portrait-upload-i18n";
import { openPortraitViewer, photoCopy } from "../../adapters/portrait-viewer";
import { usePortraitUploadChoice } from "./PortraitUploadChoice";

const copy = (locale: Locale) => ({
  ru: { title: "Селфи", hint: "Персонаж выбирает подборку по сцене и может отказать. Если подходящей нет, используется обычная категория. Фото остаются на устройстве.", add: "Добавить категорию", ordinary: "Обычные", default: "Обычная категория", name: "Название", context: "Когда подходит", example: "Например: дома вечером, в повседневной одежде", trust: "Доверие от", affinity: "Близость от", gates: "Выберите понятный уровень готовности для каждой подборки. Близость использует шкалу симпатии; точные пороги доступны в дополнительных настройках. Решение всегда остаётся за персонажем.", upload: "Добавить фото", remove: "Удалить категорию", empty: "Создайте обычную подборку и добавьте фото. Затем — категории для разных ситуаций.", failed: "Не удалось добавить фото. Выберите PNG, JPG или WebP.", limit: "Не удалось добавить фото.", pending: "Фото сохранятся кнопкой «Сохранить персонажа»." },
  en: { title: "Selfies", hint: "The character chooses a collection for the scene and may refuse. The default collection is used if none matches. Photos stay on your device.", add: "Add category", ordinary: "Regular", default: "Default collection", name: "Name", context: "When it fits", example: "For example: at home in the evening, casual clothes", trust: "Minimum trust", affinity: "Minimum closeness", gates: "Choose a readiness level for each collection. Closeness uses affinity; exact thresholds are in additional settings. The character always makes the final decision.", upload: "Add photos", remove: "Delete category", empty: "Create a default collection and upload photos. Then add collections for different situations.", failed: "Couldn’t add photos. Choose PNG, JPG or WebP.", limit: "Could not add photos.", pending: "Photos are saved with Save character." },
}[locale]);
export function SelfieCategories({ value, library = [], locale, disabled, onGenerate, onChange, onBusy }: { onGenerate?: CharacterTextGenerator; value: SelfieCategory[]; library?: string[]; locale: Locale; disabled: boolean; onChange: (next: SelfieCategory[]) => void; onBusy: (busy: boolean) => void }) {
  const t = copy(locale); const [error, setError] = useState(""); const file = useRef<HTMLInputElement>(null); const target = useRef<string>("");
  const uploadChoice = usePortraitUploadChoice(locale);
  const [picker, setPicker] = useState(""); const pickerId = useId(); const opener = useRef<HTMLButtonElement | null>(null);
  const closePicker = () => { setPicker(""); opener.current?.focus(); };
  const update = (id: string, patch: Partial<SelfieCategory>) => onChange(value.map(c => c.id === id ? { ...c, ...patch } : c));
  return <section className="dr-selfie-categories" onClickCapture={preventLabelActivation} aria-label={t.title}>
    {uploadChoice.dialog}
    <div className="dr-selfie-heading"><h3>{t.title}</h3><button type="button" disabled={disabled} onClick={() => onChange([...value, { id: createId("selfie"), name: value.length ? "" : t.ordinary, description: "", minTrust: 40, minAffinity: 30, default: !value.some(c => c.default), images: [] }])}><Plus size={16} />{t.add}</button></div>
    <p className="dr-selfie-source-label">{selfieText(locale, "uploadedMethod")}</p>
    <p className="dr-character-hint">{selfieText(locale, "manualHint")}</p>
    <p className="dr-character-hint">{t.hint}</p>{!value.length && <p>{t.empty}</p>}
    {value.map((category, index) => <fieldset className="dr-selfie-category" key={category.id} disabled={disabled}><legend>{category.name || t.title + " " + (index + 1)}</legend>
      <div className="dr-selfie-fields"><label>{t.name}<input aria-label={t.name + " " + (index + 1)} required maxLength={64} value={category.name} onChange={e => update(category.id, { name: e.target.value })} /></label><CharacterTextField field={{ key: "selfie:" + category.id, label: t.context + " " + (index + 1), maxLength: 600, scope: "selfie" }} locale={locale} value={category.description} placeholder={t.example} onChange={description => update(category.id, { description })} onGenerate={onGenerate} disabled={disabled} /></div>
      <label className="toggle-row"><span>{t.default}</span><input type="radio" name="selfie-default" checked={!!category.default} onChange={() => onChange(value.map(c => ({ ...c, default: c.id === category.id })))} /></label>
      <SelfieAccess locale={locale} value={category} disabled={disabled} onChange={next => update(category.id, next)} />
      <div className="dr-selfie-thumbnails">{category.images.map((src, at) => <div key={src}><button type="button" aria-label={photoCopy(locale).open + " " + (at + 1)} onClick={e => openPortraitViewer(e.currentTarget.ownerDocument, src, category.name, locale)}><img src={src} alt={category.name} /></button><button type="button" aria-label={selfieText(locale, "removePhoto") + " " + (at + 1)} onClick={() => update(category.id, { images: category.images.filter((_, i) => i !== at) })}><Trash2 size={14} /></button></div>)}</div>
      <div className="dr-selfie-actions"><button type="button" onClick={() => { target.current = category.id; file.current?.click(); }}><Upload size={16} />{t.upload} · {category.images.length}</button>
        <button type="button" aria-expanded={picker === category.id} aria-controls={picker === category.id ? pickerId : undefined} onClick={e => { setError(""); if (picker === category.id) closePicker(); else { opener.current = e.currentTarget; setPicker(category.id); } }}><Images size={16} />{selfieText(locale, "pick")}</button>
        <button type="button" onClick={() => { if (picker === category.id) setPicker(""); onChange(value.filter(c => c.id !== category.id)); }}><Trash2 size={16} />{t.remove}</button></div>
      {picker === category.id && <SelfieLibraryPicker key={category.id} id={pickerId} library={library} images={category.images} locale={locale} disabled={disabled} onCancel={closePicker} onAdd={selected => {
        if (disabled) return;
        try { onChange(addSelfieLibraryImages(value, category.id, library, selected)); setError(""); closePicker(); }
        catch (cause) { setError(selfieText(locale, "libraryMissing")); }
      }} />}
    </fieldset>)}
    {value.length > 0 && <><p className="dr-character-hint">{t.gates}</p><small>{t.pending}</small></>}
    {error && <p role="alert">{error}</p>}
    <input ref={file} hidden type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={e => {
      const files = [...(e.target.files ?? [])]; e.target.value = ""; const category = value.find(c => c.id === target.current); if (!files.length || !category) return;
      setError(""); onBusy(true);
      void uploadChoice.choose(files).then(async mode => { if (!mode) return; const images = await readPortraitFiles(files, undefined, mode); update(category.id, { images: [...new Set([...category.images, ...images])] }); }).catch(error => setError(portraitUploadError(locale, error, t.failed))).finally(() => onBusy(false));
    }} />
  </section>;
}
