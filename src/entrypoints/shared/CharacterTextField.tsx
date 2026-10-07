import { useEffect, useId, useRef, useState } from "react";
import { WandSparkles, LoaderCircle } from "lucide-react";
import { characterDraftCopy, characterDraftError, type CharacterTextField as Field, type CharacterTextGenerator } from "../../core/character-text";
import type { Locale } from "../../core/types";
import { preventLabelActivation } from "./control-label";
export function CharacterTextField({ field, locale, value, onChange, onGenerate, rows = 2, placeholder, required, disabled = false }: {
  field: Field; locale: Locale; value: string; onChange: (value: string) => void; onGenerate?: CharacterTextGenerator;
  rows?: number; placeholder?: string; required?: boolean; disabled?: boolean;
}) {
  const id = useId(), t = characterDraftCopy(locale); const current = useRef({ value, onChange, disabled }); current.current = { value, onChange, disabled }; const mounted = useRef(true), preview = useRef<HTMLTextAreaElement>(null);
  const [waiting, setWaiting] = useState(false), [suggestion, setSuggestion] = useState(""), [error, setError] = useState(""), [copyState, setCopyState] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const generate = async () => {
    if (!onGenerate || waiting) return; setWaiting(true); setSuggestion(""); setError(""); setCopyState(""); setNotice("");
    try { const next = await onGenerate(field, value); if (mounted.current) { if (current.current.value === value && !current.current.disabled) { current.current.onChange(next); setNotice(t.applied); } else { setSuggestion(next); setNotice(t.changed); } } }
    catch (cause) { if (mounted.current) setError(characterDraftError(locale, cause instanceof Error ? cause.message : "")); }
    finally { if (mounted.current) setWaiting(false); }
  };
  return <div className="dr-character-text-field" data-character-text-field={field.key} onClickCapture={preventLabelActivation}>
    <div className="dr-character-field-heading"><label htmlFor={id}>{field.label}</label>{onGenerate && <button type="button" className="dr-character-generate" disabled={disabled || waiting} aria-label={t.ask + ": " + field.label} title={t.ask} aria-busy={waiting} onClick={() => void generate()}>{waiting ? <LoaderCircle size={15} aria-hidden="true" /> : <WandSparkles size={15} aria-hidden="true" />}</button>}</div>
    {rows === 1 ? <input id={id} aria-label={field.label} disabled={disabled} required={required} maxLength={field.maxLength} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} /> : <textarea id={id} aria-label={field.label} disabled={disabled} required={required} rows={rows} maxLength={field.maxLength} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />}
    {notice && <small role="status">{notice}</small>}{waiting && <small role="status">{t.waiting}</small>}{error && <p className="dr-character-draft-error" role="alert">{error}</p>}
    {suggestion && <div className="dr-character-draft-result"><textarea ref={preview} readOnly aria-label={t.result + ": " + field.label} rows={3} value={suggestion} /><div className="dr-character-draft-actions"><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(suggestion); if (mounted.current) setCopyState(t.copied); } catch { preview.current?.focus(); preview.current?.select(); if (mounted.current) setCopyState(t.select); } }}>{t.copy}</button><button type="button" onClick={() => { setSuggestion(""); setCopyState(""); }}>{t.hide}</button></div><small>{t.hint}</small>{copyState && <small role="status">{copyState}</small>}</div>}
  </div>;
}
