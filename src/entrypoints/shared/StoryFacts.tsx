import { useId, useState } from "react";
import type { Locale } from "../../core/types";
import type { StoryReviewPage } from "../../core/story-review";
import { storyAutomationText } from "../../core/story-automation-i18n";
import { storyUpdateText } from "../../core/story-update-i18n";
import { storyUxText } from "../../core/story-ux-i18n";
import { validStoryUpdateDiagnostic } from "../../core/story-update";
import { SupportDetails } from "./SupportDetails";

export function StoryFacts({ locale, page, busy, compact = false, onSave, onRepair }: { locale: Locale; page: StoryReviewPage; busy: boolean; compact?: boolean; onSave?: (eventId: string, text: string, accept: boolean) => void; onRepair?: () => void }) {
  const t = (key: Parameters<typeof storyUpdateText>[1]) => storyUpdateText(locale, key), id = useId();
  const ux = (key: Parameters<typeof storyUxText>[1]) => storyUxText(locale, key);
  const [drafts, setDrafts] = useState<Record<string, { base: string; text: string }>>({}), [copied, setCopied] = useState(false), [report, setReport] = useState("");
  const diagnostic = page.update;
  const copy = async () => {
    if (!validStoryUpdateDiagnostic(diagnostic)) return;
    const text = JSON.stringify({ diagnosticVersion: 1, extensionVersion: "0.1.0", stage: "story-update", result: diagnostic, repair: page.repair?.status ?? "not-requested", cleanup: page.repair?.cleanup ?? "not-requested" }, null, 2);
    try { await navigator.clipboard.writeText(text); setCopied(true); setReport(""); } catch { setReport(text); setCopied(false); }
  };
  const updateDetails = diagnostic && <>
    <p>{t("accepted").replace("{count}", new Intl.NumberFormat(locale).format(diagnostic.accepted))} · {t("skipped").replace("{count}", new Intl.NumberFormat(locale).format(diagnostic.skipped))}</p>
    <button type="button" className="button secondary" onClick={() => void copy()}>{t("copy")}</button><p className="setting-copy">{t("privacy")}</p>
    {copied && <p role="status">{t("copied")}</p>}{report && <><p role="status">{t("manualCopy")}</p><textarea aria-label={t("report")} readOnly value={report} onFocus={e => e.currentTarget.select()} /></>}
    {!!diagnostic.issues.length && <details><summary>{t("technical")}</summary><ul>{diagnostic.issues.map((issue, i) => <li key={i}><code>{issue.path} · {issue.rule} · {issue.actual}</code></li>)}</ul></details>}
  </>;
  return <section aria-labelledby={compact ? undefined : id + "-title"} aria-label={compact ? t("title") : undefined} className="dr-story-review-preview">{!compact && <><h3 id={id + "-title"}>{t("title")}</h3><p className="setting-copy">{t("hint")}</p></>}{!!page.facts?.length && <p className="dr-workspace-notice">{ux("manualEdit")}</p>}
    {!page.facts?.length && <p>{t("empty")}</p>}
    {page.facts?.map(f => {
      const draft = drafts[f.eventId], text = draft?.text ?? f.text, dirty = !!draft && draft.text !== f.text;
      const conflict = dirty && draft.base !== f.text;
      return <article key={f.eventId} className="dr-story-review-entry"><strong>{t(f.kind)}</strong>{f.superseded && <p>{storyAutomationText(locale).superseded}</p>}{f.accepted && !f.superseded && <p>{f.automation?.mode === "automatic" && f.automation.status === "saved" ? storyAutomationText(locale).autoSaved : t("saved")}</p>}{f.automation?.status === "duplicate" && <p>{storyAutomationText(locale).duplicate}</p>}{f.edited && <p>{t("edited")}</p>}
        <label className="field-label" htmlFor={id + "-" + f.eventId}><span>{t("text")}</span></label><textarea id={id + "-" + f.eventId} maxLength={1200} disabled={busy} value={text} onChange={e => {
          const value = e.target.value;
          setDrafts(old => { const previous = old[f.eventId]; return { ...old, [f.eventId]: { base: !previous || previous.text === f.text ? f.text : previous.base, text: value } }; });
        }} />
        {conflict && <div className="dr-draft-conflict" role="status"><p>{ux("changedFact")}</p><strong>{ux("currentFact")}</strong><p>{f.text}</p><button type="button" className="button secondary" disabled={busy} onClick={() => setDrafts(old => ({ ...old, [f.eventId]: { base: f.text, text } }))}>{ux("useDraft")}</button></div>}
        <details><summary>{t("evidence")}</summary><p className="dr-story-review-source">{f.quote}</p></details>
        {dirty && <p role="status" className="setting-copy">{ux("unsavedFact")}</p>}
        <div className="button-row">{onSave && <button type="button" className={"button " + (dirty || !f.accepted ? "" : "secondary")} disabled={busy || conflict || !text.trim()} onClick={() => onSave(f.eventId, text, !(f.accepted && !dirty))}>{t(f.accepted && !dirty ? "remove" : "save")}</button>}{dirty && <button type="button" className="button secondary" disabled={busy} onClick={() => setDrafts(old => { const next = { ...old }; delete next[f.eventId]; return next; })}>{ux("discardFact")}</button>}</div>
      </article>;
    })}
    {diagnostic && <><h3>{t("update")}</h3>
      {diagnostic.status !== "accepted" && <p role="status">{t(diagnostic.status)}</p>}
      {onRepair && !page.repair && diagnostic.status !== "accepted" && !diagnostic.issues.some(i => i.rule === "scope") && (diagnostic.status === "missing" || diagnostic.issues.some(i => i.rule !== "policy")) && <><p className="setting-copy">{t("repairHint")}</p><button type="button" className="button secondary" disabled={busy} onClick={onRepair}>{t("repair")}</button></>}
      {page.repair && <p role="status">{t(page.repair.status === "done" ? "repaired" : page.repair.status === "requested" ? "repairing" : "repairFailed")}</p>}
      {page.repair?.cleanup === "failed" && <p role="status">{t("cleanupFailed")}</p>}
      <SupportDetails locale={locale}>{updateDetails}</SupportDetails>
    </>}
  </section>;
}
