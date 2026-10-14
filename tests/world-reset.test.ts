import {afterEach,expect,it,vi} from "vitest";
import {DeepRoleDatabase} from "../src/storage/database";
import {DeepRoleRepository} from "../src/storage/repository";
import {activateWorldGame} from "../src/storage/world-game";
import {createCastJob,mutateCastJob,applyCastDraft} from "../src/storage/cast-initialization";
import {confirmWorldReset,applyWorldReset} from "../src/storage/world-reset";
import {castPrompt,parseCastDraft,type CastJob} from "../src/core/cast-initialization";
import {resetEntries,validResetArchive,validResetRequest} from "../src/core/world-reset";
import {assertStoryGraph} from "../src/core/story-records";
import {validDataRecord} from "../src/core/record-validation";
import {createBackup,parseBackup,restoreBackup} from "../src/storage/backup";
import {exportWorld} from "../src/storage/worlds";
import {completeContinuation} from "../src/storage/story-continuation";
import {formatMemoryContext} from "../src/core/context";
import {resetFixture,resetDraft} from "./fixtures/world-reset";
import {runStoryGame} from "../src/storage/story-game";
import {DEFAULT_SETTINGS} from "../src/core/defaults";
import {characterRevision} from "../src/core/characters";
import {nativeStoryMessageKey as nativeKey} from "../src/core/story-transport";
import {readStoryMerge,approveStoryMerge} from "../src/storage/story-character-merge";
import {worldGamePeople} from "../src/core/world-game";
import {savePortraitLayout} from "../src/storage/portrait-layout";
import type {WorldProfile,SceneEntity,ChatBinding} from "../src/core/types";
const dbs:DeepRoleDatabase[]=[];afterEach(async()=>{vi.restoreAllMocks();await Promise.all(dbs.splice(0).map(db=>db.delete()));});
async function fixture(){const f=resetFixture(),db=new DeepRoleDatabase("reset-"+crypto.randomUUID());dbs.push(db);const repo=new DeepRoleRepository(db);await repo.mergeRecords(f.records);await activateWorldGame({chatId:f.binding.chatId,chatUrl:f.binding.chatUrl,worldId:f.world.id,mode:"initialize",expectedRevision:null},repo);const w=(await repo.get<WorldProfile>("world",f.world.id))!,job=await createCastJob(w.id,"en",false,repo,undefined,false,{chatId:f.binding.chatId,revision:w.sharedGame!.revision,start:"Tyoma has just returned after six years abroad."}),draft=resetDraft(job.id,f.records);await mutateCastJob(job.id,j=>({...j,phase:"ready",step:99,draft,cleanup:"done",reset:{...j.reset!,entryOffset:j.reset!.entries.length}}),repo);return {...f,repo,db,job,draft,getWorld:()=>repo.get<WorldProfile>("world",f.world.id).then(w=>w!)};}
it("prepares a reset-specific immutable lore request without image bytes or mutation",async()=>{const f=await fixture(),job=(await f.repo.get<CastJob>("cast",f.job.id))!;expect(castPrompt(job)).toContain("WORLD RESET TO THE START");expect(castPrompt(job)).toContain("NEVER make everyone strangers");expect(JSON.stringify(job.sources)).not.toContain("AAAA");expect((await f.getWorld()).sharedGame!.id).toBe(f.job.reset!.gameId);expect(await f.repo.get("entry",f.event.id)).not.toBeNull();});
it.each(["current","legacy"] as const)("delayed reset review survives idle binding metadata before both confirmations: %s",async format=>{
 const f=await fixture(),before=await f.getWorld();
 if(format==="legacy"){
  // The shipped guard stored the whole binding. Keep this exact old format to
  // prove an already prepared plan can be used after updating the extension.
  const all=await f.repo.rawRecords(),books=all.filter(r=>r.kind==="book"&&"worldId" in r.data&&r.data.worldId===f.world.id).map(r=>r.id);
  const guard=JSON.stringify([before.sharedGame,before.description,all.filter(r=>r.kind==="binding"&&r.id===before.sharedGame!.activeBindingId).map(r=>r.data),all.filter(r=>r.kind==="entry"&&((r.data as any).worldId===f.world.id||books.includes((r.data as any).bookId??""))||["template","entity"].includes(r.kind)&&"worldId" in r.data&&r.data.worldId===f.world.id).map(r=>r.kind==="entity"?[r.id,(r.data as SceneEntity).name,(r.data as SceneEntity).aliases,(r.data as SceneEntity).updatedAt]:[r.kind,r.id,r.data]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))]);
  await mutateCastJob(f.job.id,j=>({...j,resetGuard:guard}),f.repo);
 }
 vi.spyOn(Date,"now").mockReturnValue(Date.now()+50*60*1000);
 await savePortraitLayout({worldId:f.world.id,chatId:f.binding.chatId,chatUrl:f.binding.chatUrl,resetAt:0,entityId:"person-1",pose:{x:.4,y:.3,width:240,space:"viewport"}},f.repo);
 const binding=(await f.repo.get<ChatBinding>("binding",f.binding.id))!;
 await f.repo.put("binding",{...binding,messageCountAtAnalysis:binding.messageCountAtAnalysis+1,updatedAt:Date.now()});
 expect((await f.getWorld()).sharedGame).toEqual(before.sharedGame);
 const token=await confirmWorldReset(f.job.id,f.draft,[f.event.id,f.mixed.id],f.repo);
 await savePortraitLayout({worldId:f.world.id,chatId:f.binding.chatId,chatUrl:f.binding.chatUrl,resetAt:0,entityId:"person-1",pose:{x:.5,y:.3,width:260,space:"viewport"}},f.repo);
 await applyWorldReset(f.job.id,token,f.world.name,f.repo);
 expect((await f.getWorld()).sharedGame!.id).not.toBe(before.sharedGame!.id);
 expect(await f.repo.get("entry",f.event.id)).toBeNull();
 expect((await f.repo.get<CastJob>("cast",f.job.id))!.phase).toBe("applied");
 assertStoryGraph(await f.repo.rawRecords());
});
it.each(["no token","wrong world","wrong token"])("requires both explicit confirmations atomically: %s",async mode=>{const f=await fixture(),before=await f.repo.rawRecords(),token=mode==="no token"?"":await confirmWorldReset(f.job.id,f.draft,[f.event.id,f.mixed.id],f.repo);await expect(applyWorldReset(f.job.id,mode==="wrong token"?"bad":token,mode==="wrong world"?"Other":f.world.name,f.repo)).rejects.toThrow("reset-confirmation-required");expect((await f.getWorld()).sharedGame).toEqual((before.find(r=>r.kind==="world")!.data as WorldProfile).sharedGame);expect(await f.repo.get("entry",f.event.id)).not.toBeNull();});
it("resets individually, clears progress, preserves family/initial love/static entries/images and archives changed text",async()=>{
 const f=await fixture(),before=(await f.getWorld()).sharedGame!,images=(await f.repo.list<SceneEntity>("entity")).map(p=>({id:p.id,sprites:p.characterSheet!.sprites,appearance:p.characterSheet!.appearance,personality:p.characterSheet!.personality})),token=await confirmWorldReset(f.job.id,f.draft,[f.event.id,f.mixed.id],f.repo),snapshot=await applyWorldReset(f.job.id,token,f.world.name,f.repo),w=await f.getWorld(),g=w.sharedGame!;
 expect(g.id).not.toBe(before.id);expect(g.facts).toEqual([]);expect(g.episodeSources).toEqual([]);expect(g.profileSeeds).toEqual({});expect(g.memoryOverrides).toEqual({includedIds:[],excludedIds:[]});expect(g.scene!.states["person-3"]!.bonds!["person-1"]!.trust).toBe(75);expect(g.scene!.states["person-2"]!.bonds!["person-1"]!.affinity).toBe(80);expect(g.scene!.states["person-4"]!.bonds!["person-1"]!.trust).toBe(0);expect(g.scene!.states["person-3"]!.bonds!["person-1"]!.history).toEqual([]);expect(g.scene!.states["person-3"]!.relationship).toContain("knows her son");
 expect((await f.repo.list<SceneEntity>("entity")).map(p=>({id:p.id,sprites:p.characterSheet!.sprites,appearance:p.characterSheet!.appearance,personality:p.characterSheet!.personality}))).toEqual(images);expect(await f.repo.get("entry",f.event.id)).toBeNull();expect((await f.repo.get<any>("entry",f.mixed.id)).content).toBe("Mother is Tyoma's mother.");expect(await f.repo.get("entry",f.entry.id)).toEqual(f.entry);expect(await f.repo.get("entry",f.foreign.id)).toEqual(f.foreign);expect(w.sharedGameArchives!.at(-1)).toEqual(before);expect(validResetArchive(w.resetArchives![0])).toBe(true);expect(w.resetArchives![0]!.entries).toContainEqual(f.event);expect(snapshot.resetGameId).toBe(g.id);expect(validDataRecord({kind:"world",id:w.id,data:w})).toBe(true);assertStoryGraph(await f.repo.rawRecords());
 await expect(applyWorldReset(f.job.id,token,f.world.name,f.repo)).rejects.toThrow("reset-not-ready");
});
it("keeps unselected cleanup proposals and rejects missing/foreign entries",async()=>{const f=await fixture();await expect(confirmWorldReset(f.job.id,f.draft,[f.foreign.id],f.repo)).rejects.toThrow("reset-incomplete");const token=await confirmWorldReset(f.job.id,f.draft,[],f.repo);await applyWorldReset(f.job.id,token,f.world.name,f.repo);expect(await f.repo.get("entry",f.event.id)).toEqual(f.event);expect(await f.repo.get("entry",f.mixed.id)).toEqual(f.mixed);});
it("holds partial rosters, altered numeric definitions/protagonists and unclean workers",async()=>{const f=await fixture(),partial=structuredClone(f.draft);partial.characters.pop();await expect(confirmWorldReset(f.job.id,partial,[],f.repo)).rejects.toThrow();const wrong=structuredClone(f.draft);wrong.characters[1]!.sheet.protagonist=true;await expect(confirmWorldReset(f.job.id,wrong,[],f.repo)).rejects.toThrow();wrong.characters[1]!.sheet.protagonist=false;wrong.characters[1]!.sheet.relationships!.pace="open";await expect(confirmWorldReset(f.job.id,wrong,[],f.repo)).rejects.toThrow("reset-rules-changed");await mutateCastJob(f.job.id,j=>({...j,cleanup:"failed"}),f.repo);await expect(confirmWorldReset(f.job.id,f.draft,[],f.repo)).rejects.toThrow("reset-not-ready");expect((await f.getWorld()).sharedGame!.id).toBe(f.job.reset!.gameId);});
it.each(["entry","character","game"])("rejects changes after review without overwriting them: %s",async kind=>{
 const f=await fixture(),token=await confirmWorldReset(f.job.id,f.draft,[],f.repo);
 if(kind==="entry")await f.repo.put("entry",{...f.entry,content:"Manual new lore",updatedAt:999});
 if(kind==="character")await f.repo.put("entity",{...f.entities[1]!,updatedAt:999});
 if(kind==="game"){
  const b=(await f.repo.get<ChatBinding>("binding",f.binding.id))!,scene=structuredClone(b.characterScenes![f.world.id]!);scene.revision="new-scene";scene.states["person-1"]!.goal="New progress";
  await f.repo.put("binding",{...b,characterScenes:{...b.characterScenes,[f.world.id]:scene}});
 }
 await expect(applyWorldReset(f.job.id,token,f.world.name,f.repo)).rejects.toThrow("reset-stale");expect(await f.repo.get("entry",f.event.id)).not.toBeNull();
});
it("normal cast apply cannot bypass reset confirmations",async()=>{const f=await fixture();await expect(applyCastDraft(f.job.id,f.draft,f.draft.characters.map(c=>c.key),"person-1",f.repo)).rejects.toThrow("reset-confirmation-required");});
it("invalidates pre-reset goal/background versions without changing appearance/personality versions",async()=>{const f=await fixture(),key=await confirmWorldReset(f.job.id,f.draft,[],f.repo);await applyWorldReset(f.job.id,key,f.world.name,f.repo);const p=(await f.repo.get<SceneEntity>("entity","person-2"))!;expect(p.profileFieldRevisions?.goals).toBeTruthy();expect(p.profileFieldRevisions?.background).toBeTruthy();expect(p.profileFieldRevisions?.appearance).toBeUndefined();expect(p.profileFieldRevisions?.personality).toBeUndefined();});
it("keeps approved merged identities and their images across full reset",async()=>{
 const f=await fixture(),b=(await f.repo.get<ChatBinding>("binding",f.binding.id))!;
 const message=(id:string,parent:string|null,role:"user"|"assistant",content:string)=>({identity:{nativeMessageKey:nativeKey(id),nativeParentKey:parent?nativeKey(parent):null,role},completion:"complete" as const,content});
 await runStoryGame({chatId:b.chatId,worldId:f.world.id,operation:"start",expectedBase:characterRevision(await f.repo.list<SceneEntity>("entity"),b.characterScenes![f.world.id]),nativeParentKey:null,manual:"stop",snapshot:{chatId:b.chatId,selectedNativeKey:nativeKey("2"),messages:[message("1",null,"user","Start"),message("2","1","assistant","Original scene")] }},DEFAULT_SETTINGS,f.repo);
 const scope={worldId:f.world.id,chatId:b.chatId,offset:0,query:"",pair:["person-2","person-4"] as [string,string]},page=await readStoryMerge(scope,f.repo);
 await approveStoryMerge({...scope,guard:page.guard,versions:[page.preview!.a.updatedAt,page.preview!.b.updatedAt],choices:{profile:"a",state:"a",incoming:"a",name:"Combined",aliases:[],protagonist:false}},f.repo);
 const w=await f.getWorld(),people=worldGamePeople(await f.repo.list<SceneEntity>("entity"),w),job=await createCastJob(w.id,"en",true,f.repo,undefined,true,{chatId:b.chatId,revision:w.sharedGame!.revision,start:"Original opening"});
 const d={...f.draft,request:job.id,characters:people.map(p=>({key:p.id,name:p.name,aliases:[],sheet:{...p.characterSheet!,sprites:{},goals:"Original goal",background:"Original past"},state:{action:"neutral",condition:"Beginning",goal:"",relationship:"",stats:[]},completed:[],reason:"Original lore",evidence:[{source:w.id,quote:"Tyoma returns after six years abroad."}]})),resetEntries:[],present:[],partners:[]};
 await mutateCastJob(job.id,j=>({...j,draft:d,phase:"ready",step:99,cleanup:"done",reset:{...j.reset!,entryOffset:j.reset!.entries.length}}),f.repo);const prepared=(await f.repo.get<CastJob>("cast",job.id))!;const key=await confirmWorldReset(job.id,prepared.draft!,[],f.repo);await applyWorldReset(job.id,key,w.name,f.repo);
 const roster=worldGamePeople(await f.repo.list<SceneEntity>("entity"),await f.getWorld());expect(roster.map(p=>p.id).sort()).toEqual(people.map(p=>p.id).sort());expect(roster.find(p=>p.name==="Combined")!.characterSheet!.sprites).toEqual(people.find(p=>p.name==="Combined")!.characterSheet!.sprites);assertStoryGraph(await f.repo.rawRecords());
});
it("normalizes model scale/gate proposals before review while keeping proposed starting scores",async()=>{const f=await fixture(),d=structuredClone(f.draft);d.characters[1]!.sheet.relationships!.pace="open";d.characters[1]!.sheet.relationships!.initial.trust=31;const saved=await mutateCastJob(f.job.id,j=>({...j,draft:d}),f.repo);expect(saved.draft!.characters[1]!.sheet.relationships!.pace).toBe(f.entities[1]!.characterSheet!.relationships!.pace);expect(saved.draft!.characters[1]!.sheet.relationships!.initial.trust).toBe(31);});
it("can clean the world description without deleting the world, archiving its original text",async()=>{const f=await fixture(),d=structuredClone(f.draft);d.resetEntries!.push({id:f.world.id,action:"rewrite",content:"Tyoma returns after six years abroad. His family remembers him.",quote:"Tyoma returns after six years abroad.",reason:"Retain original family history."});const key=await confirmWorldReset(f.job.id,d,[f.world.id],f.repo);await applyWorldReset(f.job.id,key,f.world.name,f.repo);const w=await f.getWorld();expect(w.description).toContain("His family remembers");expect(w.resetArchives!.at(-1)!.description).toBe(f.world.description);expect(await f.repo.get("entry",f.event.id)).not.toBeNull();});
it("restores full backup archives and starts the new native chat with initial values only",async()=>{const f=await fixture(),token=await confirmWorldReset(f.job.id,f.draft,[f.event.id,f.mixed.id],f.repo),snapshot=await applyWorldReset(f.job.id,token,f.world.name,f.repo);await completeContinuation(snapshot,"fresh-reset",f.repo);const w=await f.getWorld();expect(w.sharedGame!.activeChatId).toBe("fresh-reset");expect(w.sharedGame!.facts).toEqual([]);expect(w.sharedGame!.scene!.states["person-2"]!.bonds!["person-1"]!.affinity).toBe(80);expect(formatMemoryContext({entries:[],estimatedTokens:0,omittedCount:0} as any,snapshot)).toContain("No events from the previous playthrough happened");assertStoryGraph(await f.repo.rawRecords());
 const payload=await parseBackup(JSON.stringify(await createBackup(undefined,f.repo))),db=new DeepRoleDatabase("reset-backup-"+crypto.randomUUID());dbs.push(db);const restored=new DeepRoleRepository(db);await restoreBackup(payload,"replace",restored);expect((await restored.get<WorldProfile>("world",w.id))!.resetArchives).toEqual(w.resetArchives);expect((await exportWorld(w.id,f.repo)).records.find(r=>r.kind==="world")!.data).not.toHaveProperty("resetArchives");assertStoryGraph(await restored.rawRecords());
});
it("validates reset entry evidence and cannot propose deleting a character/world source",async()=>{const f=await fixture(),bad=structuredClone(f.draft);bad.resetEntries![0]!.quote="Invented";expect(()=>parseCastDraft(JSON.stringify(bad),f.job.id,f.job.sources)).toThrow("invalid-evidence");bad.resetEntries![0]!.id=f.world.id;bad.resetEntries![0]!.quote="Tyoma returns after six years abroad.";await expect(confirmWorldReset(f.job.id,bad,[f.world.id],f.repo)).rejects.toThrow("reset-incomplete");expect(()=>resetEntries([{},{}],f.job.sources)).toThrow();expect(validResetRequest({chatId:f.binding.chatId,revision:"r",start:""})).toBe(false);});
