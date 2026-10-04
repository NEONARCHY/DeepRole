import { useState } from "react";
import { Check, ChevronDown, ChevronUp, CircleAlert, LoaderCircle, Send, Sparkles } from "lucide-react";
import type { ContextSelection, Locale } from "../../core/types";
import { experienceText } from "../../core/experience-i18n";
import { formatRecordCount } from "../../core/menu-i18n";
import { memoryReadiness, selectionReason, type ServiceActivity } from "../../core/memory-experience";
import { sceneChoiceText } from "../../core/scene-choices";

export function ServiceProgress({ locale, activity }: { locale: Locale; activity?: ServiceActivity | null }) {
  if (!activity) return null;
  const t = (key: Parameters<typeof experienceText>[1]) => experienceText(locale, key);
  const busy = activity.phase === "preparing" || activity.phase === "waiting";
  const handoff = /handoff/.test(activity.type);
  const key = activity.phase === "preparing" ? "preparing" : activity.phase === "error" ? handoff ? "handoffError" : "serviceError" : activity.phase === "empty" ? "emptyResult" : handoff ? "waitingRecap" : "waiting";
  const choices = activity.type === "scene-choices";
  return <section className={`dr-service-state ${busy ? "is-busy" : ""} ${activity.phase === "error" ? "is-error" : ""}`} role="status" aria-live="polite">
    {busy ? <LoaderCircle aria-hidden="true" /> : activity.phase === "error" ? <CircleAlert aria-hidden="true" /> : <Check aria-hidden="true" />}
    <div><strong>{choices ? sceneChoiceText(locale, activity.phase === "error" ? "failed" : "waiting") : t(key)}</strong><p>{choices ? sceneChoiceText(locale, activity.phase === "error" ? "failedHint" : "waitingHint") : t(activity.phase === "empty" ? "emptyResultHint" : activity.phase === "error" ? handoff ? "handoffErrorHint" : "serviceErrorHint" : handoff ? "waitingRecapHint" : "waitingHint")}</p></div>
  </section>;
}

export function MemoryStatus(props: { locale: Locale; connected: boolean; warning?: string; pendingHandoff?: string; selection?: ContextSelection; available: number; onAdd: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const t = (key: Parameters<typeof experienceText>[1]) => experienceText(props.locale, key);
  const entries = props.selection?.entries ?? [];
  const state = memoryReadiness(props.connected, props.warning, entries.length + (props.pendingHandoff ? 1 : 0), props.available);
  return <section className={`dr-memory-status is-${state}`} aria-label={t("preview")}>
    <div className="dr-status-heading">{state === "failed" ? <CircleAlert aria-hidden="true" /> : state === "ready" ? <Send aria-hidden="true" /> : <Sparkles aria-hidden="true" />}<strong>{t(state)}</strong>{state === "ready" && entries.length > 0 && <span className="dr-record-count">{entries.length}</span>}</div>
    <p>{t(`${state}Hint`)}</p>
    {props.pendingHandoff && <p>{experienceText(props.locale, "pendingRecap", { name: props.pendingHandoff })}</p>}
    {state === "empty" && <button className="button primary" onClick={props.onAdd}>{t("empty")}</button>}
    {entries.length > 0 && <>
      <button className="dr-preview-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? t("inspectLess") : t("inspect")} <span>{formatRecordCount(props.locale, entries.length)}</span>{expanded ? <ChevronUp /> : <ChevronDown />}</button>
      {expanded && <div className="dr-memory-preview-list">{entries.map((item) => <article key={item.entry.id}><strong>{item.entry.title}</strong><small>{t(selectionReason(item))}</small><p>{item.entry.content}</p></article>)}</div>}
    </>}
  </section>;
}
