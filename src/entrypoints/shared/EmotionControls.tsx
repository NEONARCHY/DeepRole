import { useId, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import type { Locale } from "../../core/types";
import { MAX_ACTIVE_EMOTIONS, emotionOptionLabel, validEmotions } from "../../core/characters";

export const emotionControlCopy = (locale: Locale) => ({
  ru: { add: "Добавить эмоцию", name: "Название новой эмоции", example: "Например: смеётся", hint: "Любой язык. Одно название — одна эмоция. Одну картинку можно назначить нескольким эмоциям в библиотеке.", duplicate: "Такая эмоция уже есть. Выберите её в списке.", invalid: "До 32 эмоций, название — до 32 символов. neutral остаётся эмоцией по умолчанию.", failed: "Не удалось добавить эмоцию. Список и изображения не изменены. Попробуйте снова.", added: "Эмоция добавлена", remove: "Убрать из списка", default: "По умолчанию", bulk: "Редактировать списком", keepImages: "Удаление названия из списка не удаляет загруженные портреты.", scope: "Новая эмоция сразу добавится в этот мир. Изображения сохраняются кнопкой «Сохранить персонажа»." },
  en: { add: "Add emotion", name: "New emotion name", example: "For example: laughing", hint: "Any language. One name is one emotion. You can assign an image to several emotions in the library.", duplicate: "This emotion already exists. Choose it from the list.", invalid: "Up to 32 emotions, with names up to 32 characters. Keep neutral as the default.", failed: "Couldn’t add the emotion. Your list and images are unchanged. Try again.", added: "Emotion added", remove: "Remove from list", default: "Default", bulk: "Edit as a list", keepImages: "Removing a name from the list does not delete uploaded portraits.", scope: "A new emotion is added to this world immediately. Save images with Save character." },
}[locale]);

export function NewEmotion({ locale, emotions, onAdd, disabled = false }: { locale: Locale; emotions: string[]; disabled?: boolean; onAdd: (name: string) => Promise<void> }) {
  const t = emotionControlCopy(locale); const id = useId(); const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const add = async () => {
    const value = name.trim(); if (!value || busy || disabled) return;
    setMessage(""); setError("");
    if (emotions.some(item => item.toLocaleLowerCase() === value.toLocaleLowerCase())) { setError(t.duplicate); return; }
    if (!validEmotions([...emotions, value])) { setError(t.invalid); return; }
    setBusy(true);
    try { await onAdd(value); setName(""); setMessage(`${t.added}: ${value}`); input.current?.focus(); }
    catch { setError(t.failed); }
    finally { setBusy(false); }
  };
  return <div className="dr-new-emotion" data-no-widget-drag>
    <label htmlFor={id}>{t.name}</label><div><input ref={input} id={id} type="text" data-portrait-preview maxLength={32} value={name} placeholder={t.example} disabled={disabled || busy} onChange={event => { setName(event.target.value); setError(""); setMessage(""); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void add(); } }} /><button type="button" disabled={disabled || busy || !name.trim() || emotions.length >= MAX_ACTIVE_EMOTIONS} onClick={() => void add()}><Plus size={16} />{t.add}</button></div>
    {error && <p className="error-text" role="alert">{error}</p>}{message && <small role="status">{message}</small>}
  </div>;
}

export function EmotionList({ locale, emotions, onChange, disabled }: { locale: Locale; emotions: string[]; onChange: (next: string[]) => void; disabled?: boolean }) {
  const t = emotionControlCopy(locale);
  return <div className="dr-emotion-list">{emotions.map((emotion, index) => <span key={`${emotion}:${index}`}><span>{emotionOptionLabel(locale, emotion)}</span>{emotion === "neutral" ? <small>{t.default}</small> : <button type="button" disabled={disabled} aria-label={`${t.remove}: ${emotion}`} title={`${t.remove}: ${emotion}`} onClick={() => onChange(emotions.filter((_, at) => at !== index))}><X size={14} /></button>}</span>)}</div>;
}
