import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import type { Locale } from "../../core/types";
import type { WorldRestartPreview } from "../../core/world-restart-preview";
import { worldRestartCopy } from "../../core/world-restart-copy";
import { actionOptionLabel } from "../../core/characters";

export function WorldRestartDialog({ locale, review, current, busy, error, blocked, onRefresh, onClose, onApply }: {
  locale: Locale; review: WorldRestartPreview; current?: WorldRestartPreview; busy: boolean; error: string; blocked: boolean;
  onRefresh: () => void; onClose: () => void; onApply: (base: string) => Promise<void>;
}) {
  const t = worldRestartCopy(locale), [confirmed, setConfirmed] = useState(false), [query, setQuery] = useState("");
  const stale = !current || JSON.stringify(current) !== JSON.stringify(review);
  useEffect(() => { if (stale) setConfirmed(false); }, [stale]);
  const people = review.people.filter(p => p.name.normalize("NFKC").toLocaleLowerCase().includes(query.normalize("NFKC").trim().toLocaleLowerCase()));
  return <div className="dr-root dr-world-restart-dialog"><Modal title={t.dialog} closeLabel={t.cancel} plainClose onClose={() => { if (!busy) onClose(); }}>
    <p>{t.effects}</p><p className="dr-restart-warning">{t.warning}</p>
    {stale && <div role="alert"><p>{t.stale}</p><button type="button" className="button secondary" disabled={busy || !current || blocked} onClick={() => { setConfirmed(false); onRefresh(); }}>{t.refresh}</button></div>}
    <h3>{t.values}</h3><p className="setting-copy">{t.source}</p>
    {review.people.length > 6 && <input className="input" type="search" aria-label={t.search} placeholder={t.search} value={query} disabled={busy} onChange={e => setQuery(e.target.value)}/>}
    <div className="dr-restart-values" role="region" aria-label={t.values} tabIndex={0}>{people.map(p => <article key={p.id}><h4>{p.name}</h4>
      {p.bond && <small>{t.toHero}{p.bond.hero}</small>}
      {p.bond || p.attributes.length ? <dl>{p.bond && <><div><dt>{t.trust}</dt><dd>{p.bond.trust} / 100</dd></div><div><dt>{t.affinity}</dt><dd>{p.bond.affinity} / 100</dd></div></>}{p.attributes.map(a => <div key={a.id}><dt>{a.label}</dt><dd>{a.value} / 100</dd></div>)}</dl> : <p className="setting-copy">{t.noNumbers}</p>}
      <details><summary>{t.state}</summary><dl><div><dt>{t.action}</dt><dd>{actionOptionLabel(locale, p.state.action)}</dd></div>{(["condition", "goal", "relationship"] as const).filter(k => p.state[k]).map(k => <div key={k}><dt>{t[k]}</dt><dd>{p.state[k]}</dd></div>)}{p.state.stats.map((s, i) => <div key={i}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}{p.bond?.completed.length ? <div><dt>{t.completed}</dt><dd>{p.bond.completed.join(", ")}</dd></div> : null}</dl></details>
    </article>)}{!people.length && <p>{review.people.length ? t.empty : t.noPeople}</p>}</div>
    {error && <p role="alert" className="error-text">{error}</p>}
    <div className="dr-restart-confirm"><label className="checkbox-row"><input type="checkbox" checked={confirmed} disabled={busy || blocked || stale} onChange={e => setConfirmed(e.target.checked)}/><span>{t.confirm}</span></label><div className="button-row"><button className="button secondary" type="button" disabled={busy} onClick={onClose}>{t.cancel}</button><button className="button danger" type="button" disabled={!confirmed || busy || blocked || stale} onClick={() => { if (confirmed && !busy && !blocked && !stale) void onApply(review.base); }}>{busy ? t.busy : t.apply}</button></div></div>
  </Modal></div>;
}
