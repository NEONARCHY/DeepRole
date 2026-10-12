import { useState } from "react";
import { Select } from "./Select";
import type { Locale } from "../../core/types";
import type { StoryAutomationMode, StoryAutomationPolicy } from "../../core/story-automation";
import { storyAutomationText } from "../../core/story-automation-i18n";
export function StoryAutomationPanel({ locale, policy, recording, blocked = false, onChange }: { locale: Locale; policy?: StoryAutomationPolicy; recording: boolean; blocked?: boolean; onChange: (mode: StoryAutomationMode) => Promise<void> }) {
  const t = storyAutomationText(locale), mode = policy?.mode ?? "review";
  const [busy, setBusy] = useState(false), [error, setError] = useState(false), [saved, setSaved] = useState(false);
  const change = async (next: StoryAutomationMode) => { if (busy || blocked) return; setBusy(true); setError(false); setSaved(false); try { await onChange(next); setSaved(true); } catch { setError(true); } finally { setBusy(false); } };
  return <section className="settings-card dr-story-automation" aria-label={t.title}><h2>{t.title}</h2><p className="setting-copy">{t.intro}</p>
    {!recording ? <><p className="setting-copy">{t.startHint}</p><button type="button" className="button" disabled={busy || blocked} onClick={() => void change("automatic")}>{busy ? t.saving : t.start}</button></> : <><div className="field-label"><span>{t.mode}</span><Select aria-label={t.mode} value={mode} disabled={busy || blocked} onChange={e => void change(e.target.value as StoryAutomationMode)}><option value="automatic">{t.automatic}</option><option value="review">{t.review}</option><option value="off">{t.off}</option></Select></div><p className="setting-copy">{t[mode === "automatic" ? "automaticHint" : mode === "review" ? "reviewHint" : "offHint"]}</p></>}
    {error && <p role="alert">{t.failed}</p>}{saved && <p role="status">{t.saved}</p>}
  </section>;
}
