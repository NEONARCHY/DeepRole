import { useId, useState } from "react";
import type { Locale } from "../../core/types";
import type { StoryReviewPage } from "../../core/story-review";
import { storyUpdateText } from "../../core/story-update-i18n";
import { validStoryUpdateDiagnostic } from "../../core/story-update";
export function StoryFacts({ locale, page, busy, onSave, onRepair }: { locale: Locale; page: StoryReviewPage; busy: boolean; onSave?: (eventId: string, text: string, accept: boolean) => void; onRepair?: () => void }) {
  const t = (key: Parameters<typeof storyUpdateText>[1]) => storyUpdateText(locale, key), id = useId();
  const [drafts, setDrafts] = useState<Record<string, string>>({}), [copied, setCopied] = useState(false), [report, setReport] = useState("");
  const diagnostic = page.update;
  const copy = async () => {
    if (!validStoryUpdateDiagnostic(diagnostic)) return;
    const text = JSON.stringify({ diagnosticVersion: 1, extensionVersion: "0.1.0", stage: "story-update", result: diagnostic, repair: page.repair?.status ?? "not-requested", cleanup: page.repair?.cleanup ?? "not-requested" }, null, 2);
    try { await navigator.clipboard.writeText(text); setCopied(true); setReport(""); } catch { setReport(text); setCopied(false); }
  };
  return <section aria-labelledby={`${id}-title`} className="dr-story-review-preview"><h3 id={`${id}-title`}>{t("title")}</h3><p className="setting-copy">{t("hint")}</p>
    {!page.facts?.length && <p>{t("empty")}</p>}
    {page.facts?.map(f => <article key={f.eventId} className="dr-story-review-entry"><strong>{t(f.kind)}</strong>{f.accepted && <p>{t("saved")}</p>}{f.edited && <p>{t("edited")}</p>}
      <label className="field-label" htmlFor={`${id}-${f.eventId}`}><span>{t("text")}</span></label><textarea id={`${id}-${f.eventId}`} maxLength={1200} value={drafts[f.eventId] ?? f.text} onChange={e => setDrafts({ ...drafts, [f.eventId]: e.target.value })} />
      <details><summary>{t("evidence")}</summary><p className="dr-story-review-source">{f.quote}</p></details>
      {onSave && <button type="button" className="button secondary" disabled={busy || !(drafts[f.eventId] ?? f.text).trim()} onClick={() => onSave(f.eventId, drafts[f.eventId] ?? f.text, !(f.accepted && drafts[f.eventId] === undefined))}>{t(f.accepted && drafts[f.eventId] === undefined ? "remove" : "save")}</button>}
    </article>)}
    {diagnostic && <><h3>{t("update")}</h3><p>{t("accepted").replace("{count}", new Intl.NumberFormat(locale).format(diagnostic.accepted))} · {t("skipped").replace("{count}", new Intl.NumberFormat(locale).format(diagnostic.skipped))}</p>
      {diagnostic.status !== "accepted" && <p role="status">{t(diagnostic.status)}</p>}
      {onRepair && !page.repair && diagnostic.status !== "accepted" && !diagnostic.issues.some(i => i.rule === "scope") && (diagnostic.status === "missing" || diagnostic.issues.some(i => i.rule !== "policy")) && <><p className="setting-copy">{t("repairHint")}</p><button type="button" className="button secondary" disabled={busy} onClick={onRepair}>{t("repair")}</button></>}
      {page.repair && <p role="status">{t(page.repair.status === "done" ? "repaired" : page.repair.status === "requested" ? "repairing" : "repairFailed")}</p>}
      {page.repair?.cleanup === "failed" && <p role="status">{t("cleanupFailed")}</p>}
      <button type="button" className="button secondary" onClick={() => void copy()}>{t("copy")}</button><p className="setting-copy">{t("privacy")}</p>
      {copied && <p role="status">{t("copied")}</p>}{report && <><p role="status">{t("manualCopy")}</p><textarea aria-label={t("report")} readOnly value={report} onFocus={e => e.currentTarget.select()} /></>}
      {!!diagnostic.issues.length && <details><summary>{t("technical")}</summary><ul>{diagnostic.issues.map((issue, i) => <li key={i}><code>{issue.path} · {issue.rule} · {issue.actual}</code></li>)}</ul></details>}
    </>}
  </section>;
}
