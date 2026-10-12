import { useEffect, useId, useRef, useState } from "react";
import { WandSparkles } from "lucide-react";
import { PROFILE_FIELDS, profileField, profileValues, readProfileProposal, type ProfileField, type ProfileProposal, type ProfileValues } from "../../core/character-profile";
import { profileCopy } from "../../core/character-profile-i18n";
import { characterDraftError, characterModeCopy, characterQueueCopy, isolatedCleanupCopy, isolatedFieldCopy, type CharacterTextGenerator, type CharacterTextResponse } from "../../core/character-text";
import { characterText } from "../../core/characters";
import { IsolatedFieldError, type CharacterTextOutcome } from "../../core/isolated-character-text";
import { castChatReference } from "../../core/cast-chat";
import type { Locale } from "../../core/types";

export interface ProfileInsertion { key: ProfileField; text: string; expected: string }
export function CharacterProfileGenerator(props: { locale: Locale; name: string; values: ProfileValues; disabled: boolean; scope?: string; onGenerate: CharacterTextGenerator; onApply: (changes: ProfileInsertion[]) => void }) {
 const t = profileCopy(props.locale), queue = characterQueueCopy(props.locale), isolated = isolatedFieldCopy(props.locale), id = useId();
 const current = useRef(props); current.current = props;
 const alive = useRef(true), task = useRef<{ controller: AbortController; phase: "queued" | "running" } | null>(null), origin = useRef<HTMLButtonElement>(null);
 const [choosing, setChoosing] = useState(false), [waiting, setWaiting] = useState(false), [position, setPosition] = useState(0), [cancelling, setCancelling] = useState(false);
 const [proposal, setProposal] = useState<ProfileProposal | null>(null), [selected, setSelected] = useState<ProfileField[]>([]), [notice, setNotice] = useState(""), [error, setError] = useState("");
 const [outcomes, setOutcomes] = useState<CharacterTextOutcome[]>([]);
 const expected = useRef<ProfileValues>(profileValues(props.values));
 const originalProposal = useRef<ProfileProposal | null>(null);
 useEffect(() => { alive.current = true; return () => { alive.current = false; task.current?.controller.abort(); }; }, []);
 useEffect(() => { task.current?.controller.abort(); setProposal(null); setSelected([]); setOutcomes([]); setNotice(""); setError(""); setChoosing(false); }, [props.name, props.scope]);
 const show = (value: ProfileProposal, baseline: ProfileValues) => {
  originalProposal.current = value;
  expected.current = { ...baseline };
  setProposal(value); setSelected(PROFILE_FIELDS.filter(key => !!value[key]?.text && !baseline[key].trim() && current.current.values[key] === baseline[key]));
 };
 const generate = async (mode: "history" | "suggest") => {
  if (task.current || current.current.disabled || !current.current.name.trim()) return;
  const controller = new AbortController(), name = current.current.name, scope = current.current.scope, baseline = profileValues(current.current.values);
  const active = () => alive.current && !controller.signal.aborted && current.current.name === name && current.current.scope === scope && !current.current.disabled;
  const unchanged = () => PROFILE_FIELDS.every(key => current.current.values[key] === baseline[key]);
  task.current = { controller, phase: "queued" }; setChoosing(false); setWaiting(true); setCancelling(false); setPosition(0); setProposal(null); setSelected([]); setOutcomes([]); setError(""); setNotice("");
  let result: ProfileProposal | null = null;
  const run = async (nextMode: "history" | "suggest", fields: ProfileField[], values: ProfileValues) => {
   const response: CharacterTextResponse = await current.current.onGenerate(profileField(props.locale, nextMode, fields), JSON.stringify(values), {
    signal: controller.signal, isCurrent: () => active() && unchanged(),
    onProgress: p => { if (task.current?.controller === controller) task.current.phase = p.phase; if (active()) setPosition(p.phase === "queued" ? p.position : 0); },
   });
   if (!active()) throw new Error("cancelled");
   const outcome = typeof response === "string" ? null : response;
   const value = readProfileProposal(typeof response === "string" ? response : response.text, fields);
   // A mismatched mode must never relabel inventions as source-backed facts.
   if (fields.some(key => nextMode === "history" ? value[key]?.status === "suggested" : value[key]?.status !== "suggested")) throw new Error("invalid-result");
   if (outcome) setOutcomes(previous => [...previous, outcome]);
   return { value, outcome };
  };
  try {
   const first = await run(mode, [...PROFILE_FIELDS], baseline); result = first.value;
   show(result, baseline);
   const missing = PROFILE_FIELDS.filter(key => result![key]?.status === "not-found");
   if (mode === "history" && missing.length && unchanged() && first.outcome?.cleanup !== "failed") {
    setNotice(t.fallback);
    const values = { ...baseline };
    for (const key of PROFILE_FIELDS) if (result[key]?.status === "found") values[key] = result[key]!.text;
    const creative = await run("suggest", missing, values); result = { ...result, ...creative.value }; show(result, baseline);
   }
   if (active()) setNotice(!unchanged() ? t.changed : mode === "history" && missing.length && first.outcome?.cleanup === "failed" ? t.cleanup : t.ready);
  } catch (cause) {
   if (alive.current && current.current.name === name && current.current.scope === scope) {
    const code = cause instanceof Error ? cause.message : "invalid-result";
    if (code === "cancelled") setNotice(t.cancelled); else if (code === "field-changed") setNotice(t.changed); else setError(characterDraftError(props.locale, code));
    if (cause instanceof IsolatedFieldError && cause.cleanup === "failed") setOutcomes(previous => [...previous, { text: "", partialContext: false, cleanup: "failed", cleanupUrl: cause.cleanupUrl }]);
   }
  } finally {
   if (task.current?.controller === controller) task.current = null;
   if (alive.current) { setWaiting(false); setCancelling(false); setPosition(0); }
  }
 };
 const apply = () => {
  if (!proposal || current.current.disabled || waiting) return;
  const changes = selected.filter(key => current.current.values[key] === expected.current[key] && !!proposal[key]?.text.trim())
   .map(key => ({ key, text: proposal[key]!.text, expected: expected.current[key] }));
  const skipped = selected.some(key => current.current.values[key] !== expected.current[key]);
  if (changes.length) props.onApply(changes);
  setSelected([]); setNotice(skipped ? t.skipped : t.applied);
 };
 return <section className="dr-profile-generator" aria-label={t.generate} data-profile-generator>
  <button ref={origin} type="button" disabled={props.disabled || waiting || !props.name.trim()} aria-expanded={choosing} aria-controls={id + "-modes"} aria-busy={waiting} onClick={() => setChoosing(v => !v)}><WandSparkles size={16} aria-hidden="true" />{t.generate}</button>
  <p className="dr-character-hint">{t.hint}</p>
  {choosing && <div className="dr-character-field-modes" id={id + "-modes"} role="group" aria-label={t.generate} onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setChoosing(false); origin.current?.focus(); } }}>
   <button type="button" aria-describedby={id + "-history"} onClick={() => void generate("history")}>{t.history}</button><small id={id + "-history"}>{t.historyHint}</small>
   <button type="button" aria-describedby={id + "-suggest"} onClick={() => void generate("suggest")}>{t.suggest}</button><small id={id + "-suggest"}>{t.suggestHint}</small>
   <button type="button" onClick={() => { setChoosing(false); origin.current?.focus(); }}>{t.cancel}</button>
  </div>}
  {waiting && <div className="dr-character-field-queue"><small role="status">{cancelling ? queue.cancelling : position ? queue.queued + position : isolated.waiting}</small><button type="button" disabled={cancelling} onClick={() => { setCancelling(true); task.current?.controller.abort(); }}>{queue.cancel}</button></div>}
  {notice && <small role="status">{notice}</small>}{error && <p role="alert" className="dr-character-draft-error">{error}</p>}
  {outcomes.some(o => o.partialContext) && <small>{isolated.partial}</small>}
  {outcomes.some(o => o.historyOrigin === "visible") && <small>{characterModeCopy(props.locale).visible}</small>}
  {outcomes.filter(o => o.cleanup === "failed").map((o, index) => <p key={index} className="dr-character-draft-error" role="status">{isolatedCleanupCopy(props.locale, !!o.text)}{castChatReference(o.cleanupUrl) && <> <a href={castChatReference(o.cleanupUrl)!.url} target="_blank" rel="noopener noreferrer">{isolated.open}</a></>}</p>)}
  {proposal && <div className="dr-profile-review"><h3>{t.review}</h3><p className="dr-character-hint">{t.reviewHint}</p>
   {PROFILE_FIELDS.map(key => proposal[key] && <div key={key} className="dr-profile-review-field" data-profile-proposal={key}>
    <strong>{characterText(props.locale, key)}</strong><small>{t[proposal[key]!.status === "not-found" ? "missing" : proposal[key]!.status]}</small>
    {originalProposal.current?.[key]?.text !== proposal[key]!.text && <small>{t.edited}</small>}
    {["found", "suggested"].includes(proposal[key]!.status) && <><label className="dr-character-check"><input type="checkbox" checked={selected.includes(key)} disabled={waiting || props.disabled} onChange={e => { expected.current[key] = current.current.values[key]; setSelected(previous => e.target.checked ? [...previous.filter(k => k !== key), key] : previous.filter(k => k !== key)); }} />{t.select} · {characterText(props.locale, key)}</label>
     <textarea aria-label={t.proposal + ": " + characterText(props.locale, key)} rows={3} maxLength={1200} disabled={waiting || props.disabled} value={proposal[key]!.text} onChange={e => setProposal(previous => ({ ...previous, [key]: { ...previous![key]!, text: e.target.value } }))} /></>}
    {!!proposal[key]!.evidence.length && <details className="dr-character-field-evidence"><summary>{characterModeCopy(props.locale).quotes}</summary>{originalProposal.current?.[key]?.text !== proposal[key]!.text && <small>{t.originalQuotes}</small>}{proposal[key]!.evidence.map((quote, index) => <blockquote key={index}>{quote}</blockquote>)}</details>}
   </div>)}
   <div className="dr-character-draft-actions"><button type="button" className="dr-character-primary" disabled={waiting || props.disabled || !selected.some(key => !!proposal[key]?.text.trim())} onClick={apply}>{t.apply}</button><button type="button" disabled={waiting} onClick={() => { setProposal(null); setSelected([]); }}>{t.dismiss}</button></div>
  </div>}
 </section>;
}
