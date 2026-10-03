import { useId, useState } from "react";
import { translate } from "../../core/i18n";
import { uiText } from "../../core/ui-i18n";
import { assistantText } from "../../core/assistant-i18n";
import { MemoryConflictError } from "../../storage/repository";
import { MemoryGuide } from "../shared/MemoryGuide";
import type { DeepRoleSettings, Locale, WorldProfile } from "../../core/types";

export function MemorySelectionSettings(props: {
  locale: Locale; world?: WorldProfile; settings: DeepRoleSettings;
  onSave: (values: { contextBudget: number; relevanceThreshold: number }, expected?: WorldProfile) => Promise<WorldProfile | void>;
}) {
  const source = props.world ?? props.settings;
  const [base, setBase] = useState(source);
  const [budget, setBudget] = useState(source.contextBudget);
  const [threshold, setThreshold] = useState(source.relevanceThreshold);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"saved" | "conflict" | "failed" | null>(null);
  const t = (key: Parameters<typeof uiText>[1]) => uiText(props.locale, key);
  const dirty = budget !== base.contextBudget || threshold !== base.relevanceThreshold;
  const hintId = useId();
  return <form className="settings-form" onSubmit={(event) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setStatus(null);
    void props.onSave({ contextBudget: budget, relevanceThreshold: threshold }, "id" in base ? base : undefined)
      .then((saved) => { setBase(saved ?? { ...base, contextBudget: budget, relevanceThreshold: threshold }); setStatus("saved"); })
      .catch((error) => setStatus(error instanceof MemoryConflictError ? "conflict" : "failed")).finally(() => setBusy(false));
  }}>
    <div className="settings-scope"><strong>{props.world ? uiText(props.locale, "worldScope", { name: props.world.name }) : t("globalScope")}</strong></div>
    <div className="field-label"><div className="dr-memory-help-heading"><label htmlFor={hintId + "-select"}>{translate(props.locale, "sensitivity")}</label><MemoryGuide locale={props.locale} threshold={threshold} /></div><select id={hintId + "-select"} aria-label={translate(props.locale, "sensitivity")} aria-describedby={hintId + "-sensitivity"} disabled={busy} value={threshold} onChange={(e) => { setThreshold(Number(e.target.value)); setStatus(null); }}>
      <option value={4}>{t("wide")}</option><option value={6}>{t("balanced")}</option>{threshold !== 4 && threshold !== 6 && threshold !== 9 && <option value={threshold}>{t("precise")}</option>}<option value={9}>{t("precise")}</option>
    </select><small id={hintId + "-sensitivity"}>{t("sensitivityHint")}</small></div>
    <label className="field-label"><span>{translate(props.locale, "contextBudget")} · {t("budgetUnit")}</span><input aria-label={translate(props.locale, "contextBudget")} aria-describedby={hintId + "-budget"} className="input" type="number" min={500} max={16000} required disabled={busy} value={budget} onChange={(e) => { setBudget(Number(e.target.value)); setStatus(null); }} /><small id={hintId + "-budget"}>{t("budgetHint")}</small></label>
    <button className="button secondary" type="submit" disabled={busy || !dirty}>{t("saveTuning")}</button>
    {status && <p className="setting-copy" role={status === "saved" ? "status" : "alert"}>{status === "saved" ? t("tuningSaved") : status === "conflict" ? t("tuningConflict") : assistantText(props.locale, "failed")}</p>}
  </form>;
}
