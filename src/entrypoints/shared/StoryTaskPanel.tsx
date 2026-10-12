import { useId,useState } from "react";
import type { Locale } from "../../core/types";
import { compactStoryFacts,type StoryFact } from "../../core/story-update";
import { memoryKeyText } from "../../core/story-memory-lifecycle";
import { storyTaskText } from "../../core/story-task-i18n";
export function StoryTaskPanel({locale,facts}: {locale:Locale;facts:StoryFact[]}) {
 const t=storyTaskText(locale),id=useId(),[query,setQuery]=useState(""),[limit,setLimit]=useState(10),[showClosed,setShowClosed]=useState(false);
 const compact=compactStoryFacts(facts),unlinked=compact.filter(f=>!f.task&&["promise","plan","task"].includes(f.kind)&&(!query||memoryKeyText(f.text).includes(memoryKeyText(query))));
 const tasks=compact.filter(f=>f.task),matching=tasks.filter(f=>!query || memoryKeyText(f.task!.title+" "+f.text).includes(memoryKeyText(query)));
 const open=matching.filter(f=>f.task!.status==="open"),closed=matching.filter(f=>f.task!.status!=="open");
 const render=(list:StoryFact[])=> <>{list.slice(0,limit).map(f=><article className="dr-story-review-entry" key={f.task!.key}><h3>{f.task!.title}</h3><p className="dr-story-task-status">{t[f.task!.status]}</p><p>{f.text}</p><details><summary>{t.source}</summary><p className="dr-story-review-source">{f.quote}</p></details></article>)}{list.length>limit&&<button type="button" className="button secondary" onClick={()=>setLimit(n=>n+10)}>{t.more}</button>}</>;
 return <section className="settings-card dr-story-tasks" aria-label={t.title}><h2>{t.title}</h2><p className="setting-copy">{t.hint}</p>{tasks.length>0&&<><label className="field-label" htmlFor={id}>{t.search}</label><input className="input" id={id} type="search" maxLength={80} value={query} onChange={e=>{setQuery(e.target.value);setLimit(10)}}/></>}{open.length?render(open):<p className="setting-copy">{query&&!closed.length?t.noMatch:t.empty}</p>}{closed.length>0&&<details open={showClosed} onToggle={e=>setShowClosed(e.currentTarget.open)}><summary>{t.closed} · {new Intl.NumberFormat(locale).format(closed.length)}</summary>{render(closed)}</details>}{unlinked.length>0&&<details><summary>{t.unlinked}</summary><p className="setting-copy">{t.unlinkedHint}</p>{unlinked.slice(0,limit).map((f,i)=><article className="dr-story-review-entry" key={i}><p>{f.text}</p><details><summary>{t.source}</summary><p className="dr-story-review-source">{f.quote}</p></details></article>)}{unlinked.length>limit&&<button type="button" className="button secondary" onClick={()=>setLimit(n=>n+10)}>{t.more}</button>}</details>}</section>;
}
