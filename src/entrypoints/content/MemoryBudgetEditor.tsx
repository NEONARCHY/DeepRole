import { useEffect, useId, useRef, useState } from "react";
import type { Locale, WorldProfile } from "../../core/types";
import { gameMemoryCoverageText } from "../../core/game-memory-coverage-i18n";

export function MemoryBudgetEditor({ world, required, locale, onSave, showSuggestion = true }: {
  world: WorldProfile; required: number; locale: Locale;
  onSave: (budget: number, expected: WorldProfile) => Promise<void>;
  showSuggestion?: boolean;
}) {
  const t = gameMemoryCoverageText(locale), id = useId();
  const [base, setBase] = useState(world.contextBudget);
  const [draft, setDraft] = useState(String(world.contextBudget));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"saved" | "failed" | "conflict" | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (world.contextBudget !== base && draft === String(base)) {
      setBase(world.contextBudget); setDraft(String(world.contextBudget)); setStatus(null);
    }
  }, [world.contextBudget, base, draft]);
  const value = Number(draft), valid = draft.trim() !== "" && Number.isSafeInteger(value) && value >= 500 && value <= 16000;
  const changedElsewhere = world.contextBudget !== base && value !== world.contextBudget;
  const suggested = Math.min(16000, Math.ceil(Math.max(required * 1.25, base + 500) / 500) * 500);
  return <form className="dr-memory-budget-editor" aria-busy={busy} onSubmit={event => {
    event.preventDefault(); if (busy || !valid || changedElsewhere || value === world.contextBudget) return;
    setBusy(true); setStatus(null);
    void onSave(value, world).then(() => {
      if (mounted.current) { setBase(value); setStatus("saved"); }
    }).catch(error => {
      if (mounted.current) setStatus(error instanceof Error && ["memory-conflict", "memory-budget-conflict", "memory-budget-scope"].includes(error.message) ? "conflict" : "failed");
    }).finally(() => { if (mounted.current) setBusy(false); });
  }}>
    <label htmlFor={id}>{t.budgetLabel}</label>
    <small>{t.budgetScope.replace("{name}", world.name)}</small>
    <div className="dr-memory-budget-fields">
      <input id={id} type="number" min={500} max={16000} step={1} required disabled={busy} value={draft} aria-describedby={id + "-hint"} onChange={event => { setDraft(event.target.value); setStatus(null); }} />
      <button type="submit" disabled={busy || !valid || changedElsewhere || value === world.contextBudget}>{busy ? t.budgetSaving : t.budgetSave}</button>
    </div>
    {showSuggestion && suggested > world.contextBudget && <button className="dr-memory-budget-suggest" type="button" disabled={busy} onClick={() => { setDraft(String(suggested)); setStatus(null); }}>{t.budgetSuggest.replace("{count}", new Intl.NumberFormat(locale).format(suggested))}</button>}
    <small id={id + "-hint"}>{t.budgetHelp}</small>
    {(changedElsewhere || status === "conflict") && <p role="alert">{t.budgetConflict} <button type="button" disabled={busy} onClick={() => { setBase(world.contextBudget); setDraft(String(world.contextBudget)); setStatus(null); }}>{t.budgetReload}</button></p>}
    {status === "saved" && !changedElsewhere && <p role="status">{t.budgetSaved}</p>}
    {status === "failed" && <p role="alert">{t.budgetFailed}</p>}
  </form>;
}
