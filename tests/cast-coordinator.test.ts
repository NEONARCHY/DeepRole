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
 const api:any={...browser,runtime,tabs:{create:vi.fn(async(v:any)=>{const tab={id:5,url:v.url};tabs.set(5,tab);return tab;}),get:vi.fn(async(id:number)=>{if(!tabs.has(id))throw Error("missing");return tabs.get(id);}),update:vi.fn(async(id:number,v:any)=>{const t={...tabs.get(id),...v};tabs.set(id,t);return t;}),remove:vi.fn(async(id:number)=>{tabs.delete(id);}),sendMessage:vi.fn(async()=>({ok:true}))}};
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
 await f.run({type:"DR_CAST_WORKER",action:"reply",id,step:1,chatId:"owned",raw:JSON.stringify(castDraft(id))},s());
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
