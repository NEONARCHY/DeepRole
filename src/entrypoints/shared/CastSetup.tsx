import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { WandSparkles, X } from "lucide-react";
import { browser } from "wxt/browser";
import { castText, castError, type CastCopyKey } from "../../core/cast-i18n";
import type { CastDraft, CastMember } from "../../core/cast-initialization";
import type { CastMessage, CastView } from "../../adapters/cast-coordinator";
import type { Locale } from "../../core/types";


export function CastSetup({ worldId, locale, compact = false }: { worldId: string; locale: Locale; compact?: boolean }) {
 const t = (key: CastCopyKey) => castText(locale, key);
 const [job, setJob] = useState<CastView | null>(null), [draft, setDraft] = useState<CastDraft | null>(null);
 const [selected, setSelected] = useState<string[]>([]), [hero, setHero] = useState("");
 const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
 const root = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDivElement>(null), origin = useRef<HTMLElement | null>(null);
 const scope = useRef(worldId); scope.current = worldId;
 const run = async (message: CastMessage) => { const result = await browser.runtime.sendMessage(message); if (!result?.ok) throw new Error(result?.error ?? "preparation-failed"); return result; };
 useEffect(() => {
   let disposed = false; setJob(null); setOpen(false); setDraft(null); setError("");
   const update = async () => { try { const r = await run({ type: "DR_CAST", action: "status", worldId }); if (!disposed) setJob(r.job ?? null); } catch { /* The start action reports connection/lock errors. */ } };
   void update(); const timer = setInterval(() => void update(), 2500);
   return () => { disposed = true; clearInterval(timer); };
 }, [worldId]);
 useLayoutEffect(() => {
   if (!open) return;
   const active = (root.current?.getRootNode() as Document | ShadowRoot)?.activeElement as HTMLElement | null;
   origin.current = active; dialog.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
   return () => { if (origin.current?.isConnected) origin.current.focus({ preventScroll: true }); };
 }, [open]);
 const act = async (message: CastMessage) => {
   if (busy) return; setBusy(true); setError(""); const world = worldId;
   try { const result = await run(message); if (scope.current !== world) return; const latest = await run({ type: "DR_CAST", action: "status", worldId }); if (scope.current === world) { setJob(latest.job ?? result.job ?? null); if (message.type === "DR_CAST" && message.action === "apply") setOpen(false); } }
   catch (e) { if (scope.current === world) setError(castError(locale, e instanceof Error ? e.message : "")); }
   finally { if (scope.current === world) setBusy(false); }
 };
 const review = () => { if (!job?.draft) return; setDraft(structuredClone(job.draft)); setSelected(job.draft.characters.map(c => c.key)); setHero(job.draft.characters.find(c => c.sheet.protagonist)?.key ?? ""); setError(""); setOpen(true); };
 const change = (key: string, update: (member: CastMember) => CastMember) => setDraft(old => old ? { ...old, characters: old.characters.map(c => c.key === key ? update(c) : c) } : old);
 const preparing = !!job && ["opening", "reading", "analyzing"].includes(job.phase);
 const label = job?.phase === "ready" ? t("review") : t("start");
 return <div ref={root} className={compact ? "dr-cast-setup is-compact" : "dr-cast-setup"}>
   {!compact && <><strong>{t("title")}</strong><p>{t("hint")}</p></>}
   <button className={compact ? "icon-button dr-cast-trigger" : "button secondary small"} type="button" title={label} aria-label={label} disabled={busy || preparing} onClick={() => job?.phase === "ready" ? review() : void act({ type: "DR_CAST", action: "start", worldId, locale, retry: !!job })}><WandSparkles size={16}/>{!compact && <span>{label}</span>}</button>
   {job && (!compact || preparing || job.phase === "ready" || job.cleanup === "failed") && <div className="dr-cast-status" role="status">
     <span>{t(job.phase)}{preparing && job.partCount > 0 && " · " + Math.min(job.step + 1, job.partCount) + "/" + job.partCount}</span>
     {preparing && <button type="button" className="button secondary small" disabled={busy} onClick={() => void act({ type: "DR_CAST", action: "cancel", id: job.id })}>{t("cancel")}</button>}
     {job.phase === "ready" && <button type="button" className="button secondary small" disabled={busy || job.cleanup === "pending"} onClick={() => void act({ type: "DR_CAST", action: "start", worldId, locale, retry: true })}>{t("reprepare")}</button>}
     {job.phase === "error" && <p>{castError(locale, job.error ?? "")}</p>}
     {job.cleanup === "pending" && !preparing && <small>{t("cleanup")}</small>}
     {job.cleanup === "failed" && <><small>{t("cleanupFailed")}</small><div className="button-row"><button className="button secondary small" type="button" disabled={busy} onClick={() => void act({ type: "DR_CAST", action: "cleanup", id: job.id })}>{t("cleanupRetry")}</button>{job.chatId && <a href={"https://chat.deepseek.com/chat/s/" + encodeURIComponent(job.chatId)} target="_blank" rel="noopener noreferrer">{t("openChat")}</a>}</div></>}
   </div>}
   {error && <p role="alert" className="error-text">{error}</p>}
   {open && draft && createPortal(<div className="dr-cast-layer" onKeyDown={e => {
     if (e.key === "Escape" && !busy) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
     if (e.key === "Tab") {
       const items = [...(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),textarea:not(:disabled),summary,a[href]") ?? [])].filter(el => el.getClientRects().length);
       const active = (dialog.current?.getRootNode() as Document | ShadowRoot)?.activeElement;
       if (e.shiftKey && active === items[0]) { e.preventDefault(); items.at(-1)?.focus(); }
       if (!e.shiftKey && active === items.at(-1)) { e.preventDefault(); items[0]?.focus(); }
     }
   }}><div ref={dialog} className="dr-cast-dialog" role="dialog" aria-modal="true" aria-labelledby="dr-cast-title">
     <header><div><h2 id="dr-cast-title">{t("title")}</h2><small>{t("source")}: {job?.sourceCount ?? 0} · {t("count")}: {draft.characters.length}</small></div><button type="button" className="icon-button" aria-label={t("close")} disabled={busy} onClick={() => setOpen(false)}><X size={18}/></button></header>
     <div className="dr-cast-body"><p>{t("estimates")}</p>{draft.warnings.map((w,i) => <p className="dr-cast-warning" key={i}>{w}</p>)}
     {!hero && <p className="dr-cast-warning">{t("chooseHero")}</p>}
     {draft.characters.map(c => <article key={c.key} className="dr-cast-member"><div className="dr-cast-member-heading">
       <input aria-label={t("select") + ": " + c.name} type="checkbox" checked={selected.includes(c.key)} disabled={busy} onChange={e => { setSelected(old => e.target.checked ? [...old,c.key] : old.filter(k => k !== c.key)); if (!e.target.checked && hero === c.key) setHero(""); }}/>
       <strong>{c.name}</strong><label><input type="radio" name="cast-hero" checked={hero === c.key} disabled={busy || !selected.includes(c.key)} onChange={() => setHero(c.key)}/>{t("hero")}</label>
     </div><p className="dr-cast-reason">{c.reason}</p>
       {c.sheet.relationships && <div className="dr-cast-scores">{(["trust","affinity"] as const).map(field => <div key={field}><span>{t(field)} / 100</span><input type="number" aria-label={t(field) + ": " + c.name} min={0} max={100} value={c.sheet.relationships!.initial[field]} disabled={busy || !selected.includes(c.key)} onChange={e => change(c.key, item => ({ ...item, sheet: { ...item.sheet, relationships: { ...item.sheet.relationships!, initial: { ...item.sheet.relationships!.initial, [field]: Math.max(0,Math.min(100,Math.round(Number(e.target.value)))) } } } }))}/></div>)}</div>}
       {!!c.sheet.attributes?.length && <div className="dr-cast-scores">{c.sheet.attributes.map((a,index) => <div key={a.id}><span>{a.label} / 100</span><input type="number" aria-label={a.label + ": " + c.name} min={0} max={100} value={a.initial} disabled={busy || !selected.includes(c.key)} onChange={e => change(c.key, item => ({ ...item, sheet: { ...item.sheet, attributes: item.sheet.attributes!.map((attribute,i) => i === index ? { ...attribute, initial: Math.max(0,Math.min(100,Math.round(Number(e.target.value)))) } : attribute) } }))}/></div>)}</div>}
       <details><summary>{t("review")}</summary>{(["appearance","personality","goals","background"] as const).map(field => <div className="dr-cast-field" key={field}><span>{t(field)}</span><textarea aria-label={t(field) + ": " + c.name} value={c.sheet[field]} maxLength={1200} rows={3} disabled={busy || !selected.includes(c.key)} onChange={e => change(c.key,item => ({ ...item,sheet:{ ...item.sheet,[field]:e.target.value } }))}/></div>)}
         <p><strong>{t("condition")}:</strong> {c.state.condition || "—"}</p><p><strong>{t("relationship")}:</strong> {c.state.relationship || "—"}</p>
         {c.sheet.relationships && <><p>{c.sheet.relationships.boundaries}</p>{c.sheet.relationships.milestones.map(m => <p key={m.id}>{c.completed.includes(m.id) ? "✓ " : "○ "}{m.label}</p>)}</>}
         <details><summary>{t("evidence")}</summary>{c.evidence.map((e,i) => <blockquote key={i}><small>{job?.titles[e.source] ?? e.source}</small><p>{e.quote}</p></blockquote>)}</details>
       </details></article>)}
       {error && <p role="alert" className="error-text">{error}</p>}
     </div><footer><button className="button secondary" type="button" disabled={busy} onClick={() => setOpen(false)}>{t("close")}</button><button className="button primary" type="button" disabled={busy || !hero || !selected.includes(hero)} onClick={async () => {
       const checked = { ...draft, characters: draft.characters.map(c => ({ ...c, sheet: { ...c.sheet, protagonist: c.key === hero } })), partners: draft.partners.filter(k => k !== hero) };
       await act({ type: "DR_CAST", action: "apply", id: job!.id, draft: checked, selected, hero });
     }}>{t("save")} · {selected.length}</button></footer>
   </div></div>, root.current?.closest(".dr-root") ?? root.current ?? document.body)}
 </div>;
}
