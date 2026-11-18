import { useId, useRef, useState } from "react";
import type { Locale } from "../../core/types";
import type { StoryReviewPage } from "../../core/story-review";
import { storyAutomationText } from "../../core/story-automation-i18n";
import { storyUpdateText } from "../../core/story-update-i18n";
import { storyUxText } from "../../core/story-ux-i18n";
import { validStoryUpdateDiagnostic } from "../../core/story-update";
import { SupportDetails } from "./SupportDetails";
import { StoryMemoryAction } from "./StoryMemoryAction";

export function StoryFacts({ locale, page, busy, compact = false, onSave, onRepair }: { locale: Locale; page: StoryReviewPage; busy: boolean; compact?: boolean; onSave?: (eventId: string, text: string, accept: boolean) => Promise<boolean>; onRepair?: () => void }) {
  const t = (key: Parameters<typeof storyUpdateText>[1]) => storyUpdateText(locale, key), id = useId();
  const ux = (key: Parameters<typeof storyUxText>[1]) => storyUxText(locale, key);
  const list = useRef<HTMLElement>(null);
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
  function closeEditor(eventId: string) {
    setDrafts(old => { const next = { ...old }; delete next[eventId]; return next; });
  }
  return <section ref={list} tabIndex={-1} aria-labelledby={compact ? undefined : id + "-title"} aria-label={compact ? t("title") : undefined} className="dr-story-review-preview dr-story-facts">{!compact && <><h3 id={id + "-title"}>{t("title")}</h3><p className="setting-copy">{t("hint")}</p></>}
    {!page.facts?.length && <p>{t("empty")}</p>}
    {page.facts?.map(f => {
      const draft = drafts[f.eventId], text = draft?.text ?? f.text, dirty = !!draft && draft.text !== f.text;
      const conflict = !!draft && draft.base !== f.text && text !== f.text;
      const exclude = f.accepted && !draft;
      const action = exclude ? (f.superseded ? "excludeOlder" : "remove") : f.accepted ? "saveEdit" : "save";
      const hint = f.superseded ? (exclude ? "excludeOlderHint" : "editOlderHint") : exclude ? "excludeFactHint" : f.accepted ? "editFactHint" : "saveFactHint";
      const auto = storyAutomationText(locale);
      const rowId = id + "-row-" + f.eventId;
      return <article key={f.eventId} id={rowId} tabIndex={-1} aria-labelledby={rowId + "-kind " + rowId + "-state"} className="dr-story-review-entry dr-fact-entry">
        <header><strong id={rowId + "-kind"}>{t(f.kind)}</strong><span id={rowId + "-state"} className="dr-fact-state" data-used={f.accepted && !f.superseded}>{t(f.superseded ? "supersededFact" : f.accepted ? "inMemory" : "inactiveFact")}</span></header>
        {f.superseded && <p className="setting-copy">{auto.superseded}</p>}
        {draft ? <><label className="field-label" htmlFor={id + "-" + f.eventId}>{t("text")}</label><textarea id={id + "-" + f.eventId} autoFocus maxLength={1200} disabled={busy} value={text} onChange={e => {
          const value = e.target.value;
          setDrafts(old => ({ ...old, [f.eventId]: { base: draft.base, text: value } }));
        }} /></> : <p className="dr-fact-text">{f.text}</p>}
        {f.edited ? <small>{t("edited")}</small> : f.automation?.status === "saved" && f.automation.mode === "automatic" && f.automation.reason !== "manual" ? <small>{auto.autoSaved}</small> : null}
        {f.automation?.status === "duplicate" && <p>{auto.duplicate}</p>}
        {conflict && <div className="dr-draft-conflict" role="status"><p>{ux("changedFact")}</p><strong>{ux("currentFact")}</strong><p>{f.text}</p><button type="button" className="button secondary" disabled={busy} onClick={() => setDrafts(old => ({ ...old, [f.eventId]: { base: f.text, text } }))}>{ux("useDraft")}</button></div>}
        <details><summary>{t("evidence")}</summary><p className="dr-story-review-source">{!draft && f.text === f.quote ? t("sameQuote") : f.quote}</p></details>
        {dirty && <p role="status" className="setting-copy">{ux("unsavedFact")}</p>}
        {onSave && <StoryMemoryAction key={JSON.stringify([page.guard, f.accepted, f.superseded, f.text, draft, busy])}
          locale={locale} label={t(action)} confirmLabel={t(exclude ? "confirmExclude" : "confirmSave")}
          hint={t(hint)}
          disabled={busy || conflict || !text.trim() || !!draft && f.accepted && !dirty} secondary={exclude}
          onConfirm={() => {
            // Some exclusions remove the row entirely. Keep focus in the facts list.
            (exclude ? list.current : document.getElementById(rowId))?.focus({ preventScroll: true });
            void onSave(f.eventId, text, !exclude).then(saved => { if (saved) closeEditor(f.eventId); });
          }}>
          <button type="button" className="button secondary" disabled={busy} onClick={() => {
            if (draft) { document.getElementById(rowId)?.focus({ preventScroll: true }); closeEditor(f.eventId); }
            else setDrafts(old => ({ ...old, [f.eventId]: { base: f.text, text: f.text } }));
          }}>
            {draft ? ux("discardFact") : t("editText")}
          </button>
        </StoryMemoryAction>}
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
