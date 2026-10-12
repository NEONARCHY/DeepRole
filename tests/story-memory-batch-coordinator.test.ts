import {afterEach,expect,it,vi} from "vitest";
import {browser} from "wxt/browser";
import {batchFixture} from "./fixtures/story-memory-batch";
import {IsolatedFieldCoordinator} from "../src/adapters/isolated-field-coordinator";
import {DEFAULT_SETTINGS} from "../src/core/defaults";
import {FIELD_OWNERS_KEY} from "../src/core/isolated-character-text";
import {readMemoryBatch} from "../src/storage/story-memory-batch";
import type {DeepRoleDatabase} from "../src/storage/database";
const dbs:DeepRoleDatabase[]=[];afterEach(async()=>{vi.restoreAllMocks();await Promise.all(dbs.splice(0).map(db=>db.delete()))});
async function fixture(){
 const f=await batchFixture(1);dbs.push(f.db);let idle=true;
 const tabs=new Map<number,any>([[1,{id:1,url:(await f.binding()).chatUrl,active:true}],[9,{id:9,url:"https://chat.deepseek.com/chat/s/personal",active:true}]]);
 const api:any={...browser,runtime:{id:"ours"},tabs:{get:vi.fn(async(id:number)=>{if(!tabs.has(id))throw Error("closed");return tabs.get(id)}),create:vi.fn(async(value:any)=>{const tab={id:2,...value};tabs.set(2,tab);return tab}),update:vi.fn(async(id:number,value:any)=>{const tab={...tabs.get(id),...value};tabs.set(id,tab);return tab}),remove:vi.fn(async(id:number)=>{tabs.delete(id)}),sendMessage:vi.fn(async()=>({ok:idle}))}};
 api.windows={create:vi.fn(async(value:any)=>({id:3,tabs:[await api.tabs.create({url:value.url,active:true,windowId:3})]}))};
 const coordinator=new IsolatedFieldCoordinator(f.repo,api,async()=>DEFAULT_SETTINGS),source:any={id:"ours",tab:{id:1},frameId:0},worker=()=>({id:"ours",tab:{id:2},frameId:0});
 const run=(m:any)=>coordinator.handle(m,source),w=(id:string,action:string,data:any={})=>coordinator.handle({type:"DR_FIELD_WORKER",id,action,...data} as any,worker() as any);
 const start=async()=>{const result=await run({type:"DR_FIELD",action:"memory-batch",input:f.input});expect(result.ok).toBe(true);return result.id};
 const reply=async(id:string)=>{const claim=await w(id,"claim");const sources=JSON.parse(claim.prompt.slice(claim.prompt.lastIndexOf("\nSources: ")+10));return JSON.stringify({requestId:id,results:sources.map((s:any)=>({source:s.id,complete:true,facts:s.role==="assistant"?[{text:s.text,quote:s.text,kind:"event",risk:"ordinary"}]:[],people:[]}))})};
 const bind=async(id:string)=>{expect(await w(id,"sent")).toMatchObject({ok:true});tabs.set(2,{id:2,url:"https://chat.deepseek.com/chat/s/owned",active:true});expect(await w(id,"bound",{chatId:"owned"})).toMatchObject({ok:true})};
 return {...f,api,tabs,coordinator,run,w,start,reply,bind,setIdle:(value:boolean)=>{idle=value}};
}
it("uses one masked owned popup, commits then cleans and acknowledges without leaking source text",async()=>{
 const f=await fixture(),id=await f.start();expect(f.api.windows.create).toHaveBeenCalledWith(expect.objectContaining({type:"popup",focused:true,width:520}));
 expect((await f.w(id,"claim")).presentation.kind).toBe("memory");expect(JSON.stringify(await browser.storage.session.get())).not.toContain("Room");await f.bind(id);
 expect(await f.w(id,"reply",{chatId:"owned",raw:await f.reply(id)})).toMatchObject({ok:true});expect((await f.world()).sharedGame!.facts).toHaveLength(1);
 await f.run({type:"DR_FIELD",action:"cancel",id});expect(await f.repo.get("service",id)).toMatchObject({phase:"result",error:null});
 expect(await f.run({type:"DR_FIELD",action:"read",id})).toEqual({ok:true});f.tabs.set(2,{id:2,url:"https://chat.deepseek.com/",active:true});expect(await f.w(id,"cleaned",{chatId:"owned",ok:true})).toMatchObject({ok:true});
 expect(await f.run({type:"DR_FIELD",action:"read",id})).toMatchObject({ok:true,outcome:{text:"memory-batch-saved",cleanup:"done"}});await f.run({type:"DR_FIELD",action:"ack",id});expect(f.api.tabs.remove).toHaveBeenCalledExactlyOnceWith(2);expect(f.tabs.has(9)).toBe(true);expect((await browser.storage.session.get(FIELD_OWNERS_KEY))[FIELD_OWNERS_KEY]).toEqual([]);
});
it("a second tab/job, cast reservation and a nonempty draft cannot dispatch",async()=>{
 const f=await fixture();f.setIdle(false);expect(await f.run({type:"DR_FIELD",action:"memory-batch",input:f.input})).toMatchObject({ok:false,error:"busy"});expect(f.api.windows.create).not.toHaveBeenCalled();
 f.setIdle(true);await browser.storage.session.set({deeprole_cast_owners:[{id:"cast-other",tabId:8}]});expect(await f.run({type:"DR_FIELD",action:"memory-batch",input:f.input})).toMatchObject({ok:false,error:"busy"});await browser.storage.session.remove("deeprole_cast_owners");await f.start();expect(await f.run({type:"DR_FIELD",action:"memory-batch",input:f.input})).toMatchObject({ok:false,error:"busy"});expect(f.api.windows.create).toHaveBeenCalledTimes(1);
});
it("a restarted background reconciles interruption but never recreates a window or resends",async()=>{
 const f=await fixture();await f.start();const restarted=new IsolatedFieldCoordinator(f.repo,f.api,async()=>DEFAULT_SETTINGS);
 expect(await restarted.handle({type:"DR_FIELD",action:"memory-batch-status",input:f.input},{id:"ours",tab:{id:1},frameId:0} as any)).toMatchObject({ok:true,data:{reason:"failed"}});expect(f.api.windows.create).toHaveBeenCalledTimes(1);expect((await f.world()).sharedGame!.facts).toHaveLength(0);
});
it("late draft/lock changes preserve all memory and unfinished positions",async()=>{
 const f=await fixture(),id=await f.start();await f.bind(id);const raw=await f.reply(id);f.setIdle(false);expect(await f.w(id,"reply",{chatId:"owned",raw})).toMatchObject({ok:false});expect((await f.world()).sharedGame!.facts).toHaveLength(0);expect(await readMemoryBatch(f.input,f.repo)).toMatchObject({pendingTurns:1});
 await f.repo.enableVault("synthetic-password");await f.repo.lockVault();await expect(readMemoryBatch(f.input,f.repo)).rejects.toThrow();await f.repo.unlockVault("synthetic-password");
});
it("failed worker navigation closes only its owned blank popup and leaves an explicit retry",async()=>{
 const f=await fixture();f.api.tabs.update.mockRejectedValueOnce(Error("synthetic navigation failure"));
 expect(await f.run({type:"DR_FIELD",action:"memory-batch",input:f.input})).toMatchObject({ok:false,error:"tab-unavailable"});
 expect(f.api.tabs.remove).toHaveBeenCalledExactlyOnceWith(2);expect(f.tabs.has(9)).toBe(true);expect((await f.repo.list<any>("service")).map(j=>({phase:j.phase,cleanup:j.cleanup}))).toEqual([{phase:"failed",cleanup:"done"}]);
 expect(await readMemoryBatch(f.input,f.repo)).toMatchObject({reason:"failed",pendingTurns:1});
});
it("another active tab in the same game can cancel only the memory job, not unrelated tools",async()=>{
 const f=await fixture();await f.start();f.tabs.set(3,{id:3,url:(await f.binding()).chatUrl,active:true});
 expect(await f.coordinator.handle({type:"DR_FIELD",action:"memory-batch-cancel",input:f.input},{id:"ours",tab:{id:3},frameId:0} as any)).toMatchObject({ok:true});
 expect(await readMemoryBatch(f.input,f.repo)).toMatchObject({reason:"failed",pendingTurns:1});expect((await f.world()).sharedGame!.facts).toHaveLength(0);
});
