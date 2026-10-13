import {expect,it} from "vitest";
import {isPlainStoryContinuation,storyContinuationCandidates} from "../src/core/story-continuation-balance";
import {compileGameContext,addedContextTokens} from "../src/core/game-context";
import {createStoryRoleReader,createStoryRoleReaderV1} from "../src/core/story-source-roles";
import {storedRoleReader} from "../src/core/story-role-binding";
import {createEpisodeReader} from "../src/core/story-episodes";
import {createStoryTimeReader} from "../src/core/story-time";
import {compactStoryFactSources,type StoryFact} from "../src/core/story-update";
import {decodeStoryMemory} from "../src/core/story-memory-transport";
import {continuationWorld} from "./fixtures/story-continuation-quality";
const hints=(text:string)=>{const block=text.split("<deeprole_story_memory>")[1]?.split("</deeprole_story_memory>")[0];return block?decodeStoryMemory(JSON.parse(block.split("\n")[1]!)):[]};
function readers(f:ReturnType<typeof continuationWorld>){const scope={worldId:f.input.story!.world.id,entities:f.input.entities!},episodes=createEpisodeReader(f.input.story!.roleSeeds,f.input.story!.episodeSources),roles=createStoryRoleReader(scope,"",storedRoleReader(f.input.story!.roleSeeds!,f.input.entities!,scope.worldId,{},true));return {episodes,roles,time:createStoryTimeReader(f.input.story!.facts,episodes)};}
it.each(["Continue.","Nora, go on.","Please continue.","Mira, what happens next?","Продолжай.","Нора, давай дальше.","Пожалуйста, продолжай.","Мира, что происходит дальше?"])("recognizes only bounded generic continuation: %s",draft=>{
  expect(isPlainStoryContinuation(draft,["Nora","Mira","Нора","Мира"])).toBe(true);
});
it.each(["","\"Continue\"","«Продолжай»." ,"Nora, \"Continue\".","Nora, 'Continue'.","Do not continue.","Не продолжай.","Continue repairing the gate.","Продолжай ремонт ворот.","Where is the clock key?","What did Nora promise?","She continues.","Что с её обещанием?"])("keeps unsupported or quoted/action/owner syntax outside balance: %s",draft=>{
  expect(isPlainStoryContinuation(draft,["Nora","Нора"])).toBe(false);
});
it("does not turn a character's own name into a continuation command",()=>{
  expect(isPlainStoryContinuation("Continue",["Continue"])).toBe(false);expect(isPlainStoryContinuation("Ann Lee, go on.",["Ann","Ann Lee"])).toBe(true);
  expect(isPlainStoryContinuation("O'Connor, go on.",["O'Connor"])).toBe(true);
});
it("declared positive bindings are backed by frozen grammar, not invented owners",()=>{
  for(const locale of ["ru","en"] as const){const f=continuationWorld(locale),read=createStoryRoleReaderV1({worldId:f.base.world.id,entities:f.base.entities});expect(read.read(f.task)?.promisor?.id).toBe(f.base.entities[0]!.id);expect(read.read(f.plan)?.planner?.id).toBe(f.base.entities[1]!.id);expect(read.read(f.knowledge)?.speaker?.id).toBe(f.base.entities[1]!.id);}
});
it("recipients do not own a commitment; unknown source order and invalidated quotes do not gain lanes",()=>{
  const f=continuationWorld("en"),r=readers(f),read=(ids:string[])=>storyContinuationCandidates([f.task,f.knowledge],ids,r.roles,r.episodes,r.time);
  expect(read([f.base.entities[1]!.id]).tasks).toEqual([]);expect(read([f.base.entities[0]!.id]).persistent).toEqual([]);
  const noOrder=createEpisodeReader(f.seeds,[]);expect(storyContinuationCandidates([f.task,f.knowledge],f.base.entities.map(e=>e.id),r.roles,noOrder,r.time)).toEqual({tasks:[],persistent:[]});
  f.task.quote+=" Changed evidence.";expect(read([f.base.entities[0]!.id]).tasks).toEqual([]);
});
it("same-name replacements cannot inherit old ownership; renames retain exact historical ID and name",()=>{
  const f=continuationWorld("en"),owner=f.base.entities[0]!;f.input.entities=[{...owner,id:"replacement"},f.base.entities[1]!];f.input.character![2]=f.input.entities;f.input.character![3]!.presentIds=["replacement"];const r=readers(f);
  expect(storyContinuationCandidates([f.task],["replacement"],r.roles,r.episodes,r.time).tasks).toEqual([]);
  f.input.entities=[{...owner,name:"Renamed Nora"},f.base.entities[1]!];const next=readers(f);expect(storyContinuationCandidates([f.task],[owner.id],next.roles,next.episodes,next.time).tasks).toEqual([f.task]);expect(next.roles.read(f.task)?.promisor).toMatchObject({id:owner.id,name:"Renamed Nora",sourceName:"Nora"});
});
it("current-game compaction never resurrects completed/cancelled/replaced obligations or reclassified knowledge",()=>{
  const f=continuationWorld("en");for(const status of ["completed","cancelled"] as const){const done:StoryFact={kind:"event",text:"Duty closed",quote:"Duty closed",task:{...f.task.task!,status}},kept=compactStoryFactSources([f.task,done]);const r=readers(f);expect(storyContinuationCandidates(kept,[f.base.entities[0]!.id],r.roles,r.episodes,r.time).tasks).toEqual([]);}
  const changed:StoryFact={...f.knowledge,claim:{...f.knowledge.claim!,lifetime:"scene",transition:"correction"}},r=readers(f);expect(storyContinuationCandidates([changed],f.base.entities.map(e=>e.id),r.roles,r.episodes,r.time).persistent).toEqual([]);
});
it("recorded source order, not a matching number or an invented deadline, chooses the protected task",()=>{
  const f=continuationWorld("en"),other:StoryFact={...f.task,text:"Nora promised help yesterday; deadline passed.",quote:"Nora promised help yesterday; deadline passed.",task:{key:"overdue-wording",title:"Help yesterday",status:"open"}};
  f.input.story!.facts=[other,...f.input.story!.facts];f.input.story!.roleSeeds!.unshift(f.seed(other,"earlier-duty","promisor",f.base.entities[0]!));f.input.story!.episodeSources!.unshift("earlier-duty");const r=readers(f),c=storyContinuationCandidates([other,f.task],f.base.entities.map(e=>e.id),r.roles,r.episodes,r.time);
  expect(c.tasks).toEqual([f.task,other]);expect(other.task!.status).toBe("open");
});
it("known empty scene does not infer presence from old mentions; scene-free unique references remain context only",()=>{
  const f=continuationWorld("en");f.input.character![3]!.presentIds=[];expect(compileGameContext(f.input)).toEqual(compileGameContext(f.input,{continuationBalance:false}));
  f.input.character=undefined;const out=compileGameContext(f.input);expect(hints(out.text).some(h=>h.text===f.task.text)).toBe(true);expect(f.input.scene!.focusIds).toEqual([]);
});
it.each(["ru","en"] as const)("whole-budget overflow and an oversized anchor restore EXACT previous counters/selection: %s",locale=>{
  const f=continuationWorld(locale);f.input.settings.contextBudget=900;f.latest.quote+=" Full original condition. ".repeat(85);const before=structuredClone(f.input),out=compileGameContext(f.input);
  expect(out).toEqual(compileGameContext(f.input,{continuationBalance:false}));expect(f.input).toEqual(before);expect(out.report.total).toBe(addedContextTokens(out.text));
});
it.each(["ru","en"] as const)("keeps one current anchor, owned open task and lasting source within2000 tokens: %s",locale=>{
  const f=continuationWorld(locale);f.input.settings.contextBudget=2000;const before=structuredClone(f.input),out=compileGameContext(f.input),selected=hints(out.text);
  for(const target of [f.latest,f.task,f.knowledge])expect(selected.some(h=>h.text===target.text)).toBe(true);expect(out.report.total).toBeLessThanOrEqual(2000);expect(f.input).toEqual(before);
});
it("reference-only service, absent story and new-game restart do not reserve game lanes",()=>{
  const f=continuationWorld("en");for(const mode of ["reference","absent","restart"]){const input=structuredClone(f.input);if(mode==="reference")input.character![9]=true;if(mode==="absent")input.story=undefined;if(mode==="restart")input.restart=true;expect(compileGameContext(input)).toEqual(compileGameContext(input,{continuationBalance:false}));}
});
