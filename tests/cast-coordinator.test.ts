import { afterEach, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { CastCoordinator } from "../src/adapters/cast-coordinator";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { castRecords, castDraft, castBatch } from "./fixtures/cast-data";
import type { CastJob } from "../src/core/cast-initialization";
import { mutateCastJob } from "../src/storage/cast-initialization";
import { SERVICE_OUTBOX_PREFIX } from "../src/core/service-outbox";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { removeWorld } from "../src/storage/worlds";
import { ServiceAuditOutbox } from "../src/storage/service-outbox";
const dbs:DeepRoleDatabase[]=[];
afterEach(async()=>{await Promise.all(dbs.map(db=>db.delete()));dbs.length=0;vi.restoreAllMocks();});
async function setup(){
 const db=new DeepRoleDatabase("cast-coord-"+crypto.randomUUID());dbs.push(db);const repo=new DeepRoleRepository(db);await repo.mergeRecords(castRecords());
 const tabs=new Map<number,any>(),runtime={id:"ours",getURL:(p:string)=>"chrome-extension://ours/"+p};
 let nextTabId=5;
 const makeTab=(v:any)=>{const tab={id:nextTabId++,url:v.url,windowId:7,incognito:!!v.incognito};tabs.set(tab.id,tab);return tab;};
 const api:any={...browser,runtime,windows:{getLastFocused:vi.fn(async()=>({id:1,incognito:false})),update:vi.fn(async()=>({})),create:vi.fn(async(v:any)=>({id:7,tabs:[makeTab(v)]}))},tabs:{create:vi.fn(async(v:any)=>makeTab(v)),get:vi.fn(async(id:number)=>{if(!tabs.has(id))throw Error("missing");return tabs.get(id);}),update:vi.fn(async(id:number,v:any)=>{const t={...tabs.get(id),...v};tabs.set(id,t);return t;}),remove:vi.fn(async(id:number)=>{tabs.delete(id);}),sendMessage:vi.fn(async()=>({ok:true}))}};
 const coordinator=new CastCoordinator(repo,api),ui={id:"ours",url:runtime.getURL("sidepanel.html")};
 const run=(m:any,s:{id:string;url:string;tab?:{id:number}}=ui)=>coordinator.handle(m,s) as Promise<any>;
 const start=()=>run({type:"DR_CAST",action:"start",worldId:"w",locale:"en"});
 const worker=(_id:string)=>({id:"ours",url:tabs.get(5).url,tab:{id:5}});
 return {repo,coordinator,api,tabs,run,start,worker};
}
it("creates a focused service popup, claims only its tab and keeps lore out of session",async()=>{
 const f=await setup(),r=await f.start();expect(r.ok).toBe(true);expect(f.api.windows.create).toHaveBeenCalledWith({url:"about:blank",type:"popup",focused:true,width:520,height:720,incognito:false});expect(f.api.tabs.create).not.toHaveBeenCalled();
 expect(f.api.tabs.update).toHaveBeenCalledWith(5,{url:"https://chat.deepseek.com/?deeprole_cast_job="+r.job.id+"&deeprole_cast_locale=en"});
 expect((await f.run({type:"DR_CAST_WORKER",action:"claim",id:r.job.id},f.worker(r.job.id))).prompt).toContain("Leon is the protagonist");
 expect(JSON.stringify(await browser.storage.session.get())).not.toContain("Leon");
 await f.run({type:"DR_CAST_WORKER",action:"sent",id:r.job.id,step:0},f.worker(r.job.id));
 const reloaded = new CastCoordinator(f.repo,f.api);
 expect(await reloaded.handle({type:"DR_CAST_WORKER",action:"claim",id:r.job.id},f.worker(r.job.id))).toMatchObject({ok:true,awaiting:true,step:0});expect((await f.run({type:"DR_CAST_WORKER",action:"claim",id:r.job.id},{...f.worker(r.job.id),tab:{id:99}})).ok).toBe(false);
 expect((await f.run({type:"DR_CAST",action:"status",worldId:"w"},{id:"outsider",url:"https://chat.deepseek.com/"})).ok).toBe(false);
});
it("persists refusal diagnostics before cleanup and exposes them after coordinator reload",async()=>{
 const f=await setup(),r=await f.start(),id=r.job.id;await f.run({type:"DR_CAST_WORKER",action:"sent",id,step:0},f.worker(id));
 f.tabs.set(5,{id:5,url:"https://chat.deepseek.com/chat/s/owned"});
 await f.run({type:"DR_CAST_WORKER",action:"bound",id,chatId:"owned"},f.worker(id));
 expect((await f.run({type:"DR_CAST_WORKER",action:"error",id,chatId:"owned",error:"model-refusal"},f.worker(id))).ok).toBe(true);
 expect((await f.repo.get<CastJob>("cast",id))!.diagnostics![0]!.code).toBe("model-refusal");
 f.tabs.set(5,{id:5,url:"https://chat.deepseek.com/"});await f.run({type:"DR_CAST_WORKER",action:"cleaned",id,chatId:"owned",ok:true},f.worker(id));
 const reloaded=new CastCoordinator(f.repo,f.api),status:any=await reloaded.handle({type:"DR_CAST",action:"status",worldId:"w"},{id:"ours",url:"chrome-extension://ours/sidepanel.html"});
 expect(status.job.cleanup).toBe("done");expect(status.job.diagnostics[0]).toMatchObject({requestId:id,code:"model-refusal",repair:false});
 expect(status.job.sources).toBeUndefined();
});
it("keeps the source chat and privacy mode when preparation starts from its tab",async()=>{
 const f=await setup();const source={id:1,windowId:2,url:"https://chat.deepseek.com/chat/s/original",incognito:true};f.tabs.set(1,source);
 const started=await f.run({type:"DR_CAST",action:"start",worldId:"w",locale:"ru"},{id:"ours",url:source.url,tab:{id:1}});
 expect(started.ok).toBe(true);expect(f.api.windows.create).toHaveBeenCalledWith({url:"about:blank",type:"popup",focused:true,width:520,height:720,incognito:true});
 expect(f.api.windows.getLastFocused).not.toHaveBeenCalled();expect(f.tabs.get(1)).toEqual(source);expect(f.api.tabs.update).toHaveBeenCalledExactlyOnceWith(5,{url:"https://chat.deepseek.com/?deeprole_cast_job="+started.job.id+"&deeprole_cast_locale=ru"});
});
it("records popup creation failure without creating a replacement tab or sending",async()=>{
 const f=await setup();f.api.windows.create.mockRejectedValue(new Error("synthetic-window-failure"));
 expect(await f.start()).toMatchObject({ok:false,error:"tab-unavailable"});
 expect(f.api.tabs.create).not.toHaveBeenCalled();expect(f.api.tabs.update).not.toHaveBeenCalled();expect(f.api.tabs.sendMessage).not.toHaveBeenCalled();
 expect(await f.repo.list("cast")).toMatchObject([{phase:"error",error:"tab-unavailable",cleanup:"none",awaiting:false}]);
});
it("completes exact sequential turns, persists review then closes only its cleaned tab",async()=>{
 const f=await setup(),r=await f.start(),id=r.job.id,s=()=>f.worker(id);await f.run({type:"DR_CAST_WORKER",action:"sent",id,step:0},s());f.tabs.set(5,{id:5,url:"https://chat.deepseek.com/chat/s/owned"});
 expect((await f.run({type:"DR_CAST_WORKER",action:"bound",id,chatId:"owned"},s())).ok).toBe(true);
 await f.run({type:"DR_CAST_WORKER",action:"reply",id,step:0,chatId:"owned",raw:"received"},s());
 expect((await f.run({type:"DR_CAST_WORKER",action:"reply",id,step:0,chatId:"owned",raw:"received"},s())).ok).toBe(false);
 await f.run({type:"DR_CAST_WORKER",action:"sent",id,step:1},s());
 await f.run({type:"DR_CAST_WORKER",action:"reply",id,step:1,chatId:"owned",raw:JSON.stringify(castBatch(id,0))},s());
 await f.run({type:"DR_CAST_WORKER",action:"sent",id,step:2},s());
 await f.run({type:"DR_CAST_WORKER",action:"reply",id,step:2,chatId:"owned",raw:JSON.stringify(castBatch(id,1))},s());
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
 const f=await setup(),r=await f.start(),id=r.job.id;await browser.storage.session.clear();await mutateCastJob(id,j=>({...j,updatedAt:0}),f.repo);vi.spyOn(Date,"now").mockReturnValue(Date.now()+40000);const view=await f.run({type:"DR_CAST",action:"status",worldId:"w"});expect(view.job.phase).toBe("error");expect(view.job.error).toBe("interrupted");expect(f.api.windows.create).toHaveBeenCalledTimes(1);
});
async function finalStep() {
 const f=await setup(),r=await f.start(),id=r.job.id,s=()=>f.worker(id);
 await f.run({type:"DR_CAST_WORKER",action:"sent",id,step:0},s());f.tabs.set(5,{id:5,url:"https://chat.deepseek.com/chat/s/owned"});
 await f.run({type:"DR_CAST_WORKER",action:"bound",id,chatId:"owned"},s());
 await f.run({type:"DR_CAST_WORKER",action:"reply",id,step:0,chatId:"owned",raw:"received"},s());
 await f.run({type:"DR_CAST_WORKER",action:"sent",id,step:1},s());
 await f.run({type:"DR_CAST_WORKER",action:"reply",id,step:1,chatId:"owned",raw:JSON.stringify(castBatch(id,0))},s());
 await f.run({type:"DR_CAST_WORKER",action:"sent",id,step:2},s());
 const message={type:"DR_CAST_WORKER",action:"checkpoint",id,step:2,repair:false,chatId:"owned",replyIdentity:JSON.stringify(["message","r2"]),raw:JSON.stringify(castBatch(id,1))};
 return {...f,id,s,message};
}
it("authorizes only the exact bound worker chat and rejects subframes", async () => {
 const f = await finalStep(), message = { type: "DR_CAST_WORKER", action: "authorize-cleanup", id: f.id, chatId: "owned" };
 expect(await f.run(message, { ...f.s(), frameId: 2 } as any)).toMatchObject({ ok: false, error: "unowned-tab" });
 expect(await f.run({ ...message, chatId: "personal" }, f.s())).toMatchObject({ ok: false, error: "chat-changed" });
 f.tabs.set(5, { id: 5, url: "https://chat.deepseek.com/chat/s/personal" });
 expect(await f.run(message, f.s())).toMatchObject({ ok: false, error: "chat-changed" }); expect(f.api.tabs.remove).not.toHaveBeenCalled();
 f.tabs.set(5, { id: 5, url: "https://chat.deepseek.com/chat/s/owned" });
 expect(await f.run(message, f.s())).toMatchObject({ ok: true, chatId: "owned" });
 expect(await f.repo.get("cast", f.id)).toMatchObject({ phase: "error", error: "interrupted" });
});
for (const storageFailure of [false, true]) it(`audits exact validation attempts even without a phase change, diagnostic write failure=${storageFailure}`, async () => {
 const f = await setup(), r = await f.start(), id = r.job.id, send = (value: any) => f.run({ type: "DR_CAST_WORKER", id, ...value }, f.worker(id));
 await send({ action: "sent", step: 0 }); f.tabs.set(5, { id: 5, url: "https://chat.deepseek.com/chat/s/owned" }); await send({ action: "bound", chatId: "owned" });
 await send({ action: "reply", step: 0, chatId: "owned", raw: "received" }); await send({ action: "sent", step: 1 });
 const invalid = castBatch(id, 0); invalid.characters[0]!.evidence[0]!.quote = "PRIVATE_INVALID_QUOTE";
 const write = f.repo.updateRecords.bind(f.repo); let broken = storageFailure;
 vi.spyOn(f.repo, "updateRecords").mockImplementation((...args: Parameters<typeof write>) => broken && args[2]?.length === 2 && args[2].includes("service") && args[2].includes("cast") ? Promise.reject(new Error("PRIVATE_DISK")) : write(...args));
 expect((await send({ action: "reply", step: 1, chatId: "owned", raw: JSON.stringify(invalid) })).ok).toBe(true);
 expect(await f.repo.get("cast", id)).toMatchObject({ phase: "analyzing", repair: true });
 expect(await f.repo.get("service", id)).toMatchObject({ phase: "dispatching", cleanup: "pending" });
 if (storageFailure) expect((await f.repo.get<any>("service", id))!.validation).toBeUndefined();
 broken = false; await f.coordinator.reconcilePending();
 expect((await f.repo.get<any>("service", id))!.validation.events).toMatchObject([{ repair: false, issues: [{ path: "characters[0].evidence[0].quote", rule: "exact substring of source text" }] }]);
 await send({ action: "sent", step: 1, repair: true }); await send({ action: "reply", step: 1, repair: true, chatId: "owned", raw: JSON.stringify(castBatch(id, 0)) });
 await send({ action: "sent", step: 2 }); await send({ action: "reply", step: 2, chatId: "owned", raw: JSON.stringify(castBatch(id, 1)) });
 f.tabs.set(5, { id: 5, url: "https://chat.deepseek.com/" }); await send({ action: "cleaned", chatId: "owned", ok: true });
 await f.repo.delete("cast", id); await browser.storage.session.clear(); await new CastCoordinator(f.repo, f.api).reconcilePending();
 const journal = await f.repo.get<any>("service", id); expect(journal).toMatchObject({ contractVersion: 2, phase: "result", cleanup: "done", error: null }); expect(journal.validation.events).toHaveLength(1);
 expect(JSON.stringify(journal.validation)).not.toContain("PRIVATE"); expect(f.api.windows.create).toHaveBeenCalledTimes(1); expect(f.api.tabs.remove).toHaveBeenCalledExactlyOnceWith(5); expect(await f.repo.list("entity")).toEqual([]);
});
it("cleans while locked, then delivers the outcome to the existing job after session loss", async () => {
 const f = await finalStep(); const before = (await f.repo.rawRecords()).filter(r => r.kind !== "cast" && r.kind !== "service");
 await f.repo.enableVault("synthetic-password"); await f.repo.lockVault();
 const restarted = new CastCoordinator(f.repo, f.api), run = (m: any) => restarted.handle({ type: "DR_CAST_WORKER", id: f.id, ...m }, f.s()) as Promise<any>;
 expect(await run({ action: "claim" })).toMatchObject({ ok: true, cleanupOnly: true, prompt: "", phase: "error", chatId: "owned" });
 for (const message of [{ action: "sent", step: 2 }, { ...f.message, action: "reply" }, { action: "bound", chatId: "owned" }, { action: "error", error: "PRIVATE_TEXT" }]) expect(await run(message)).toMatchObject({ ok: false, error: "vault-locked" });
 expect(await run({ action: "authorize-cleanup", chatId: "owned" })).toMatchObject({ ok: true, chatId: "owned" });
 f.tabs.set(5, { id: 5, url: "https://chat.deepseek.com/" });
 expect(await run({ action: "cleaned", chatId: "owned", ok: true })).toMatchObject({ ok: true });
 expect(f.api.tabs.remove).toHaveBeenCalledExactlyOnceWith(5); await restarted.removed(5);
 const pending = Object.entries(await browser.storage.local.get()).filter(([key]) => key.startsWith(SERVICE_OUTBOX_PREFIX));
 expect(pending).toHaveLength(1); expect(pending[0]![1]).toMatchObject({ phase: "failed", error: "vault-locked", cleanup: "done" });
 expect(JSON.stringify(pending)).not.toMatch(/PRIVATE|Leon|Mira|owned|worldId|chatId|sources|signature/u);
 expect(JSON.stringify(await browser.storage.session.get())).not.toMatch(/PRIVATE|Leon|Mira|sources|signature|raw/u);
 await browser.storage.session.clear(); await f.repo.unlockVault("synthetic-password");
 const next = new CastCoordinator(f.repo, f.api); await next.reconcilePending();
 const job = await f.repo.get<CastJob>("cast", f.id); expect(job).toMatchObject({ phase: "error", error: "vault-locked", cleanup: "done", awaiting: false }); expect(job?.draft?.characters).toHaveLength(1);
 const once = await f.repo.rawRecords(); await next.reconcilePending(); expect(await f.repo.rawRecords()).toEqual(once);
 expect(once.filter(r => r.kind !== "cast" && r.kind !== "service")).toEqual(before); expect(f.api.windows.create).toHaveBeenCalledTimes(1); expect(f.api.tabs.sendMessage).not.toHaveBeenCalled();
});
for (const partial of [false, true]) it(`preserves ${partial ? "partial" : "complete"} profiles through locked cleanup`, async () => {
 const f = await finalStep(), raw = partial ? JSON.stringify({ ...castDraft(f.id), characters: [castDraft(f.id).characters[1]], partial: true }) : f.message.raw;
 await f.run({ ...f.message, action: "reply", raw }, f.s()); const before = await f.repo.get<CastJob>("cast", f.id);
 await f.repo.enableVault("synthetic-password"); await f.repo.lockVault(); await f.coordinator.cancelLocked();
 expect(await f.run({ type: "DR_CAST_WORKER", action: "authorize-cleanup", id: f.id, chatId: "owned" }, f.s())).toMatchObject({ ok: true });
 f.tabs.set(5, { id: 5, url: "https://chat.deepseek.com/" }); await f.run({ type: "DR_CAST_WORKER", action: "cleaned", id: f.id, chatId: "owned", ok: true }, f.s());
 await browser.storage.session.clear(); await f.repo.unlockVault("synthetic-password"); await new CastCoordinator(f.repo, f.api).reconcilePending();
 expect(await f.repo.get("cast", f.id)).toMatchObject({ phase: before!.phase, draft: before!.draft, cleanup: "done", ...(partial ? { error: "partial-reply" } : {}) });
 expect(await f.repo.get("service", f.id)).toMatchObject({ phase: partial ? "failed" : "result", error: partial ? "partial-reply" : null, cleanup: "done" }); expect(await f.repo.list("entity")).toEqual([]);
});
it("does not declare a closed locked worker's native chat deleted", async () => {
 const f = await finalStep(); await f.repo.enableVault("synthetic-password"); await f.repo.lockVault(); f.tabs.delete(5);
 await f.coordinator.removed(5); await f.repo.unlockVault("synthetic-password"); await new CastCoordinator(f.repo, f.api).reconcilePending();
 expect(await f.repo.get("cast", f.id)).toMatchObject({ phase: "error", error: "tab-closed", cleanup: "failed" });
 expect(await f.repo.get("service", f.id)).toMatchObject({ phase: "failed", cleanup: "failed", workerChatId: "owned" }); expect(f.api.tabs.remove).not.toHaveBeenCalled();
});
it("keeps only validated checkpoint profiles when locked cleanup interrupts a batch", async () => {
 const f = await finalStep(); await f.run(f.message, f.s()); await f.repo.enableVault("synthetic-password"); await f.repo.lockVault();
 f.tabs.set(5, { id: 5, url: "https://chat.deepseek.com/" }); await f.run({ type: "DR_CAST_WORKER", action: "cleaned", id: f.id, chatId: "owned", ok: true }, f.s());
 await browser.storage.session.clear(); await f.repo.unlockVault("synthetic-password"); await new CastCoordinator(f.repo, f.api).reconcilePending();
 expect(await f.repo.get("cast", f.id)).toMatchObject({ phase: "error", error: "vault-locked", cleanup: "done", awaiting: false });
 expect((await f.repo.get<CastJob>("cast", f.id))?.draft?.characters).toHaveLength(2); expect(await f.repo.list("entity")).toEqual([]);
});
it("rejects locked cleanup if ownership was lost or the native chat was never bound", async () => {
 const f = await setup(), r = await f.start(), id = r.job.id; await f.repo.enableVault("synthetic-password"); await f.repo.lockVault();
 f.tabs.set(5, { id: 5, url: "https://chat.deepseek.com/chat/s/personal" });
 expect(await f.run({ type: "DR_CAST_WORKER", action: "authorize-cleanup", id, chatId: "personal" }, f.worker(id))).toMatchObject({ ok: false, error: "chat-changed" });
 await browser.storage.session.clear(); expect(await f.run({ type: "DR_CAST_WORKER", action: "authorize-cleanup", id, chatId: "personal" }, f.worker(id))).toMatchObject({ ok: false, error: "unowned-tab" });
 expect(f.api.tabs.remove).not.toHaveBeenCalled(); expect(f.api.tabs.sendMessage).not.toHaveBeenCalled();
});
it("does not authorize deletion before the session cleanup marker is saved", async () => {
 const f = await finalStep(); await f.repo.enableVault("synthetic-password"); await f.repo.lockVault();
 vi.spyOn(browser.storage.session, "set").mockRejectedValue(new Error("synthetic-session-failure"));
 expect(await f.run({ type: "DR_CAST_WORKER", action: "authorize-cleanup", id: f.id, chatId: "owned" }, f.s())).toMatchObject({ ok: false }); expect(f.api.tabs.remove).not.toHaveBeenCalled();
});
it("retains the cleanup marker when the persistent queue is unavailable while locked", async () => {
 const f = await finalStep(); await f.repo.enableVault("synthetic-password"); await f.repo.lockVault();
 const localWrite = browser.storage.local.set.bind(browser.storage.local), fail = vi.spyOn(browser.storage.local, "set").mockImplementation(async values => { if (Object.keys(values).some(key => key.startsWith(SERVICE_OUTBOX_PREFIX))) throw new Error("synthetic-queue-failure"); await localWrite(values); });
 f.tabs.set(5, { id: 5, url: "https://chat.deepseek.com/" });
 expect(await f.run({ type: "DR_CAST_WORKER", action: "cleaned", id: f.id, chatId: "owned", ok: true }, f.s())).toMatchObject({ ok: false, error: "service-outbox-unavailable" });
 expect(f.api.tabs.remove).not.toHaveBeenCalled(); expect(JSON.stringify(await browser.storage.session.get())).toContain('"cleanup":"done"');
 fail.mockRestore(); await f.repo.unlockVault("synthetic-password"); await new CastCoordinator(f.repo, f.api).reconcilePending();
 expect(await f.repo.get("cast", f.id)).toMatchObject({ phase: "error", cleanup: "done", error: "vault-locked" });
});
it("retries delivery from the committed journal after the job write fails and the queue is gone", async () => {
 const f = await finalStep(); await f.repo.enableVault("synthetic-password"); await f.repo.lockVault();
 f.tabs.set(5, { id: 5, url: "https://chat.deepseek.com/" }); await f.run({ type: "DR_CAST_WORKER", action: "cleaned", id: f.id, chatId: "owned", ok: true }, f.s());
 await browser.storage.session.clear(); await f.repo.unlockVault("synthetic-password");
 const write = f.repo.updateRecords.bind(f.repo), fail = vi.spyOn(f.repo, "updateRecords").mockImplementation((...args: Parameters<typeof write>) => args[2]?.includes("cast") ? Promise.reject(new Error("synthetic-job-failure")) : write(...args));
 await expect(new CastCoordinator(f.repo, f.api).reconcilePending()).rejects.toThrow("synthetic-job-failure");
 expect(Object.keys(await browser.storage.local.get()).filter(key => key.startsWith(SERVICE_OUTBOX_PREFIX))).toHaveLength(0);
 expect(await f.repo.get("service", f.id)).toMatchObject({ cleanup: "done", phase: "failed" });
 fail.mockRestore(); await new CastCoordinator(f.repo, f.api).reconcilePending(); expect(await f.repo.get("cast", f.id)).toMatchObject({ cleanup: "done", phase: "error", error: "vault-locked" });
});
it("does not deliver stale or imported audit metadata to a mismatched job", async () => {
 const f = await finalStep(), audit: any = await f.repo.get("service", f.id), outbox = new ServiceAuditOutbox(f.repo);
 await outbox.record(f.id, { phase: "failed", error: "vault-locked", cleanup: "done", workerChatId: "owned", at: Date.now() });
 const terminal: any = await f.repo.get("service", f.id), before = await f.repo.get("cast", f.id);
 for (const patch of [{ origin: "restored" }, { worldId: "foreign" }, { createdAt: audit.createdAt - 1 }, { workerChatId: "foreign" }]) {
  await f.repo.put("service", { ...terminal, ...patch }); await new CastCoordinator(f.repo, f.api).reconcilePending(); expect(await f.repo.get("cast", f.id)).toEqual(before);
 }
 await f.repo.delete("cast", f.id); await f.repo.put("service", terminal); await new CastCoordinator(f.repo, f.api).reconcilePending(); expect(await f.repo.get("cast", f.id)).toBeNull();
 expect(f.api.windows.create).toHaveBeenCalledTimes(1); expect(await f.repo.list("entity")).toEqual([]);
});
for (const flushBeforeReconcile of [false, true]) it(`recovers an exact binding from the protected job after failed audit writes${flushBeforeReconcile ? " and early queue drain" : ""}`, async () => {
 const f = await setup(), r = await f.start(), id = r.job.id; await f.run({ type: "DR_CAST_WORKER", action: "sent", id, step: 0 }, f.worker(id));
 const write = f.repo.updateRecords.bind(f.repo), fail = vi.spyOn(f.repo, "updateRecords").mockImplementation((...args: Parameters<typeof write>) => args[2]?.length === 1 && args[2][0] === "service" ? Promise.reject(new Error("synthetic-audit-failure")) : write(...args));
 f.tabs.set(5, { id: 5, url: "https://chat.deepseek.com/chat/s/owned" }); await f.run({ type: "DR_CAST_WORKER", action: "bound", id, chatId: "owned" }, f.worker(id));
 expect(await f.repo.get("service", id)).toMatchObject({ workerChatId: null });
 await f.repo.enableVault("synthetic-password"); await f.repo.lockVault(); f.tabs.set(5, { id: 5, url: "https://chat.deepseek.com/" });
 await f.run({ type: "DR_CAST_WORKER", action: "cleaned", id, chatId: "owned", ok: true }, f.worker(id)); await browser.storage.session.clear(); await f.repo.unlockVault("synthetic-password"); fail.mockRestore();
 if (flushBeforeReconcile) { await new ServiceAuditOutbox(f.repo).flush(); expect(await f.repo.get("service", id)).toMatchObject({ workerChatId: null, cleanup: "done" }); }
 await new CastCoordinator(f.repo, f.api).reconcilePending();
 expect(await f.repo.get("service", id)).toMatchObject({ workerChatId: "owned", cleanup: "done", phase: "failed", error: "vault-locked" }); expect(await f.repo.get("cast", id)).toMatchObject({ cleanup: "done", phase: "error", error: "vault-locked" });
 expect(f.api.windows.create).toHaveBeenCalledTimes(1); expect(await f.repo.list("entity")).toEqual([]);
});
it("never changes applied profiles or manual edits when delivering locked partial cleanup", async () => {
 const f = await finalStep(); await f.run({ ...f.message, action: "reply", raw: JSON.stringify({ ...castDraft(f.id), characters: [castDraft(f.id).characters[1]], partial: true }) }, f.s());
 const job = await f.repo.get<CastJob>("cast", f.id); expect(await f.run({ type: "DR_CAST", action: "apply", id: f.id, draft: job!.draft, selected: ["p1", "p2"], hero: "p1" })).toMatchObject({ ok: true, count: 2 });
 const entity: any = (await f.repo.list("entity"))[0]; await f.repo.put("entity", { ...entity, characterSheet: { ...entity.characterSheet, appearance: "Manual coat after saving" } });
 const before = (await f.repo.rawRecords()).filter(r => r.kind !== "cast" && r.kind !== "service");
 await f.repo.enableVault("synthetic-password"); await f.repo.lockVault(); f.tabs.set(5, { id: 5, url: "https://chat.deepseek.com/" }); await f.run({ type: "DR_CAST_WORKER", action: "cleaned", id: f.id, chatId: "owned", ok: true }, f.s());
 await browser.storage.session.clear(); await f.repo.unlockVault("synthetic-password"); await new CastCoordinator(f.repo, f.api).reconcilePending();
 expect(await f.repo.get("cast", f.id)).toMatchObject({ phase: "applied", error: "partial-reply", cleanup: "done" }); expect((await f.repo.rawRecords()).filter(r => r.kind !== "cast" && r.kind !== "service")).toEqual(before);
});
it("delivers locked cleanup before accepting an explicit retry without requiring a status poll", async () => {
 const f = await finalStep(); await f.run({ ...f.message, action: "reply", raw: JSON.stringify({ ...castDraft(f.id), characters: [castDraft(f.id).characters[1]], partial: true }) }, f.s());
 await f.repo.enableVault("synthetic-password"); await f.repo.lockVault(); f.tabs.set(5, { id: 5, url: "https://chat.deepseek.com/" }); await f.run({ type: "DR_CAST_WORKER", action: "cleaned", id: f.id, chatId: "owned", ok: true }, f.s());
 await browser.storage.session.clear(); await f.repo.unlockVault("synthetic-password");
 const next = await new CastCoordinator(f.repo, f.api).handle({ type: "DR_CAST", action: "start", worldId: "w", locale: "en", retry: true }, { id: "ours", url: "chrome-extension://ours/sidepanel.html" }) as any;
 expect(next).toMatchObject({ ok: true, job: { phase: "opening" } }); expect(next.job.id).not.toBe(f.id); expect(next.job.draft.characters).toHaveLength(2); expect(f.api.windows.create).toHaveBeenCalledTimes(2);
 expect(await f.repo.get("service", f.id)).toMatchObject({ phase: "failed", error: "partial-reply", cleanup: "done" });
});
it("does not resume or accept a late reply after unlocking while job delivery still fails", async () => {
 const f = await finalStep(); await f.repo.enableVault("synthetic-password"); await f.repo.lockVault(); await f.coordinator.cancelLocked(); await f.repo.unlockVault("synthetic-password");
 const write = f.repo.updateRecords.bind(f.repo); vi.spyOn(f.repo, "updateRecords").mockImplementation((...args: Parameters<typeof write>) => args[2]?.includes("cast") ? Promise.reject(new Error("synthetic-job-failure")) : write(...args));
 const next = new CastCoordinator(f.repo, f.api); await expect(next.reconcilePending()).rejects.toThrow("synthetic-job-failure");
 expect(await next.handle({ type: "DR_CAST_WORKER", action: "claim", id: f.id }, f.s())).toMatchObject({ ok: true, cleanupOnly: true, prompt: "", phase: "error" });
 expect(await next.handle({ ...f.message, action: "reply" } as any, f.s())).toMatchObject({ ok: false, error: "stale-step" });
 expect((await f.repo.get<CastJob>("cast", f.id))?.draft?.characters).toHaveLength(1); expect(await f.repo.list("entity")).toEqual([]); expect(f.api.windows.create).toHaveBeenCalledTimes(1);
});
it("registers a cast audit before creating the temporary tab and never copies lore", async () => {
 const f = await setup(); let beforeTab: any[] = [];
 const create = f.api.windows.create.getMockImplementation(); f.api.windows.create.mockImplementation(async (value: any) => { beforeTab = await f.repo.list("service"); return create(value); });
 const r = await f.start(); expect(beforeTab).toMatchObject([{ id: r.job.id, operation: "cast-preparation", phase: "prepared", workerChatId: null, sourceChatId: null }]);
 expect(JSON.stringify(beforeTab)).not.toMatch(/Leon|Mira|protagonist|sources|signature|https:\/\//u);
});
it("records a completed cast and cleanup without applying any profiles", async () => {
 const f = await finalStep(); await f.run({ ...f.message, action: "reply" }, f.s());
 expect(await f.repo.get("service", f.id)).toMatchObject({ phase: "result", cleanup: "pending", workerChatId: "owned" });
 f.tabs.set(5, { id: 5, url: "https://chat.deepseek.com/" });
 expect(await f.run({ type: "DR_CAST_WORKER", action: "cleaned", id: f.id, chatId: "owned", ok: true }, f.s())).toMatchObject({ ok: true });
 expect(await f.repo.get("service", f.id)).toMatchObject({ phase: "result", cleanup: "done" }); expect(await f.repo.list("entity")).toEqual([]);
 const before = await f.repo.get("service", f.id); await f.run({ type: "DR_CAST", action: "status", worldId: "w" }); expect(await f.repo.get("service", f.id)).toEqual(before);
});
it("does not label a partial character batch as a complete cast", async () => {
 const f = await finalStep(); const partial = JSON.stringify({ ...castDraft(f.id), characters: [castDraft(f.id).characters[1]], partial: true });
 await f.run({ ...f.message, action: "reply", raw: partial }, f.s());
 expect(await f.repo.get("service", f.id)).toMatchObject({ phase: "failed", error: "partial-reply", cleanup: "pending" });
 expect((await f.repo.get<CastJob>("cast", f.id))?.draft?.characters).toHaveLength(2); expect(await f.repo.list("entity")).toEqual([]);
});
it("reconciles a missed journal write from the durable local job without resending", async () => {
 const f = await finalStep();
 const write = f.repo.updateRecords.bind(f.repo); const failing = vi.spyOn(f.repo, "updateRecords").mockImplementation((operation: any, scope?: any, kinds?: any) => kinds?.length === 1 && kinds[0] === "service" ? Promise.reject(new Error("synthetic-audit-failure")) : write(operation, scope, kinds));
 await f.run({ ...f.message, action: "reply" }, f.s()); expect((await f.repo.get<CastJob>("cast", f.id))?.phase).toBe("ready");
 const pending = Object.entries(await browser.storage.local.get()).filter(([key]) => key.startsWith(SERVICE_OUTBOX_PREFIX)); expect(pending).toHaveLength(1); expect(JSON.stringify(pending)).not.toMatch(/Leon|Mira|owned|sources|signature|worldId|chatId/u);
 failing.mockRestore(); await browser.storage.session.clear();
 await new CastCoordinator(f.repo, f.api).reconcilePending(); expect(await f.repo.get("service", f.id)).toMatchObject({ phase: "result", workerChatId: "owned" });
 expect(f.api.windows.create).toHaveBeenCalledTimes(1); expect(f.api.tabs.sendMessage).not.toHaveBeenCalled(); expect(await f.repo.list("entity")).toEqual([]);
});
it("keeps a durable job when both audit stores fail and reconciles it later", async () => {
 const f = await finalStep(), write = f.repo.updateRecords.bind(f.repo);
 const failing = vi.spyOn(f.repo, "updateRecords").mockImplementation((operation: any, scope?: any, kinds?: any) => kinds?.length === 1 && kinds[0] === "service" ? Promise.reject(new Error("synthetic-audit-failure")) : write(operation, scope, kinds));
 const localWrite = browser.storage.local.set.bind(browser.storage.local);
 const queue = vi.spyOn(browser.storage.local, "set").mockImplementation(async values => { if (Object.keys(values).some(key => key.startsWith(SERVICE_OUTBOX_PREFIX))) throw new Error("synthetic-queue-failure"); await localWrite(values); });
 await f.run({ ...f.message, action: "reply" }, f.s()); expect((await f.repo.get<CastJob>("cast", f.id))?.phase).toBe("ready");
 failing.mockRestore(); queue.mockRestore(); await browser.storage.session.clear(); await new CastCoordinator(f.repo, f.api).reconcilePending();
 expect(await f.repo.get("service", f.id)).toMatchObject({ phase: "result" }); expect(f.api.windows.create).toHaveBeenCalledTimes(1); expect(await f.repo.list("entity")).toEqual([]);
});
it("does not reopen a previously stored active job after ownership loss", async () => {
 const f = await setup(), r = await f.start(); await f.run({ type: "DR_CAST_WORKER", action: "sent", id: r.job.id, step: 0 }, f.worker(r.job.id)); await browser.storage.session.clear();
 const again = await new CastCoordinator(f.repo, f.api).handle({ type: "DR_CAST", action: "start", worldId: "w", locale: "en" }, { id: "ours", url: "chrome-extension://ours/sidepanel.html" }) as any;
 expect(again).toMatchObject({ ok: true, job: { phase: "error", error: "interrupted", cleanup: "failed" } }); expect(f.api.windows.create).toHaveBeenCalledTimes(1);
 expect(await f.repo.get("service", r.job.id)).toMatchObject({ phase: "failed", error: "interrupted" });
});
it("does not revive cast audits after world purge or backup restore", async () => {
 const f = await setup(), r = await f.start(), id = r.job.id; const backup = await parseBackup(JSON.stringify(await createBackup(undefined, f.repo)));
 expect(backup.version).toBe(3); expect(backup.records.some(row => row.kind === "cast")).toBe(false);
 await removeWorld("w", f.repo, { deleteLore: true }); await f.coordinator.reconcilePending(); expect(await f.repo.get("service", id)).toBeNull();
 await restoreBackup(backup, "replace", f.repo); expect(await f.repo.get("service", id)).toMatchObject({ origin: "restored" });
 await f.coordinator.reconcilePending(); expect(await f.repo.get("service", id)).toMatchObject({ origin: "restored", phase: "prepared" }); expect(f.api.windows.create).toHaveBeenCalledTimes(1);
});
it("never closes a chat reached during the cleanup journal write", async () => {
 const f = await finalStep(); await f.run({ ...f.message, action: "reply" }, f.s()); f.tabs.set(5, { id: 5, url: "https://chat.deepseek.com/" });
 const write = f.repo.updateRecords.bind(f.repo); vi.spyOn(f.repo, "updateRecords").mockImplementation(async (...args: Parameters<typeof write>) => { const result = await write(...args); f.tabs.set(5, { id: 5, url: "https://chat.deepseek.com/chat/s/personal" }); return result; });
 await f.run({ type: "DR_CAST_WORKER", action: "cleaned", id: f.id, chatId: "owned", ok: true }, f.s()); expect(f.api.tabs.remove).not.toHaveBeenCalled(); expect(f.tabs.get(5).url).toContain("personal");
});
it("requires a removed owned chat before accepting cleanup success", async () => {
 const f = await finalStep(); const before = await f.repo.get("service", f.id);
 expect(await f.run({ type: "DR_CAST_WORKER", action: "cleaned", id: f.id, chatId: "owned", ok: true }, f.s())).toMatchObject({ ok: false, error: "chat-changed" });
 expect(await f.repo.get("service", f.id)).toEqual(before); expect(f.api.tabs.remove).not.toHaveBeenCalled();
});
it("does not create a worker when its service registration cannot be saved", async () => {
 const f = await setup(), write = f.repo.updateRecords.bind(f.repo);
 vi.spyOn(f.repo, "updateRecords").mockImplementation((operation: any, scope?: any, kinds?: any) => kinds?.includes("service") ? Promise.reject(new Error("synthetic-registration-failure")) : write(operation, scope, kinds));
 expect(await f.start()).toMatchObject({ ok: false, error: "interrupted" }); expect(f.api.windows.create).not.toHaveBeenCalled();
 expect(await f.repo.list("service")).toEqual([]); expect(await f.repo.list("cast")).toMatchObject([{ phase: "error", error: "interrupted" }]);
});
it("keeps encrypted cast metadata through lock/reopen without retaining draft text", async () => {
 const f = await finalStep(); await f.run({ ...f.message, action: "reply" }, f.s()); await f.repo.enableVault("synthetic-password"); await f.repo.lockVault();
 await expect(f.repo.get("service", f.id)).rejects.toThrow(); await browser.storage.session.clear();
 await new CastCoordinator(f.repo, f.api).reconcilePending(); await f.repo.unlockVault("synthetic-password");
 const backup = await parseBackup(JSON.stringify(await createBackup("synthetic-backup", f.repo)), "synthetic-backup");
 const metadata = backup.records.filter(r => r.kind === "service"); expect(metadata).toMatchObject([{ data: { phase: "result", operation: "cast-preparation" } }]);
 expect(JSON.stringify(metadata)).not.toMatch(/Leon|Mira|sources|draft|https:\/\//u); expect(f.api.windows.create).toHaveBeenCalledTimes(1); expect(await f.repo.list("entity")).toEqual([]);
});
it("does not backfill a legacy cast task with an invented service operation", async () => {
 const f = await setup(), r = await f.start(); await f.repo.delete("service", r.job.id); await browser.storage.session.clear();
 await new CastCoordinator(f.repo, f.api).reconcilePending(); expect(await f.repo.list("service")).toEqual([]); expect(f.api.windows.create).toHaveBeenCalledTimes(1);
});
it("does not close a foreign tab if navigation fails during initial setup", async () => {
 const f = await setup(); f.api.tabs.update.mockImplementation(async (tabId: number) => { f.tabs.set(tabId, { id: tabId, url: "https://chat.deepseek.com/chat/s/personal" }); throw new Error("synthetic-navigation-failure"); });
 expect(await f.start()).toMatchObject({ ok: false, error: "tab-unavailable" }); expect(f.api.tabs.remove).not.toHaveBeenCalled();
 expect(await f.repo.list("service")).toMatchObject([{ phase: "failed", cleanup: "failed", error: "tab-unavailable" }]);
});
it("rechecks the tab before closing after its cast job was deleted", async () => {
 const f = await finalStep(); await f.repo.delete("cast", f.id); f.tabs.set(5, { id: 5, url: "https://chat.deepseek.com/" });
 const get = f.api.tabs.get.getMockImplementation(); let rootReads = 0;
 f.api.tabs.get.mockImplementation(async (tabId: number) => { if (++rootReads >= 3) f.tabs.set(tabId, { id: tabId, url: "https://chat.deepseek.com/chat/s/personal" }); return get(tabId); });
 await f.run({ type: "DR_CAST_WORKER", action: "cleaned", id: f.id, chatId: "owned", ok: true }, f.s()); expect(f.api.tabs.remove).not.toHaveBeenCalled();
});
it("retains a tab-creation error in the queue even when the job write also fails", async () => {
 const f = await setup(), write = f.repo.updateRecords.bind(f.repo); let broken = false;
 const failure = vi.spyOn(f.repo, "updateRecords").mockImplementation((...args: Parameters<typeof write>) => broken ? Promise.reject(new Error("synthetic-repository-failure")) : write(...args));
 f.api.windows.create.mockImplementation(async () => { broken = true; throw new Error("synthetic-tab-failure"); });
 expect(await f.start()).toMatchObject({ ok: false, error: "tab-unavailable" });
 const pending = Object.entries(await browser.storage.local.get()).filter(([key]) => key.startsWith(SERVICE_OUTBOX_PREFIX)); expect(pending).toHaveLength(1);
 expect(JSON.stringify(pending)).not.toMatch(/synthetic|Leon|Mira|worldId|chatId/u); failure.mockRestore(); await browser.storage.session.clear();
 await new CastCoordinator(f.repo, f.api).reconcilePending(); expect(await f.repo.list("service")).toMatchObject([{ phase: "failed", error: "tab-unavailable", cleanup: "done" }]); expect(f.api.windows.create).toHaveBeenCalledTimes(1);
});
it("checkpoints only validated final data, survives a worker restart and excludes it from UI views",async()=>{
 const f=await finalStep();expect((await f.run(f.message,f.s())).ok).toBe(true);
 const claim=await new CastCoordinator(f.repo,f.api).handle({type:"DR_CAST_WORKER",action:"claim",id:f.id},f.s()) as any;
 expect(claim.replyCheckpoint.raw).toBe(f.message.raw);expect(claim.awaiting).toBe(true);
 expect((await f.run({type:"DR_CAST",action:"status",worldId:"w"})).job.replyCheckpoint).toBeUndefined();
 expect(JSON.stringify(await browser.storage.session.get())).not.toContain("Leon");expect(await f.repo.list("entity")).toEqual([]);
 await f.run({...f.message,action:"reply"},f.s());expect((await f.repo.get<CastJob>("cast",f.id))!.replyCheckpoint).toBeUndefined();
});
it("keeps validated partial checkpoints and earlier scene references when the owned tab closes", async () => {
 const f=await finalStep(), d=castDraft(f.id);
 const partial=JSON.stringify({...d,characters:[d.characters[1]],partial:true});
 expect((await f.run({...f.message,raw:partial},f.s())).ok).toBe(true);
 await f.coordinator.removed(5);
 const job=await f.repo.get<CastJob>("cast",f.id);
 expect(job?.phase).toBe("error");expect(job?.draft?.characters).toHaveLength(2);
 expect(job?.draft?.present).toEqual(["p1","p2"]);
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
 await browser.storage.session.clear();const before=(await f.repo.rawRecords()).filter(r=>r.kind!=="cast"&&r.kind!=="service");
 expect((await f.run({type:"DR_CAST",action:"hide",id})).ok).toBe(true);
 const reloaded=new CastCoordinator(f.repo,f.api);expect(await reloaded.handle({type:"DR_CAST",action:"status",worldId:"w"},{id:"ours",url:"chrome-extension://ours/sidepanel.html"})).toMatchObject({ok:true,job:{statusHidden:true,cleanup:"failed",phase:"error",draft:castDraft(id)}});
 expect((await f.repo.rawRecords()).filter(r=>r.kind!=="cast"&&r.kind!=="service")).toEqual(before);expect(f.api.tabs.sendMessage).not.toHaveBeenCalled();expect(f.api.tabs.remove).not.toHaveBeenCalled();
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
 f.tabs.set(5,{id:5,url:"https://chat.deepseek.com/chat/s/personal"});const before=(await f.repo.rawRecords()).filter(r=>r.kind!=="cast"&&r.kind!=="service");
 expect((await f.run({type:"DR_CAST",action:"confirm-cleanup",id})).ok).toBe(true);
 expect(await f.repo.get<CastJob>("cast",id)).toMatchObject({cleanup:"done",phase:"error",draft:castDraft(id)});
 expect((await f.repo.rawRecords()).filter(r=>r.kind!=="cast"&&r.kind!=="service")).toEqual(before);expect(f.api.tabs.sendMessage).not.toHaveBeenCalled();expect(f.api.tabs.remove).not.toHaveBeenCalled();expect(f.tabs.get(5).url).toContain("/personal");
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
 expect(f.api.tabs.update).toHaveBeenCalledExactlyOnceWith(5,{active:true});expect(f.api.tabs.create).not.toHaveBeenCalled();expect(f.api.tabs.sendMessage).toHaveBeenCalledExactlyOnceWith(5,{type:"DR_CAST_REVEAL"});
 expect(f.api.tabs.remove).not.toHaveBeenCalled();
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
