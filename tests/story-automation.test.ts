import { afterEach, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import { characterRevision, characterInChat } from "../src/core/characters";
import { automationMarker, factAutomationReason, inlineStoryPeople, validStoryAutomationPolicy } from "../src/core/story-automation";
import { validAutomationReviewPage } from "../src/core/story-automation-review";
import { assertStoryGraph, type StoryEvent, type StoryRecord } from "../src/core/story-records";
import { currentStoryProfileEntities } from "../src/core/story-profile-view";
import { nativeStoryMessageKey as key } from "../src/core/story-transport";
import type { StoryGameSnapshot } from "../src/core/story-game";
import type { ChatBinding, SceneEntity, WorldProfile } from "../src/core/types";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { runStoryGame, markNonStoryMessage } from "../src/storage/story-game";
import { activateWorldGame } from "../src/storage/world-game";
import { prepareDispatchCapture, confirmDispatchCapture, advanceDispatchCapture } from "../src/storage/story-dispatch-capture";
import { readAutomationReview, resolveAutomationReview } from "../src/storage/story-automation-review";
import { readStoryReview } from "../src/storage/story-review";
import { storyFactContext } from "../src/core/story-fact-context";
import { approveStoryFact } from "../src/storage/story-facts";
import { characterEditBaseline,mergeCharacterEdit } from "../src/core/character-edit";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { storyWorld } from "./fixtures/story-worlds";
const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { await Promise.all(dbs.splice(0).map(d => d.delete())); });
const fact = (text: string, risk = "ordinary", kind = "event", claim?: unknown) => ({ text,quote:text,kind,risk,...(claim ? { claim } : {}) });
const person = (name: string, text: string, id = "new:"+name, field = "background", risk = "ordinary") => ({ id,name,quote:name+" "+text,risk,fields:[{ key:field,text,quote:name+" "+text,risk }] });
async function fixture(mode: "automatic" | "review" | "off" = "automatic") {
  const f = storyWorld(), db = new DeepRoleDatabase("automation-"+crypto.randomUUID()); dbs.push(db); const repo = new DeepRoleRepository(db);
  f.world.storyAutomation = { mode,revision:"policy-a" }; await repo.mergeRecords(f.records);
  const world = async () => (await repo.get<WorldProfile>("world",f.world.id))!;
  let chat = f.binding.chatId;
  const binding = async () => (await repo.list<ChatBinding>("binding")).find(b => b.chatId === chat)!;
  const scope = () => ({ chatId:chat,worldId:f.world.id });
  const activate = async (mode: "initialize" | "attach") => activateWorldGame({ ...scope(),chatUrl:(await binding()).chatUrl,expectedRevision:(await world()).sharedGame?.revision ?? null,mode },repo);
  const message = (id: string,parent: string | null,role:"assistant"|"user",content:string) => ({ identity:{nativeMessageKey:key(id),nativeParentKey:parent===null?null:key(parent),role},completion:"complete" as const,content });
  const snapshot:StoryGameSnapshot = { chatId:chat,selectedNativeKey:key("2"),messages:[message("1",null,"user","Start."),message("2","1","assistant","The workshop opens.")] };
  const play = async (operation: "start"|"sync"|"reset"|"restore" = "sync") => { const b = await binding(), people = (await repo.list<SceneEntity>("entity")).filter(p => characterInChat(p,chat)); return runStoryGame({ ...scope(),operation,snapshot,expectedBase:characterRevision(people,b.characterScenes?.[f.world.id]),manual:"stop",nativeParentKey:null },DEFAULT_SETTINGS,repo); };
  await activate("initialize"); await play("start");
  let sequence = 2;
  const send = async (facts: unknown[] = [],people: unknown[] = [], options: {capture?:boolean; beforeReply?:()=>Promise<void>;updates?:unknown[]} = {}) => {
    const parent = snapshot.selectedNativeKey!, user = String(++sequence), reply = String(++sequence), draft = "Continue "+user, policy = await world(), context = automationMarker(policy), requestId=crypto.randomUUID();
    const outgoing = context+"\n\n[User message]\n"+draft;
    if (options.capture !== false) {
      const route = { requestId, identity:{ chatId:chat,nativeParentKey:parent },transport:"fetch" as const };
      await prepareDispatchCapture({ id:requestId,worldId:f.world.id,bindingId:(await binding()).id,identity:route.identity,transport:"fetch",sceneRevision:(await binding()).characterScenes![f.world.id]!.revision,originalDraft:draft,proposedContext:context },7,repo);
      await confirmDispatchCapture({ ...route,outgoingText:outgoing },7,repo);
      await advanceDispatchCapture({ ...route,phase:"started" },7,repo);
      await advanceDispatchCapture({ ...route,phase:"settled",delivery:{status:"accepted",httpStatus:200} },7,repo);
    }
    await options.beforeReply?.();
    const prose = [...facts.map(v => (v as any).quote),...people.map(v => (v as any).quote)].join("\n") || "A normal scene.";
    const content = prose+"\n<deeprole_characters>"+JSON.stringify({version:2,world:f.world.id,chat,updates:options.updates ?? [],facts,people})+"</deeprole_characters>";
    snapshot.messages.push({ identity:{nativeMessageKey:key(user),nativeParentKey:parent,role:"user"},completion:"complete",content:options.capture === false ? draft : outgoing },message(reply,user,"assistant",content)); snapshot.selectedNativeKey=key(reply); await play(); return reply;
  };
  const view = async () => currentStoryProfileEntities(await repo.list<SceneEntity>("entity"),await repo.list<StoryRecord>("story"),f.world.id,chat,(await binding()).id);
  const review = () => readAutomationReview({ ...scope(),query:"" },repo);
  const resolve = async (accept:boolean, id?:string, fields: any[] = [], entityId:string|null=null,name="") => { const p=await review(); return resolveAutomationReview({ ...scope(),guard:p.guard,gameRevision:p.gameRevision,eventId:id ?? p.items[0]!.id,accept,fields,entityId,name },repo); };
  const change = async (mode: "automatic"|"review"|"off") => {const w=await world(); await repo.put("world",{...w,storyAutomation:{mode,revision:crypto.randomUUID()}});};
  const attach = async (start = true) => {chat="synthetic-b";const b={...f.binding,id:"binding:b",chatId:chat,chatUrl:"https://chat.deepseek.com/a/chat/s/"+chat};delete b.characterScenes; await repo.put("binding",b); await activate("attach"); snapshot.chatId=chat;snapshot.messages=[message("1",null,"user","New chat."),message("2","1","assistant","The story continues.")];snapshot.selectedNativeKey=key("2"); sequence=2;if(start)await play("start");};
  return {...f,repo,db,snapshot,send,play,world,review,resolve,view,change,attach,scope};
}
it.each(["event","promise","plan","belief","secret","task"])("automatically saves a literal %s with durable receipt",async kind=>{
  const f=await fixture();await f.send([fact("The artisan returned the borrowed lantern.","ordinary",kind)]);
  expect((await f.world()).sharedGame!.facts).toHaveLength(1);expect((await f.review()).total).toBe(0);
  const before=await f.repo.rawRecords(); await f.play(); f.db.close();await f.db.open();await f.play();expect(await f.repo.rawRecords()).toEqual(before);assertStoryGraph(before);
});
it("never counts a repeated fact again and keeps mutable claim progression",async()=>{
  const f=await fixture();const a=fact("The door code is 123.","ordinary","event",{key:"door.code",value:"123",scope:"state"}),b=fact("The door code is 456.","ordinary","event",{key:"door.code",value:"456",scope:"state",transition:"progress"});
  await f.send([a]);await f.send([a]);await f.send([b]);expect((await f.world()).sharedGame!.facts).toHaveLength(1);expect((await f.world()).sharedGame!.facts[0]!.text).toBe(b.text);
  expect((await f.repo.list<StoryEvent>("story")).filter(e=>e.automation?.status==="duplicate")).toHaveLength(1);
});
it("ordinary new mentioned person and existing profile additions preserve author canon",async()=>{
  const f=await fixture(), original=f.entities[1]!.characterSheet!.background;
  await f.send([], [person("Neri","repairs clocks."),person("Resident 2","keeps a journal.","person-2")]);
  expect((await f.view()).find(p=>p.name==="Neri")!.characterSheet!.background).toBe("repairs clocks.");
  expect((await f.view()).find(p=>p.id==="person-2")!.characterSheet!.background).toContain("keeps a journal.");
  expect((await f.repo.get<SceneEntity>("entity","person-2"))!.characterSheet!.background).toBe(original);
  await f.send([], [person("Neri","repairs clocks.")]);expect((await f.view()).filter(p=>p.name==="Neri")).toHaveLength(1);
});
it.each(["review","off"] as const)("explicit %s mode never auto accepts",async mode=>{
  const f=await fixture(mode);await f.send([fact("A visitor returned the lantern.")],[person("Neri","repairs clocks.")]);
  expect((await f.world()).sharedGame!.facts).toHaveLength(0);expect((await f.view()).some(p=>p.name==="Neri")).toBe(false);expect((await f.review()).total).toBe(mode==="off"?0:2);
});
it.each(["missing","changed","restored"] as const)("a %s capture cannot grant automatic acceptance",async reason=>{
  const f=await fixture();await f.send([fact("A visitor returned the lantern.")],[],{capture:reason!=="missing",beforeReply:async()=>{if(reason==="changed")await f.change("automatic");if(reason==="restored"){const d=(await f.repo.list<any>("dispatch"))[0];await f.repo.put("dispatch",{...d,origin:"restored"});}}});
  expect((await f.world()).sharedGame!.facts).toHaveLength(0);expect((await f.review()).total).toBe(1);
});
it("OOC and incomplete answers do not update memory",async()=>{
  const f=await fixture();await markNonStoryMessage(f.binding.chatId,f.scope().worldId,f.repo);await f.send([fact("The traveler found the lamp.")]);expect((await f.world()).sharedGame!.facts).toHaveLength(0);
  const before=await f.repo.rawRecords();f.snapshot.messages.at(-1)!.completion="interrupted";await expect(f.play()).rejects.toThrow("story-source-incomplete");expect(await f.repo.rawRecords()).toEqual(before);
});
it("protected fields and a manual revision made during generation require review",async()=>{
  const f=await fixture(); const e=(await f.repo.get<SceneEntity>("entity","person-2"))!;await f.repo.put("entity",{...e,characterSheet:{...e.characterSheet!,protectedProfileFields:["background"]}});
  await f.send([], [person(e.name,"keeps a journal.",e.id)]);
  expect((await f.review()).items[0]!.reason).toBe("protected");
  await f.resolve(true,undefined,["background"]);expect((await f.view()).find(p=>p.id===e.id)!.characterSheet!.background).toContain("keeps a journal.");
});
it("queued conflicts survive another chapter, decline is durable and does not reappear",async()=>{
  const f=await fixture();await f.send([fact("The visitor returned the lantern.","conflict")]);
  const p=await f.review();expect(validAutomationReviewPage(p)).toBe(true);await f.attach();expect((await f.review()).total).toBe(1);
  await f.send();await f.resolve(false);expect((await f.review()).total).toBe(0);
  await f.send([fact("The visitor returned the lantern.")]);expect((await f.world()).sharedGame!.facts).toHaveLength(0);expect((await f.review()).total).toBe(0);assertStoryGraph(await f.repo.rawRecords());
});
it("late profile approval rebases on current scene across continuation without rewriting original",async()=>{
  const f=await fixture();await f.send([], [person("Resident 2","keeps a journal.","person-2","background","conflict")]);await f.attach();await f.send();await f.resolve(true,undefined,["background"]);
  expect((await f.view()).find(p=>p.id==="person-2")!.characterSheet!.background).toContain("keeps a journal.");assertStoryGraph(await f.repo.rawRecords());
  const copy=await parseBackup(JSON.stringify(await createBackup(undefined,f.repo)));expect(copy.records).toBeDefined();const db=new DeepRoleDatabase("automation-copy-"+crypto.randomUUID());dbs.push(db);const repo=new DeepRoleRepository(db);await restoreBackup(copy,"replace",repo);assertStoryGraph(await repo.rawRecords());
});
it("explicit character approval permits selecting an existing stable person",async()=>{
  const f=await fixture();await f.send([], [person("Maker","keeps a journal.","new:Maker","background","uncertain")]);await f.resolve(true,undefined,["background"],"person-2");
  expect((await f.view()).find(p=>p.id==="person-2")!.characterSheet!.background).toContain("keeps a journal.");expect((await f.view()).some(p=>p.name==="Maker")).toBe(false);assertStoryGraph(await f.repo.rawRecords());
});
it("review snapshot guards reject stale, foreign and fabricated decisions atomically",async()=>{
  const f=await fixture();await f.send([fact("The traveler found the lamp.","uncertain")]);const p=await f.review();const input={...f.scope(),guard:p.guard,gameRevision:p.gameRevision,eventId:p.items[0]!.id,accept:true,fields:[],entityId:null,name:""};
  await f.send();const before=await f.repo.rawRecords();await expect(resolveAutomationReview(input,f.repo)).rejects.toThrow("story-review-stale");expect(await f.repo.rawRecords()).toEqual(before);
  const now=await f.review();await expect(resolveAutomationReview({...input,guard:now.guard,gameRevision:now.gameRevision,eventId:"made-up"},f.repo)).rejects.toThrow("story-review-stale");
});
it("one hundred bounded portions have no pending routine questions, survive reload, and no duplicated profiles",async()=>{
  const f=await fixture();for(let i=0;i<100;i++)await f.send([fact("Traveler "+String.fromCharCode(97+Math.floor(i/26),97+i%26).repeat(3)+" recorded marker "+String.fromCharCode(97+i%26,97+Math.floor(i/26)).repeat(3)+".")]);expect((await f.world()).sharedGame!.facts).toHaveLength(100);expect((await f.review()).total).toBe(0);
  const before=await f.repo.rawRecords();await f.play();expect(await f.repo.rawRecords()).toEqual(before);
},30000);
it("literal evidence, conditional actions, immutable claims, protected ages and choices are conservative",()=>{
  expect(factAutomationReason({text:"He opened the gate.",quote:"Maybe he opened the gate.",kind:"event"},"ordinary",[],[])).toBe("uncertain");
  expect(factAutomationReason({text:"He opened the gate.",quote:"He never opened the gate.",kind:"event"},"ordinary",[],[])).not.toBe("new");
  expect(factAutomationReason({text:"Age 42.",quote:"Age 42.",kind:"event"},"ordinary",[],[])).toBe("protected");
  expect(factAutomationReason({text:"The code is 456.",quote:"The code is 456.",kind:"event",claim:{key:"code",value:"456",scope:"event"}},"ordinary",[{text:"The code is 123.",quote:"The code is 123.",kind:"event",claim:{key:"code",value:"123",scope:"event"}}],[])).toBe("conflict");
  expect(inlineStoryPeople([person("Neri","repairs clocks.")],"<deeprole_choices>Neri repairs clocks.</deeprole_choices>")).toEqual([]);
  expect(inlineStoryPeople(Array.from({length:5},()=>person("Neri","repairs clocks.")),"Neri repairs clocks.")).toEqual([]);
  expect(validStoryAutomationPolicy({mode:"automatic",revision:"__proto__"})).toBe(false);
});
it("alternative selection and undo remove automatic facts and overlays, then replay once",async()=>{
 const f=await fixture();const reply=await f.send([fact("The traveler returned the lantern.")],[person("Resident 2","keeps a journal.","person-2")]);await f.send();
 f.snapshot.selectedNativeKey=key("2");await f.play();expect((await f.world()).sharedGame!.facts).toHaveLength(0);expect((await f.view()).find(p=>p.id==="person-2")!.characterSheet!.background).not.toContain("keeps a journal.");
 f.snapshot.selectedNativeKey=key(reply);await f.play();expect((await f.world()).sharedGame!.facts).toHaveLength(1);expect((await f.view()).find(p=>p.id==="person-2")!.characterSheet!.background).toContain("keeps a journal.");
});
it("reset archives pending decisions and immediate undo restores the same queue",async()=>{
 const f=await fixture();await f.send([fact("The traveler returned the lantern.","conflict")]);const id=(await f.review()).items[0]!.id;await f.play("reset");expect((await f.world()).sharedGame!.pendingReviewIds).toBeUndefined();
 await f.play("restore");expect((await f.world()).sharedGame!.pendingReviewIds).toEqual([id]);assertStoryGraph(await f.repo.rawRecords());
});
it("a manual profile revision during generation preserves the edit and queues the addition",async()=>{
 const f=await fixture();await f.send([], [person("Resident 2","keeps a journal.","person-2")],{beforeReply:async()=>{const p=(await f.repo.get<SceneEntity>("entity","person-2"))!;await f.repo.put("entity",{...p,profileFieldRevisions:{background:"manual-new"},characterSheet:{...p.characterSheet!,background:"Author-protected history."}});}});
 expect((await f.review()).items[0]!.reason).toBe("protected");expect((await f.view()).find(p=>p.id==="person-2")!.characterSheet!.background).toBe("Author-protected history.");
});
it("new scene participant and metadata discovery create a single stable card",async()=>{
 const f=await fixture();await f.send([], [person("Neri","repairs clocks.")],{updates:[{id:"new:Neri",name:"Neri",state:{condition:{op:"set",value:"At the door"}}}]});
 expect((await f.view()).filter(p=>p.name==="Neri")).toHaveLength(1);expect((await f.view()).find(p=>p.name==="Neri")!.characterSheet!.background).toContain("repairs clocks.");
});
it("a forged external origin or cross-game baseline is rejected by the evidence graph",async()=>{
 const f=await fixture();await f.send([fact("The traveler returned the lantern.","conflict")]);await f.attach();await f.send();await f.resolve(true);
 const before=await f.repo.rawRecords(), copied=before.find(r=>r.kind==="story" && (r.data as StoryEvent).originEventId)!;
 expect(()=>assertStoryGraph(before.map(r=>r===copied?{...r,data:{...r.data,originEventId:"unproven"}}:r))).toThrow("story-evidence-invalid");
 const root=before.find(r=>r.kind==="story" && (r.data as any).type==="baseline" && (r.data as any).origin.chatId===f.binding.chatId)!;
 expect(()=>assertStoryGraph(before.map(r=>r===root?{...r,data:{...r.data,gameId:"another-game"}}:r))).toThrow("story-evidence-invalid");
});
it("protected profile settings survive character saves and reject concurrent changes",()=>{
 const f=storyWorld(),p=f.entities[1]!,original=characterEditBaseline(p,f.entities,undefined);
 const draft={...original,sheet:{...original.sheet,protectedProfileFields:["background" as const]}};
 expect(mergeCharacterEdit(original,draft,original).sheet.protectedProfileFields).toEqual(["background"]);
 const current={...original,sheet:{...original.sheet,protectedProfileFields:["appearance" as const]}};
 expect(()=>mergeCharacterEdit(original,draft,current)).toThrow("character-edit-conflict");
});
it("removing an accepted review fact dismisses the original queue item permanently",async()=>{
 const f=await fixture();await f.send([fact("The traveler returned the lantern.","conflict")]);await f.resolve(true);
 const event=(await f.repo.list<StoryEvent>("story")).find(e=>e.originEventId && e.memory)!;
 const p=await f.review();await approveStoryFact({...f.scope(),guard:p.guard,eventId:event.id,text:event.memory!.text,accept:false},f.repo);
 expect((await f.review()).total).toBe(0);expect((await f.world()).sharedGame!.facts).toHaveLength(0);assertStoryGraph(await f.repo.rawRecords());
});
it("relevant early memory is retrieved and old claim values are visibly superseded",async()=>{
 const f=await fixture();const a=fact("The door code is 123.","ordinary","event",{key:"door.code",value:"123",scope:"state"}),b=fact("The door code is 456.","ordinary","event",{key:"door.code",value:"456",scope:"state",transition:"progress"});
 await f.send([a]);await f.send([b]);const p=await readStoryReview({...f.scope(),cursor:null},f.repo);
 expect(p.facts!.find(e=>e.text===a.text)).toMatchObject({superseded:true});expect(p.facts!.find(e=>e.text===b.text)!.superseded).toBeUndefined();
 const facts=Array.from({length:100},(_,i)=>({text:i===0?"Neri hid the antique compass in the attic.":"A visitor recorded landmark "+i,quote:"Source",kind:"event" as const}));
 const context=storyFactContext(facts,600,"Where is the antique compass?");expect(context).toContain(facts[0]!.text);expect(context).not.toContain("Source");
});
it("an unanchored new chat can read inherited pending items but cannot resolve them",async()=>{
 const f=await fixture();await f.send([fact("The traveler returned the lantern.","conflict")]);await f.attach(false);
 const page=await f.review();expect(page.total).toBe(1);expect(page.ready).toBe(false);expect(validAutomationReviewPage(page)).toBe(true);
 const before=await f.repo.rawRecords();await expect(f.resolve(true)).rejects.toThrow("story-checkpoint-busy");expect(await f.repo.rawRecords()).toEqual(before);
 await f.play("start");expect((await f.review()).total).toBe(1);
});
