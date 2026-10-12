import { useEffect, useId, useRef, useState } from "react";
import { characterDiscoveryText, characterDiscoveryError } from "../../core/character-discovery-i18n";
import { DISCOVERY_PAGE, validCharacterDiscoveryPage, type CharacterDiscoveryAction, type CharacterDiscoveryInput, type CharacterDiscoveryPage } from "../../core/story-character-discovery";
import type { Locale } from "../../core/types";
import { PROFILE_FIELDS, type ProfileValues } from "../../core/character-profile";
import { characterText } from "../../core/characters";
import { DiscoveryProfileReview } from "./DiscoveryProfileReview";
export function CharacterDiscovery({ locale, scope, onAction, onChanged, disabled }: { locale: Locale; scope: CharacterDiscoveryInput; onAction: (action: CharacterDiscoveryAction) => Promise<CharacterDiscoveryPage | null>; onChanged: () => void; disabled: boolean }) {
  const [page, setPage] = useState<CharacterDiscoveryPage | null>(null), [busy, setBusy] = useState(false), [scanning, setScanning] = useState(false), [notice, setNotice] = useState<Parameters<typeof characterDiscoveryText>[1] | null>(null);
  const [preparing, setPreparing] = useState(false);
  const live = useRef(true), running = useRef(false), search = useRef(false), latest = useRef(onAction); latest.current = onAction;
  const t = (key: Parameters<typeof characterDiscoveryText>[1]) => characterDiscoveryText(locale, key), n = (v: number) => new Intl.NumberFormat(locale).format(v);
  useEffect(() => { live.current = true; return () => { live.current = false; if (search.current) void latest.current({ action: "cancel", input: { worldId: scope.worldId, chatId: scope.chatId } }).catch(() => undefined); }; }, [scope.worldId, scope.chatId]);
  const read = (offset = 0) => onAction({ action: "read", input: { worldId: scope.worldId, chatId: scope.chatId, offset, ...(offset && page ? { guard: page.guard } : {}) } });
  function update(value: CharacterDiscoveryPage | null) { if (!validCharacterDiscoveryPage(value) || value.worldId !== scope.worldId || value.chatId !== scope.chatId) throw Error("story-review-invalid"); if (live.current) setPage(value); return value; }
  async function retainPage(value: CharacterDiscoveryPage | null) {
    if (!validCharacterDiscoveryPage(value) || value.worldId !== scope.worldId || value.chatId !== scope.chatId) throw Error("story-review-invalid");
    return page?.offset ? onAction({ action: "read", input: { worldId: scope.worldId, chatId: scope.chatId, offset: page.offset, guard: value.guard } }) : value;
  }
  async function run(task: () => Promise<CharacterDiscoveryPage | null>, find = false, profile = false) {
    if (running.current || disabled) return; running.current = true; search.current = find || profile; setBusy(true); setScanning(find); setPreparing(profile); setNotice(null);
    let timer: ReturnType<typeof setInterval> | undefined, polling = false;
    if (find) timer = setInterval(() => { if (polling || !live.current) return; polling = true; void read().then(value => { if (live.current && search.current) update(value); }).catch(() => undefined).finally(() => { polling = false; }); }, 1500);
    try { update(await task()); if (live.current && (find || profile)) setNotice(profile ? "profileReady" : "finish"); }
    catch (error) { if (live.current) { setNotice(characterDiscoveryError(error)); try { update(await read()); } catch { /* Keep previously read results, never invent progress. */ } } }
    finally { if (timer) clearInterval(timer); running.current = false; search.current = false; if (live.current) { setBusy(false); setScanning(false); setPreparing(false); } }
  }
  async function find() { const current = update(await read()); return current.remaining ? onAction({ action: "run", input: { worldId: scope.worldId, chatId: scope.chatId, guard: current.guard } }) : current; }
  return <section className="dr-story-review-preview dr-character-discovery"><h3>{t("title")}</h3><p className="setting-copy">{t("hint")}</p>
    <p className="setting-copy">{t("serviceHint")}</p>
    <div className="dr-story-review-actions"><button type="button" className="button secondary" disabled={busy || disabled} onClick={() => void run(find, true)}>{t(scanning ? "running" : "start")}</button>
      {scanning || preparing ? <button type="button" className="button secondary" onClick={() => void onAction({ action: "cancel", input: { chatId: scope.chatId, worldId: scope.worldId } }).catch(() => { if (live.current) setNotice("error"); })}>{t(preparing ? "stopProfile" : "cancel")}</button> : <button type="button" className="button secondary" disabled={busy || disabled} onClick={() => void run(() => read())}>{t(page ? "refresh" : "read")}</button>}</div>
    <div role="status" aria-live="polite" aria-atomic="true">{notice ? t(notice) : scanning ? t("running") : preparing ? t("preparing") : null}</div>
    {page && <><p>{t("progress").replace("{done}", n(page.completed)).replace("{total}", n(page.sources))}</p>
      {!page.candidates.length ? <p>{t("empty")}</p> : <><p className="setting-copy">{t("range").replace("{from}", n(page.offset + 1)).replace("{to}", n(page.offset + page.candidates.length)).replace("{total}", n(page.total))}</p>
        {page.candidates.map(c => <Candidate key={c.eventId} locale={locale} candidate={c} headRevisionId={page.guard.headRevisionId} disabled={busy || disabled} onPrepare={(name, values) => void run(async () => retainPage(await onAction({ action: "profile", input: { worldId: page.worldId, chatId: page.chatId, guard: page.guard, eventId: c.eventId, name, values } })), false, true)} onSave={(name, values, accept) => void run(async () => { const result = await onAction({ action: "approve", input: { worldId: page.worldId, chatId: page.chatId, guard: page.guard, eventId: c.eventId, name, background: values.background, accept, ...(accept ? { values } : {}) } }); onChanged(); const kept = await retainPage(result); if (live.current && accept) setNotice("saved"); return kept; })} />)}</>}
      <div className="dr-story-review-actions">{page.offset > 0 && <button type="button" className="button secondary" disabled={busy || disabled} onClick={() => void run(() => read(Math.max(0, page.offset - DISCOVERY_PAGE)))}>{t("prev")}</button>}{page.next !== null && <button type="button" className="button secondary" disabled={busy || disabled} onClick={() => void run(() => read(page.next!))}>{t("next")}</button>}</div>
    </>}
  </section>;
}
function Candidate({ locale, candidate, headRevisionId, disabled, onSave, onPrepare }: { locale: Locale; candidate: CharacterDiscoveryPage["candidates"][number]; headRevisionId: string | null; disabled: boolean; onSave: (name: string, values: ProfileValues, accept: boolean) => void; onPrepare: (name: string, values: ProfileValues) => void }) {
  const id = useId();
  const [name, setName] = useState(candidate.profile?.name ?? candidate.name), [values, setValues] = useState<ProfileValues>(candidate.profile?.values ?? { appearance: "", personality: "", goals: "", background: candidate.background }), t = (key: Parameters<typeof characterDiscoveryText>[1]) => characterDiscoveryText(locale, key);
  const stale = !!candidate.profile && candidate.profile.headRevisionId !== headRevisionId;
  return <article className="dr-story-review-entry"><h4>{candidate.name}</h4><p className="setting-copy">{t(candidate.added ? "added" : "proposal")}</p><details><summary>{t("quote")}</summary><p className="dr-story-review-source">{candidate.quote}</p></details>
    {!candidate.added && <><details><summary>{t("edit")}</summary><label htmlFor={`${id}-name`}>{t("name")}</label><input id={`${id}-name`} maxLength={80} value={name} disabled={disabled} onChange={e => setName(e.target.value)} />{PROFILE_FIELDS.map(k => <div key={k}><label htmlFor={`${id}-${k}`}>{k === "background" ? t("background") : characterText(locale, k)}</label><textarea id={`${id}-${k}`} rows={3} maxLength={k === "background" ? 1600 : 1200} value={values[k]} disabled={disabled} onChange={e => setValues(v => ({ ...v, [k]: e.target.value }))} /></div>)}<p className="setting-copy">{t("editHint")}</p></details>
      <button type="button" className="button secondary" disabled={disabled || !name.trim()} onClick={() => onPrepare(name.trim(), values)}>{t("prepare")}</button><p className="setting-copy">{t("profileHint")}</p>
      {candidate.profile && <DiscoveryProfileReview locale={locale} profile={candidate.profile} values={values} disabled={disabled} stale={stale} onApply={changes => setValues(v => ({ ...v, ...changes }))} />}</>}
    <div className="dr-story-review-actions">{!candidate.added && <button type="button" className="button" disabled={disabled || !name.trim() || stale} onClick={() => onSave(name.trim(), values, true)}>{t("approve")}</button>}<button type="button" className="button secondary" disabled={disabled} onClick={() => onSave(candidate.name, { appearance: "", personality: "", goals: "", background: candidate.background }, false)}>{t(candidate.added ? "remove" : "reject")}</button></div>
  </article>;
}
