import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Select } from "./Select";
import { MemoryGuide } from "./MemoryGuide";
import type { Locale } from "../../core/types";
import type { StoryAutomationMode, StoryAutomationPolicy } from "../../core/story-automation";
import { storyAutomationText } from "../../core/story-automation-i18n";
export function StoryAutomationPanel({ locale, policy, recording, compact = false, blocked = false, onChange }: { locale: Locale; policy?: StoryAutomationPolicy; recording: boolean; compact?: boolean; blocked?: boolean; onChange: (mode: StoryAutomationMode) => Promise<void> }) {
  const t = storyAutomationText(locale), mode = policy?.mode ?? "review";
  const [busy, setBusy] = useState(false), [error, setError] = useState(false), [saved, setSaved] = useState(false);
  const change = async (next: StoryAutomationMode) => { if (busy || blocked) return; setBusy(true); setError(false); setSaved(false); try { await onChange(next); setSaved(true); } catch { setError(true); } finally { setBusy(false); } };
  const controls = <><p className="setting-copy">{t.intro}</p>
    {!recording && !policy ? <><p className="setting-copy">{t.startHint}</p><button type="button" className="button" disabled={busy || blocked} onClick={() => void change("automatic")}>{busy ? t.saving : t.start}</button></> : <><div className="field-label">{!compact && <span>{t.mode}</span>}<Select aria-label={t.mode} value={mode} disabled={busy || blocked} onChange={e => void change(e.target.value as StoryAutomationMode)}><option value="automatic">{t.automatic}</option><option value="review">{t.review}</option><option value="off">{t.off}</option></Select></div><p className="setting-copy">{t[mode === "automatic" ? "automaticHint" : mode === "review" ? "reviewHint" : "offHint"]}</p>{!recording && mode !== "off" && <p className="setting-copy">{t.startHint}</p>}</>}
    {error && <p role="alert">{t.failed}</p>}{saved && <p role="status">{t.saved}</p>}
  </>;
  if (compact && (policy || recording)) return <details className="settings-card dr-story-automation dr-story-automation-settings">
    <summary><span>{t.mode}</span><span className="dr-story-mode-value">{t[mode]}</span><ChevronRight size={16} aria-hidden="true"/>
      {mode === "off" && <small className="dr-mode-explanation">{t.pausedSummary}</small>}
    </summary>
    <div className="dr-story-automation-body">{controls}</div>
  </details>;
  return <section className="settings-card dr-story-automation" aria-label={t.title}>
    <header className="dr-story-feature-heading"><h2>{t.title}</h2><MemoryGuide locale={locale} topic="automation"/></header>
    {controls}
  </section>;
}
