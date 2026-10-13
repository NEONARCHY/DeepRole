import {createStoryTimeReader,GAME_TIME_KEY} from "../src/core/story-time";
import type {StoryFact} from "../src/core/story-update";
import {automationMarker} from "../src/core/story-automation";
import {applyMemoryBatch,changeMemoryBatch,prepareMemoryBatch} from "../src/storage/story-memory-batch";
import {batchReply} from "./fixtures/story-memory-batch";
import {createEpisodeReader} from "../src/core/story-episodes";
import {afterEach,expect,it} from "vitest";
import {DEFAULT_SETTINGS} from "../src/core/defaults";
import {characterRevision,characterInChat} from "../src/core/characters";
import {nativeStoryMessageKey as key} from "../src/core/story-transport";
import {assertStoryGraph,type StoryRecord,type StoryRevision} from "../src/core/story-records";
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
 const db=new DeepRoleDatabase("time-storage-"+crypto.randomUUID());dbs.push(db);const repo=new DeepRoleRepository(db);await repo.mergeRecords(f.records);
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
const clock=(label:string):StoryFact=>({kind:"event",text:label,quote:label,claim:{key:GAME_TIME_KEY,value:label,scope:"state",transition:"progress"}});
const temp:StoryFact={kind:"event",text:"Nora waits at the bridge.",quote:"Nora waits at the bridge.",claim:{key:"nora-place",value:"Nora waits at the bridge.",scope:"state",lifetime:"scene"}};
const lasting:StoryFact={kind:"event",text:"Nora knows the password.",quote:"Nora knows the password.",claim:{key:"password",value:"Nora knows the password.",scope:"state",lifetime:"persistent"}};
const task:StoryFact={kind:"promise",text:"I will help tomorrow.",quote:"I will help tomorrow.",task:{key:"help",title:"help tomorrow",status:"open"}};
const temporal=(g:import("../src/core/world-game").WorldGame)=>createStoryTimeReader(g.facts,createEpisodeReader(g.factRoleSeeds,g.episodeSources));
async function append(f:Awaited<ReturnType<typeof fixture>>,facts:StoryFact[],approve=true){
 const w=await f.getWorld(),parent=String(f.snapshot.messages.length),u=String(Number(parent)+1),a=String(Number(parent)+2),requestId=crypto.randomUUID(),b=await f.getBinding(),identity={chatId:f.binding.chatId,nativeParentKey:key(parent)},route={requestId,identity,transport:"xhr" as const},proposedContext="<deeprole_context>Temporal contract "+automationMarker(w)+"</deeprole_context>",outgoingText=proposedContext+"\n\n[User message]\nContinue";
 await prepareDispatchCapture({id:requestId,worldId:f.world.id,bindingId:b.id,identity,transport:"xhr",sceneRevision:b.characterScenes![f.world.id]!.revision,originalDraft:"Continue",proposedContext},7,f.repo);
 await confirmDispatchCapture({...route,outgoingText},7,f.repo);await advanceDispatchCapture({...route,phase:"started"},7,f.repo);await advanceDispatchCapture({...route,phase:"settled",delivery:{status:"accepted",httpStatus:200}},7,f.repo);await advanceDispatchCapture({...route,phase:"ready",link:{requestId,chatId:f.binding.chatId,nativeParentKey:key(parent),userMessageKey:key(u),assistantMessageKey:key(a)},sawFinish:false,issue:null},7,f.repo);
 const branch=(await readStoryReview({chatId:f.binding.chatId,worldId:f.world.id,cursor:null},f.repo)).guard!.branchId;
 const answer=facts.map(f=>f.quote).join("\n")+`<deeprole_characters>${JSON.stringify({version:2,world:f.world.id,chat:f.binding.chatId,branch,facts:w.storyAutomation?facts.map(f=>({...f,risk:"ordinary"})):facts})}</deeprole_characters>`;
 f.snapshot.messages.push(f.message(u,parent,"user",outgoingText),f.message(a,u,"assistant",answer));f.snapshot.selectedNativeKey=key(a);await f.play();
 const events:string[]=[];
 if(!approve)return events;
 for(const fact of facts){const review=await readStoryReview({chatId:f.binding.chatId,worldId:f.world.id,cursor:null},f.repo),event=review.facts!.find(x=>x.text===fact.text&&!x.accepted&&!x.superseded)!;expect(event).toBeDefined();await approveStoryFact({chatId:f.binding.chatId,worldId:f.world.id,eventId:event.eventId,guard:review.guard!,text:fact.text,accept:true},f.repo);events.push(event.eventId);}
 return events;
}
it("persists an explicit jump, keeps lasting knowledge and an overdue task through reload",async()=>{
 const f=await fixture();await append(f,[clock("Day 2"),temp,lasting,task]);await append(f,[clock("Three days later.")]);
 const g=(await f.getWorld()).sharedGame!,before=structuredClone(g),time=temporal(g);expect(time.anchor!.label).toBe("Three days later.");expect(time.read(temp)).toBe("earlier-scene");expect(time.read(lasting)).toBe("persistent");expect(g.facts.find(x=>x.task?.key==="help")!.task!.status).toBe("open");
 f.db.close();await f.db.open();await f.play();expect((await f.getWorld()).sharedGame!.facts).toEqual(before.facts);expect(temporal((await f.getWorld()).sharedGame!).anchor).toEqual(time.anchor);assertStoryGraph(await f.repo.rawRecords());
});
it("rejecting the latest marker restores the prior accepted time without deleting sources",async()=>{
 const f=await fixture();await append(f,[clock("Day 2"),temp]);const ids=await append(f,[clock("Three days later.")]);
 const before=await f.repo.rawRecords(),review=await readStoryReview({chatId:f.binding.chatId,worldId:f.world.id,cursor:null},f.repo);
 await approveStoryFact({chatId:f.binding.chatId,worldId:f.world.id,eventId:ids[0]!,guard:review.guard!,text:"Three days later.",accept:false},f.repo);
 const g=(await f.getWorld()).sharedGame!;expect(temporal(g).anchor!.label).toBe("Day 2");expect(temporal(g).read(temp)).toBe("last-known");expect((await f.repo.rawRecords()).filter(r=>r.kind==="story"&&(r.data as StoryRecord).type==="revision")).toEqual(before.filter(r=>r.kind==="story"&&(r.data as StoryRecord).type==="revision"));
});
it("retains time and lifetime through continuation, full backup, reset and restore",async()=>{
 const f=await fixture();await append(f,[clock("Day 2"),temp,lasting,task]);await append(f,[clock("Three days later.")]);const old=temporal((await f.getWorld()).sharedGame!);
 const chat="continued-time",b:ChatBinding={...f.binding,id:"binding:"+chat,chatId:chat,chatUrl:"https://chat.deepseek.com/chat/s/"+chat,characterScenes:undefined};await f.repo.put("binding",b);await f.activate(chat,"attach");const snap={chatId:chat,selectedNativeKey:key("12"),messages:[f.message("11",null,"user","Continue"),f.message("12","11","assistant","Workshop continues")]};await f.play("start",chat,snap);
 expect(temporal((await f.getWorld()).sharedGame!).anchor).toEqual(old.anchor);assertStoryGraph(await f.repo.rawRecords());
 const db=new DeepRoleDatabase("time-restore-"+crypto.randomUUID());dbs.push(db);const restored=new DeepRoleRepository(db);await restoreBackup(await parseBackup(JSON.stringify(await createBackup(undefined,f.repo))),"replace",restored);const g=(await restored.get<WorldProfile>("world",f.world.id))!.sharedGame!;expect(temporal(g).anchor).toEqual(old.anchor);expect(temporal(g).read(temp)).toBe("earlier-scene");expect(g.facts.find(x=>x.task?.key==="help")!.task!.status).toBe("open");
 await f.play("reset",chat,snap);expect(temporal((await f.getWorld()).sharedGame!).anchor).toBeUndefined();await f.play("restore",chat,snap);expect(temporal((await f.getWorld()).sharedGame!).anchor).toEqual(old.anchor);
});
it("rejects forged clock proof inside dialogue in a full backup",async()=>{
 const f=await fixture();await append(f,[clock("Day 2")]);const all=await f.repo.rawRecords(),g=(all.find(r=>r.kind==="world")!.data as WorldProfile).sharedGame!,binding=g.factRoleSeeds!.find(s=>s.binding.quote==="Day 2")!.binding,source=all.find(r=>r.id===binding.sourceRevisionId)!.data as StoryRevision;
 source.content=source.content.replace("Day 2","Nora said: Day 2");expect(()=>assertStoryGraph(all)).toThrow("story-evidence-invalid");
});
it("records identical elapsed labels at distinct source turns rather than dropping the second",async()=>{
 const f=await fixture();await append(f,[clock("Three days later.")]);const before=temporal((await f.getWorld()).sharedGame!).anchor!;await append(f,[clock("Three days later.")]);const after=temporal((await f.getWorld()).sharedGame!).anchor!;
 expect(after.label).toBe(before.label);expect(after.revisionId).not.toBe(before.revisionId);assertStoryGraph(await f.repo.rawRecords());
});
it("late batch extraction of equal elapsed text cannot replace a newer clock source",async()=>{
 const f=await fixture(),label="Three days later.";await append(f,[clock(label)]);await append(f,[clock(label)]);const before=temporal((await f.getWorld()).sharedGame!).anchor!,w=await f.getWorld();await f.repo.put("world",{...w,storyAutomation:{mode:"automatic",revision:"batch-time"}});
 const input={worldId:f.world.id,chatId:f.binding.chatId,force:true};await changeMemoryBatch(input,"automatic",f.repo);const b=await prepareMemoryBatch(input,"field_"+crypto.randomUUID(),"en",f.repo);
 await applyMemoryBatch(b,batchReply(b,p=>({facts:p.text.startsWith(label)?[{...clock(label),risk:"ordinary"}]:[],people:[]})),f.repo);
 expect(temporal((await f.getWorld()).sharedGame!).anchor).toEqual(before);expect((await f.repo.list<import("../src/core/story-records").StoryEvent>("story")).some(e=>e.memory?.text===label&&e.automation?.status==="review")).toBe(true);assertStoryGraph(await f.repo.rawRecords());
});
const ending:StoryFact={kind:"event",text:"Nora left the bridge.",quote:"Nora left the bridge.",claim:{...temp.claim!,value:"Nora left the bridge.",transition:"progress",status:"ended"}};
it("automatically saves a known explicit ending and preserves lasting knowledge and the open promise",async()=>{
 const f=await fixture();await append(f,[temp,lasting,task]);const w=await f.getWorld();await f.repo.put("world",{...w,storyAutomation:{mode:"automatic",revision:"ending-policy"}});await append(f,[ending],false);
 const g=(await f.getWorld()).sharedGame!;expect(g.facts).toContainEqual(ending);expect(g.facts).not.toContainEqual(temp);expect(temporal(g).read(ending)).toBe("ended");expect(temporal(g).read(lasting)).toBe("persistent");expect(g.facts.find(x=>x.task?.key==="help")!.task!.status).toBe("open");
 expect((await readStoryReview({chatId:f.binding.chatId,worldId:f.world.id,cursor:null},f.repo)).facts!.find(x=>x.text===ending.text)!.automation).toMatchObject({status:"saved",reason:"new"});assertStoryGraph(await f.repo.rawRecords());
});
it("unknown or negated endings require review and do not replace active state",async()=>{
 const f=await fixture();await append(f,[temp]);const w=await f.getWorld();await f.repo.put("world",{...w,storyAutomation:{mode:"automatic",revision:"review-end"}});
 const negated={...ending,text:"Nora did not leave the bridge.",quote:"Nora did not leave the bridge.",claim:{...ending.claim!,value:"Nora did not leave the bridge."}},unknown={...ending,claim:{...ending.claim!,key:"unknown-property"}};await append(f,[negated,unknown],false);
 const events=await f.repo.list<import("../src/core/story-records").StoryEvent>("story");for(const fact of [negated,unknown])expect(events.find(x=>x.memory?.text===fact.text&&x.memory.claim?.key===fact.claim.key)!.automation).toMatchObject({status:"review",reason:"uncertain"});expect((await f.getWorld()).sharedGame!.facts).toContainEqual(temp);assertStoryGraph(await f.repo.rawRecords());
});
it("rejection of the ending restores waiting and retains both exact source scenes",async()=>{
 const f=await fixture();await append(f,[temp]);const [id]=await append(f,[ending]);const before=await f.repo.rawRecords(),review=await readStoryReview({chatId:f.binding.chatId,worldId:f.world.id,cursor:null},f.repo);
 await approveStoryFact({chatId:f.binding.chatId,worldId:f.world.id,eventId:id!,guard:review.guard!,text:ending.text,accept:false},f.repo);
 const g=(await f.getWorld()).sharedGame!;expect(g.facts).toContainEqual(temp);expect(g.facts).not.toContainEqual(ending);expect(temporal(g).read(temp)).toBe("last-known");expect((await f.repo.rawRecords()).filter(r=>r.kind==="story"&&(r.data as StoryRecord).type==="revision")).toEqual(before.filter(r=>r.kind==="story"&&(r.data as StoryRecord).type==="revision"));assertStoryGraph(await f.repo.rawRecords());
});
it("retains the ending through reload, continuation, full backup, reset and restore",async()=>{
 const f=await fixture();await append(f,[temp,lasting,task]);await append(f,[ending]);const g=(await f.getWorld()).sharedGame!;f.db.close();await f.db.open();await f.play();expect((await f.getWorld()).sharedGame!.facts).toEqual(g.facts);
 const chat="continued-ending",b:ChatBinding={...f.binding,id:"binding:"+chat,chatId:chat,chatUrl:"https://chat.deepseek.com/chat/s/"+chat,characterScenes:undefined};await f.repo.put("binding",b);await f.activate(chat,"attach");const snap={chatId:chat,selectedNativeKey:key("12"),messages:[f.message("11",null,"user","Continue"),f.message("12","11","assistant","Workshop continues")]};await f.play("start",chat,snap);expect(temporal((await f.getWorld()).sharedGame!).read(ending)).toBe("ended");
 const db=new DeepRoleDatabase("ending-restore-"+crypto.randomUUID());dbs.push(db);const restored=new DeepRoleRepository(db);await restoreBackup(await parseBackup(JSON.stringify(await createBackup(undefined,f.repo))),"replace",restored);const backup=(await restored.get<WorldProfile>("world",f.world.id))!.sharedGame!;expect(backup.facts).toEqual(g.facts);expect(temporal(backup).read(ending)).toBe("ended");assertStoryGraph(await restored.rawRecords());
 await f.play("reset",chat,snap);expect((await f.getWorld()).sharedGame!.facts).not.toContainEqual(ending);await f.play("restore",chat,snap);expect(temporal((await f.getWorld()).sharedGame!).read(ending)).toBe("ended");
});
it("a new explicit active state resumes the property; stale status-less data cannot",async()=>{
 const f=await fixture();await append(f,[temp]);await append(f,[ending]);const w=await f.getWorld();await f.repo.put("world",{...w,storyAutomation:{mode:"automatic",revision:"resume-policy"}});await append(f,[temp],false);expect((await f.getWorld()).sharedGame!.facts).toContainEqual(ending);
 const resumed={...temp,claim:{...temp.claim!,transition:"progress" as const,status:"active" as const}};await append(f,[resumed],false);const g=(await f.getWorld()).sharedGame!;expect(g.facts).toContainEqual(resumed);expect(g.facts).not.toContainEqual(ending);expect(temporal(g).read(resumed)).toBe("last-known");assertStoryGraph(await f.repo.rawRecords());
});
it("late batch active state cannot overwrite a later ending",async()=>{
 const f=await fixture();await append(f,[temp]);await append(f,[ending]);const w=await f.getWorld();await f.repo.put("world",{...w,storyAutomation:{mode:"automatic",revision:"batch-end"}});const input={worldId:f.world.id,chatId:f.binding.chatId,force:true};await changeMemoryBatch(input,"automatic",f.repo);const b=await prepareMemoryBatch(input,"field_"+crypto.randomUUID(),"en",f.repo);
 await applyMemoryBatch(b,batchReply(b,p=>({facts:p.text.includes(temp.quote)?[{...temp,claim:{...temp.claim!,status:"active",transition:"progress"},risk:"ordinary"}]:[],people:[]})),f.repo);expect((await f.getWorld()).sharedGame!.facts).toContainEqual(ending);expect(temporal((await f.getWorld()).sharedGame!).read(ending)).toBe("ended");assertStoryGraph(await f.repo.rawRecords());
});
