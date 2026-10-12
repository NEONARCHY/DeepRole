import { useId, useLayoutEffect, useRef, useState } from "react";
import { Plus, X, Pencil, Check } from "lucide-react";
import type { Locale } from "../../core/types";
import { MAX_ACTIVE_ACTIONS, actionOptionLabel, validActions } from "../../core/characters";
import { actionIdentity } from "../../core/character-actions";

export const actionControlCopy = (locale: Locale) => ({
  ru: { add: "Добавить действие", name: "Название нового действия", example: "Например: Сидит, Смеётся, Даёт себя обнять", hint: "Действие, поза или реакция: «Сидит», «Смущается», «Спокойствие». Стандартные названия — на языке расширения, свои можно написать на любом языке. Одну картинку можно назначить нескольким действиям.", duplicate: "Такое действие уже есть. Выберите его в списке.", invalid: "До 32 действий, название — до 32 символов. «Спокойствие» остаётся вариантом по умолчанию.", failed: "Не удалось добавить действие. Список и изображения не изменены. Попробуйте снова.", added: "Действие добавлено", remove: "Убрать из списка", default: "По умолчанию", bulk: "Редактировать списком", keepImages: "После сохранения удалённое действие отвяжется от портретов. Картинки останутся в библиотеке персонажей или в других назначенных действиях.", scope: "Новое действие сразу добавится в этот мир. Изображения сохраняются кнопкой «Сохранить персонажа»." },
  en: { add: "Add action", name: "New action name", example: "For example: Sitting, Laughing, Accepting a hug", hint: "An action, pose or reaction: Sitting, Blushing, Calm. Standard names use the extension’s language; custom names can use any language. An image can belong to several actions.", duplicate: "This action already exists. Choose it from the list.", invalid: "Up to 32 actions, with names up to 32 characters. Keep Calm as the default.", failed: "Couldn’t add the action. Your list and images are unchanged. Try again.", added: "Action added", remove: "Remove from list", default: "Default", bulk: "Edit as a list", keepImages: "Saving a removed action detaches its portraits. Images stay in the characters’ libraries or their other assigned actions.", scope: "A new action is added to this world immediately. Save images with Save character." },
}[locale]);

export function NewAction({ locale, actions, onAdd, disabled = false }: { locale: Locale; actions: string[]; disabled?: boolean; onAdd: (name: string) => Promise<void> }) {
  const t = actionControlCopy(locale); const id = useId(); const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const add = async () => {
    const value = name.trim(); if (!value || busy || disabled) return;
    setMessage(""); setError("");
    if (actions.some(item => actionIdentity(item) === actionIdentity(value))) { setError(t.duplicate); return; }
    if (!validActions([...actions, value])) { setError(t.invalid); return; }
    setBusy(true);
    try { await onAdd(value); setName(""); setMessage(`${t.added}: ${value}`); input.current?.focus(); }
    catch { setError(t.failed); }
    finally { setBusy(false); }
  };
  return <div className="dr-new-action" data-no-widget-drag>
    <label htmlFor={id}>{t.name}</label><div><input ref={input} id={id} type="text" data-portrait-preview maxLength={32} value={name} placeholder={t.example} disabled={disabled || busy} onChange={event => { setName(event.target.value); setError(""); setMessage(""); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void add(); } }} /><button type="button" disabled={disabled || busy || !name.trim() || actions.length >= MAX_ACTIVE_ACTIONS} onClick={() => void add()}><Plus size={16} />{t.add}</button></div>
    {error && <p className="error-text" role="alert">{error}</p>}{message && <small role="status">{message}</small>}
  </div>;
}

export function ActionList({ locale, actions, onChange, onRename, disabled }: { locale: Locale; actions: string[]; onChange: (next: string[]) => void; onRename?: (from: string, to: string) => void; disabled?: boolean }) {
  const t = actionControlCopy(locale);
  const [editing, setEditing] = useState<string | null>(null), [name, setName] = useState(""), [error, setError] = useState("");
  const inputId = useId();
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const returnFocus = useRef<string | null>(null);
  useLayoutEffect(() => { if (!editing && returnFocus.current) { buttons.current.get(returnFocus.current)?.focus(); returnFocus.current = null; } }, [editing]);
  const close = (key: string) => { returnFocus.current = key; setEditing(null); setError(""); };
  const ui = locale === "ru" ? { rename: "Переименовать действие", apply: "Готово", cancel: "Отмена", name: "Новое название действия", hint: "Стандартные действия показаны на языке расширения. Ваши названия не переводятся. При переименовании фотографии и состояния перейдут на новое название после «Сохранить действия». «Спокойствие» всегда остаётся вариантом по умолчанию." } : { rename: "Rename action", apply: "Done", cancel: "Cancel", name: "Rename to", hint: "Standard actions use the extension’s language. Custom names stay as written. Renaming moves images and states to the new name after Save actions. Calm always remains the default." };
  const apply = () => {
    if (!editing || !onRename || disabled) return;
    const value = name.trim();
    if (value === editing || value === actionOptionLabel(locale,editing)) { close(editing); return; }
    if (actions.some(key => key !== editing && actionIdentity(key) === actionIdentity(value))) { setError(t.duplicate); return; }
    if (!validActions(actions.map(key => key === editing ? value : key))) { setError(t.invalid); return; }
    onRename(editing, value); close(value);
  };
  return <><div className="dr-action-list">{actions.map((action, index) => <span key={`${action}:${index}`}><span>{actionOptionLabel(locale, action)}</span>{action === "neutral" ? <small>{t.default}</small> : <>
    {onRename && <button ref={node => { if (node) buttons.current.set(action, node); else buttons.current.delete(action); }} className="dr-action-rename-button" type="button" disabled={disabled} aria-label={`${ui.rename}: ${actionOptionLabel(locale,action)}`} title={`${ui.rename}: ${actionOptionLabel(locale,action)}`} onClick={() => { setEditing(action); setName(actionOptionLabel(locale,action)); setError(""); }}><Pencil size={14} /></button>}
    <button type="button" disabled={disabled} aria-label={`${t.remove}: ${actionOptionLabel(locale,action)}`} title={`${t.remove}: ${actionOptionLabel(locale,action)}`} onClick={() => onChange(actions.filter((_, at) => at !== index))}><X size={14} /></button></>}</span>)}</div>
    {editing && <div className="dr-action-rename" role="group" aria-label={ui.rename}><label htmlFor={inputId}>{ui.name}</label><div><input id={inputId} autoFocus maxLength={32} value={name} disabled={disabled} onChange={event => { setName(event.target.value); setError(""); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); apply(); } else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(editing); } }} />
    <button type="button" disabled={disabled || !name.trim()} onClick={apply}><Check size={14} />{ui.apply}</button><button type="button" disabled={disabled} onClick={() => close(editing)}>{ui.cancel}</button></div>{error && <p className="error-text" role="alert">{error}</p>}</div>}
    {onRename && <p className="setting-copy">{ui.hint}</p>}</>;
}
