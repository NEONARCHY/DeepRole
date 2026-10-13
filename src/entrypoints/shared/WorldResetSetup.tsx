import {useEffect,useId,useLayoutEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {browser} from "wxt/browser";
import type {CastMessage,CastView} from "../../adapters/cast-coordinator";
import type {CastDraft,CastMember} from "../../core/cast-initialization";
import type {Locale} from "../../core/types";
import type {WorldGame} from "../../core/world-game";
import {worldResetText} from "../../core/world-reset-i18n";
import {CastDiagnostics} from "./CastDiagnostics";
import "./cast.css";

export function WorldResetSetup({worldId,worldName,locale,game,chatId,blocked=false,send=(m:CastMessage)=>browser.runtime.sendMessage(m)}:{worldId:string;worldName:string;locale:Locale;game:WorldGame;chatId:string;blocked?:boolean;send?:(m:CastMessage)=>Promise<any>}){
 const t=worldResetText(locale),id=useId(),dialog=useRef<HTMLDivElement>(null),root=useRef<HTMLDivElement>(null),origin=useRef<HTMLElement|null>(null),scope=useRef(worldId);scope.current=worldId;
 const [open,setOpen]=useState(false),[job,setJob]=useState<CastView|null>(null),[draft,setDraft]=useState<CastDraft|null>(null),[start,setStart]=useState(t.defaultStart),[entries,setEntries]=useState<string[]>([]),[first,setFirst]=useState(false),[second,setSecond]=useState(false),[typed,setTyped]=useState(""),[token,setToken]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const name=job?.reset?.worldName??worldName;
 const run=async(m:CastMessage)=>{const r=await send(m);if(!r?.ok)throw Error(r?.error??"failed");return r;};
 useEffect(()=>{setOpen(false);setJob(null);setDraft(null);setToken("");setError("");},[worldId]);
 useEffect(()=>{if(!open)return;let disposed=false;const update=async()=>{try{const r=await run({type:"DR_CAST",action:"status",worldId,reset:true});if(!disposed)setJob(r.job??null);}catch{}};void update();const timer=setInterval(()=>void update(),2500);return()=>{disposed=true;clearInterval(timer);};},[open,worldId]);
 useLayoutEffect(()=>{if(!open)return;origin.current=(root.current?.getRootNode() as Document|ShadowRoot)?.activeElement as HTMLElement|null;dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();return()=>{if(origin.current?.isConnected)origin.current.focus();};},[open]);
 const act=async(m:CastMessage)=>{
  if(busy||blocked)return;setBusy(true);setError("");const world=worldId;
  try{const r=await run(m);if(scope.current!==world)return;if(m.type==="DR_CAST"&&m.action==="confirm-reset"){setToken(r.token);setSecond(false);setTyped("");}if(m.type==="DR_CAST"&&m.action==="apply-reset"){setDraft(null);setToken("");}const latest=await run({type:"DR_CAST",action:"status",worldId,reset:true});if(scope.current===world)setJob(latest.job??null);}
  catch(e){if(scope.current===world){const code=e instanceof Error?e.message:"";setError(code==="reset-stale"?t.stale:["reset-incomplete","reset-rules-changed"].includes(code)?t.incomplete:t.failed);}}
  finally{if(scope.current===world)setBusy(false);}
 };
 const edit=(key:string,fn:(c:CastMember)=>CastMember)=>{setDraft(old=>old?{...old,characters:old.characters.map(c=>c.key===key?fn(c):c)}:old);setFirst(false);setToken("");};
 const review=()=>{if(!job?.draft)return;setDraft(structuredClone(job.draft));setEntries((job.draft.resetEntries??[]).map(e=>e.id));setFirst(false);setToken("");setError("");};
 const preparing=!!job&&["opening","reading","analyzing"].includes(job.phase),ready=job?.phase==="ready"&&(!job.large||job.large.stage==="done"),clean=!!job&&["done","none"].includes(job.cleanup),disabled=busy||blocked;
 const body=open&&<div className="dr-cast-layer" onKeyDown={e=>{
  if(e.key==="Escape"&&!busy){e.preventDefault();setOpen(false);}
  if(e.key==="Tab"){const nodes=[...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),summary,a[href]')??[])].filter(n=>n.getClientRects().length);const active=(dialog.current?.getRootNode() as Document|ShadowRoot)?.activeElement;if(e.shiftKey&&active===nodes[0]){e.preventDefault();nodes.at(-1)?.focus();}else if(!e.shiftKey&&active===nodes.at(-1)){e.preventDefault();nodes[0]?.focus();}}
 }}><div ref={dialog} className="dr-cast-dialog dr-world-reset" role="dialog" aria-modal="true" aria-labelledby={id+"-title"}>
 <header><h2 id={id+"-title"}>{t.title}</h2><button type="button" className="button secondary" disabled={busy} onClick={()=>setOpen(false)}>{t.close}</button></header>
 <div className="dr-cast-body">
  {!draft&&job?.phase!=="applied"&&<>
   <p>{t.intro}</p><p className="dr-cast-warning">{t.safety}</p><label className="field-label" htmlFor={id+"-start"}>{t.start}</label><textarea className="textarea" id={id+"-start"} maxLength={4000} value={preparing||ready?job!.reset!.start:start} disabled={preparing||ready||disabled} onChange={e=>setStart(e.target.value)}/>
   {!preparing&&(!job||["error","cancelled"].includes(job.phase))&&<button type="button" className="button" disabled={disabled||start.trim().length<3||!!job&&!clean} onClick={()=>void act({type:"DR_CAST",action:"start",worldId,locale,retry:!!job,restart:true,reset:{chatId,revision:game.revision,start}})}>{job?t.retry:t.prepare}</button>}
   {preparing&&<><p role="status">{t.preparing} {job?.reset?.entryOffset!==undefined?(locale==="ru"?"Проверено записей: ":"Entries reviewed: ")+(job.reset.entryOffset)+"/"+job.reset.entries.length:t.phase+": "+(job?.draft?.characters.length??0)+"/"+(job?.reset?.people.length??0)}</p><button type="button" className="button secondary" disabled={busy} onClick={()=>void act({type:"DR_CAST",action:"cancel",id:job!.id})}>{t.cancel}</button></>}
   {ready&&<button type="button" className="button" disabled={disabled||!clean} onClick={review}>{t.review}</button>}
  </>}
  {job&&!clean&&!preparing&&<section className="dr-cast-notes"><p>{t.cleanupHint}</p><div className="button-row"><button type="button" className="button secondary" disabled={busy} onClick={()=>void act({type:"DR_CAST",action:"cleanup",id:job.id})}>{t.cleanup}</button><button type="button" className="button secondary" disabled={busy} onClick={()=>void act({type:"DR_CAST",action:"open",id:job.id})}>{t.open}</button></div><button type="button" className="button secondary" disabled={busy} onClick={()=>void act({type:"DR_CAST",action:"confirm-cleanup",id:job.id})}>{t.cleanupConfirm}</button></section>}
  {draft&&!token&&<>
   <p className="dr-cast-warning">{t.warning}</p>{!!draft.warnings.length&&<section><h3>{t.notes}</h3>{draft.warnings.map((w,i)=><p key={i}>{w}</p>)}</section>}
   {draft.characters.map((c,n)=><article key={c.key} className="dr-cast-member"><h3>{c.name}</h3><p className="dr-cast-reason">{c.reason}</p>
    <details><summary>{t.before}</summary><p>{job?.reset?.people.find(p=>p.id===c.key)?.before?.goals}</p><p>{job?.reset?.people.find(p=>p.id===c.key)?.before?.background}</p><p>{job?.reset?.people.find(p=>p.id===c.key)?.before?.state?.relationship}</p>{Object.entries(job?.reset?.people.find(p=>p.id===c.key)?.before?.state?.bonds??{}).map(([key,value])=><p key={key}>{t.trust}: {value.trust} · {t.affinity}: {value.affinity}</p>)}</details>
    {c.sheet.relationships&&<div className="dr-cast-scores">{(["trust","affinity"] as const).map(k=><div key={k}><label className="field-label" htmlFor={id+n+k}>{t[k]}</label><input className="input" id={id+n+k} type="number" min={0} max={100} value={c.sheet.relationships!.initial[k]} disabled={disabled} onChange={e=>edit(c.key,old=>({...old,sheet:{...old.sheet,relationships:{...old.sheet.relationships!,initial:{...old.sheet.relationships!.initial,[k]:Number(e.target.value)}}}}))}/></div>)}</div>}
    {!!c.sheet.relationships?.milestones.length&&<p>{locale==="ru"?"Уже произошло до начала игры":"Already happened before this game"}</p>}{c.sheet.relationships?.milestones.map(m=><label className="checkbox-row" key={m.id}><input type="checkbox" disabled={disabled} checked={c.completed.includes(m.id)} onChange={e=>edit(c.key,old=>({...old,completed:e.target.checked?[...old.completed,m.id]:old.completed.filter(v=>v!==m.id)}))}/><span>{m.label}</span></label>)}
    {(["condition","relationship","goal"] as const).map(k=><div className="dr-cast-field" key={k}><label className="field-label" htmlFor={id+n+k}>{t[k]}</label><textarea className="textarea" id={id+n+k} maxLength={240} value={c.state[k]} disabled={disabled} onChange={e=>edit(c.key,old=>({...old,state:{...old.state,[k]:e.target.value}}))}/></div>)}
    {(["goals","background"] as const).map(k=><div className="dr-cast-field" key={k}><label className="field-label" htmlFor={id+n+k}>{t[k]}</label><textarea className="textarea" id={id+n+k} maxLength={1200} value={c.sheet[k]} disabled={disabled} onChange={e=>edit(c.key,old=>({...old,sheet:{...old.sheet,[k]:e.target.value}}))}/></div>)}
    {!!c.sheet.attributes?.length&&<h4>{t.attributes}</h4>}{c.sheet.attributes?.map((a,i)=><div className="dr-cast-field" key={a.id}><label htmlFor={id+n+"attr"+i}>{a.label}</label><input className="input" id={id+n+"attr"+i} type="number" min={0} max={100} value={a.initial} disabled={disabled} onChange={e=>edit(c.key,old=>({...old,sheet:{...old.sheet,attributes:old.sheet.attributes!.map((v,j)=>j===i?{...v,initial:Number(e.target.value)}:v)}}))}/></div>)}
    {c.state.stats.map((s,i)=><div className="dr-cast-field" key={i}><label htmlFor={id+n+"stat"+i}>{s.label}</label><input className="input" id={id+n+"stat"+i} maxLength={80} value={s.value} disabled={disabled} onChange={e=>edit(c.key,old=>({...old,state:{...old.state,stats:old.state.stats.map((v,j)=>j===i?{...v,value:e.target.value}:v)}}))}/></div>)}
    <details><summary>{t.evidence}</summary>{c.evidence.map((e,i)=><p key={i}>{e.quote}</p>)}</details>
   </article>)}
   {!!draft.resetEntries?.length&&<section><h3>{t.entries}</h3><p>{t.entryHint}</p>{draft.resetEntries.map((e,i)=><article className="dr-cast-member" key={e.id}>
    <label className="checkbox-row"><input type="checkbox" disabled={disabled} checked={entries.includes(e.id)} onChange={ev=>{setEntries(old=>ev.target.checked?[...old,e.id]:old.filter(v=>v!==e.id));setFirst(false);}}/><span>{job?.titles[e.id]??e.id} — {e.action==="remove"?t.remove:t.rewrite}</span></label><p>{e.reason}</p><details><summary>{t.before}</summary><p className="dr-story-review-source">{job?.reset?.entries.find(v=>v.id===e.id)?.content}</p></details>
    {e.action==="rewrite"&&<><label htmlFor={id+"entry"+i}>{t.after}</label><textarea className="textarea" id={id+"entry"+i} maxLength={30000} value={e.content} disabled={disabled} onChange={ev=>{setDraft(old=>old?{...old,resetEntries:old.resetEntries?.map(v=>v.id===e.id?{...v,content:ev.target.value}:v)}:old);setFirst(false);}}/></>}
   </article>)}</section>}
   <details><summary>{t.code}</summary><pre className="dr-reset-code">{JSON.stringify(draft,null,2)}</pre></details><label className="checkbox-row"><input type="checkbox" checked={first} disabled={disabled} onChange={e=>setFirst(e.target.checked)}/><span>{t.first}</span></label>
  </>}
  {token&&<><h3>{t.final}</h3><p className="dr-cast-warning">{t.finalHint}</p><p><strong>{name}</strong></p><label className="field-label" htmlFor={id+"name"}>{t.name}</label><input className="input" id={id+"name"} value={typed} disabled={disabled} onChange={e=>setTyped(e.target.value)}/><label className="checkbox-row"><input type="checkbox" checked={second} disabled={disabled} onChange={e=>setSecond(e.target.checked)}/><span>{t.second}</span></label></>}
  {job?.phase==="applied"&&<><p role="status">{t.done}</p><button type="button" className="button secondary" disabled={busy} onClick={()=>void act({type:"DR_CAST",action:"open-reset-chat",id:job.id})}>{t.openFresh}</button></>}
  {!!job?.diagnostics?.length&&<CastDiagnostics job={job} locale={locale}/>}{error&&<p className="error-text" role="alert">{error}</p>}
 </div><footer>
  {(draft||token)&&<button type="button" className="button secondary" disabled={busy} onClick={()=>token?(setToken(""),setFirst(false)):setDraft(null)}>{t.back}</button>}
  {draft&&!token&&<button type="button" className="button" disabled={disabled||!first||!clean} onClick={()=>void act({type:"DR_CAST",action:"confirm-reset",id:job!.id,draft,entries})}>{t.next}</button>}
  {token&&<button type="button" className="button danger" disabled={disabled||!second||typed!==name} onClick={()=>void act({type:"DR_CAST",action:"apply-reset",id:job!.id,token,worldName:typed})}>{t.apply}</button>}
 </footer></div></div>;
 return <div ref={root}><button type="button" className="button secondary" disabled={blocked||game.activeChatId!==chatId} onClick={()=>setOpen(true)}>{t.title}</button>{body&&createPortal(body,(root.current?.getRootNode() instanceof ShadowRoot?root.current.getRootNode():document.body) as Element)}</div>;
}
