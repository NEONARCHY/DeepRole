import {useEffect,useId,useLayoutEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import type {CastMessage} from "../../adapters/cast-coordinator";
import type {CastDraft,CastMember} from "../../core/cast-initialization";
import type {Locale} from "../../core/types";
import type {WorldGame} from "../../core/world-game";
import {worldResetText} from "../../core/world-reset-i18n";
import {CastDiagnostics} from "./CastDiagnostics";
import {SupportDetails} from "./SupportDetails";
import {castPreparationReady} from "../../core/cast-progress";
import {sendCastMessage,useWorldResetJob} from "./useWorldResetJob";
import "./cast.css";

export function WorldResetSetup({worldId,worldName,locale,game,chatId,blocked=false,send=sendCastMessage,open:controlledOpen,onOpenChange,hideLauncher=false,requestedReviewId}:{worldId:string;worldName:string;locale:Locale;game:WorldGame;chatId:string;blocked?:boolean;send?:(m:CastMessage)=>Promise<any>;open?:boolean;onOpenChange?:(open:boolean)=>void;hideLauncher?:boolean;requestedReviewId?:string|null}){
 const t=worldResetText(locale),id=useId(),dialog=useRef<HTMLDivElement>(null),root=useRef<HTMLDivElement>(null),origin=useRef<HTMLElement|null>(null),scope=useRef("");scope.current=JSON.stringify([worldId,chatId]);
 const [localOpen,setLocalOpen]=useState(false),[draft,setDraft]=useState<CastDraft|null>(null),[start,setStart]=useState(t.defaultStart),[entries,setEntries]=useState<string[]>([]),[first,setFirst]=useState(false),[second,setSecond]=useState(false),[typed,setTyped]=useState(""),[token,setToken]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const {job,setJob,loaded,failed:statusFailed}=useWorldResetJob(worldId,send),opened=useRef("");
 const open=controlledOpen??localOpen,setOpen=(value:boolean)=>{setLocalOpen(value);onOpenChange?.(value);};
 const name=job?.reset?.worldName??worldName;
 const run=async(m:CastMessage)=>{const r=await send(m);if(!r?.ok)throw Error(r?.error??"failed");return r;};
 useEffect(()=>{setOpen(false);setDraft(null);setToken("");setFirst(false);setSecond(false);setTyped("");setBusy(false);setError("");opened.current="";},[worldId,chatId]);
 useEffect(()=>{if(job?.reset)setStart(job.reset.start);},[job?.id]);
 useLayoutEffect(()=>{if(!open)return;origin.current=(root.current?.getRootNode() as Document|ShadowRoot)?.activeElement as HTMLElement|null;dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();return()=>{if(origin.current?.isConnected)origin.current.focus();};},[open]);
 const act=async(m:CastMessage)=>{
  if(busy||blocked||game.activeChatId!==chatId&&!(m.type==="DR_CAST"&&m.action==="open-reset-chat"))return;setBusy(true);setError("");const world=scope.current;
  try{const r=await run(m);if(scope.current!==world)return;if(m.type==="DR_CAST"&&m.action==="confirm-reset"){setToken(r.token);setSecond(false);setTyped("");}if(m.type==="DR_CAST"&&m.action==="apply-reset"){setDraft(null);setToken("");}const latest=await run({type:"DR_CAST",action:"status",worldId,reset:true});if(scope.current===world)setJob(latest.job??null);}
  catch(e){if(scope.current===world){const code=e instanceof Error?e.message:"";setError(code==="reset-stale"?t.stale:["reset-incomplete","reset-rules-changed"].includes(code)?t.incomplete:t.failed);}}
  finally{if(scope.current===world)setBusy(false);}
 };
 const edit=(key:string,fn:(c:CastMember)=>CastMember)=>{setDraft(old=>old?{...old,characters:old.characters.map(c=>c.key===key?fn(c):c)}:old);setFirst(false);setToken("");};
 const review=()=>{if(!job?.draft)return;setDraft(structuredClone(job.draft));setEntries((job.draft.resetEntries??[]).map(e=>e.id));setFirst(false);setSecond(false);setTyped("");setToken("");setError("");setOpen(true);opened.current=job.id;};
 const active=game.activeChatId===chatId;
 const ready=!!job&&castPreparationReady(job),preparing=!!job&&(["opening","reading","analyzing"].includes(job.phase)||job.phase==="ready"&&!ready),clean=!!job&&["done","none"].includes(job.cleanup),disabled=busy||blocked||!active;
 const stale=!!job?.reset&&job.phase!=="applied"&&(job.reset.gameId!==game.id||job.reset.revision!==game.revision);
 useEffect(()=>{
  if(!job||!ready||!clean||disabled||stale||opened.current===job.id||job.reset?.chatId!==chatId)return;
  if(job.statusHidden&&requestedReviewId!==job.id)return;
  review();
 },[job?.id,ready,clean,disabled,stale,chatId,job?.statusHidden,requestedReviewId]);
 const close=()=>{
  setOpen(false);
  setFirst(false);setSecond(false);setTyped("");setToken("");
  // Closing the review is an explicit dismissal, not cancellation or approval.
  if(job&&ready){opened.current=job.id;setJob({...job,statusHidden:true});void run({type:"DR_CAST",action:"hide",id:job.id}).catch(()=>{});}
 };
 const step=job?.phase==="applied"?"done":token?"final":draft?"review":"preparation";
 useLayoutEffect(()=>{if(!open)return;const body=dialog.current?.querySelector(".dr-cast-body");if(body)body.scrollTop=0;dialog.current?.querySelector<HTMLElement>("h2")?.focus();},[open,step]);
 const body=open&&<div className="dr-cast-layer" onKeyDown={e=>{
  if(e.key==="Escape"&&!busy){e.preventDefault();e.stopPropagation();close();}
  if(e.key==="Tab"){const nodes=[...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),summary,a[href]')??[])].filter(n=>n.getClientRects().length);const active=(dialog.current?.getRootNode() as Document|ShadowRoot)?.activeElement;if(e.shiftKey&&(active===nodes[0]||active===dialog.current?.querySelector("h2"))){e.preventDefault();nodes.at(-1)?.focus();}else if(!e.shiftKey&&active===nodes.at(-1)){e.preventDefault();nodes[0]?.focus();}}
 }}><div ref={dialog} className="dr-cast-dialog dr-world-reset" role="dialog" aria-modal="true" aria-labelledby={id+"-title"}>
 <header><div><h2 tabIndex={-1} id={id+"-title"}>{t.title}</h2><small>{job?.phase==="applied"?t.appliedStep:token?t.stepTwo:draft?t.stepOne:t.preparationStep}</small></div><button type="button" className="button secondary" disabled={busy} onClick={close}>{t.close}</button></header>
 <div className="dr-cast-body">
  {statusFailed&&<p role="status" className="setting-copy">{t.statusFailed}</p>}
  {stale&&<p role="alert" className="dr-cast-warning">{t.stale}</p>}
  {!draft&&job?.phase!=="applied"&&<>
   <p>{t.intro}</p><p className="dr-cast-warning">{t.safety}</p><label className="field-label" htmlFor={id+"-start"}>{t.start}</label><textarea className="textarea" id={id+"-start"} maxLength={4000} value={preparing||ready&&!stale?job!.reset!.start:start} disabled={preparing||ready&&!stale||disabled} onChange={e=>setStart(e.target.value)}/>
   {!preparing&&(!job||stale||["error","cancelled"].includes(job.phase))&&<button type="button" className="button" disabled={disabled||!loaded||!!statusFailed||start.trim().length<3||!!job&&!clean} onClick={()=>void act({type:"DR_CAST",action:"start",worldId,locale,retry:!!job,restart:true,reset:{chatId,revision:game.revision,start}})}>{job?t.retry:t.prepare}</button>}
   {preparing&&<><p role="status">{t.preparing} {job?.reset?.entryOffset!==undefined?(locale==="ru"?"Проверено записей: ":"Entries reviewed: ")+(job.reset.entryOffset)+"/"+job.reset.entries.length:t.phase+": "+(job?.draft?.characters.length??0)+"/"+(job?.reset?.people.length??0)}</p><button type="button" className="button secondary" disabled={busy} onClick={()=>void act({type:"DR_CAST",action:"cancel",id:job!.id})}>{t.cancel}</button></>}
   {ready&&!stale&&<section className="dr-reset-status" data-state="ready"><strong>{t.readyTitle}</strong><p>{t.readyHint}</p><button type="button" className="button" disabled={disabled||!clean} onClick={review}>{t.review}</button></section>}
   {job?.phase==="error"&&!error&&<p className="error-text" role="alert">{["invalid-result","invalid-evidence","duplicate-character","partial-reply"].includes(job.error??"")?t.invalidReply:t.failed}</p>}
  </>}
  {job&&!clean&&!preparing&&<section className="dr-cast-notes"><p>{t.cleanupHint}</p><div className="button-row"><button type="button" className="button secondary" disabled={busy} onClick={()=>void act({type:"DR_CAST",action:"cleanup",id:job.id})}>{t.cleanup}</button><button type="button" className="button secondary" disabled={busy} onClick={()=>void act({type:"DR_CAST",action:"open",id:job.id})}>{t.open}</button></div><button type="button" className="button secondary" disabled={busy} onClick={()=>void act({type:"DR_CAST",action:"confirm-cleanup",id:job.id})}>{t.cleanupConfirm}</button></section>}
  {draft&&!token&&<>
   <section className="dr-reset-status" data-state="ready" role="status"><strong>{t.readyTitle}</strong><p>{t.reviewHint.replace("{count}",String(draft.characters.length))}</p></section>
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
    <SupportDetails locale={locale}><h3>{t.code}</h3><pre className="dr-reset-code">{JSON.stringify(draft,null,2)}</pre></SupportDetails><label className="checkbox-row"><input type="checkbox" checked={first} disabled={disabled} onChange={e=>setFirst(e.target.checked)}/><span>{t.first}</span></label>
  </>}
  {token&&<><h3>{t.final}</h3><p className="dr-cast-warning">{t.finalHint}</p><p><strong>{name}</strong></p><label className="field-label" htmlFor={id+"name"}>{t.name}</label><input className="input" id={id+"name"} value={typed} disabled={disabled} onChange={e=>setTyped(e.target.value)}/><label className="checkbox-row"><input type="checkbox" checked={second} disabled={disabled} onChange={e=>setSecond(e.target.checked)}/><span>{t.second}</span></label></>}
  {job?.phase==="applied"&&<><p role="status">{t.done}</p><button type="button" className="button secondary" disabled={busy} onClick={()=>void act({type:"DR_CAST",action:"open-reset-chat",id:job.id})}>{t.openFresh}</button></>}
  {!!job?.diagnostics?.length&&<CastDiagnostics job={job} locale={locale}/>}{error&&<p className="error-text" role="alert">{error}</p>}
 </div><footer>
  {(draft||token)&&<button type="button" className="button secondary" disabled={busy} onClick={()=>token?(setToken(""),setFirst(false)):setDraft(null)}>{token?t.back:t.toPreparation}</button>}
  {draft&&!token&&<button type="button" className="button" disabled={disabled||stale||!first||!clean} onClick={()=>void act({type:"DR_CAST",action:"confirm-reset",id:job!.id,draft,entries})}>{t.next}</button>}
  {token&&<button type="button" className="button danger" disabled={disabled||stale||!second||typed!==name} onClick={()=>void act({type:"DR_CAST",action:"apply-reset",id:job!.id,token,worldName:typed})}>{t.apply}</button>}
 </footer></div></div>;
 return <div ref={root}>
  {!hideLauncher&&<button type="button" className="button secondary" disabled={blocked||!active} onClick={()=>{if(ready&&clean&&!stale)review();else setOpen(true);}}>{t.title}</button>}
  {!open&&job&&active&&(ready||preparing||job.phase==="error"||job.cleanup==="failed")&&<section className="dr-reset-status" data-state={stale||job.phase==="error"?"error":ready?"ready":"preparing"} aria-label={t.title}>
   <strong role="status">{stale?t.stoppedTitle:ready?t.readyTitle:preparing?t.preparing:t.stoppedTitle}</strong><p>{stale?t.stale:ready?t.readyHint:preparing?t.preparingHint:t.stoppedHint}</p>
   {ready&&<p>{t.phase}: {job.draft?.characters.length??0}</p>}
   <button type="button" className={ready&&clean&&!stale?"button":"button secondary"} disabled={disabled} onClick={()=>{if(ready&&clean&&!stale)review();else setOpen(true);}}>{ready&&clean&&!stale?t.review:t.showPreparation}</button>
  </section>}
  {body&&createPortal(body,(root.current?.getRootNode() instanceof ShadowRoot?root.current.getRootNode():document.body) as Element)}
 </div>;
}
