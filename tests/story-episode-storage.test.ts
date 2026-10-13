import {createEpisodeReader,storyEpisodes} from "../src/core/story-episodes";
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
import {createBackup,parseBackup,restoreBackup} from "../src/storage/backup";
import {storyWorld} from "./fixtures/story-worlds";
const dbs:DeepRoleDatabase[]=[];
afterEach(async()=>{await Promise.all(dbs.splice(0).map(d=>d.delete()));});
async function fixture(renameDuringSend=false,foreignTwin=false){
 const f=storyWorld("en",3);f.entities[0]!.name="Nora";f.entities[1]!.name="Mira";
 if(foreignTwin){f.entities[2]!.name="Nora";f.entities[2]!.playthroughChatId="elsewhere";}
 const db=new DeepRoleDatabase("episode-storage-"+crypto.randomUUID());dbs.push(db);const repo=new DeepRoleRepository(db);await repo.mergeRecords(f.records);
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

it("automatically indexes played sources and keeps an old promise through many later turns and reload",async()=>{
 const f=await fixture(),before=structuredClone((await f.getWorld()).sharedGame!.facts);
 for(let n=0;n<13;n++){const u=String(5+n*2),a=String(6+n*2),parent=String(4+n*2);f.snapshot.messages.push(f.message(u,parent,"user","Next scene "+n),f.message(a,u,"assistant","A later scene "+n));f.snapshot.selectedNativeKey=key(a);await f.play();}
 const w=await f.getWorld(),g=w.sharedGame!,sources=structuredClone(g.episodeSources!);
 expect(sources).toHaveLength(28);expect(g.facts).toEqual(before);
 expect(createEpisodeReader(g.factRoleSeeds,g.episodeSources).read(f.fact)).toMatchObject({episode:1,period:"earlier-turn"});
 f.db.close();await f.db.open();await f.play();expect((await f.getWorld()).sharedGame!.episodeSources).toEqual(sources);assertStoryGraph(await f.repo.rawRecords());
});
it("rebuilds the summary after removal, keeping original source and chronology",async()=>{
 const f=await fixture(),original=await f.repo.rawRecords(),current=await readStoryReview({chatId:f.binding.chatId,worldId:f.world.id,cursor:null},f.repo),event=current.facts![0]!;
 await approveStoryFact({chatId:f.binding.chatId,worldId:f.world.id,eventId:event.eventId,guard:current.guard!,text:event.text,accept:false},f.repo);
 const g=(await f.getWorld()).sharedGame!;expect(storyEpisodes(g.facts,g.factRoleSeeds,g.episodeSources)).toEqual([]);
 expect(g.episodeSources).toHaveLength(2);
 const source=original.find(r=>r.kind==="story"&&(r.data as StoryRecord).type==="revision"&&(r.data as StoryRevision).role==="assistant")!;
 expect((await f.repo.rawRecords()).find(r=>r.id===source.id)).toEqual(source);
});
it("removes an excluded alternative from episode order",async()=>{
 const f=await fixture(),before=structuredClone((await f.getWorld()).sharedGame!.episodeSources);
 f.snapshot.messages.push(f.message("9","3","assistant","A different outcome."));f.snapshot.selectedNativeKey=key("9");await f.play();
 const g=(await f.getWorld()).sharedGame!;expect(g.episodeSources).toHaveLength(2);expect(g.episodeSources).not.toEqual(before);expect(g.episodeSources![0]).toBe(before![0]);expect(g.facts).toEqual([]);assertStoryGraph(await f.repo.rawRecords());
});
it("retains summaries through continuation, full backup, reset and restore",async()=>{
 const f=await fixture(),old=structuredClone((await f.getWorld()).sharedGame!.episodeSources),chat="continued-episodes",b:ChatBinding={...f.binding,id:"binding:"+chat,chatId:chat,chatUrl:"https://chat.deepseek.com/chat/s/"+chat,characterScenes:undefined};await f.repo.put("binding",b);await f.activate(chat,"attach");
 const snap={chatId:chat,selectedNativeKey:key("12"),messages:[f.message("11",null,"user","Continue"),f.message("12","11","assistant","Workshop continues")]};await f.play("start",chat,snap);
 expect((await f.getWorld()).sharedGame!.episodeSources).toEqual(old);assertStoryGraph(await f.repo.rawRecords());
 snap.messages.push(f.message("13","12","user","Several game days later"),f.message("14","13","assistant","A later continued scene"));snap.selectedNativeKey=key("14");await f.play("sync",chat,snap);
 const continued=structuredClone((await f.getWorld()).sharedGame!.episodeSources);expect(continued).toHaveLength(4);expect(continued!.slice(0,2)).toEqual(old);assertStoryGraph(await f.repo.rawRecords());
 const forged=await f.repo.rawRecords();(forged.find(r=>r.kind==="world")!.data as WorldProfile).sharedGame!.episodeSources=continued!.slice(2);expect(()=>assertStoryGraph(forged)).toThrow();
 const db=new DeepRoleDatabase("episode-restore-"+crypto.randomUUID());dbs.push(db);const restored=new DeepRoleRepository(db);
 await restoreBackup(await parseBackup(JSON.stringify(await createBackup(undefined,f.repo))),"replace",restored);
 expect((await restored.get<WorldProfile>("world",f.world.id))!.sharedGame!.episodeSources).toEqual(continued);assertStoryGraph(await restored.rawRecords());
 await f.play("reset",chat,snap);expect((await f.getWorld()).sharedGame!.episodeSources).toEqual([]);expect((await f.getWorld()).sharedGameArchives!.at(-1)!.episodeSources).toEqual(continued);
 await f.play("restore",chat,snap);expect((await f.getWorld()).sharedGame!.episodeSources).toEqual(continued);assertStoryGraph(await f.repo.rawRecords());
});
it.each(["missing","reverse","repeat","omit-prefix","foreign-world","partial","out-of-character","missing-graph"])("rejects forged episode order: %s",async mode=>{
 const f=await fixture(),all=await f.repo.rawRecords(),w=all.find(r=>r.kind==="world")!.data as WorldProfile,g=w.sharedGame!,source=all.find(r=>r.id===g.episodeSources!.at(-1))!.data as StoryRevision;
 if(mode==="missing")g.episodeSources!.push("missing");if(mode==="reverse")g.episodeSources!.reverse();if(mode==="repeat")g.episodeSources!.push(g.episodeSources![0]!);if(mode==="omit-prefix")g.episodeSources!.shift();
 if(mode==="foreign-world")source.worldId="other";if(mode==="partial")source.completion="partial";if(mode==="out-of-character")source.storyPurpose="out-of-character";
 expect(()=>assertStoryGraph(mode==="missing-graph"?all.filter(r=>r.kind!=="story"):all)).toThrow();
});
it("retains exact underlying fact and source IDs in the replaceable outline",async()=>{
 const f=await fixture(),all=await f.repo.rawRecords(),event=all.find(r=>r.kind==="story"&&(r.data as StoryRecord).type==="event"&&!!(r.data as StoryEvent).memory)!.data as StoryEvent;
 const g=(await f.getWorld()).sharedGame!,episodes=storyEpisodes(g.facts,g.factRoleSeeds,g.episodeSources);
 expect(episodes[0]!.facts).toEqual([f.fact]);expect(episodes[0]!.sourceIds).toContain(event.memoryRoles!.sourceRevisionId);
});
