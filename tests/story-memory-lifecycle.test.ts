import "fake-indexeddb/auto";
import { afterEach,expect,it } from "vitest";
import { lifecycleFixture,taskFact } from "./fixtures/story-lifecycle";
import { validStoryFact,compactStoryFacts,parseStoryUpdate,type StoryFact } from "../src/core/story-update";
import { storyAutomationInstruction,factAutomationReason } from "../src/core/story-automation";
import { storyFactContext } from "../src/core/story-fact-context";
import { assertStoryGraph,type StoryRecord } from "../src/core/story-records";
import { readStoryReview } from "../src/storage/story-review";
import { storyFactIdentity } from "../src/core/story-memory-lifecycle";
import { resolveAutomationReview } from "../src/storage/story-automation-review";
import { createBackup,parseBackup,restoreBackup } from "../src/storage/backup";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { batchReply } from "./fixtures/story-memory-batch";
import { applyMemoryBatch } from "../src/storage/story-memory-batch";
const dbs:DeepRoleDatabase[]=[];
afterEach(async()=>{await Promise.all(dbs.splice(0).map(d=>d.delete()))});
async function setup(){const f=await lifecycleFixture();dbs.push(f.db);return f}
const state=(text:string,value:string,transition?:"progress"|"correction"):StoryFact=>({text,quote:text,kind:"event",claim:{key:"gate.state",value,scope:"state",...(transition?{transition}:{})}});
it("lexical similarity cannot hide a semantic conflict or swallow explicit mutable progress",()=>{
 const before=state("The large decorated northern main gate is open.","open"),after=state("The large decorated northern main gate is closed.","closed","progress");
 expect(factAutomationReason(after,"ordinary",[before],[])).toBe("new");
 const {claim:a,...withoutA}=before,{claim:b,...withoutB}=after;
 expect(a).toBeDefined();expect(b).toBeDefined();expect(factAutomationReason(withoutB,"conflict",[withoutA],[])).toBe("conflict");
});
it("accepts legacy facts, strictly validates tasks, and never accepts model-authored replacements",()=>{
 expect(validStoryFact({text:"Found it.",quote:"Found it.",kind:"event"})).toBe(true);
 const f=taskFact("Mira will repair the gate.");expect(validStoryFact({...f,risk:undefined})).toBe(false);
 const {risk,...clean}=f;expect(validStoryFact(clean)).toBe(true);
 for(const patch of [{task:{...clean.task,status:"unknown"}},{kind:"event"},{claim:{key:"x",value:"x",scope:"state"}}])expect(validStoryFact({...clean,...patch})).toBe(false);
 const source="Mira will repair the gate.";
 const reply=source+'<deeprole_characters>'+JSON.stringify({world:"world-a",chat:"chat-a",facts:[{...f,replaces:["bad"]}]})+'</deeprole_characters>';
 expect(parseStoryUpdate(reply,{world:"world-a",chat:"chat-a",branch:"branch-a",base:"x",entities:[]}).facts).toEqual([]);
});
it.each(["completed","cancelled"] as const)("opens a promise then %s only on an explicit selected event, with no duplicate on reload",async status=>{
 const f=await setup();await f.send([taskFact("Mira will repair the gate.")]);expect((await f.world()).sharedGame!.facts[0]!.task?.status).toBe("open");
 await f.send([taskFact(status==="completed"?"Mira repaired the gate.":"Mira cancelled the gate repair.",status)]);
 expect((await f.world()).sharedGame!.facts).toHaveLength(1);expect((await f.world()).sharedGame!.facts[0]!.task?.status).toBe(status);expect((await f.review()).total).toBe(0);
 const before=await f.repo.rawRecords();await f.play();f.db.close();await f.db.open();await f.play();expect(await f.repo.rawRecords()).toEqual(before);assertStoryGraph(before);
});
it("future fulfillment, unknown tasks, renamed obligations and reopening never auto-close or replace",async()=>{
 const f=await setup();await f.send([taskFact("Mira will repair the gate.")]);
 await f.send([taskFact("Mira promises to repair the gate.","completed")]);expect((await f.world()).sharedGame!.facts[0]!.task?.status).toBe("open");expect((await f.review()).total).toBe(1);await f.resolve(false);
 await f.send([taskFact("Mira has not repaired the gate.","completed")]);expect((await f.world()).sharedGame!.facts[0]!.task?.status).toBe("open");expect((await f.review()).total).toBe(1);await f.resolve(false);
 await f.send([taskFact("Mira says she repaired the gate.","completed")]);expect((await f.world()).sharedGame!.facts[0]!.task?.status).toBe("open");expect((await f.review()).total).toBe(1);await f.resolve(false);
 await f.send([taskFact("Mira repaired the gate.","completed","foreign")]);expect((await f.review()).total).toBe(1);await f.resolve(false);
 await f.send([taskFact("Mira completed a different task.","completed","mira.gate","find the key")]);expect((await f.review()).items[0]!.reason).toBe("conflict");await f.resolve(false);
 await f.send([taskFact("Mira repaired the gate.","completed")]);await f.send([taskFact("Mira will repair the gate again.")]);expect((await f.world()).sharedGame!.facts[0]!.task?.status).toBe("completed");expect((await f.review()).total).toBe(1);
});
it("distinct tasks for one person stay separate and do not complete each other",async()=>{
 const f=await setup();await f.send([taskFact("Mira will repair the gate."),taskFact("Mira will find the key.","open","mira.key","find the key")]);
 await f.send([taskFact("Mira repaired the gate.","completed")]);const facts=(await f.world()).sharedGame!.facts;expect(facts).toHaveLength(2);expect(facts.find(x=>x.task?.key==="mira.key")?.task?.status).toBe("open");
});
it("alternative selection removes completion and restores the original open task",async()=>{
 const f=await setup(),open=await f.send([taskFact("Mira will repair the gate.")]),done=await f.send([taskFact("Mira repaired the gate.","completed")]);
 f.snapshot.selectedNativeKey=open;await f.play();expect((await f.world()).sharedGame!.facts[0]!.task?.status).toBe("open");
 f.snapshot.selectedNativeKey=done;await f.play();expect((await f.world()).sharedGame!.facts[0]!.task?.status).toBe("completed");assertStoryGraph(await f.repo.rawRecords());
});
it("a different mutable value without explicit progress is a conflict; a played transition is not",async()=>{
 const f=await setup();await f.send([{...state("The gate is open.","open"),risk:"ordinary"}]);await f.send([{...state("The gate is closed.","closed"),risk:"ordinary"}]);
 expect((await f.world()).sharedGame!.facts[0]!.claim?.value).toBe("open");const page=await f.review();expect(page.items[0]!.conflicts?.[0]?.text).toBe("The gate is open.");
 await f.resolve(false);await f.send([{...state("Mira closed the gate.","closed","progress"),risk:"ordinary"}]);expect((await f.world()).sharedGame!.facts[0]!.claim?.value).toBe("closed");
});
it("human replacement removes only selected prior memory, keeps source records, and follows undo",async()=>{
 const f=await setup(),old=await f.send([{text:"The red key opens the cellar.",quote:"The red key opens the cellar.",kind:"event",risk:"ordinary"}]);
 const next=await f.send([{text:"The blue key opens the cellar.",quote:"The blue key opens the cellar.",kind:"event",risk:"conflict"}]);const p=await f.review();expect(p.items[0]!.conflicts).toHaveLength(1);
 await f.resolve(true);const w=await f.world();expect(w.sharedGame!.facts.map(f=>f.text)).toEqual(["The blue key opens the cellar."]);
 expect((await f.repo.list<StoryRecord>("story")).filter(r=>r.type==="event"&&r.memory).length).toBe(3);
 const historical=await readStoryReview({worldId:f.input.worldId,chatId:f.input.chatId,cursor:null},f.repo);expect(historical.facts?.find(f=>f.text.includes("red"))?.superseded).toBe(true);
 f.snapshot.selectedNativeKey=old;await f.play();expect((await f.world()).sharedGame!.facts[0]!.text).toContain("red");
 f.snapshot.selectedNativeKey=next;await f.play();expect((await f.world()).sharedGame!.facts[0]!.text).toContain("blue");assertStoryGraph(await f.repo.rawRecords());
});
it("rejects arbitrary replacements, stale decisions and changes from another writer",async()=>{
 const f=await setup();await f.send([{...state("The gate is open.","open"),risk:"ordinary"}]);await f.send([{...state("The gate is closed.","closed"),risk:"ordinary"}]);const p=await f.review(),input={chatId:p.chatId,worldId:p.worldId,guard:p.guard,gameRevision:p.gameRevision,eventId:p.items[0]!.id,accept:true,fields:[],entityId:null,name:"",replaceKeys:["foreign"]};
 await expect(resolveAutomationReview(input,f.repo)).rejects.toThrow("story-review-stale");await f.send([]);await expect(resolveAutomationReview({...input,replaceKeys:p.items[0]!.conflicts!.map(c=>c.key)},f.repo)).rejects.toThrow("story-review-stale");
 await f.attach();await expect(resolveAutomationReview({...input,replaceKeys:[]},f.repo)).rejects.toThrow();
});
it("tasks and resolved conflicts survive new chats, checkpoint, backup and new-game reset/undo",async()=>{
 const f=await setup();await f.send([taskFact("Mira will repair the gate.")]);await f.attach();expect((await f.world()).sharedGame!.facts[0]!.task?.status).toBe("open");
 await f.send([taskFact("Mira repaired the gate.","completed")]);await f.play("restart");expect((await f.world()).sharedGame!.facts[0]!.task?.status).toBe("completed");
 const backup=await createBackup(undefined,f.repo),parsed=await parseBackup(JSON.stringify(backup));
 const db=new DeepRoleDatabase("lifecycle-restore-"+crypto.randomUUID());dbs.push(db);const repo=new DeepRoleRepository(db);await restoreBackup(parsed,"replace",repo);
 expect((await repo.rawRecords()).find(r=>r.kind==="world")?.data).toMatchObject({sharedGame:{facts:[{task:{status:"completed"}}]}});
 await f.play("reset");expect((await f.world()).sharedGame!.facts).toEqual([]);await f.play("restore");expect((await f.world()).sharedGame!.facts[0]!.task?.status).toBe("completed");
});
it("batch parsing preserves task linkage and never resurrects an old task over a newer completion",async()=>{
 const f=await setup();await f.send([taskFact("Mira will repair the gate.")]);await f.send([taskFact("Mira repaired the gate.","completed")]);await f.send([{text:"A later scene.",quote:"A later scene.",kind:"event",risk:"ordinary"}]);const b=await f.prepare();
 await applyMemoryBatch(b,batchReply(b,p=>({facts:p.text.startsWith("Mira will")?[taskFact("Mira will repair the gate.")]:[]})),f.repo);
 expect((await f.world()).sharedGame!.facts[0]!.task?.status).toBe("completed");assertStoryGraph(await f.repo.rawRecords());
});
it("context carries open-task identity and accepted status within the same eight-fact budget",()=>{
 const task=taskFact("Mira will repair the gate.") as StoryFact,old=state("The gate is open.","open"),next={...state("The gate is closed.","closed","correction"),replaces:[storyFactIdentity(old)]};
 const facts=compactStoryFacts([old,next,task]);expect(facts).toHaveLength(2);const text=storyFactContext(facts,1000,"gate");expect(text).toContain('"status":"open"');expect(text).toContain('"key":"mira.gate"');expect(text).not.toContain('"replaces"');expect(text).not.toContain("The gate is open.");
 expect(storyFactContext(facts,0)).toBe("");expect(storyAutomationInstruction({id:"w",storyAutomation:{mode:"automatic",revision:"p"}} as any)).toContain("Optional task:");
});
