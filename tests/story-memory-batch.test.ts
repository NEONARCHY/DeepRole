import { afterEach, expect, it } from "vitest";
import { batchFixture, batchReply } from "./fixtures/story-memory-batch";
import { applyMemoryBatch, readMemoryBatch, changeMemoryBatch, finishMemoryBatch, reconcileMemoryBatch } from "../src/storage/story-memory-batch";
import { assertStoryGraph, type StoryEvent, type StoryRecord, type StoryRevision } from "../src/core/story-records";
import { MEMORY_BATCH_BYTES, validMemoryBatchPolicy } from "../src/core/story-memory-batch";
import { createBackup, restoreBackup } from "../src/storage/backup";
import { activateWorldGame } from "../src/storage/world-game";
import { exportWorld, cloneWorldPackage } from "../src/storage/worlds";
import type { DeepRoleDatabase } from "../src/storage/database";
import type { SceneEntity } from "../src/core/types";
const dbs: DeepRoleDatabase[]=[];afterEach(async()=>{await Promise.all(dbs.splice(0).map(db=>db.delete()))});
const fixture=async(n=12)=>{const f=await batchFixture(n);dbs.push(f.db);return f};
it("defaults off, explicitly enables, and only counts complete post-checkpoint turns",async()=>{
 const f=await fixture(0);expect(await readMemoryBatch(f.input,f.repo)).toMatchObject({pendingTurns:0,due:false});await f.add();
 expect(await readMemoryBatch({...f.input,force:false},f.repo)).toMatchObject({pendingTurns:1,due:false});await changeMemoryBatch(f.input,"off",f.repo);await expect(f.prepare()).rejects.toThrow("scene-changed");
 expect(validMemoryBatchPolicy({mode:"automatic",revision:"policy",extra:true})).toBe(false);
});
it("reviews 12 turns atomically, remembers gaps, and never resends after reload",async()=>{
 const f=await fixture();expect(await readMemoryBatch(f.input,f.repo)).toMatchObject({pendingTurns:12,due:true});
 const b=await f.prepare();expect(b.parts).toHaveLength(24);expect(JSON.stringify(b.parts).length).toBeLessThanOrEqual(MEMORY_BATCH_BYTES);expect(b.prompt).not.toContain("data:image");
 await applyMemoryBatch(b,batchReply(b),f.repo);expect((await f.world()).sharedGame!.facts).toHaveLength(12);
 const saved=await f.repo.rawRecords();assertStoryGraph(saved);f.db.close();await f.db.open();await f.play();expect((await f.world()).sharedGame!.facts).toHaveLength(12);
 expect(await readMemoryBatch(f.input,f.repo)).toMatchObject({pendingTurns:0,processedSources:24,due:false});await expect(applyMemoryBatch(b,batchReply(b),f.repo)).rejects.toThrow();
});
it("100 turns form bounded batches with no duplicate facts or repeat processing",async()=>{
 const f=await fixture(100);let requests=0;
 while((await readMemoryBatch(f.input,f.repo)).pendingTurns){const b=await f.prepare();await applyMemoryBatch(b,batchReply(b),f.repo);requests++;await f.play();}
 expect(requests).toBe(9);expect((await f.world()).sharedGame!.facts).toHaveLength(100);assertStoryGraph(await f.repo.rawRecords());
});
it.each(["foreign-id","missing-source","wrong-quote","incomplete"])("rejects %s without advancing receipts or memory",async(kind)=>{
 const f=await fixture(1),b=await f.prepare(),raw=JSON.parse(batchReply(b));
 if(kind==="foreign-id")raw.requestId="foreign";if(kind==="missing-source")raw.results.pop();if(kind==="wrong-quote")raw.results[1].facts[0].quote="Invented";if(kind==="incomplete")raw.results[1].complete=false;
 const before=await f.repo.rawRecords();await expect(applyMemoryBatch(b,JSON.stringify(raw),f.repo)).rejects.toThrow();expect(await f.repo.rawRecords()).toEqual(before);
});
it("interruptions become visible errors, require explicit retry, and keep unfinished positions",async()=>{
 const f=await fixture(1);await f.prepare();await reconcileMemoryBatch(f.input,new Set(),f.repo);expect(await readMemoryBatch(f.input,f.repo)).toMatchObject({reason:"failed",pendingTurns:1,due:false});await expect(f.prepare()).rejects.toThrow("busy");
 await changeMemoryBatch(f.input,"automatic",f.repo);const retry=await f.prepare();expect(retry.parts.map(p=>p.start)).toEqual([0,0]);await applyMemoryBatch(retry,batchReply(retry),f.repo);expect((await f.world()).sharedGame!.facts).toHaveLength(1);
});
it.each(["paused","off"])("late reply after %s cannot write",async(mode)=>{
 const f=await fixture(1),b=await f.prepare();await changeMemoryBatch(f.input,mode as "paused"|"off",f.repo);const before=await f.repo.rawRecords();await expect(applyMemoryBatch(b,batchReply(b),f.repo)).rejects.toThrow();expect(await f.repo.rawRecords()).toEqual(before);
});
it("branch/head changes invalidate waiting work, and selecting an earlier scene removes batch memory",async()=>{
 const f=await fixture(2),b=await f.prepare();await f.add();await expect(applyMemoryBatch(b,batchReply(b),f.repo)).rejects.toThrow();await finishMemoryBatch(f.input,b.requestId,false,f.repo);await changeMemoryBatch(f.input,"automatic",f.repo);
 const fresh=await f.prepare();await applyMemoryBatch(fresh,batchReply(fresh),f.repo);expect((await f.world()).sharedGame!.facts).toHaveLength(3);
 f.snapshot.selectedNativeKey=f.snapshot.messages[3]!.identity.nativeMessageKey;await f.play();expect((await f.world()).sharedGame!.facts).toHaveLength(0);
});
it("classifies promises safely and deduplicates repeated results",async()=>{
 const f=await fixture(1);await f.add("Mira promises to repair the gate tomorrow.");const b=await f.prepare();
 await applyMemoryBatch(b,batchReply(b,p=>({facts:p.role==="assistant"?[{text:p.text,quote:p.text,kind:"event",risk:"ordinary"}]:[]})),f.repo);
 expect((await f.world()).sharedGame!.facts.some(x=>x.text.includes("promises"))).toBe(false);expect((await f.repo.list<StoryEvent>("story")).filter(e=>e.type==="event"&&e.automation?.status==="review")).toHaveLength(1);
 await f.add("Room4 contains token4.");const next=await f.prepare();await applyMemoryBatch(next,batchReply(next),f.repo);expect((await f.world()).sharedGame!.facts).toHaveLength(1);
});
it("new people and lasting details share inline protection and do not rewrite author text",async()=>{
 const f=await fixture(0),actor=f.entities[1]!;await f.repo.put("entity",{...actor,name:"Mira",characterSheet:{...actor.characterSheet!,appearance:"Author coat.",protectedProfileFields:["appearance"]}});
 await f.add("Mira has a small scar. Rowan grew up by the harbor.");const b=await f.prepare();
 await applyMemoryBatch(b,batchReply(b,p=>({facts:[],people:p.role==="assistant"?[{id:actor.id,name:"Mira",quote:"Mira has a small scar.",risk:"ordinary",fields:[{key:"appearance",text:"small scar",quote:"Mira has a small scar.",risk:"ordinary"}]},{id:"new:Rowan",name:"Rowan",quote:"Rowan grew up by the harbor.",risk:"ordinary",fields:[{key:"background",text:"grew up by the harbor",quote:"Rowan grew up by the harbor.",risk:"ordinary"}]}]:[]})),f.repo);
 expect((await f.repo.get<SceneEntity>("entity",actor.id))!.characterSheet!.appearance).toBe("Author coat.");expect((await f.world()).sharedGame!.profileSeeds[actor.id]).toBeUndefined();expect((await f.repo.list<SceneEntity>("entity")).some(p=>p.name==="Rowan")).toBe(true);
 expect((await f.repo.list<StoryEvent>("story")).some(e=>e.automation?.reason==="protected")).toBe(true);assertStoryGraph(await f.repo.rawRecords());
});
it("a final commit guard rolls back all proposals and cursor advancement",async()=>{
 const f=await fixture(1),b=await f.prepare(),before=await f.repo.rawRecords();await expect(applyMemoryBatch(b,batchReply(b),f.repo,async()=>{throw Error("vault-locked")})).rejects.toThrow("vault-locked");expect(await f.repo.rawRecords()).toEqual(before);
});
it("large excerpts resume with overlap and no history truncation",async()=>{
 const f=await fixture(0);await f.add("A".repeat(28000));let first=await f.prepare();expect(first.parts.at(-1)!.end).toBeLessThan(28000);await applyMemoryBatch(first,batchReply(first,()=>({facts:[],people:[]})),f.repo);
 expect(await readMemoryBatch(f.input,f.repo)).toMatchObject({due:true});const second=await f.prepare();expect(second.parts[0]!.start).toBe(first.parts.at(-1)!.end);expect(second.parts[0]!.text.length).toBe(second.parts[0]!.end-second.parts[0]!.start+600);
 expect((await f.repo.list<StoryRevision>("story")).some(r=>r.type==="revision"&&r.content.length===28000)).toBe(true);
});
it("continuation inherits pending sources and processed receipts; backup cannot auto-start imported work",async()=>{
 const f=await fixture(1),b=await f.prepare();await applyMemoryBatch(b,batchReply(b),f.repo);await f.add();
 const next={...await f.binding(),id:"batch-next",chatId:"batch-next",chatUrl:"https://chat.deepseek.com/chat/s/batch-next"};delete next.characterScenes;await f.repo.put("binding",next);
 await activateWorldGame({worldId:f.input.worldId,chatId:next.chatId,chatUrl:next.chatUrl,expectedRevision:(await f.world()).sharedGame!.revision,mode:"attach"},f.repo);
 expect((await f.world()).sharedGame!.memoryBatchSources).toHaveLength(4);expect(await readMemoryBatch({...f.input,chatId:next.chatId},f.repo)).toMatchObject({pendingTurns:1,processedSources:2});
 f.input.chatId=next.chatId;f.snapshot.chatId=next.chatId;f.snapshot.messages=[f.message(81,null,"user","Continue the game."),f.message(82,81,"assistant","New segment begins.")];f.snapshot.selectedNativeKey=f.snapshot.messages[1]!.identity.nativeMessageKey;await f.play("start");
 f.snapshot.messages.push(f.message(83,82,"user","Explore."),f.message(84,83,"assistant","The sailor found a lantern."));f.snapshot.selectedNativeKey=f.snapshot.messages[3]!.identity.nativeMessageKey;await f.play();
 const inherited=await f.prepare();expect(inherited.parts).toHaveLength(4);await applyMemoryBatch(inherited,batchReply(inherited),f.repo);expect((await f.world()).sharedGame!.facts).toHaveLength(3);
 const backup=await createBackup(undefined,f.repo);await restoreBackup(backup as import("../src/core/types").BackupPayload,"replace",f.repo);expect((await f.world()).storyMemoryBatch!.mode).toBe("paused");expect((await f.world()).sharedGame!.facts).toHaveLength(3);assertStoryGraph(await f.repo.rawRecords());
});
it("OOC and partial sources never count; ordinary turns remain available",async()=>{
 const f=await fixture(2),rows=await f.repo.list<StoryRecord>("story");const reply=rows.find((r):r is StoryRevision=>r.type==="revision"&&r.role==="assistant"&&r.content.includes("token4"))!;
 await f.repo.put("story",{...reply,storyPurpose:"out-of-character"});expect(await readMemoryBatch(f.input,f.repo)).toMatchObject({pendingTurns:1});
 const b=await f.prepare();expect(b.parts.some(p=>p.revisionId===reply.id)).toBe(false);await applyMemoryBatch(b,batchReply(b),f.repo);expect((await f.world()).sharedGame!.facts).toHaveLength(1);
});
it("late manual edits send additions to review instead of replacing the author",async()=>{
 const f=await fixture(0),actor=f.entities[1]!;await f.repo.put("entity",{...actor,name:"Mira"});await f.add("Mira keeps a journal.");const b=await f.prepare();
 await f.repo.put("entity",{...actor,name:"Mira",characterSheet:{...actor.characterSheet!,background:"New author text."},profileFieldRevisions:{background:"author-new"}});
 await applyMemoryBatch(b,batchReply(b,p=>({facts:[],people:p.role==="assistant"?[{id:actor.id,name:"Mira",quote:p.text,risk:"ordinary",fields:[{key:"background",text:"keeps a journal",quote:p.text,risk:"ordinary"}]}]:[]})),f.repo);
 expect((await f.repo.get<SceneEntity>("entity",actor.id))!.characterSheet!.background).toBe("New author text.");expect((await f.repo.list<StoryEvent>("story")).some(e=>e.automation?.reason==="protected")).toBe(true);
});
it("a new checkpoint keeps pending work; starting over does not inherit old-game work",async()=>{
 const f=await fixture(1);await f.play("restart");expect(await readMemoryBatch(f.input,f.repo)).toMatchObject({pendingTurns:1});await f.add("The sailor found a lantern.");const b=await f.prepare();await applyMemoryBatch(b,batchReply(b),f.repo);expect((await f.world()).sharedGame!.facts).toHaveLength(2);assertStoryGraph(await f.repo.rawRecords());
 await f.play("reset");expect((await f.world()).sharedGame!.facts).toHaveLength(0);expect((await f.world()).sharedGame!.memoryBatchSources??[]).toHaveLength(0);
});
it("choosing an alternative reopens unchanged sources whose batch anchor disappeared",async()=>{
 const f=await fixture(2),b=await f.prepare();await applyMemoryBatch(b,batchReply(b),f.repo);
 f.snapshot.messages.push(f.message(7,5,"assistant","The sailor found a lantern."));f.snapshot.selectedNativeKey=f.snapshot.messages.at(-1)!.identity.nativeMessageKey;await f.play();
 expect(await readMemoryBatch(f.input,f.repo)).toMatchObject({pendingTurns:2});expect((await f.world()).sharedGame!.facts).toHaveLength(0);
 const alternate=await f.prepare();await applyMemoryBatch(alternate,batchReply(alternate),f.repo);expect((await f.world()).sharedGame!.facts.map(x=>x.text)).toEqual(["Room4 contains token4.","The sailor found a lantern."]);
});
it("importing a standalone lore cannot enable extra requests for the recipient",async()=>{
 const f=await fixture(1),payload=await exportWorld(f.input.worldId,f.repo);
 const imported=cloneWorldPackage(payload,"Imported batch lore").find(r=>r.kind==="world")!.data as import("../src/core/types").WorldProfile;
 expect(imported.storyMemoryBatch!.mode).toBe("paused");expect((await f.world()).storyMemoryBatch!.mode).toBe("automatic");
});
it("an incomplete native reply is rejected before it can count as a batch source",async()=>{
 const f=await fixture(1);f.snapshot.messages.push(f.message(5,4,"user","Continue."),{...f.message(6,5,"assistant","Unfinished scene."),completion:"partial"});f.snapshot.selectedNativeKey=f.snapshot.messages.at(-1)!.identity.nativeMessageKey;
 await expect(f.play()).rejects.toThrow();expect(await readMemoryBatch(f.input,f.repo)).toMatchObject({pendingTurns:1});expect((await f.prepare()).parts.some(p=>p.text.includes("Unfinished scene"))).toBe(false);
});
it("a late result from an old writer cannot update the shared game in another chat",async()=>{
 const f=await fixture(1),b=await f.prepare(),next={...await f.binding(),id:"writer-next",chatId:"writer-next",chatUrl:"https://chat.deepseek.com/chat/s/writer-next"};delete next.characterScenes;await f.repo.put("binding",next);
 await activateWorldGame({worldId:f.input.worldId,chatId:next.chatId,chatUrl:next.chatUrl,expectedRevision:(await f.world()).sharedGame!.revision,mode:"attach"},f.repo);const before=await f.repo.rawRecords();
 await expect(applyMemoryBatch(b,batchReply(b),f.repo)).rejects.toThrow();expect(await f.repo.rawRecords()).toEqual(before);
});
it("historical state keys differing only by case cannot overwrite the current state",async()=>{
 const f=await fixture(0);await f.add("The gate was locked.");await f.add("The gate is open.");
 const baseline=(await f.repo.list<StoryRecord>("story")).find(r=>r.type==="baseline")!;
 const latest={text:"The gate is open.",quote:"The gate is open.",kind:"event" as const,claim:{key:"gate.status",value:"open",scope:"state" as const}};
 await f.repo.put("story",{...baseline,factSeeds:[latest]});const b=await f.prepare();
 await applyMemoryBatch(b,batchReply(b,p=>({facts:p.text==="The gate was locked."?[{text:p.text,quote:p.text,kind:"event",risk:"ordinary",claim:{key:"GATE.STATUS",value:"LOCKED",scope:"state"}}]:[],people:[]})),f.repo);
 expect((await f.world()).sharedGame!.facts).toEqual([latest]);expect((await f.repo.list<StoryEvent>("story")).some(e=>e.memory?.claim?.value==="LOCKED"&&e.automation?.status==="review")).toBe(true);
});
