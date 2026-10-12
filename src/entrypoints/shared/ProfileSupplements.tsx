import { useEffect, useId, useRef, useState } from "react";
import { validSupplementPage, appendProfileText, type SupplementAction, type SupplementPage, type SupplementScope } from "../../core/profile-supplements";
import { PROFILE_FIELDS, type ProfileValues } from "../../core/character-profile";
import { characterText } from "../../core/characters";
import { characterDiscoveryError } from "../../core/character-discovery-i18n";
import { profileSupplementText } from "../../core/profile-supplement-i18n";
import type { Locale } from "../../core/types";
import { DiscoveryProfileReview } from "./DiscoveryProfileReview";

export function ProfileSupplements({ locale, scope, onAction, onChanged, disabled }: { locale: Locale; scope: SupplementScope; onAction: (a: SupplementAction) => Promise<SupplementPage | null>; onChanged: () => void; disabled: boolean }) {
 const [page, setPage] = useState<SupplementPage | null>(null), [query, setQuery] = useState(""), [busy, setBusy] = useState(false), [preparing, setPreparing] = useState(false), [notice, setNotice] = useState("");
 const [staged, setStaged] = useState<Partial<ProfileValues>>({}); const alive = useRef(true), running = useRef(false), owned = useRef(false), latest = useRef(onAction); latest.current = onAction; const id = useId();
 const t = (k: Parameters<typeof profileSupplementText>[1]) => profileSupplementText(locale, k);
 useEffect(() => { alive.current = true; return () => { alive.current = false; if (owned.current) void latest.current({ action: "cancel", input: scope }).catch(() => undefined); }; }, [scope.worldId, scope.chatId]);
 const checked = (p: SupplementPage | null) => { if (!validSupplementPage(p) || p.worldId !== scope.worldId || p.chatId !== scope.chatId) throw Error("story-review-invalid"); return p; };
 async function retained(value: SupplementPage | null) {
  const p = checked(value); if (p.query === query && p.offset === (page?.offset ?? 0)) return p;
  const next = checked(await onAction({ action: "read", input: { ...scope, entityId: p.target?.id ?? null, query, offset: page?.offset ?? 0, guard: p.guard } }));
  return { ...next, ...(p.result ? { result: p.result } : {}) };
 }
 async function run(task: () => Promise<SupplementPage | null>, service = false, changed = false) {
  if (running.current || disabled) return; running.current = true; owned.current = service; setBusy(true); setPreparing(service); setNotice(""); setStaged({});
  try { const p = checked(await task()); if (alive.current) { setPage(p); setNotice(p.result ? t(p.result.skipped.length ? p.result.applied ? "skip" : "skipOnly" : p.result.applied ? "saved" : "unchanged") : service ? t("ready") : ""); } if (changed) onChanged(); }
  catch (e) { if (alive.current) { const key = characterDiscoveryError(e); setNotice(e instanceof Error && e.message === "profile-ambiguous" ? t("ambiguous") : e instanceof Error && e.message === "text-too-long" ? t("tooLong") : t(key === "partial" ? "cancelled" : key === "busy" || key === "changed" || key === "cleanup" ? key : "error")); try { const p = checked(await read(page?.target?.id ?? null)); if (alive.current) setPage(p); } catch { /* Keep inspected proposals, never fabricate success. */ } } }
  finally { running.current = false; owned.current = false; if (alive.current) { setBusy(false); setPreparing(false); } }
 }
 const read = (entityId: string | null, offset = 0) => onAction({ action: "read", input: { ...scope, entityId, query, offset, ...(offset && page ? { guard: page.guard } : {}) } });
 const target = page?.target, suggestion = target?.suggestions[0], stale = !!suggestion && suggestion.supplement.profile.headRevisionId !== page?.guard.headRevisionId;
 const final: Partial<ProfileValues> = {}; let tooLong = false;
 if (target) for (const k of PROFILE_FIELDS) if (staged[k]) { try { final[k] = appendProfileText(target.values[k], staged[k]!); } catch { tooLong = true; } }
 return <section className="dr-story-review-preview dr-character-discovery dr-profile-supplements"><h3>{t("title")}</h3><p className="setting-copy">{t("hint")}</p>
  {!page ? <button type="button" className="button secondary" disabled={busy || disabled} onClick={() => void run(() => read(null))}>{t("read")}</button> : <>
   <label htmlFor={id + "-query"}>{t("query")}</label><input id={id + "-query"} maxLength={80} disabled={busy || disabled} value={query} onChange={e => setQuery(e.target.value)} /><button type="button" className="button secondary" disabled={busy || disabled} onClick={() => void run(() => read(null))}>{t("search")}</button>
   <label htmlFor={id + "-target"}>{t("character")}</label><select id={id + "-target"} value={target?.id ?? ""} disabled={busy || disabled} onChange={e => void run(() => read(e.target.value || null))}><option value="">{t("choose")}</option>{target && !page.people.some(p => p.id === target.id) && <option value={target.id}>{target.name}</option>}{page.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
   {!page.people.length && <p>{t("empty")}</p>}<div className="dr-story-review-actions">{page.offset > 0 && <button type="button" className="button secondary" disabled={busy || disabled} onClick={() => void run(() => read(target?.id ?? null, Math.max(0, page.offset - 40)))}>{t("prev")}</button>}{page.next !== null && <button type="button" className="button secondary" disabled={busy || disabled} onClick={() => void run(() => read(target?.id ?? null, page.next!))}>{t("next")}</button>}</div>
  </>}
  {target && <><h4>{target.name}</h4><details><summary>{t("current")}</summary>{PROFILE_FIELDS.map(k => <div key={k}><strong>{characterText(locale, k)}</strong><p className="dr-story-review-source">{target.values[k] || "—"}</p></div>)}</details>
   <button type="button" className="button secondary" disabled={busy || disabled} onClick={() => void run(async () => retained(await onAction({ action: "prepare", input: { ...scope, guard: page!.guard, entityId: target.id } })), true)}>{t("prepare")}</button><p className="setting-copy">{t("service")}</p>
   <button type="button" className="button secondary" disabled={busy || disabled} onClick={() => void run(() => read(target.id))}>{t("refresh")}</button>
   {suggestion && <>{suggestion.accepted ? <><p>{t("accepted")}</p><button type="button" className="button secondary" disabled={busy || disabled} onClick={() => void run(async () => retained(await onAction({ action: "approve", input: { ...scope, guard: page!.guard, eventId: suggestion.eventId, additions: {}, accept: false } })), false, true)}>{t("remove")}</button></> : <><p className="setting-copy">{t("append")}</p>{stale && <p>{t("stale")}</p>}<DiscoveryProfileReview key={suggestion.eventId} locale={locale} profile={suggestion.supplement.profile} values={target.values} disabled={busy || disabled} stale={stale} onApply={setStaged} copy={{ apply: t("stage"), applied: t("staged"), ready: t("ready"), stale: t("stale"), title: t("review") }} /></>}
    {Object.keys(staged).length > 0 && <section><h4>{t("preview")}</h4>{PROFILE_FIELDS.map(k => final[k] && <div key={k}><strong>{characterText(locale, k)}</strong><p className="dr-story-review-source">{final[k]}</p></div>)}{tooLong && <p role="alert">{t("tooLong")}</p>}<button type="button" className="button" disabled={busy || disabled || stale || tooLong} onClick={() => void run(async () => retained(await onAction({ action: "approve", input: { ...scope, guard: page!.guard, eventId: suggestion.eventId, additions: staged, accept: true } })), false, true)}>{t("save")}</button></section>}
    {target.suggestions.length > 1 && <details><summary>{t("history")}</summary>{target.suggestions.slice(1).map(s => <div key={s.eventId}><strong>{s.supplement.profile.name}</strong>{s.accepted && <><p>{t("accepted")}</p><button type="button" className="button secondary" disabled={busy || disabled} onClick={() => void run(async () => retained(await onAction({ action: "approve", input: { ...scope, guard: page!.guard, eventId: s.eventId, additions: {}, accept: false } })), false, true)}>{t("remove")}</button></>}{PROFILE_FIELDS.map(k => s.supplement.profile.proposal[k]?.evidence.map((q, i) => <blockquote key={k + i}>{q}</blockquote>))}</div>)}</details>}
   </>}
  </>}
  {preparing && <button type="button" className="button secondary" onClick={() => void onAction({ action: "cancel", input: scope }).catch(() => undefined)}>{t("cancel")}</button>}
  <div role="status" aria-live="polite" aria-atomic="true">{preparing ? t("preparing") : notice}</div>
 </section>;
}
