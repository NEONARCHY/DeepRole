import { useEffect, useRef, useState } from "react";
import { readServiceDiagnosticSnapshot, serviceDiagnosticReport, serviceDiagnosticSnapshot, type ServiceDiagnosticOperation, type ServiceDiagnosticPending, type ServiceDiagnosticSnapshot } from "../../core/service-diagnostics";
import { serviceDiagnosticErrorKey, serviceDiagnosticsText, type ServiceDiagnosticsTextKey } from "../../core/service-diagnostics-i18n";
import type { Locale } from "../../core/types";
import { serviceValidationRuleText } from "../../core/service-validation-i18n";
import "./story-diagnostics.css";
import "./service-diagnostics.css";

export function ServiceDiagnostics({ locale, onCheck }: { locale: Locale; onCheck: () => Promise<unknown> }) {
 const [snapshot, setSnapshot] = useState<{ result: ServiceDiagnosticSnapshot; at: number } | null>(null);
 const [busy, setBusy] = useState(false), [copy, setCopy] = useState<"idle" | "copied" | "manual">("idle");
 const running = useRef(false), generation = useRef(0), mounted = useRef(false);
 useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
 const t = (key: ServiceDiagnosticsTextKey) => serviceDiagnosticsText(locale, key);
 const number = (value: number | null) => value === null ? t("unknown") : new Intl.NumberFormat(locale).format(value);
 const date = (value: number) => new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "medium" }).format(value);
 const result = snapshot?.result, report = snapshot ? serviceDiagnosticReport(snapshot.result, snapshot.at) : null;
 async function check() {
  if (running.current) return;
  running.current = true; const token = ++generation.current; setBusy(true); setSnapshot(null); setCopy("idle");
  const unavailable = () => serviceDiagnosticSnapshot({ status: "unavailable" }, { status: "unavailable" });
  let value: ServiceDiagnosticSnapshot;
  try { value = readServiceDiagnosticSnapshot(await onCheck()) ?? unavailable(); } catch { value = unavailable(); }
  if (mounted.current && generation.current === token) { setSnapshot({ result: value, at: Date.now() }); setBusy(false); }
  running.current = false;
 }
 async function copyReport() {
  if (!report) return; const token = generation.current;
  let state: "copied" | "manual";
  try { await navigator.clipboard.writeText(report); state = "copied"; } catch { state = "manual"; }
  if (mounted.current && generation.current === token) setCopy(state);
 }
 return <section className="settings-card dr-story-diagnostics dr-service-diagnostics" aria-labelledby="dr-service-diagnostics-title">
  <header><h2 id="dr-service-diagnostics-title">{t("title")}</h2></header><div>
   <p className="setting-copy">{t("hint")}</p><p className="setting-copy">{t("limit")}</p>
   <div className="dr-story-diagnostics-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => void check()}>{t(busy ? "checking" : snapshot ? "again" : "check")}</button>
    {report && <button type="button" className="button secondary" onClick={() => void copyReport()}>{t("copy")}</button>}
   </div>
   <div role="status" aria-live="polite" aria-atomic="true">{busy ? t("checking") : result && <>
    <p>{t(result.journal.status === "read" ? "journalRead" : result.journal.status === "locked" ? "locked" : "journalUnavailable")}</p>
    {result.pending.status === "unavailable" ? <p>{t("pendingUnavailable")}</p> : !!result.pending.total && <p>{t("pendingHint")}</p>}
    {!!((result.journal.invalid ?? 0) + (result.pending.invalid ?? 0)) && <p>{t("invalidHint")}</p>}
    {result.journal.status === "read" && result.pending.status === "read" && result.journal.total === 0 && result.pending.total === 0 && !result.journal.invalid && !result.pending.invalid && <p>{t("empty")}</p>}
   </>}</div>
   {snapshot && <small>{t("checked").replace("{date}", date(snapshot.at))}</small>}
   {result && <><p className="setting-copy">{t("snapshotHint")}</p>
    <dl className="dr-story-diagnostics-counts">{([ ["journal", result.journal.total], ["pending", result.pending.total], ["invalid", result.journal.invalid === null || result.pending.invalid === null ? null : result.journal.invalid + result.pending.invalid] ] as const).map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{number(value)}</dd></div>)}</dl>
    {!!(result.journal.entries.length || result.pending.entries.length) && <details><summary>{t("details")}</summary>
     {result.journal.entries.length > 0 && <><h3>{t("journalDetails")}</h3><ul className="dr-service-diagnostics-list">{result.journal.entries.map((entry, index) => <Operation key={`${entry.id}:${index}`} entry={entry} locale={locale}/>)}</ul></>}
     {!!result.journal.omitted && <p className="setting-copy">{t("omitted").replace("{shown}", number(result.journal.entries.length)).replace("{total}", number(result.journal.total))}</p>}
     {result.pending.entries.length > 0 && <><h3>{t("pendingDetails")}</h3><ul className="dr-service-diagnostics-list">{result.pending.entries.map(entry => <Operation key={entry.id} entry={entry} locale={locale}/>)}</ul></>}
     {!!result.pending.omitted && <p className="setting-copy">{t("omitted").replace("{shown}", number(result.pending.entries.length)).replace("{total}", number(result.pending.total))}</p>}
    </details>}
   </>}
   <p className="setting-copy">{t("privacy")}</p>
   {copy === "copied" && <small role="status">{t("copied")}</small>}
   {copy === "manual" && <><p role="status" className="setting-copy">{t("manual")}</p><textarea readOnly rows={10} aria-label={t("report")} value={report ?? ""} onFocus={event => event.currentTarget.select()}/></>}
  </div>
 </section>;
}
function Operation({ entry, locale }: { entry: ServiceDiagnosticOperation | ServiceDiagnosticPending; locale: Locale }) {
 const t = (key: ServiceDiagnosticsTextKey) => serviceDiagnosticsText(locale, key);
 const date = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "medium" }).format("updatedAt" in entry ? entry.updatedAt : entry.at);
 return <li><strong>{t(entry.operation === "character-field" ? "operation_characterField" : entry.operation === "story-repair" ? "operation_storyRepair" : entry.operation === "character-discovery" ? "operation_characterDiscovery" : "operation_castPreparation")}</strong><small>{date}</small>
  {"origin" in entry && <>
   <p className="setting-copy">{t(`mode_${entry.mode}`)} · {t(`scope_${entry.fieldScope}`)}</p>
   {entry.origin === "restored" && <p>{t("restoredHint")}</p>}
  </>}
  <dl className="dr-story-diagnostics-counts"><div><dt>{t("phase")}</dt><dd>{t(`phase_${entry.phase}`)}</dd></div><div><dt>{t("cleanup")}</dt><dd>{t(`cleanup_${entry.cleanup}`)}</dd></div></dl>
  {"runtime" in entry && entry.runtime && <dl className="dr-story-diagnostics-counts">
   <div><dt>{t("worker")}</dt><dd>{t(({ opening: "worker_opening", ready: "worker_ready", sending: "worker_sending", "waiting-reply": "worker_waitingReply", "reply-received": "worker_replyReceived", cleanup: "worker_cleanup", finished: "worker_finished" } as const)[entry.runtime.stage])}</dd></div>
   <div><dt>{t("workerVisibility")}</dt><dd>{t(`visibility_${entry.runtime.visibility}`)}</dd></div>
   <div><dt>{t("workerAt")}</dt><dd>{new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "medium" }).format(entry.runtime.at)}</dd></div>
  </dl>}
  {entry.error && <p>{t(serviceDiagnosticErrorKey(entry.error))}<br/>{t("error")}: <code>{entry.error}</code></p>}
  {"origin" in entry && entry.validation && <div className="dr-service-validation"><h4>{t("validation")}</h4><p className="setting-copy">{t(entry.validation.family === "field" ? "validationFieldHint" : "validationHint")}</p>
   {entry.validation.events.map((event, index) => <div key={index}><strong>{entry.validation!.family === "field" ? t("validationFieldAttempt") : t("validationAttempt").replace("{step}", new Intl.NumberFormat(locale).format(event.step)).replace("{attempt}", t(event.repair ? "validationRepair" : "validationOriginal"))}</strong>
    <ul>{event.issues.map((issue, i) => <li key={i}><p>{serviceValidationRuleText(locale, issue.rule)}</p><code>{issue.path}</code><br/>{t("validationRule")}: <code>{issue.rule}</code>
     {issue.actual !== null && <><br/>{t("validationActual")}: <code>{issue.actual}</code></>}
    </li>)}</ul>
   </div>)}
   {!!entry.validation.excluded && <p>{t("validationExcluded").replace("{count}", new Intl.NumberFormat(locale).format(entry.validation.excluded))}</p>}
  </div>}
  {"origin" in entry && !entry.validation && ["invalid-result", "invalid-evidence", "partial-reply", "preparation-failed", "text-too-long", "facts-not-found", "conflicting-facts"].includes(entry.error ?? "") && <p className="setting-copy">{t("validationMissing")}</p>}
  <p className="setting-copy">{t("request")}: {entry.id ? <code>{entry.id}</code> : t("legacyId")}</p>
 </li>;
}
