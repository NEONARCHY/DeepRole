import {afterEach,expect,it} from "vitest";
import {DEFAULT_SETTINGS} from "../src/core/defaults";
import {characterRevision,characterInChat} from "../src/core/characters";
import {nativeStoryMessageKey as key} from "../src/core/story-transport";
import {assertStoryGraph,type StoryRecord,type StoryEvent,type StoryRevision} from "../src/core/story-records";
import {createStoryRoleReader} from "../src/core/story-source-roles";
import {storedRoleReader} from "../src/core/story-role-binding";
import {worldGamePeople} from "../src/core/world-game";
import type {SceneEntity,WorldProfile,ChatBinding} from "../src/core/types";
import {DeepRoleDatabase} from "../src/storage/database";
import {DeepRoleRepository} from "../src/storage/repository";
import {activateWorldGame} from "../src/storage/world-game";
import {runStoryGame} from "../src/storage/story-game";
import {prepareDispatchCapture,confirmDispatchCapture,advanceDispatchCapture} from "../src/storage/story-dispatch-capture";
import {readStoryReview} from "../src/storage/story-review";
import {approveStoryFact} from "../src/storage/story-facts";
import {readStoryMerge,approveStoryMerge,undoStoryMerge} from "../src/storage/story-character-merge";
import {createBackup,parseBackup,restoreBackup} from "../src/storage/backup";
import {storyWorld} from "./fixtures/story-worlds";
const dbs:DeepRoleDatabase[]=[];
afterEach(async()=>{await Promise.all(dbs.splice(0).map(d=>d.delete()));});
async function fixture(renameDuringSend=false,foreignTwin=false){
 const f=storyWorld("en",3);f.entities[0]!.name="Nora";f.entities[1]!.name="Mira";
 if(foreignTwin){f.entities[2]!.name="Nora";f.entities[2]!.playthroughChatId="elsewhere";}
 const db=new DeepRoleDatabase("role-binding-"+crypto.randomUUID());dbs.push(db);const repo=new DeepRoleRepository(db);await repo.mergeRecords(f.records);
 const binding=async(chat=f.binding.chatId)=>(await repo.list<ChatBinding>("binding")).find(b=>b.chatId===chat)!;
 const world=()=>repo.get<WorldProfile>("world",f.world.id).then(w=>w!);
 const activate=async(chat=f.binding.chatId,mode:"initialize"|"attach"="initialize")=>activateWorldGame({chatId:chat,chatUrl:(await binding(chat)).chatUrl,worldId:f.world.id,expectedRevision:(await world()).sharedGame?.revision??null,mode},repo);
 const message=(id:string,parent:string|null,role:"user"|"assistant",content:string)=>({identity:{nativeMessageKey:key(id),nativeParentKey:parent===null?null:key(parent),role},completion:"complete" as const,content});
 const snapshot={chatId:f.binding.chatId,selectedNativeKey:key("2"),messages:[message("1",null,"user","Start"),message("2","1","assistant","Workshop")]};
 const play=async(operation:"start"|"sync"|"reset"|"restore"="sync",chat=f.binding.chatId,snap=snapshot)=>{const b=await binding(chat),people=(await repo.list<SceneEntity>("entity")).filter(p=>characterInChat(p,chat));return runStoryGame({chatId:chat,worldId:f.world.id,operation,expectedBase:characterRevision(people,b.characterScenes?.[f.world.id]),nativeParentKey:null,manual:"stop",snapshot:snap},DEFAULT_SETTINGS,repo);};
 await activate();await play("start");const b=await binding(),requestId=crypto.randomUUID(),identity={chatId:f.binding.chatId,nativeParentKey:key("2")},route={requestId,identity,transport:"xhr" as const},proposedContext="<deeprole_context>Current roster</deeprole_context>",outgoingText=proposedContext+"\n\n[User message]\nAct";
 await prepareDispatchCapture({id:requestId,worldId:f.world.id,bindingId:b.id,identity,transport:"xhr",sceneRevision:b.characterScenes![f.world.id]!.revision,originalDraft:"Act",proposedContext},7,repo);
 await confirmDispatchCapture({...route,outgoingText},7,repo);await advanceDispatchCapture({...route,phase:"started"},7,repo);await advanceDispatchCapture({...route,phase:"settled",delivery:{status:"accepted",httpStatus:200}},7,repo);await advanceDispatchCapture({...route,phase:"ready",link:{requestId,chatId:f.binding.chatId,nativeParentKey:key("2"),userMessageKey:key("3"),assistantMessageKey:key("4")},sawFinish:false,issue:null},7,repo);
 if(renameDuringSend){const p=(await repo.get<SceneEntity>("entity","person-1"))!;await repo.put("entity",{...p,name:"Eva",updatedAt:Date.now()});}
 const branch=(await readStoryReview({chatId:f.binding.chatId,worldId:f.world.id,cursor:null},repo)).guard!.branchId;
 const fact={kind:"promise" as const,text:"Bring tools if the road opens.",quote:'Nora told Mira: “I promise to bring tools if the road opens.”'};
 const answer=fact.quote+`<deeprole_characters>${JSON.stringify({version:2,world:f.world.id,chat:f.binding.chatId,branch,facts:[fact]})}</deeprole_characters>`;
 snapshot.messages.push(message("3","2","user",outgoingText),message("4","3","assistant",answer));snapshot.selectedNativeKey=key("4");await play();
 const review=await readStoryReview({chatId:f.binding.chatId,worldId:f.world.id,cursor:null},repo),event=review.facts![0]!;
 await approveStoryFact({chatId:f.binding.chatId,worldId:f.world.id,eventId:event.eventId,guard:review.guard!,text:fact.text,accept:true},repo);
 const reader=async(query="")=>{const w=await world(),entities=worldGamePeople(await repo.list<SceneEntity>("entity"),w);return createStoryRoleReader({worldId:w.id,entities},query,storedRoleReader(w.sharedGame!.factRoleSeeds??[],entities,w.id,w.sharedGame!.mergeSeeds));};
 return {...f,db,repo,getWorld:world,getBinding:binding,activate,play,message,snapshot,fact,reader,requestId};
}
it("captures before sending and keeps the original person when renamed while the reply is pending",async()=>{
 const f=await fixture(true),r=await f.reader("What did Eva promise?");expect(r.read(f.fact)?.promisor).toEqual({id:"person-1",name:"Eva",sourceName:"Nora"});expect(r.score(f.fact)).toBe(40);
 const w=await f.getWorld();expect(w.sharedGame!.facts[0]).toEqual(f.fact);expect(w.sharedGame!.factRoleSeeds![0]!.binding.roles.promisor).toEqual({id:"person-1",name:"Nora"});assertStoryGraph(await f.repo.rawRecords());
 const source=(await f.repo.list<StoryRecord>("story")).find((s):s is StoryRevision=>s.type==="revision"&&s.nativeMessageKey===key("4"))!;expect(source.roleRosterRequestId).toBe(f.requestId);expect(source.roleRoster!.map(p=>p.name)).toEqual(["Nora","Mira"]);
});
it("excludes private characters of another chat from the source roster and collision map",async()=>{
 const f=await fixture(false,true);expect((await f.reader()).read(f.fact)?.promisor?.id).toBe("person-1");
 const capture=(await f.repo.list<any>("dispatch"))[0];expect(capture.roleRoster.map((p:any)=>p.id)).not.toContain("person-3");assertStoryGraph(await f.repo.rawRecords());
});
it("survives reload, a replacement name, and full backup restore with historical capture origin",async()=>{
 const f=await fixture(true),other=(await f.repo.get<SceneEntity>("entity","person-3"))!;await f.repo.put("entity",{...other,name:"Nora",updatedAt:Date.now()});
 f.db.close();await f.db.open();expect((await f.reader("What did Nora promise?")).score(f.fact)).toBe(-12);
 const db=new DeepRoleDatabase("role-restore-"+crypto.randomUUID());dbs.push(db);const restored=new DeepRoleRepository(db);await restoreBackup(await parseBackup(JSON.stringify(await createBackup(undefined,f.repo))),"replace",restored);assertStoryGraph(await restored.rawRecords());
 const w=(await restored.get<WorldProfile>("world",f.world.id))!,entities=worldGamePeople(await restored.list<SceneEntity>("entity"),w);
 expect(storedRoleReader(w.sharedGame!.factRoleSeeds!,entities,w.id)(f.fact)?.promisor).toEqual({id:"person-1",name:"Eva",sourceName:"Nora"});expect((await restored.list<any>("dispatch"))[0].origin).toBe("restored");
});
it("follows approved merging and undo without rewriting original source-role evidence",async()=>{
 const f=await fixture(),seed=structuredClone((await f.getWorld()).sharedGame!.factRoleSeeds),input={chatId:f.binding.chatId,worldId:f.world.id,query:"",offset:0,pair:["person-1","person-3"] as [string,string]},page=await readStoryMerge(input,f.repo);
 await approveStoryMerge({...input,guard:page.guard,versions:[page.preview!.a.updatedAt,page.preview!.b.updatedAt],choices:{profile:"a",state:"a",incoming:"a",name:"Nora Vale",aliases:["Nora","Resident 3"],protagonist:true}},f.repo);
 const merged=(await readStoryMerge({...input,pair:null},f.repo)).merges[0]!,w=await f.getWorld(),id=Object.values(w.sharedGame!.mergeSeeds)[0]!.mergedId;
 expect((await f.reader("What did Nora Vale promise?")).read(f.fact)?.promisor).toEqual({id,name:"Nora Vale",sourceName:"Nora",sourceId:"person-1"});expect(w.sharedGame!.factRoleSeeds).toEqual(seed);
 const current=await readStoryMerge({...input,pair:null},f.repo);await undoStoryMerge({worldId:input.worldId,chatId:input.chatId,query:input.query,offset:input.offset,guard:current.guard,eventId:merged.id},f.repo);
 expect((await f.reader()).read(f.fact)?.promisor).toEqual({id:"person-1",name:"Nora"});assertStoryGraph(await f.repo.rawRecords());
});
it("carries selected role seeds into a manually attached continuation chat, and archives them on reset",async()=>{
 const f=await fixture(),old=structuredClone((await f.getWorld()).sharedGame!.factRoleSeeds),chat="continued-role",b:ChatBinding={...f.binding,id:"binding:"+chat,chatId:chat,chatUrl:"https://chat.deepseek.com/chat/s/"+chat,characterScenes:undefined};await f.repo.put("binding",b);await f.activate(chat,"attach");
 const snap={chatId:chat,selectedNativeKey:key("12"),messages:[f.message("11",null,"user","Continue"),f.message("12","11","assistant","Workshop continues")]};await f.play("start",chat,snap);
 expect((await f.getWorld()).sharedGame!.factRoleSeeds).toEqual(old);expect((await f.reader()).read(f.fact)?.promisor?.id).toBe("person-1");assertStoryGraph(await f.repo.rawRecords());
 await f.play("reset",chat,snap);expect((await f.getWorld()).sharedGame!.facts).toEqual([]);expect((await f.getWorld()).sharedGame!.factRoleSeeds).toBeUndefined();expect((await f.getWorld()).sharedGameArchives!.at(-1)!.factRoleSeeds).toEqual(old);
 await f.play("restore",chat,snap);expect((await f.getWorld()).sharedGame!.factRoleSeeds).toEqual(old);assertStoryGraph(await f.repo.rawRecords());
});
it.each(["wrong-source","wrong-owner","forged-roster","foreign-world","missing-request","missing-graph"])("rejects forged persistent attribution: %s",async mode=>{
 const f=await fixture(),all=await f.repo.rawRecords(),event=all.find(r=>r.kind==="story"&&(r.data as StoryRecord).type==="event"&&!!(r.data as StoryEvent).memory)!.data as StoryEvent,source=all.find(r=>r.id===event.memoryRoles!.sourceRevisionId)!.data as StoryRevision;
 if(mode==="wrong-source")event.memoryRoles!.sourceRevisionId="missing";if(mode==="wrong-owner")event.memoryRoles!.roles.promisor!.id="person-2";if(mode==="forged-roster")source.roleRoster![0]!.id="person-2";if(mode==="foreign-world")source.worldId="another-world";if(mode==="missing-request")delete source.roleRosterRequestId;
 expect(()=>assertStoryGraph(mode==="missing-graph"?all.filter(r=>r.kind!=="story"):all)).toThrow();
});
