import { useEffect, useId, useRef, useState } from "react";
import type { Locale } from "../../core/types";
import type { AutomationReviewPage } from "../../core/story-automation-review";
import { PROFILE_FIELDS, type ProfileField } from "../../core/character-profile";
import { characterText } from "../../core/characters";
import { storyAutomationText } from "../../core/story-automation-i18n";
import { storyReviewError, storyReviewText } from "../../core/story-review-i18n";
import { readActiveAutomation, resolveActiveAutomation, type StoryReviewTabs } from "../../adapters/story-review-client";
import { Select } from "./Select";
import { storyTaskText } from "../../core/story-task-i18n";
export function StoryAutomationInbox({ locale,tabs,scope,revision,blocked = false }: { locale: Locale; tabs: StoryReviewTabs; scope: { worldId: string; chatId: string }; revision?: string; blocked?: boolean }) {
  const t = storyAutomationText(locale), taskText = storyTaskText(locale), id = useId(), generation = useRef(0);
  const [page,setPage] = useState<AutomationReviewPage>(), [busy,setBusy] = useState(false), [error,setError] = useState(""), [query,setQuery] = useState("");
  const [drafts,setDrafts] = useState<Record<string,{ fields: ProfileField[]; target: string; name: string }>>({});
  const load = async () => { const seq = ++generation.current; setBusy(true); setError(""); try { const next = await readActiveAutomation(tabs,scope,query); if (seq === generation.current) setPage(next); } catch(e) { if (seq === generation.current) setError(storyReviewText(locale,storyReviewError(e))); } finally { if (seq === generation.current) setBusy(false); } };
  useEffect(() => { void load(); return () => { generation.current++; }; },[scope.worldId,scope.chatId,revision]);
  const save = async (item: NonNullable<typeof page>["items"][number], accept: boolean) => {
    if (!page || busy || blocked) return; setBusy(true); setError("");
    const draft = drafts[item.id] ?? { fields: PROFILE_FIELDS.filter(k => item.fields[k]),target: "",name: item.name };
    try { await resolveActiveAutomation(tabs,page,{ eventId: item.id,accept,fields: accept ? draft.fields : [],entityId: accept && draft.target ? draft.target : null,name: accept && item.type === "person" && !draft.target ? draft.name : "", ...(accept && item.conflicts?.length ? {replaceKeys:item.conflicts.map(c=>c.key)} : {}) }); await load(); }
    catch(e) { setError(storyReviewText(locale,storyReviewError(e))); } finally { setBusy(false); }
  };
  return <section className="settings-card dr-story-automation-inbox" aria-label={t.inbox}><div className="dr-story-inbox-heading"><h2>{t.inbox}{page && page.total > 0 && <span className="dr-story-inbox-count">{page.total}</span>}</h2><button className="button secondary" type="button" disabled={busy || blocked} onClick={() => void load()}>{t.refresh}</button></div>
    {busy && !page && <p role="status">{t.loading}</p>}{error && <p role="alert">{error}</p>}{page && !page.total && <p className="setting-copy">{t.empty}</p>}
    {!!page?.total && <><p className="setting-copy">{t.inboxHint}</p>{!page.ready && <p role="status">{t.readyScene}</p>}
      {page.items.some(p => p.type === "person") && <div className="dr-story-inbox-search"><span className="field-label" id={id+"-search-label"}>{t.searchPeople}</span><input type="text" className="input" aria-labelledby={id+"-search-label"} id={id+"-search"} value={query} maxLength={80} disabled={busy || blocked} onChange={e => setQuery(e.target.value)} /><button type="button" className="button secondary" disabled={busy || blocked} onClick={() => void load()}>{t.search}</button></div>}
      {page.items.map(item => {
        const draft = drafts[item.id] ?? { fields: PROFILE_FIELDS.filter(k => item.fields[k]),target: "",name: item.name };
        const update = (patch: Partial<typeof draft>) => setDrafts(old => ({ ...old,[item.id]: { ...draft,...patch } }));
        return <article className="dr-story-review-entry" key={item.id}><h3>{item.type === "fact" ? t.fact : item.name}</h3><p className="setting-copy">{t[item.reason]}</p>
          {!!item.conflicts?.length&&<div className="dr-story-conflict"><h4>{taskText.before}</h4>{item.conflicts.map(c=><div key={c.key}><p>{c.text}</p><details><summary>{t.source}</summary><p className="dr-story-review-source">{c.quote}</p></details></div>)}<h4>{taskText.after}</h4></div>}
          {item.text && <p>{item.text}</p>}<details><summary>{t.source}</summary><p className="dr-story-review-source">{item.quote}</p></details>{!!item.conflicts?.length&&<p className="setting-copy">{taskText.replaceHint}</p>}
          {item.type === "person" && <><span className="field-label" id={id+item.id+"-person-label"}>{t.personTarget}</span><Select aria-labelledby={id+item.id+"-person-label"} id={id+item.id+"-person"} value={draft.target} disabled={busy || blocked} onChange={e => update({ target: e.target.value })}><option value="">{t.newPerson}</option>{page.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>{!draft.target && <><span className="field-label" id={id+item.id+"-name-label"}>{t.personName}</span><input type="text" className="input" aria-labelledby={id+item.id+"-name-label"} id={id+item.id+"-name"} maxLength={80} disabled={busy || blocked} value={draft.name} onChange={e => update({ name: e.target.value })}/></>}</>}
          {Object.keys(item.fields).length > 0 && <fieldset className="dr-story-inbox-fields" disabled={busy || blocked}><legend>{t.addFields}</legend>{PROFILE_FIELDS.filter(k => item.fields[k]).map(k => <div key={k}><label><input type="checkbox" checked={draft.fields.includes(k)} onChange={e => update({ fields: e.target.checked ? [...draft.fields,k] : draft.fields.filter(f => f !== k) })}/><span>{characterText(locale,k)}</span></label><p>{item.fields[k]}</p></div>)}</fieldset>}
          <div className="button-row"><button className="button" type="button" disabled={busy || blocked || !page.ready || item.type === "profile" && !draft.fields.length || item.type === "person" && !draft.target && !draft.name.trim() || item.type === "person" && !!draft.target && !draft.fields.length} onClick={() => void save(item,true)}>{item.conflicts?.length ? taskText.replace : t.accept}</button><button className="button secondary" type="button" disabled={busy || blocked || !page.ready} onClick={() => void save(item,false)}>{item.conflicts?.length ? taskText.keep : t.decline}</button></div>
        </article>;
      })}
    </>}
  </section>;
}
