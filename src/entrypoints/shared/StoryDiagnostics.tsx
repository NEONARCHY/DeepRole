import { useEffect, useRef, useState } from "react";
import { diagnosticUnavailable, readStoryDiagnosticResult, storyDiagnosticReport, type StoryDiagnosticResult } from "../../core/story-diagnostics";
import { diagnosticErrorTextKeys, storyDiagnosticsText, type StoryDiagnosticsTextKey } from "../../core/story-diagnostics-i18n";
import type { Locale } from "../../core/types";
import type { NativeStoryReplyProbe } from "../../core/story-reply-probe";
import type { NativeStorySnapshotDiagnostics } from "../../core/story-native-snapshot";
import "./story-diagnostics.css";

export function StoryDiagnostics({ locale, onCheck }: { locale: Locale; onCheck: () => Promise<unknown> }) {
  const [snapshot, setSnapshot] = useState<{ result: StoryDiagnosticResult; at: number } | null>(null);
  const [busy, setBusy] = useState(false), [copy, setCopy] = useState<"idle" | "copied" | "manual">("idle");
  const running = useRef(false), generation = useRef(0), mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  const t = (key: StoryDiagnosticsTextKey) => storyDiagnosticsText(locale, key);
  const number = (value: number | null) => value === null ? t("unknown") : new Intl.NumberFormat(locale).format(value);
  const report = snapshot ? storyDiagnosticReport(snapshot.result, snapshot.at) : null;
  async function check() {
    if (running.current) return;
    running.current = true; const token = ++generation.current; setBusy(true); setSnapshot(null); setCopy("idle");
    let result: StoryDiagnosticResult;
    try { result = readStoryDiagnosticResult(await onCheck()) ?? diagnosticUnavailable("invalid-bridge"); }
    catch { result = diagnosticUnavailable("not-connected"); }
    if (mounted.current && generation.current === token) { setSnapshot({ result, at: Date.now() }); setBusy(false); }
    running.current = false;
  }
  async function copyReport() {
    if (!report) return; const token = generation.current;
    let state: "copied" | "manual";
    try { await navigator.clipboard.writeText(report); state = "copied"; } catch { state = "manual"; }
    if (mounted.current && generation.current === token) setCopy(state);
  }
  const result = snapshot?.result;
  return <section className="settings-card dr-story-diagnostics" aria-labelledby="dr-story-diagnostics-title">
    <header><h2 id="dr-story-diagnostics-title">{t("title")}</h2></header>
    <div>
      <p className="setting-copy">{t("hint")}</p>
      <p className="setting-copy">{t("limit")}</p>
      <div className="dr-story-diagnostics-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => void check()}>{busy ? t("checking") : t(snapshot ? "again" : "check")}</button>
        {report && <button type="button" className="button secondary" onClick={() => void copyReport()}>{t("copy")}</button>}
      </div>
      <div role="status" aria-live="polite" aria-atomic="true">{busy ? t("checking") : result?.status === "unavailable" ? <p>{t(diagnosticErrorTextKeys[result.code])}</p> : result?.status === "read" ? <><strong>{t(`ancestry_${result.diagnostics.ancestry}`)}</strong><p className="setting-copy">{t(result.diagnostics.diagnosticVersion === 4 && result.diagnostics.ancestry === "complete" ? "hint_nativeComplete" : `hint_${result.diagnostics.ancestry}`)}</p></> : null}</div>
      {snapshot && <small>{t("checked").replace("{date}", new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "medium" }).format(snapshot.at))}</small>}
      {result?.status === "read" && <>
        <dl className="dr-story-diagnostics-counts">{([ ["messages", result.diagnostics.messageCount], ["identities", result.diagnostics.identityCount], ["warnings", result.diagnostics.issueCount] ] as const).map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{number(value)}</dd></div>)}</dl>
        {result.diagnostics.diagnosticVersion === 4 && <NativeSnapshotDetails snapshot={result.diagnostics.nativeSnapshot} locale={locale}/>}
        <details><summary>{t("details")}</summary><dl className="dr-story-diagnostics-counts"><div><dt>{t("roots")}</dt><dd>{number(result.diagnostics.rootCount)}</dd></div><div><dt>{t("boundaries")}</dt><dd>{number(result.diagnostics.boundaryCount)}</dd></div><div><dt>{t("pagination")}</dt><dd>{t(result.diagnostics.pagination ? "yes" : "no")}</dd></div><div><dt>{t(result.diagnostics.diagnosticVersion === 4 ? "snapshotRequestLink" : "lifecycle")}</dt><dd>{t("unknown")}</dd></div></dl>
          {!!result.diagnostics.issues.length && <ul>{result.diagnostics.issues.map((issue, index) => <li key={index}><code>{issue.path}</code><br/><code>{issue.code}</code></li>)}</ul>}
          {result.diagnostics.issueCount > result.diagnostics.issues.length && <p className="setting-copy">{t("more").replace("{shown}", number(result.diagnostics.issues.length)).replace("{total}", number(result.diagnostics.issueCount))}</p>}
          <p>{t("fields")}</p>{result.diagnostics.completionFields.length ? <ul>{result.diagnostics.completionFields.map(f => <li key={f.field}><code>{f.field}: {Object.entries(f.types).map(([type, count]) => `${type} × ${number(count!)}`).join(", ")}</code></li>)}</ul> : <p className="setting-copy">{t("noFields")}</p>}
          {(result.diagnostics.diagnosticVersion === 3 || result.diagnostics.diagnosticVersion === 4) && <ReplyProbeDetails probe={result.diagnostics.replyProbe} locale={locale}/>}
          {result.diagnostics.diagnosticVersion !== 1 && <>
            <p>{t("states")}</p><p className="setting-copy">{t("statesHint")}</p>
            {result.diagnostics.statusCounts.length ? <ul>{result.diagnostics.statusCounts.map(row => <li key={`${row.field}:${row.role}:${row.state}`}>
              <code>{row.field}</code> · {t(`role_${row.role}`)}: {row.state === "unrecognized-string" ? t("state_unrecognized") : row.state === "non-string" ? t("state_nonString") : <code>{row.state}</code>} × {number(row.count)}
            </li>)}</ul> : <p className="setting-copy">{t("noStates")}</p>}
          </>}
        </details>
      </>}
      <p className="setting-copy">{t("privacy")}</p>
      {copy === "copied" && <small role="status">{t("copied")}</small>}
      {copy === "manual" && <><p role="status" className="setting-copy">{t("manual")}</p><textarea readOnly rows={10} aria-label={t("report")} value={report ?? ""} onFocus={event => event.currentTarget.select()}/></>}
    </div>
  </section>;
}

function NativeSnapshotDetails({ snapshot, locale }: { snapshot: NativeStorySnapshotDiagnostics; locale: Locale }) {
  const t = (key: StoryDiagnosticsTextKey) => storyDiagnosticsText(locale, key);
  const completion = { complete: "snapshot_complete", "in-progress": "snapshot_inProgress", interrupted: "snapshot_interrupted", unusable: "snapshot_unusable", unknown: "replyUnknown", "not-applicable": "replyNA" } as const;
  const selection = { anchor: "snapshot_anchor", ancestor: "snapshot_ancestor", different: "snapshot_different", unknown: "replyUnknown" } as const;
  return <section className="dr-story-reply-probe dr-story-native-snapshot" aria-label={t("snapshotTitle")}>
    <h3>{t("snapshotTitle")}</h3>
    <dl className="dr-story-diagnostics-counts">
      <div><dt>{t("snapshotSelection")}</dt><dd>{t(selection[snapshot.selection])}</dd></div>
      <div><dt>{t("snapshotCompletion")}</dt><dd>{t(completion[snapshot.anchorCompletion])}</dd></div>
      <div><dt>{t("snapshotPath")}</dt><dd>{t(snapshot.selectedPath === "complete" ? "snapshot_pathComplete" : snapshot.selectedPath === "partial" ? "snapshot_pathPartial" : "replyUnknown")}</dd></div>
    </dl>
    <p className="setting-copy">{t(snapshot.session === "mismatch" ? "snapshot_mismatch" : "snapshotHint")}</p>
  </section>;
}

function ReplyProbeDetails({ probe, locale }: { probe: NativeStoryReplyProbe; locale: Locale }) {
  const t = (key: StoryDiagnosticsTextKey) => storyDiagnosticsText(locale, key);
  const anchor = { matched: "anchor_matched", "not-supplied": "anchor_notSupplied", "not-in-history": "anchor_notInHistory", "invalid-history": "anchor_invalidHistory" } as const;
  const parent = { root: "parent_root", "in-window": "parent_inWindow", "outside-window": "parent_outsideWindow", unknown: "replyUnknown" } as const;
  const refs = { anchor: "ref_anchor", "other-in-window": "ref_other", "outside-window": "ref_outside", null: "ref_null", invalid: "ref_invalid" } as const;
  const number = (n: number | null) => n === null ? t(probe.anchor === "matched" ? "replyNA" : "replyUnknown") : new Intl.NumberFormat(locale).format(n);
  return <section className="dr-story-reply-probe" aria-label={t("replyTitle")}>
    <h3>{t("replyTitle")}</h3><p className="setting-copy">{t("replyHint")}</p>
    <dl className="dr-story-diagnostics-counts">
      <div><dt>{t("replyAnchor")}</dt><dd>{t(anchor[probe.anchor])}</dd></div>
      <div><dt>{t("replyRole")}</dt><dd>{t(probe.role === "user" ? "replyUser" : probe.role === "assistant" ? "replyAssistant" : "replyUnknown")}</dd></div>
      <div><dt>{t("replyParent")}</dt><dd>{t(parent[probe.parent])}</dd></div>
      <div><dt>{t("replySiblings")}</dt><dd>{number(probe.siblingReplies)}</dd></div>
      <div><dt>{t("replyChildren")}</dt><dd>{number(probe.childMessages)}</dd></div>
    </dl>
    <p>{t("replyFields")}</p>{probe.fields.length ? <ul>{probe.fields.map(f => <li key={f.field}>
      <code>{f.field}: {f.type}</code>{f.state !== null && <> · {f.state === "unrecognized-string" ? t("state_unrecognized") : f.state === "non-string" ? t("state_nonString") : f.state === "true" || f.state === "false" ? t(f.state === "true" ? "yes" : "no") : <code>{f.state}</code>}</>}
    </li>)}</ul> : <p className="setting-copy">{t("replyNoFields")}</p>}
    <p>{t("replyReferences")}</p>{probe.references.length ? <ul>{probe.references.map(r => <li key={`${r.path}:${r.field}`}><code>{r.path}.{r.field}</code> · {t(refs[r.relation])}</li>)}</ul> : <p className="setting-copy">{t("replyNoReferences")}</p>}
  </section>;
}
