import {expect,it} from "vitest";
import {storyContentRelevance} from "../src/core/story-content-relevance";
import {rankStoryFacts} from "../src/core/story-fact-context";
import {storyRetrievalQuery} from "../src/core/story-retrieval-query";
import {createStoryRoleReader} from "../src/core/story-source-roles";
import {storyWorld} from "./fixtures/story-worlds";
import {compileGameContext,addedContextTokens} from "../src/core/game-context";
import {relevanceQualityCorpus} from "./fixtures/story-relevance-quality";
import {decodeStoryMemory} from "../src/core/story-memory-transport";
import {validStoryFact,type StoryFact} from "../src/core/story-update";

const f=(text:string,extra:Partial<StoryFact>={}):StoryFact=>({kind:"event",text,quote:text,...extra});
it.each(["Nora","Нора","What do we know about Nora?","Напомни о Норе","Where is she?","Что она обещала?","UNKNOWN TOPIC","unmentioned"]) ("does not turn names/framing/pronouns/unsupported text into a topic: %s",query=>{
  const facts=[f("Nora asked what we know."),f("Нора попросила напомнить подробности.")];
  expect(facts.map(x=>storyContentRelevance(facts,query,["Nora","Нора","Норе"]).score(x))).toEqual([0,0]);
});
it.each(["sourceQuote","claimKey","claimValue","taskKey"] as const)("does not discover a topic solely from %s",field=>{
  const a=f("Ordinary note",{...(field==="sourceQuote"?{quote:"Oxygen clue"}:{}),...(field.startsWith("claim")?{claim:{key:field==="claimKey"?"oxygen":"opaque",value:field==="claimValue"?"oxygen":"ordinary",scope:"state" as const}}:{}),...(field==="taskKey"?{kind:"promise",task:{key:"oxygen",title:"Unrelated duty",status:"open" as const}}:{})}),b=f("Another ordinary note");
  expect(storyContentRelevance([a,b],"oxygen",[]).score(a)).toBe(0);
});
it("scores whole task titles and full bodies while preserving exact data",()=>{
  const a=f("The assigned duty is complete.",{task:{key:"opaque",title:"A lengthy timetable and paperwork review before addressing telemetry",status:"completed"}}),b=f("Nora: "+"Routine briefing. ".repeat(20)+" Oxygen supply requires permission."),noise=f("Nora asked about the meeting.");
  const before=structuredClone([a,b,noise]),reader=storyContentRelevance([a,b,noise],"telemetry oxygen",["Nora"]);
  expect(reader.score(a)).toBe(16);expect(reader.score(b)).toBe(16);expect(reader.score(noise)).toBe(0);expect([a,b,noise]).toEqual(before);
});
it("common words cannot drown the distinctive topic or multiply by repeated occurrences",()=>{
  const a=f("Gate oxygen "+"oxygen ".repeat(20)),b=f("Gate flower"),c=f("Gate table"),reader=storyContentRelevance([a,b,c],"gate oxygen",[]);
  expect(reader.score(a)).toBe(32);expect(reader.score(b)).toBe(0);expect(storyContentRelevance([a],"oxygen",[]).score(a)).toBe(0);
});
it.each(["Continue. What happened?","Дальше. Что произошло?"])("generic continuation does not gain a topic bonus: %s",query=>{
  const a=f("Nora said continue and described what happened."),b=f("Нора сказала продолжай и описала, что произошло."),facts=[a,b,f("The door is open.")];
  expect(facts.map(x=>storyContentRelevance(facts,query,["Nora","Нора"]).score(x))).toEqual([0,0,0]);
});
it.each(["repair gate","fix gate","mend gate","починить ворота","восстановить ворота","отдать обратно книгу"])("does not make a recognized action a second rare topic: %s",query=>{
  const facts=[f(query.split(" ")[0]!+" roof"),f("Unrelated")];expect(storyContentRelevance(facts,query,[]).score(facts[0]!)).toBe(0);
});
it("masks the longest full names without erasing distinct object words",()=>{
  const facts=[f("Ann Lee waits by the oxygen tank."),f("Ann is in the kitchen.")];
  expect(storyContentRelevance(facts,"Ann Lee",["Ann","Ann Lee"]).score(facts[0]!)).toBe(0);
  expect(storyContentRelevance(facts,"Ann Lee oxygen",["Ann","Ann Lee"]).score(facts[0]!)).toBe(32);
});
it("rebuilds frequency and cached projections after title/text edits, new masks and subset changes",()=>{
  const a=f("Nora has oxygen"),b=f("Unrelated"),read=()=>storyContentRelevance([a,b],"oxygen",[]);
  expect(read().score(a)).toBe(32);a.text="Routine note";expect(read().score(a)).toBe(0);
  a.task={key:"duty",title:"oxygen",status:"completed"};expect(read().score(a)).toBe(32);a.task.title="Other";expect(read().score(a)).toBe(0);
  a.text="Nora has oxygen";expect(storyContentRelevance([a,b],"oxygen",["oxygen"]).score(a)).toBe(0);
  expect(storyContentRelevance([a],"oxygen",[]).score(a)).toBe(0);expect(read().score(a)).toBe(32);
});
it("owner questions retain exactly their source-bound order and scores",()=>{
  const w=storyWorld("en",2);w.entities[0]!.name="Nora";w.entities[1]!.name="Mira";const scope={worldId:w.world.id,entities:w.entities},query="What did Nora promise Mira?",roles=createStoryRoleReader(scope,query);
  const facts=[f("A commitment",{kind:"promise",quote:"Nora told Mira: “I promise to help.”"}),f("Oxygen duty",{kind:"promise",quote:"Mira told Nora: “I promise to bring oxygen.”"})];
  expect(roles.question).toBeDefined();expect(rankStoryFacts(facts,query,scope,roles)).toEqual(rankStoryFacts(facts,query,scope,roles,false));
});
it("ambiguous current names do not establish an owner through topic scoring",()=>{
  const w=storyWorld("en",2);w.entities.forEach(e=>e.name="Alex");const scope={worldId:w.world.id,entities:w.entities};
  const facts=[f("Alex spoke about oxygen.",{kind:"belief",quote:"Alex believes oxygen is available."}),f("Alex discussed flowers.")],out=rankStoryFacts(facts,"Alex oxygen",scope);
  expect(out[0]!.fact).toEqual(facts[0]);expect(createStoryRoleReader(scope).read(facts[0]!)).toBeUndefined();expect(storyRetrievalQuery("Alex oxygen",scope).ambiguousName).toBe(true);
});
it("full corpus uses valid accepted fact shapes and exact read-only source references",()=>{
  for(const locale of ["ru","en"] as const)for(const c of relevanceQualityCorpus(locale))for(const fact of c.input.story!.facts)expect(validStoryFact(fact)).toBe(true);
});
it.each(["ru","en"] as const)("keeps the older topic ahead of 2000 newer framing records and respects a small budget: %s",locale=>{
  const c=relevanceQualityCorpus(locale)[0]!,facts=c.input.story!.facts,target=c.first,noise=facts.at(-1)!;
  facts.push(...Array.from({length:2000},(_,i)=>f(noise.text+" "+i)));c.input.settings.contextBudget=2000;
  const out=compileGameContext(c.input),block=out.text.split("<deeprole_story_memory>")[1]!.split("</deeprole_story_memory>")[0]!,hints=decodeStoryMemory(JSON.parse(block.split("\n")[1]!));
  expect(hints[0]?.text).toBe(target.text);expect(hints[0]?.sourceQuote??hints[0]?.text).toBe(target.quote);expect(out.report.total).toBe(addedContextTokens(out.text));expect(out.report.total).toBeLessThanOrEqual(2000);expect(out.report.omitted.facts).toBeGreaterThan(2000);
});
