import { afterEach, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { CastCoordinator } from "../src/adapters/cast-coordinator";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { castRecords, castDraft } from "./fixtures/cast-data";
import type { CastJob } from "../src/core/cast-initialization";
import { mutateCastJob } from "../src/storage/cast-initialization";
const dbs:DeepRoleDatabase[]=[];
afterEach(async()=>{await Promise.all(dbs.map(db=>db.delete()));dbs.length=0;vi.restoreAllMocks();});
async function setup(){
 const db=new DeepRoleDatabase("cast-coord-"+crypto.randomUUID());dbs.push(db);const repo=new DeepRoleRepository(db);await repo.mergeRecords(castRecords());
 const tabs=new Map<number,any>(),runtime={id:"ours",getURL:(p:string)=>"chrome-extension://ours/"+p};
 let nextTabId=5;
 const api:any={...browser,runtime,tabs:{create:vi.fn(async(v:any)=>{const tab={id:nextTabId++,url:v.url};tabs.set(tab.id,tab);return tab;}),get:vi.fn(async(id:number)=>{if(!tabs.has(id))throw Error("missing");return tabs.get(id);}),update:vi.fn(async(id:number,v:any)=>{const t={...tabs.get(id),...v};tabs.set(id,t);return t;}),remove:vi.fn(async(id:number)=>{tabs.delete(id);}),sendMessage:vi.fn(async()=>({ok:true}))}};
 const coordinator=new CastCoordinator(repo,api),ui={id:"ours",url:runtime.getURL("sidepanel.html")};
 const run=(m:any,s:{id:string;url:string;tab?:{id:number}}=ui)=>coordinator.handle(m,s) as Promise<any>;
 const start=()=>run({type:"DR_CAST",action:"start",worldId:"w",locale:"en"});
 const worker=(_id:string)=>({id:"ours",url:tabs.get(5).url,tab:{id:5}});
 return {repo,coordinator,api,tabs,run,start,worker};
}
it("creates an inactive empty tab, claims only that tab and keeps lore out of session",async()=>{
 const f=await setup(),r=await f.start();expect(r.ok).toBe(true);expect(f.api.tabs.create).toHaveBeenCalledWith({url:"about:blank",active:false});
 expect((await f.run({type:"DR_CAST_WORKER",action:"claim",id:r.job.id},f.worker(r.job.id))).prompt).toContain("Leon is the protagonist");
 expect(JSON.stringify(await browser.storage.session.get())).not.toContain("Leon");
 await f.run({type:"DR_CAST_WORKER",action:"sent",id:r.job.id,step:0},f.worker(r.job.id));
 const reloaded = new CastCoordinator(f.repo,f.api);
 expect(await reloaded.handle({type:"DR_CAST_WORKER",action:"claim",id:r.job.id},f.worker(r.job.id))).toMatchObject({ok:true,awaiting:true,step:0});expect((await f.run({type:"DR_CAST_WORKER",action:"claim",id:r.job.id},{...f.worker(r.job.id),tab:{id:99}})).ok).toBe(false);
 expect((await f.run({type:"DR_CAST",action:"status",worldId:"w"},{id:"outsider",url:"https://chat.deepseek.com/"})).ok).toBe(false);
});
it("completes exact sequential turns, persists review then closes only its cleaned tab",async()=>{
 const f=await setup(),r=await f.start(),id=r.job.id,s=()=>f.worker(id);await f.run({type:"DR_CAST_WORKER",action:"sent",id,step:0},s());f.tabs.set(5,{id:5,url:"https://chat.deepseek.com/chat/s/owned"});
 expect((await f.run({type:"DR_CAST_WORKER",action:"bound",id,chatId:"owned"},s())).ok).toBe(true);
 await f.run({type:"DR_CAST_WORKER",action:"reply",id,step:0,chatId:"owned",raw:"received"},s());
 expect((await f.run({type:"DR_CAST_WORKER",action:"reply",id,step:0,chatId:"owned",raw:"received"},s())).ok).toBe(false);
 await f.run({type:"DR_CAST_WORKER",action:"sent",id,step:1},s());
  await f.run({type:"DR_CAST_WORKER",action:"reply",id,step:1,chatId:"owned",raw:JSON.stringify({...castDraft(id),more:false})},s());
 expect((await f.repo.get<CastJob>("cast",id))!.phase).toBe("ready");f.tabs.set(5,{id:5,url:"https://chat.deepseek.com/"});
 expect((await f.run({type:"DR_CAST_WORKER",action:"cleaned",id,chatId:"owned",ok:true},s())).ok).toBe(true);
 expect(f.api.tabs.remove).toHaveBeenCalledExactlyOnceWith(5);expect((await f.repo.get<CastJob>("cast",id))!.draft!.characters).toHaveLength(2);
});
it("does not bind a preexisting chat before submitting and rejects navigation to another chat",async()=>{
 const f=await setup(),r=await f.start(),id=r.job.id;f.tabs.set(5,{id:5,url:"https://chat.deepseek.com/chat/s/personal"});
 expect((await f.run({type:"DR_CAST_WORKER",action:"bound",id,chatId:"personal"},f.worker(id))).ok).toBe(false);
 await f.run({type:"DR_CAST_WORKER",action:"error",id,error:"not-empty-chat",chatId:"personal"},f.worker(id));expect((await f.repo.get<CastJob>("cast",id))!.chatId).toBeUndefined();expect(f.api.tabs.remove).not.toHaveBeenCalled();
});
it("cancellation requests cleanup but a late reply cannot apply data",async()=>{
 const f=await setup(),r=await f.start(),id=r.job.id;await f.run({type:"DR_CAST",action:"cancel",id});expect(f.api.tabs.sendMessage).toHaveBeenCalledWith(5,{type:"DR_CAST_RETRY_CLEANUP"});expect((await f.repo.get<CastJob>("cast",id))!.phase).toBe("cancelled");expect(await f.repo.list("entity")).toEqual([]);
});
it("reports lost ownership after a restart instead of starting a duplicate request",async()=>{
 const f=await setup(),r=await f.start(),id=r.job.id;await browser.storage.session.clear();await mutateCastJob(id,j=>({...j,updatedAt:0}),f.repo);vi.spyOn(Date,"now").mockReturnValue(Date.now()+40000);const view=await f.run({type:"DR_CAST",action:"status",worldId:"w"});expect(view.job.phase).toBe("error");expect(view.job.error).toBe("interrupted");expect(f.api.tabs.create).toHaveBeenCalledTimes(1);
});
async function finalStep() {
 const f=await setup(),r=await f.start(),id=r.job.id,s=()=>f.worker(id);
 await f.run({type:"DR_CAST_WORKER",action:"sent",id,step:0},s());f.tabs.set(5,{id:5,url:"https://chat.deepseek.com/chat/s/owned"});
 await f.run({type:"DR_CAST_WORKER",action:"bound",id,chatId:"owned"},s());
 await f.run({type:"DR_CAST_WORKER",action:"reply",id,step:0,chatId:"owned",raw:"received"},s());
 await f.run({type:"DR_CAST_WORKER",action:"sent",id,step:1},s());
  const message={type:"DR_CAST_WORKER",action:"checkpoint",id,step:1,repair:false,chatId:"owned",replyIdentity:JSON.stringify(["message","r1"]),raw:JSON.stringify({...castDraft(id),more:false})};
 return {...f,id,s,message};
}
it("checkpoints only validated final data, survives a worker restart and excludes it from UI views",async()=>{
 const f=await finalStep();expect((await f.run(f.message,f.s())).ok).toBe(true);
 const claim=await new CastCoordinator(f.repo,f.api).handle({type:"DR_CAST_WORKER",action:"claim",id:f.id},f.s()) as any;
 expect(claim.replyCheckpoint.raw).toBe(f.message.raw);expect(claim.awaiting).toBe(true);
 expect((await f.run({type:"DR_CAST",action:"status",worldId:"w"})).job.replyCheckpoint).toBeUndefined();
 expect(JSON.stringify(await browser.storage.session.get())).not.toContain("Leon");expect(await f.repo.list("entity")).toEqual([]);
 await f.run({...f.message,action:"reply"},f.s());expect((await f.repo.get<CastJob>("cast",f.id))!.replyCheckpoint).toBeUndefined();
});
it("keeps validated partial checkpoints when the owned tab closes", async () => {
 const f=await finalStep(), d=castDraft(f.id);
 const partial=JSON.stringify({...d,characters:[d.characters[0]],present:[],partners:[],partial:true});
 expect((await f.run({...f.message,raw:partial},f.s())).ok).toBe(true);
 await f.coordinator.removed(5);
 const job=await f.repo.get<CastJob>("cast",f.id);
 expect(job?.phase).toBe("error");expect(job?.draft?.characters).toHaveLength(1);
 expect(job?.replyCheckpoint).toBeUndefined();expect(await f.repo.list("entity")).toHaveLength(0);
});
it("rejects incomplete, wrong-request, invalid-evidence, stale-step and cross-chat checkpoints",async()=>{
 const f=await finalStep();
 const invalid=castDraft(f.id);invalid.characters[0]!.evidence[0]!.quote="Never happened";
 for(const patch of [{raw:"<deeprole_cast>{"},{raw:JSON.stringify(castDraft("other"))},{raw:JSON.stringify(invalid)},{step:0},{repair:true},{chatId:"personal"},{replyIdentity:"not-json"}]) {
  expect((await f.run({...f.message,...patch},f.s())).ok).toBe(false);
 }
 expect((await f.repo.get<CastJob>("cast",f.id))!.replyCheckpoint).toBeUndefined();
});
it("cancellation clears checkpoints and rejects late checkpoint writes",async()=>{
 const f=await finalStep();await f.run(f.message,f.s());await f.run({type:"DR_CAST",action:"cancel",id:f.id});
 expect((await f.repo.get<CastJob>("cast",f.id))!.replyCheckpoint).toBeUndefined();expect((await f.run(f.message,f.s())).ok).toBe(false);
});
it("hides a terminal stale popup persistently without cleaning or losing its draft",async()=>{
 const f=await setup(),r=await f.start(),id=r.job.id;
 await mutateCastJob(id,j=>({...j,phase:"error",error:"model-refusal",chatId:"owned",cleanup:"failed",draft:castDraft(id)}),f.repo);
 await browser.storage.session.clear();const before=(await f.repo.rawRecords()).filter(r=>r.kind!=="cast");
 expect((await f.run({type:"DR_CAST",action:"hide",id})).ok).toBe(true);
 const reloaded=new CastCoordinator(f.repo,f.api);expect(await reloaded.handle({type:"DR_CAST",action:"status",worldId:"w"},{id:"ours",url:"chrome-extension://ours/sidepanel.html"})).toMatchObject({ok:true,job:{statusHidden:true,cleanup:"failed",phase:"error",draft:castDraft(id)}});
 expect((await f.repo.rawRecords()).filter(r=>r.kind!=="cast")).toEqual(before);expect(f.api.tabs.sendMessage).not.toHaveBeenCalled();expect(f.api.tabs.remove).not.toHaveBeenCalled();
 expect(await f.run({type:"DR_CAST",action:"start",worldId:"w",locale:"en",retry:true})).toMatchObject({ok:false,error:"cleanup-required"});
 expect((await f.run({type:"DR_CAST",action:"show",id})).job.statusHidden).toBe(false);
});
it("hiding an active popup never cancels preparation or requests cleanup",async()=>{
 const f=await setup(),r=await f.start(),id=r.job.id;
 expect((await f.run({type:"DR_CAST",action:"hide",id})).ok).toBe(true);
 expect(await f.repo.get<CastJob>("cast",id)).toMatchObject({phase:"opening",cleanup:"pending",statusHidden:true});expect(f.api.tabs.sendMessage).not.toHaveBeenCalled();
});
it("a manual deleted-chat acknowledgement releases only the stale cleanup requirement",async()=>{
 const f=await setup(),r=await f.start(),id=r.job.id;
 await mutateCastJob(id,j=>({...j,phase:"error",error:"model-refusal",chatId:"owned",cleanup:"failed",draft:castDraft(id)}),f.repo);
 f.tabs.set(5,{id:5,url:"https://chat.deepseek.com/chat/s/personal"});const before=(await f.repo.rawRecords()).filter(r=>r.kind!=="cast");
 expect((await f.run({type:"DR_CAST",action:"confirm-cleanup",id})).ok).toBe(true);
 expect(await f.repo.get<CastJob>("cast",id)).toMatchObject({cleanup:"done",phase:"error",draft:castDraft(id)});
 expect((await f.repo.rawRecords()).filter(r=>r.kind!=="cast")).toEqual(before);expect(f.api.tabs.sendMessage).not.toHaveBeenCalled();expect(f.api.tabs.remove).not.toHaveBeenCalled();expect(f.tabs.get(5).url).toContain("/personal");
 expect((await f.run({type:"DR_CAST_WORKER",action:"cleaned",id,ok:true},f.worker(id))).ok).toBe(false);
 const next=await f.run({type:"DR_CAST",action:"start",worldId:"w",locale:"en",retry:true});expect(next.ok).toBe(true);expect(next.job.id).not.toBe(id);
});
it("does not let acknowledgement silently stop an active job",async()=>{
 const f=await setup(),r=await f.start(),id=r.job.id;
 expect(await f.run({type:"DR_CAST",action:"confirm-cleanup",id})).toMatchObject({ok:false,error:"preparation-active"});expect(await f.repo.get<CastJob>("cast",id)).toMatchObject({phase:"opening",cleanup:"pending"});expect(f.api.tabs.sendMessage).not.toHaveBeenCalled();
});
it("a worker finishing a hidden job preserves visibility and its review draft",async()=>{
 const f=await finalStep();await f.run({type:"DR_CAST",action:"hide",id:f.id});
 expect((await f.run({...f.message,action:"reply"},f.s())).ok).toBe(true);
 expect(await f.repo.get<CastJob>("cast",f.id)).toMatchObject({phase:"ready",statusHidden:true,draft:castDraft(f.id)});
 expect(await f.repo.list("entity")).toEqual([]);expect(f.api.tabs.remove).not.toHaveBeenCalled();
});
it("rejects visibility and acknowledgement changes from another extension",async()=>{
 const f=await setup(),r=await f.start();
 for(const action of ["hide","show","confirm-cleanup"]){
  expect(await f.run({type:"DR_CAST",action,id:r.job.id},{id:"outsider",url:"chrome-extension://ours/sidepanel.html"})).toMatchObject({ok:false,error:"untrusted"});
 }
 expect(await f.repo.get<CastJob>("cast",r.job.id)).toMatchObject({phase:"opening",cleanup:"pending"});expect(f.api.tabs.sendMessage).not.toHaveBeenCalled();
});
it("saves the real /a chat URL from the owned tab, not from the message",async()=>{
 const f=await setup(),r=await f.start(),id=r.job.id;
 await f.run({type:"DR_CAST_WORKER",action:"sent",id,step:0},f.worker(id));
 f.tabs.set(5,{id:5,url:"https://chat.deepseek.com/a/chat/s/owned?deeprole_cast_job="+id});
 expect((await f.run({type:"DR_CAST_WORKER",action:"bound",id,chatId:"owned",chatUrl:"https://other.example/chat/s/personal"},f.worker(id))).ok).toBe(true);
 expect(await f.repo.get<CastJob>("cast",id)).toMatchObject({chatId:"owned",chatUrl:"https://chat.deepseek.com/a/chat/s/owned"});
});
it("opens the exact existing service tab without sending, deleting or creating a chat",async()=>{
 const f=await setup(),r=await f.start(),id=r.job.id;
 f.tabs.set(5,{id:5,url:"https://chat.deepseek.com/a/chat/s/owned"});
 await mutateCastJob(id,j=>({...j,phase:"error",cleanup:"failed",chatId:"owned"}),f.repo);
 const before=(await f.repo.rawRecords()).filter(r=>r.kind!=="cast");f.api.tabs.create.mockClear();f.api.tabs.update.mockClear();
 expect((await f.run({type:"DR_CAST",action:"open",id})).ok).toBe(true);
 expect(f.api.tabs.update).toHaveBeenCalledExactlyOnceWith(5,{active:true});expect(f.api.tabs.create).not.toHaveBeenCalled();
 expect(f.api.tabs.sendMessage).not.toHaveBeenCalled();expect(f.api.tabs.remove).not.toHaveBeenCalled();
 expect(await f.repo.get<CastJob>("cast",id)).toMatchObject({phase:"error",cleanup:"failed",chatUrl:"https://chat.deepseek.com/a/chat/s/owned"});
 expect((await f.repo.rawRecords()).filter(r=>r.kind!=="cast")).toEqual(before);
});
it("a lost worker opens the saved conversation URL, never the empty service launcher",async()=>{
 const f=await setup(),r=await f.start(),id=r.job.id;
 await mutateCastJob(id,j=>({...j,phase:"error",cleanup:"failed",chatId:"owned",chatUrl:"https://chat.deepseek.com/a/chat/s/owned"}),f.repo);
 await browser.storage.session.clear();f.api.tabs.create.mockClear();f.api.tabs.update.mockClear();
 expect((await f.run({type:"DR_CAST",action:"open",id})).ok).toBe(true);
 expect(f.api.tabs.create).toHaveBeenCalledExactlyOnceWith({url:"https://chat.deepseek.com/a/chat/s/owned",active:true});
 expect(f.api.tabs.update).not.toHaveBeenCalled();expect(f.api.tabs.sendMessage).not.toHaveBeenCalled();
});
it("legacy valid IDs use /a, but unknown, wrong, removed and incomplete chats never open a blank replacement",async()=>{
 const f=await setup(),r=await f.start(),id=r.job.id;await browser.storage.session.clear();
 await mutateCastJob(id,j=>({...j,phase:"error",cleanup:"failed",chatId:"owned"}),f.repo);f.api.tabs.create.mockClear();
 expect((await f.run({type:"DR_CAST",action:"open",id})).ok).toBe(true);
 expect(f.api.tabs.create).toHaveBeenCalledExactlyOnceWith({url:"https://chat.deepseek.com/a/chat/s/owned",active:true});
 for(const patch of [{chatId:undefined,chatUrl:undefined},{chatId:"s",chatUrl:undefined},{chatId:"owned",chatUrl:"https://other.example/a/chat/s/owned"},{chatId:"owned",chatUrl:"https://chat.deepseek.com/a/chat/s/personal"},{chatId:"owned",chatUrl:undefined,cleanup:"done" as const}]) {
  await mutateCastJob(id,j=>({...j,cleanup:"failed",...patch}),f.repo);f.api.tabs.create.mockClear();
  expect((await f.run({type:"DR_CAST",action:"open",id})).ok).toBe(false);expect(f.api.tabs.create).not.toHaveBeenCalled();
 }
});
it("does not navigate a service tab that the user has moved into a personal conversation",async()=>{
 const f=await setup(),r=await f.start(),id=r.job.id;
 await mutateCastJob(id,j=>({...j,phase:"error",cleanup:"failed",chatId:"owned",chatUrl:"https://chat.deepseek.com/a/chat/s/owned"}),f.repo);
 f.tabs.set(5,{id:5,url:"https://chat.deepseek.com/a/chat/s/personal"});f.api.tabs.update.mockClear();f.api.tabs.create.mockClear();
 expect((await f.run({type:"DR_CAST",action:"open",id})).ok).toBe(true);
 expect(f.api.tabs.update).not.toHaveBeenCalled();expect(f.api.tabs.create).toHaveBeenCalledExactlyOnceWith({url:"https://chat.deepseek.com/a/chat/s/owned",active:true});
 expect(f.api.tabs.remove).not.toHaveBeenCalled();expect(f.api.tabs.sendMessage).not.toHaveBeenCalled();
 expect(f.tabs.get(5).url).toBe("https://chat.deepseek.com/a/chat/s/personal");
});
it("never accepts an incomplete /a/chat/s route as the saved native chat ID",async()=>{
 const f=await setup(),r=await f.start(),id=r.job.id;
 await f.run({type:"DR_CAST_WORKER",action:"sent",id,step:0},f.worker(id));
 f.tabs.set(5,{id:5,url:"https://chat.deepseek.com/a/chat/s"});
 expect((await f.run({type:"DR_CAST_WORKER",action:"bound",id,chatId:"s"},f.worker(id))).ok).toBe(false);
 expect((await f.repo.get<CastJob>("cast",id))!.chatId).toBeUndefined();
});
