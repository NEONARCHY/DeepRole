import {afterEach,expect,it,vi} from "vitest";
import {browser} from "wxt/browser";
import {CastCoordinator,type CastMessage} from "../src/adapters/cast-coordinator";
import {DeepRoleDatabase} from "../src/storage/database";
import {DeepRoleRepository} from "../src/storage/repository";
import {activateWorldGame} from "../src/storage/world-game";
import {mutateCastJob} from "../src/storage/cast-initialization";
import {resetFixture,resetDraft} from "./fixtures/world-reset";
import type {WorldProfile} from "../src/core/types";
const dbs:DeepRoleDatabase[]=[];afterEach(async()=>{await Promise.all(dbs.splice(0).map(d=>d.delete()));vi.restoreAllMocks();});
async function fixture(){
 const f=resetFixture(),db=new DeepRoleDatabase("reset-coord-"+crypto.randomUUID());dbs.push(db);const repo=new DeepRoleRepository(db);await repo.mergeRecords(f.records);await activateWorldGame({chatId:f.binding.chatId,chatUrl:f.binding.chatUrl,worldId:f.world.id,expectedRevision:null,mode:"initialize"},repo);
 const tabs=new Map<number,any>(),runtime={id:"ours",getURL:(p:string)=>"chrome-extension://ours/"+p};let counter=10;
 const create=(v:any)=>{const t={id:counter++,url:v.url,windowId:1,incognito:false};tabs.set(t.id,t);return t;};
 const api:any={...browser,runtime,windows:{getLastFocused:vi.fn(async()=>({id:1})),create:vi.fn(async(v:any)=>({id:1,tabs:[create(v)]}))},tabs:{create:vi.fn(async(v:any)=>create(v)),get:vi.fn(async(id:number)=>{if(!tabs.has(id))throw Error("missing");return tabs.get(id);}),update:vi.fn(async(id:number,v:any)=>{const t={...tabs.get(id),...v};tabs.set(id,t);return t;}),sendMessage:vi.fn(async()=>({ok:true})),remove:vi.fn(async(id:number)=>tabs.delete(id))}};
 const coordinator=new CastCoordinator(repo,api),ui={id:runtime.id,url:runtime.getURL("sidepanel.html")},run=(m:CastMessage,s:any=ui)=>coordinator.handle(m,s) as Promise<any>,world=()=>repo.get<WorldProfile>("world",f.world.id).then(w=>w!);
 const request={chatId:f.binding.chatId,revision:(await world()).sharedGame!.revision,start:"Tyoma returns after six years abroad."};
 const ready=async()=>{const r=await run({type:"DR_CAST",action:"start",worldId:f.world.id,locale:"en",reset:request});expect(r.ok).toBe(true);const draft=resetDraft(r.job.id,f.records);await mutateCastJob(r.job.id,j=>({...j,phase:"ready",step:99,cleanup:"done",draft,reset:{...j.reset!,entryOffset:j.reset!.entries.length}}),repo);return {id:r.job.id,draft};};
 return {...f,repo,api,tabs,run,getWorld:world,request,ready};
}
it("never accepts destructive reset actions from a page or model worker",async()=>{const f=await fixture(),sender={id:"ours",url:f.binding.chatUrl};expect(await f.run({type:"DR_CAST",action:"start",worldId:f.world.id,locale:"en",reset:f.request},sender)).toMatchObject({ok:false,error:"untrusted"});expect(await f.run({type:"DR_CAST",action:"apply-reset",id:"fake",token:"fake",worldName:f.world.name},sender)).toMatchObject({ok:false,error:"untrusted"});expect(f.api.windows.create).not.toHaveBeenCalled();});
it("keeps reset review separate, commits once and opens only one fresh chat on retries",async()=>{const f=await fixture(),r=await f.ready();expect((await f.run({type:"DR_CAST",action:"status",worldId:f.world.id})).job).toBeNull();expect((await f.run({type:"DR_CAST",action:"status",worldId:f.world.id,reset:true})).job.id).toBe(r.id);const one=await f.run({type:"DR_CAST",action:"confirm-reset",id:r.id,draft:r.draft,entries:[f.event.id,f.mixed.id]});expect(one.ok).toBe(true);expect(f.api.tabs.create).not.toHaveBeenCalled();expect(await f.run({type:"DR_CAST",action:"apply-reset",id:r.id,token:one.token,worldName:f.world.name})).toMatchObject({ok:true,chatOpened:true});const gameId=(await f.getWorld()).sharedGame!.id;await Promise.all([1,2].map(()=>f.run({type:"DR_CAST",action:"open-reset-chat",id:r.id})));expect(f.api.tabs.create).toHaveBeenCalledTimes(1);expect((await f.getWorld()).sharedGame!.id).toBe(gameId);expect(f.api.tabs.update).toHaveBeenCalledWith(11,{url:"https://chat.deepseek.com/",active:true});const state=(await apiSession())["deeprole_tab_state_11"];expect(state?.continueOnFreshChat).toBe(true);expect(state?.snapshotId).toBeTruthy();});
const apiSession=()=>browser.storage.session.get() as Promise<Record<string,{continueOnFreshChat?:boolean;snapshotId?:string}>>;
it('opens the reset mask before claim, then supplies the reset mode only to its owned worker',async()=>{
 const f=await fixture(),r=await f.run({type:'DR_CAST',action:'start',worldId:f.world.id,locale:'en',reset:f.request});expect(r.ok).toBe(true);
 const tab=[...f.tabs.values()][0];expect(tab.url).toContain('&deeprole_cast_mode=reset');
 const claim=await f.run({type:'DR_CAST_WORKER',action:'claim',id:r.job.id},{id:'ours',url:tab.url,tab});
 expect(claim).toMatchObject({ok:true,reset:true,id:r.job.id});
 expect(await f.run({type:'DR_CAST_WORKER',action:'claim',id:r.job.id},{id:'ours',url:tab.url,tab:{...tab,id:999}})).toMatchObject({ok:false});
 expect((await f.getWorld()).sharedGame!.id).toBe(r.job.reset.gameId);
});
it("reports a failed fresh-chat open after commit, allowing retry without resetting again",async()=>{const f=await fixture(),r=await f.ready(),one=await f.run({type:"DR_CAST",action:"confirm-reset",id:r.id,draft:r.draft,entries:[]});f.api.tabs.create.mockRejectedValueOnce(Error("failed"));expect(await f.run({type:"DR_CAST",action:"apply-reset",id:r.id,token:one.token,worldName:f.world.name})).toMatchObject({ok:true,chatOpened:false});const id=(await f.getWorld()).sharedGame!.id;expect(await f.run({type:"DR_CAST",action:"open-reset-chat",id:r.id})).toMatchObject({ok:true});expect((await f.getWorld()).sharedGame!.id).toBe(id);});
