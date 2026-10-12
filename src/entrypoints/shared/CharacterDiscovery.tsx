import { useEffect, useId, useRef, useState } from "react";
import { characterDiscoveryText, characterDiscoveryError } from "../../core/character-discovery-i18n";
import { DISCOVERY_PAGE, validCharacterDiscoveryPage, type CharacterDiscoveryAction, type CharacterDiscoveryInput, type CharacterDiscoveryPage } from "../../core/story-character-discovery";
import type { Locale } from "../../core/types";
import { PROFILE_FIELDS, type ProfileValues } from "../../core/character-profile";
import { characterText } from "../../core/characters";
import { storyUxText } from "../../core/story-ux-i18n";
import { DiscoveryProfileReview } from "./DiscoveryProfileReview";
import { DiscoveryIdentityPicker } from "./DiscoveryIdentityPicker";
import type { IdentityOptions, IdentitySelection } from "../../core/story-character-identity";
export function CharacterDiscovery({ locale, scope, onAction, onChanged, disabled, compact = false, autoRead = false }: { locale: Locale; scope: CharacterDiscoveryInput; onAction: (action: CharacterDiscoveryAction) => Promise<CharacterDiscoveryPage | null>; onChanged: () => void; disabled: boolean; compact?: boolean; autoRead?: boolean }) {
  const [page, setPage] = useState<CharacterDiscoveryPage | null>(null), [busy, setBusy] = useState(false), [scanning, setScanning] = useState(false), [notice, setNotice] = useState<Parameters<typeof characterDiscoveryText>[1] | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [queueRunning, setQueueRunning] = useState(false), [selected, setSelected] = useState<Set<string>>(new Set());
  const drafts = useRef(new Map<string, { name: string; values: ProfileValues }>());
  const [, setDraftVersion] = useState(0);
  const live = useRef(true), running = useRef(false), search = useRef(false), latest = useRef(onAction); latest.current = onAction;
  const t = (key: Parameters<typeof characterDiscoveryText>[1]) => characterDiscoveryText(locale, key), n = (v: number) => new Intl.NumberFormat(locale).format(v);
  useEffect(() => { live.current = true; return () => { live.current = false; if (search.current) void latest.current({ action: "cancel", input: { worldId: scope.worldId, chatId: scope.chatId } }).catch(() => undefined); }; }, [scope.worldId, scope.chatId]);
  const read = (offset = 0) => onAction({ action: "read", input: { worldId: scope.worldId, chatId: scope.chatId, offset, ...(offset && page ? { guard: page.guard } : {}) } });
  function update(value: CharacterDiscoveryPage | null) { if (!validCharacterDiscoveryPage(value) || value.worldId !== scope.worldId || value.chatId !== scope.chatId) throw Error("story-review-invalid"); if (live.current) setPage(value); return value; }
  async function retainPage(value: CharacterDiscoveryPage | null) {
    if (!validCharacterDiscoveryPage(value) || value.worldId !== scope.worldId || value.chatId !== scope.chatId) throw Error("story-review-invalid");
    return page?.offset ? onAction({ action: "read", input: { worldId: scope.worldId, chatId: scope.chatId, offset: page.offset, guard: value.guard } }) : value;
  }
  async function run(task: () => Promise<CharacterDiscoveryPage | null>, find = false, profile = false, queue = false) {
    if (running.current || disabled) return; running.current = true; search.current = find || profile || queue; setBusy(true); setScanning(find); setPreparing(profile); setQueueRunning(queue); setNotice(null);
    let timer: ReturnType<typeof setInterval> | undefined, polling = false;
    if (find || queue) timer = setInterval(() => { if (polling || !live.current) return; polling = true; void read(page?.offset ?? 0).then(value => { if (live.current && search.current) update(value); }).catch(() => undefined).finally(() => { polling = false; }); }, 1500);
    try { update(await task()); if (live.current && (find || profile || queue)) { setNotice(queue ? "queueReady" : profile ? "profileReady" : "finish"); if (queue) setSelected(new Set()); } }
    catch (error) { if (live.current) { setNotice(characterDiscoveryError(error)); try { update(await retainPage(await read())); } catch { /* Keep previously read results, never invent progress. */ } } }
    finally { if (timer) clearInterval(timer); running.current = false; search.current = false; if (live.current) { setBusy(false); setScanning(false); setPreparing(false); setQueueRunning(false); } }
  }
  useEffect(() => { if (!autoRead || disabled || page) return; const timer = setTimeout(() => void run(() => read()), 0); return () => clearTimeout(timer); }, [autoRead, disabled]);
  async function find() { const current = update(await read()); return current.remaining ? onAction({ action: "run", input: { worldId: scope.worldId, chatId: scope.chatId, guard: current.guard } }) : current; }
  const eligible = page?.candidates.filter(c => !c.added && c.profile?.headRevisionId !== page.guard.headRevisionId && (!c.distinct || !!drafts.current.get(c.eventId)?.name && drafts.current.get(c.eventId)!.name !== c.name)) ?? [];
  async function queue(operation: "enqueue" | "resume" | "clear") {
    if (!page) return null;
    const items = operation === "enqueue" ? eligible.filter(c => selected.has(c.eventId)).map(c => ({ eventId: c.eventId, ...(drafts.current.get(c.eventId) ?? { name: c.name, values: { appearance: "", personality: "", goals: "", background: c.background } }) })) : [];
    const result = await retainPage(await onAction({ action: "queue", input: { chatId: page.chatId, worldId: page.worldId, guard: page.guard, operation, items } }));
    if (operation === "clear" && live.current) setSelected(new Set());
    return result;
  }
  return <section className="dr-story-review-preview dr-character-discovery"><h3>{compact ? storyUxText(locale, "newPeople") : t("title")}</h3><p className="setting-copy">{compact ? storyUxText(locale, "newPeopleHint") : t("hint")}</p>
    <p className="setting-copy">{t("serviceHint")}</p>
    <div className="dr-story-review-actions"><button type="button" className="button secondary" disabled={busy || disabled} onClick={() => void run(find, true)}>{t(scanning ? "running" : "start")}</button>
      {scanning || preparing || queueRunning ? <button type="button" className="button secondary" onClick={() => void onAction({ action: "cancel", input: { chatId: scope.chatId, worldId: scope.worldId } }).catch(() => { if (live.current) setNotice("error"); })}>{t(queueRunning ? "queueStop" : preparing ? "stopProfile" : "cancel")}</button> : <button type="button" className="button secondary" disabled={busy || disabled} onClick={() => void run(() => read())}>{t(page ? "refresh" : "read")}</button>}</div>
    <div role="status" aria-live="polite" aria-atomic="true">{notice ? t(notice) : queueRunning ? t("queueRunning") : scanning ? t("running") : preparing ? t("preparing") : null}</div>
    {page && <><p>{t("progress").replace("{done}", n(page.completed)).replace("{total}", n(page.sources))}</p>
      <div className="dr-story-review-preview"><p className="setting-copy">{t("queueHint")}</p>
        {!!page.queue?.total && <p>{t("queueProgress").replace("{done}", n(page.queue.ready)).replace("{total}", n(page.queue.total))}</p>}
        {!!page.queue?.stale && <p className="setting-copy">{t("queueStale")}</p>}
        <div className="dr-story-review-actions"><button type="button" className="button secondary" disabled={busy || disabled || !eligible.length} onClick={() => setSelected(new Set(eligible.map(c => c.eventId)))}>{t("queuePage")}</button>
          <button type="button" className="button" disabled={busy || disabled || !eligible.some(c => selected.has(c.eventId))} onClick={() => void run(() => queue("enqueue"), false, false, true)}>{t("queueStart")} · {eligible.filter(c => selected.has(c.eventId)).length}</button>
          {selected.size > 0 && <button type="button" className="button secondary" disabled={busy || disabled} onClick={() => setSelected(new Set())}>{storyUxText(locale, "clearSelection")}</button>}
          {!!page.queue?.pending && <button type="button" className="button secondary" disabled={busy || disabled || !!page.queue.stale} onClick={() => void run(() => queue("resume"), false, false, true)}>{t("queueResume")}</button>}
          {!!page.queue?.total && <button type="button" className="button secondary" disabled={busy || disabled} onClick={() => void run(() => queue("clear"))}>{t("queueClear")}</button>}</div>
      </div>
      {!page.candidates.length ? <p>{t("empty")}</p> : <><p className="setting-copy">{t("range").replace("{from}", n(page.offset + 1)).replace("{to}", n(page.offset + page.candidates.length)).replace("{total}", n(page.total))}</p>
        {page.candidates.map(c => <Candidate key={c.eventId} compact={compact} initialDraft={drafts.current.get(c.eventId)} locale={locale} candidate={c} headRevisionId={page.guard.headRevisionId} identity={page.identity?.eventId === c.eventId ? page.identity : undefined} onLookup={(query, offset) => void run(() => onAction({ action: "read", input: { worldId: page.worldId, chatId: page.chatId, guard: page.guard, offset: page.offset, identity: { eventId: c.eventId, query, offset } } }))} onLink={identity => void run(async () => { const value = await onAction({ action: "approve", input: { worldId: page.worldId, chatId: page.chatId, guard: page.guard, eventId: c.eventId, name: c.name, background: "", accept: true, identity } }); onChanged(); const kept = await retainPage(value); if (live.current) setNotice("identitySaved"); return kept; })} disabled={busy || disabled} selected={selected.has(c.eventId)} onSelect={value => setSelected(s => { const next = new Set(s); value ? next.add(c.eventId) : next.delete(c.eventId); return next; })} onDraft={(name, values) => { const changed = drafts.current.get(c.eventId)?.name !== name; drafts.current.set(c.eventId, { name, values }); if (changed) setDraftVersion(v => v + 1); }} onPrepare={(name, values) => void run(async () => retainPage(await onAction({ action: "profile", input: { worldId: page.worldId, chatId: page.chatId, guard: page.guard, eventId: c.eventId, name, values } })), false, true)} onSave={(name, values, accept) => void run(async () => { const result = await onAction({ action: "approve", input: { worldId: page.worldId, chatId: page.chatId, guard: page.guard, eventId: c.eventId, name, background: values.background, accept, ...(accept ? { values } : {}) } }); onChanged(); const kept = await retainPage(result); if (live.current && accept) setNotice("saved"); return kept; })} />)}</>}
      <div className="dr-story-review-actions">{page.offset > 0 && <button type="button" className="button secondary" disabled={busy || disabled} onClick={() => void run(() => read(Math.max(0, page.offset - DISCOVERY_PAGE)))}>{t("prev")}</button>}{page.next !== null && <button type="button" className="button secondary" disabled={busy || disabled} onClick={() => void run(() => read(page.next!))}>{t("next")}</button>}</div>
    </>}
  </section>;
}
function Candidate({ compact, initialDraft, locale, candidate, headRevisionId, identity, onLookup, onLink, disabled, selected, onSelect, onDraft, onSave, onPrepare }: { compact: boolean; initialDraft?: { name: string; values: ProfileValues }; locale: Locale; candidate: CharacterDiscoveryPage["candidates"][number]; headRevisionId: string | null; identity?: IdentityOptions; onLookup: (query: string, offset: number) => void; onLink: (identity: IdentitySelection) => void; disabled: boolean; selected: boolean; onSelect: (value: boolean) => void; onDraft: (name: string, values: ProfileValues) => void; onSave: (name: string, values: ProfileValues, accept: boolean) => void; onPrepare: (name: string, values: ProfileValues) => void }) {
  const id = useId();
  const [name, setName] = useState(initialDraft?.name ?? candidate.task?.name ?? candidate.profile?.name ?? candidate.name), [values, setValues] = useState<ProfileValues>(initialDraft?.values ?? candidate.task?.values ?? candidate.profile?.values ?? { appearance: "", personality: "", goals: "", background: candidate.background }), t = (key: Parameters<typeof characterDiscoveryText>[1]) => characterDiscoveryText(locale, key);
  useEffect(() => { onDraft(name.trim(), values); }, [name, values, onDraft]);
  const stale = !!candidate.profile && candidate.profile.headRevisionId !== headRevisionId;
  const body = <><details><summary>{t("quote")}</summary><p className="dr-story-review-source">{candidate.quote}</p></details>{candidate.identityActive === false && <p className="setting-copy">{t("identityInactive")}</p>}
    {!candidate.added && <><DiscoveryIdentityPicker locale={locale} options={identity} disabled={disabled} onLookup={onLookup} onLink={onLink} />{candidate.distinct && <p className="setting-copy">{t("distinctHint")}</p>}{!compact && <label className="checkbox-row" htmlFor={`${id}-queue`}><input id={`${id}-queue`} type="checkbox" checked={selected} disabled={disabled || !name.trim() || !!candidate.distinct && name.trim() === candidate.name || candidate.profile?.headRevisionId === headRevisionId} onChange={e => onSelect(e.target.checked)} />{t("queueSelect")} · {candidate.name}</label>}{candidate.task && <p className="setting-copy">{t(candidate.task.status === "ready" ? "queueDone" : candidate.task.status === "preparing" ? "queuePreparing" : candidate.task.status === "failed" ? "queueFailed" : "queuePending")}</p>}</>}
    {!candidate.added && <><details><summary>{t("edit")}</summary><label htmlFor={`${id}-name`}>{t("name")}</label><input id={`${id}-name`} maxLength={80} value={name} disabled={disabled} onChange={e => setName(e.target.value)} />{PROFILE_FIELDS.map(k => <div key={k}><label htmlFor={`${id}-${k}`}>{k === "background" ? t("background") : characterText(locale, k)}</label><textarea id={`${id}-${k}`} rows={3} maxLength={k === "background" ? 1600 : 1200} value={values[k]} disabled={disabled} onChange={e => setValues(v => ({ ...v, [k]: e.target.value }))} /></div>)}<p className="setting-copy">{t("editHint")}</p></details>
      <button type="button" className="button secondary" disabled={disabled || !name.trim() || !!candidate.distinct && name.trim() === candidate.name} onClick={() => onPrepare(name.trim(), values)}>{t("prepare")}</button><p className="setting-copy">{t("profileHint")}</p>
      {candidate.profile && <DiscoveryProfileReview locale={locale} profile={candidate.profile} values={values} disabled={disabled} stale={stale} onApply={changes => setValues(v => ({ ...v, ...changes }))} />}</>}
    <div className="dr-story-review-actions">{!candidate.added && <button type="button" className="button" disabled={disabled || !name.trim() || stale || !!candidate.distinct && name.trim() === candidate.name} onClick={() => onSave(name.trim(), values, true)}>{t("approve")}</button>}<button type="button" className="button secondary" disabled={disabled} onClick={() => onSave(candidate.name, { appearance: "", personality: "", goals: "", background: candidate.background }, false)}>{t(candidate.identityName ? "identityRemove" : candidate.added ? "remove" : "reject")}</button></div>
  </>;
  return <article className="dr-story-review-entry"><h4>{candidate.name}</h4><p className="dr-story-candidate-status">{candidate.identityName ? t("identityLinked").replace("{name}", candidate.identityName) : t(candidate.added ? "added" : "proposal")}</p>
    {compact && !candidate.added && <label className="checkbox-row" htmlFor={`${id}-queue`}><input id={`${id}-queue`} type="checkbox" checked={selected} disabled={disabled || !name.trim() || !!candidate.distinct && name.trim() === candidate.name || candidate.profile?.headRevisionId === headRevisionId} onChange={e => onSelect(e.target.checked)} />{t("queueSelect")} · {candidate.name}</label>}
    {compact ? <details className="dr-candidate-detail"><summary>{storyUxText(locale, "details")}</summary>{body}</details> : body}
  </article>;
}
