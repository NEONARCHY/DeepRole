import { useState } from "react";
import { castText } from "../../core/cast-i18n";
import type { CastView } from "../../adapters/cast-coordinator";
import type { Locale } from "../../core/types";
import {worldResetText} from "../../core/world-reset-i18n";
import {castDiagnosticOutcome,castPreparationReady} from "../../core/cast-progress";
import {castProgressText} from "../../core/cast-progress-i18n";
import { SupportDetails } from "./SupportDetails";

export function CastDiagnostics({ job, locale }: { job: CastView; locale: Locale }) {
  const [fallback, setFallback] = useState(false), [copied, setCopied] = useState(false);
  if (!job.diagnostics?.length) return null;
  const t = (key: Parameters<typeof castText>[1]) => castText(locale, key);
  const progress=castProgressText(locale),ready=castPreparationReady(job);
  const report = JSON.stringify({ diagnosticVersion: 2, extensionVersion: "0.1.0", requestId: job.id, phase: job.phase, cleanup: job.cleanup, sourceCount: job.sourceCount, partCount: job.partCount, batchSize: job.batchSize, prepared: job.draft?.characters.length ?? 0, reasoning: job.reasoning ?? "unavailable", automaticCorrectionsPerBatch: 1, events: job.diagnostics }, null, 2);
  return <div className="dr-cast-validation">
    {(ready||job.phase==="applied")&&<p className="dr-cast-validation-success" role="status">{job.phase==="applied"?progress.applied:job.reset?progress.resetReady:progress.ready}</p>}
    <SupportDetails locale={locale}><div className="dr-cast-diagnostics"><h3>{progress.history}</h3><small>{progress.historyHint}</small><small>{t("diagnosticPrivacy")}</small><small>{t("repairExplanation")}</small>
    <button type="button" className="button secondary small" onClick={async () => { try { await navigator.clipboard.writeText(report); setCopied(true); } catch { setFallback(true); } }}>{t("copyDiagnostics")}</button>
    {copied && <small role="status">{t("diagnosticsCopied")}</small>}
    {fallback && <><small>{t("diagnosticsManual")}</small><textarea aria-label={t("diagnosticReport")} readOnly rows={8} value={report} onFocus={e => e.currentTarget.select()}/></>}
    {job.diagnostics.map((item, index) => <section key={index} data-outcome={castDiagnosticOutcome(job,index)}><strong className="dr-cast-validation-outcome">{progress[castDiagnosticOutcome(job,index)]}</strong><p>{item.requestId !== job.id && <><strong>{t("previousAttempt")}</strong><br/></>}{t("requestId")}: <code>{item.requestId}</code><br/>{t("diagnosticStep")}: {item.step + 1} · {t(item.repair ? "repairStep" : "finalStep")}<br/>{t("diagnosticCode")}: <code>{item.code}</code>
      {item.stage && <><br/>{t("diagnosticStage")}: {t(item.stage === "merge" ? "stageMerge" : item.stage === "worker" ? "stageWorker" : "stageParse")}</>}
      {item.replyLength !== undefined && <><br/>{t("replyLength")}: {item.replyLength}</>}
      {item.prepared !== undefined && <><br/>{job.reset ? worldResetText(locale).phase : t("savedCount")}: {item.prepared}</>}
      {item.reasoning && <><br/>{t("thinkingMode")}: {t(item.reasoning === "enabled" ? "thinkingEnabled" : item.reasoning === "unverified" ? "thinkingUnverified" : "thinkingUnavailable")}</>}
      {item.at && <><br/>{new Intl.DateTimeFormat(locale, {dateStyle:"short", timeStyle:"medium"}).format(item.at)}</>}
    </p>{item.details?.length ? <ul>{item.details.map((d, i) => <li key={i}><code>{d.path}</code><br/>{t("expected")}: {d.rule}<br/>{t("actual")}: {d.actual}</li>)}</ul> : !!item.issues.length && <ul>{item.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>}</section>)}
  </div></SupportDetails></div>;
}
