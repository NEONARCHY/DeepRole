import { CharacterTextField } from "./CharacterTextField";
import type { CharacterTextGenerator } from "../../core/character-text";
import { preventLabelActivation } from "./control-label";
import { useRef, useState } from "react";
import { Plus, Upload, Trash2 } from "lucide-react";
import type { Locale, SelfieCategory } from "../../core/types";
import { createId } from "../../core/id";
import { MAX_SELFIE_CATEGORIES } from "../../core/selfies";
import { MAX_PORTRAIT_VARIATIONS } from "../../core/portrait-variations";
import { readPortrait } from "./portrait-file";
import { openPortraitViewer, photoCopy } from "../../adapters/portrait-viewer";

const copy = (locale: Locale) => ({
  ru: { title: "Селфи", hint: "Персонаж выбирает подборку по сцене и может отказать. Если подходящей нет, используется обычная категория. Фото остаются на устройстве.", add: "Добавить категорию", ordinary: "Обычные", default: "Обычная категория", name: "Название", context: "Когда подходит", example: "Например: дома вечером, в повседневной одежде", trust: "Доверие от", affinity: "Близость от", gates: "Близость использует шкалу симпатии. Пороги 0–100 действуют при настроенном учёте отношений с главным героем. Без него согласие зависит от истории. Достигнутые пороги не гарантируют согласие.", upload: "Добавить фото", remove: "Удалить категорию", empty: "Создайте обычную подборку и добавьте фото. Затем — категории для разных ситуаций.", failed: "Не удалось добавить фото. Выберите PNG, JPG или WebP до 10 МБ.", limit: "До 48 фото в одной категории.", pending: "Фото сохранятся кнопкой «Сохранить персонажа»." },
  en: { title: "Selfies", hint: "The character chooses a collection for the scene and may refuse. The default collection is used if none matches. Photos stay on your device.", add: "Add category", ordinary: "Regular", default: "Default collection", name: "Name", context: "When it fits", example: "For example: at home in the evening, casual clothes", trust: "Minimum trust", affinity: "Minimum closeness", gates: "Closeness uses affinity. Thresholds 0–100 apply with relationship tracking set up for the protagonist. Otherwise willingness depends on the story. Reaching the thresholds never guarantees agreement.", upload: "Add photos", remove: "Delete category", empty: "Create a default collection and upload photos. Then add collections for different situations.", failed: "Couldn’t add photos. Choose PNG, JPG or WebP up to 10 MB.", limit: "Up to 48 photos per category.", pending: "Photos are saved with Save character." },
}[locale]);
export function SelfieCategories({ value, locale, disabled, onGenerate, onChange, onBusy }: { onGenerate?: CharacterTextGenerator; value: SelfieCategory[]; locale: Locale; disabled: boolean; onChange: (next: SelfieCategory[]) => void; onBusy: (busy: boolean) => void }) {
  const t = copy(locale); const [error, setError] = useState(""); const file = useRef<HTMLInputElement>(null); const target = useRef<string>("");
  const update = (id: string, patch: Partial<SelfieCategory>) => onChange(value.map(c => c.id === id ? { ...c, ...patch } : c));
  return <section className="dr-selfie-categories" onClickCapture={preventLabelActivation} aria-label={t.title}>
    <div className="dr-selfie-heading"><h3>{t.title}</h3><button type="button" disabled={disabled || value.length >= MAX_SELFIE_CATEGORIES} onClick={() => onChange([...value, { id: createId("selfie"), name: value.length ? "" : t.ordinary, description: "", minTrust: 40, minAffinity: 30, default: !value.some(c => c.default), images: [] }])}><Plus size={16} />{t.add}</button></div>
    <p className="dr-character-hint">{t.hint}</p>{!value.length && <p>{t.empty}</p>}
    {value.map((category, index) => <fieldset className="dr-selfie-category" key={category.id} disabled={disabled}><legend>{category.name || t.title + " " + (index + 1)}</legend>
      <div className="dr-selfie-fields"><label>{t.name}<input aria-label={t.name + " " + (index + 1)} required maxLength={64} value={category.name} onChange={e => update(category.id, { name: e.target.value })} /></label><CharacterTextField field={{ key: "selfie:" + category.id, label: t.context + " " + (index + 1), maxLength: 600, scope: "selfie" }} locale={locale} value={category.description} placeholder={t.example} onChange={description => update(category.id, { description })} onGenerate={onGenerate} disabled={disabled} /></div>
      <label className="toggle-row"><span>{t.default}</span><input type="radio" name="selfie-default" checked={!!category.default} onChange={() => onChange(value.map(c => ({ ...c, default: c.id === category.id })))} /></label>
      <div className="dr-selfie-scores">{(["minTrust", "minAffinity"] as const).map(key => <label key={key}>{key === "minTrust" ? t.trust : t.affinity}<input type="number" required min={0} max={100} step={1} value={category[key]} onChange={e => { const n = e.target.valueAsNumber; update(category.id, { [key]: Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0 }); }} /></label>)}</div>
      <div className="dr-selfie-thumbnails">{category.images.map((src, at) => <div key={src}><button type="button" aria-label={photoCopy(locale).open + " " + (at + 1)} onClick={e => openPortraitViewer(e.currentTarget.ownerDocument, src, category.name, locale)}><img src={src} alt={category.name} /></button><button type="button" aria-label={t.remove + " " + (at + 1)} onClick={() => update(category.id, { images: category.images.filter((_, i) => i !== at) })}><Trash2 size={14} /></button></div>)}</div>
      <div className="dr-selfie-actions"><button type="button" disabled={category.images.length >= MAX_PORTRAIT_VARIATIONS} onClick={() => { target.current = category.id; file.current?.click(); }}><Upload size={16} />{t.upload} · {category.images.length}/48</button><button type="button" onClick={() => onChange(value.filter(c => c.id !== category.id))}><Trash2 size={16} />{t.remove}</button></div>
    </fieldset>)}
    {value.length > 0 && <><p className="dr-character-hint">{t.gates}</p><small>{t.pending}</small></>}
    {error && <p role="alert">{error}</p>}
    <input ref={file} hidden type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={e => {
      const files = [...(e.target.files ?? [])]; e.target.value = ""; const category = value.find(c => c.id === target.current); if (!files.length || !category) return;
      if (category.images.length + files.length > MAX_PORTRAIT_VARIATIONS) { setError(t.limit); return; }
      setError(""); onBusy(true);
      void Promise.all(files.map(readPortrait)).then(images => update(category.id, { images: [...new Set([...category.images, ...images])] })).catch(() => setError(t.failed)).finally(() => onBusy(false));
    }} />
  </section>;
}
