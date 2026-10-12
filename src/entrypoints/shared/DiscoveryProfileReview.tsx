import { useEffect, useRef, useState } from "react";
import { PROFILE_FIELDS, type ProfileValues, type ProfileField, type ProfileProposal } from "../../core/character-profile";
import { characterText } from "../../core/characters";
import { profileCopy } from "../../core/character-profile-i18n";
import { characterDiscoveryText } from "../../core/character-discovery-i18n";
import type { DiscoveryProfile } from "../../core/discovery-profile";
import type { Locale } from "../../core/types";
export function DiscoveryProfileReview({ locale, profile, values, disabled, stale, onApply, copy }: { locale: Locale; profile: DiscoveryProfile; values: ProfileValues; disabled: boolean; stale: boolean; onApply: (changes: Partial<ProfileValues>) => void; copy?: { apply: string; applied: string; title?: string; ready?: string; stale?: string } }) {
  const t = profileCopy(locale), d = (key: Parameters<typeof characterDiscoveryText>[1]) => characterDiscoveryText(locale, key);
  const [proposal, setProposal] = useState<ProfileProposal>(profile.proposal), [selected, setSelected] = useState<ProfileField[]>([]), [applied, setApplied] = useState(false);
  const expected = useRef<ProfileValues>({ ...values }), [skipped, setSkipped] = useState(false);
  const signature = JSON.stringify(profile);
  useEffect(() => { setProposal(profile.proposal); expected.current = { ...values }; setSelected(PROFILE_FIELDS.filter(k => !!profile.proposal[k]?.text && !values[k].trim() && values[k] === profile.values[k])); setApplied(false); setSkipped(false); }, [signature]);
  return <section className="dr-profile-review"><h4>{copy?.title ?? t.review}</h4><p className="setting-copy">{stale ? copy?.stale ?? d("profileStale") : copy?.ready ?? d("profileReady")}</p>{profile.partial && <p className="setting-copy">{d("profilePartial")}</p>}
    {PROFILE_FIELDS.map(k => <div className="dr-profile-review-field" key={k}><strong>{characterText(locale, k)}</strong><small>{t[proposal[k]!.status === "not-found" ? "missing" : proposal[k]!.status]}</small>
      {proposal[k]!.text !== profile.proposal[k]!.text && <small>{t.edited}</small>}
      {proposal[k]!.status === "found" && <><label className="dr-character-check"><input type="checkbox" disabled={disabled || stale} checked={selected.includes(k)} onChange={e => { expected.current[k] = values[k]; setSelected(previous => e.target.checked ? [...previous.filter(p => p !== k), k] : previous.filter(p => p !== k)); }} />{t.select} · {characterText(locale, k)}</label>
        <textarea rows={3} maxLength={1200} aria-label={t.proposal + ": " + characterText(locale, k)} disabled={disabled || stale} value={proposal[k]!.text} onChange={e => setProposal(p => ({ ...p, [k]: { ...p[k]!, text: e.target.value } }))} /></>}
      {!!proposal[k]!.evidence.length && <details><summary>{d("quote")}</summary>{proposal[k]!.text !== profile.proposal[k]!.text && <small>{t.originalQuotes}</small>}{proposal[k]!.evidence.map((quote, i) => <blockquote key={i}>{quote}</blockquote>)}</details>}
    </div>)}
    <button type="button" className="button secondary" disabled={disabled || stale || !selected.some(k => proposal[k]?.text.trim())} onClick={() => {
      const changes = Object.fromEntries(selected.filter(k => !!proposal[k]?.text.trim() && values[k] === expected.current[k]).map(k => [k, proposal[k]!.text]));
      onApply(changes); setSkipped(selected.some(k => values[k] !== expected.current[k])); setSelected([]); setApplied(Object.keys(changes).length > 0);
    }}>{copy?.apply ?? d("profileApply")}</button>{applied && <p role="status">{copy?.applied ?? d("profileApplied")}</p>}{skipped && <p role="status">{t.skipped}</p>}
  </section>;
}
