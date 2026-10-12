import { useEffect, useId, useRef, useState } from "react";
import { WandSparkles, LoaderCircle } from "lucide-react";
import { characterDraftCopy, characterDraftError, characterModeCopy, characterQueueCopy, isolatedFieldCopy, isolatedCleanupCopy, type CharacterTextMode, type CharacterTextField as Field, type CharacterTextGenerator } from "../../core/character-text";
import { castChatReference } from "../../core/cast-chat";
import { IsolatedFieldError } from "../../core/isolated-character-text";
import type { Locale } from "../../core/types";
import { preventLabelActivation } from "./control-label";
export function CharacterTextField({ field, locale, value, onChange, onGenerate, rows = 2, placeholder, required, disabled = false }: {
  field: Field; locale: Locale; value: string; onChange: (value: string) => void; onGenerate?: CharacterTextGenerator;
  rows?: number; placeholder?: string; required?: boolean; disabled?: boolean;
}) {
  const id = useId(), t = characterDraftCopy(locale), modes = characterModeCopy(locale), isolated = isolatedFieldCopy(locale); const current = useRef({ value, onChange, disabled }); current.current = { value, onChange, disabled }; const mounted = useRef(true), preview = useRef<HTMLTextAreaElement>(null), wand = useRef<HTMLButtonElement>(null);
  const [choosing, setChoosing] = useState(false);
  const queue = characterQueueCopy(locale), task = useRef<{ controller: AbortController; value: string; phase: "queued" | "running" } | null>(null);
  const [position, setPosition] = useState(0), [cancelling, setCancelling] = useState(false);
  const [waiting, setWaiting] = useState(false), [suggestion, setSuggestion] = useState(""), [error, setError] = useState(""), [copyState, setCopyState] = useState(""), [notice, setNotice] = useState("");
  const [outcome, setOutcome] = useState<import("../../core/isolated-character-text").CharacterTextOutcome | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; task.current?.controller.abort(); }; }, []);
  useEffect(() => { if (task.current?.phase === "queued" && (value !== task.current.value || disabled)) task.current.controller.abort(new Error("field-changed")); }, [value, disabled]);
  const generate = async (mode: CharacterTextMode) => {
    if (!onGenerate || task.current || waiting || current.current.disabled) return; const controller = new AbortController(); task.current = { controller, value, phase: "running" }; setChoosing(false); setWaiting(true); setCancelling(false); setPosition(0); setSuggestion(""); setError(""); setCopyState(""); setNotice(""); setOutcome(null);
    try { const result = await onGenerate({ ...field, mode }, value, { signal: controller.signal, isCurrent: () => mounted.current && current.current.value === value && !current.current.disabled, onProgress: progress => { if (task.current?.controller === controller) task.current.phase = progress.phase; if (mounted.current) setPosition(progress.phase === "queued" ? progress.position : 0); } }), next = typeof result === "string" ? result : result.text; if (mounted.current && !controller.signal.aborted) { if (typeof result !== "string") setOutcome(result); if (current.current.value === value && !current.current.disabled) { current.current.onChange(next); setNotice(t.applied); } else { setSuggestion(next); setNotice(t.changed); } } }
    catch (cause) { if (mounted.current) { const code = cause instanceof Error ? cause.message : ""; if (["facts-not-found", "cancelled", "field-changed", "queue-stopped"].includes(code)) setNotice(characterDraftError(locale, code)); else setError(characterDraftError(locale, code)); if (cause instanceof IsolatedFieldError && cause.cleanup === "failed") setOutcome({ text: "", partialContext: false, cleanup: "failed", cleanupUrl: cause.cleanupUrl }); } }
    finally { if (task.current?.controller === controller) task.current = null; if (mounted.current) { setWaiting(false); setCancelling(false); } }
  };
  return <div className="dr-character-text-field" data-character-text-field={field.key} onClickCapture={preventLabelActivation}>
    <div className="dr-character-field-heading"><label htmlFor={id}>{field.label}</label>{onGenerate && <button ref={wand} type="button" className="dr-character-generate" disabled={disabled || waiting} aria-label={t.ask + ": " + field.label} title={t.ask} aria-busy={waiting} aria-expanded={choosing} aria-controls={id + "-modes"} onClick={() => setChoosing(v => !v)}>{waiting ? <LoaderCircle size={15} aria-hidden="true" /> : <WandSparkles size={15} aria-hidden="true" />}</button>}</div>
    {choosing && !disabled && <div id={id + "-modes"} className="dr-character-field-modes" role="group" aria-label={t.ask + ": " + field.label} onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); setChoosing(false); wand.current?.focus(); } }}>
      <button type="button" aria-describedby={id + "-history-hint"} onClick={() => void generate("history")}>{modes.history}</button><small id={id + "-history-hint"}>{modes.historyHint}</small>
      <button type="button" aria-describedby={id + "-suggest-hint"} onClick={() => void generate("suggest")}>{modes.suggest}</button><small id={id + "-suggest-hint"}>{modes.suggestHint}</small>
      <button type="button" onClick={() => { setChoosing(false); wand.current?.focus(); }}>{modes.cancel}</button>
    </div>}
    {rows === 1 ? <input id={id} aria-label={field.label} disabled={disabled} required={required} maxLength={field.maxLength} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} /> : <textarea id={id} aria-label={field.label} disabled={disabled} required={required} rows={rows} maxLength={field.maxLength} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />}
    {notice && <small role="status">{notice}</small>}{waiting && <div className="dr-character-field-queue"><small role="status">{cancelling ? queue.cancelling : position ? queue.queued + position : isolated.waiting}</small><button type="button" disabled={cancelling} aria-label={queue.cancel + ": " + field.label} onClick={() => { setCancelling(true); task.current?.controller.abort(); }}>{queue.cancel}</button></div>}{error && <p className="dr-character-draft-error" role="alert">{error}</p>}
    {outcome?.partialContext && <small>{isolated.partial}</small>}
    {outcome?.historyOrigin === "visible" && <small>{modes.visible}</small>}
    {outcome?.mode === "history" && <small>{modes.evidence}</small>}
    {!!outcome?.evidence?.length && <details className="dr-character-field-evidence"><summary>{modes.quotes}</summary>{outcome.evidence.map((quote, index) => <blockquote key={index}>{quote}</blockquote>)}</details>}
    {outcome?.cleanup === "failed" && <p className="dr-character-draft-error" role="status">{isolatedCleanupCopy(locale, !!outcome.text)}{castChatReference(outcome.cleanupUrl) && <> <a href={castChatReference(outcome.cleanupUrl)!.url} target="_blank" rel="noopener noreferrer">{isolated.open}</a></>}</p>}
    {suggestion && <div className="dr-character-draft-result"><textarea ref={preview} readOnly aria-label={t.result + ": " + field.label} rows={3} value={suggestion} /><div className="dr-character-draft-actions"><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(suggestion); if (mounted.current) setCopyState(t.copied); } catch { preview.current?.focus(); preview.current?.select(); if (mounted.current) setCopyState(t.select); } }}>{t.copy}</button><button type="button" onClick={() => { setSuggestion(""); setCopyState(""); }}>{t.hide}</button></div><small>{t.hint}</small>{copyState && <small role="status">{copyState}</small>}</div>}
  </div>;
}
