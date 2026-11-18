import {expect,it} from "vitest";
import {storyContentRelevance} from "../src/core/story-content-relevance";
import {isNonAdvancingDiscussion,rankStoryFacts} from "../src/core/story-fact-context";
import {storyRetrievalQuery} from "../src/core/story-retrieval-query";
import {createStoryRoleReader} from "../src/core/story-source-roles";
import {storyWorld} from "./fixtures/story-worlds";
import {compileGameContext,addedContextTokens} from "../src/core/game-context";
import {relevanceQualityCorpus} from "./fixtures/story-relevance-quality";
import {decodeStoryMemory} from "../src/core/story-memory-transport";
import {validStoryFact,type StoryFact} from "../src/core/story-update";

const f=(text:string,extra:Partial<StoryFact>={}):StoryFact=>({kind:"event",text,quote:text,...extra});
it.each(["ru","en"] as const)("distinguishes who gets which materials in similarly worded long histories: %s",locale=>{
  const input = relevanceQualityCorpus(locale)[0]!.input;
  const ru = locale === "ru";
  const right = f(ru ? "Полотно для мастерской и тушь для школы отложены." : "Canvas for the studio and ink for the school were set aside.");
  const swapped = ru ? "Тушь для мастерской и полотно для школы отложены." : "Ink for the studio and canvas for the school were set aside.";
  input.story = {...input.story!,facts:[right,...Array.from({length:220},(_,i)=>f(swapped+" №"+i))]};
  input.recentMessages = [];
  input.settings.contextBudget = 2000;
  input.draft = ru ? "Забираю полотно для мастерской." : "I collect the canvas for the studio.";
  const out = compileGameContext(input);
  const rows = decodeStoryMemory(JSON.parse(out.text.split("<deeprole_story_memory>")[1]!.split("\n")[1]!));
  expect(rows?.map(row=>row.text)).toContain(right.text);
  expect(out.report.total).toBeLessThanOrEqual(out.report.limit);
});
it.each(["ru","en"] as const)("recalls the older named concert among 240 similar memories in the outgoing context: %s",locale=>{
  const input = relevanceQualityCorpus(locale)[0]!.input;
  const ru = locale === "ru";
  const wish = f(ru ? "Мира хочет попасть на концерт группы «N»." : "Mira wants to attend the concert of band N.",{kind:"plan"});
  const distractors = Array.from({length:240},(_,i)=>f(ru
    ? `Мира обсуждала концерт группы «Z». Запись ${i}.` : `Mira discussed the concert of band Z. Entry ${i}.`));
  input.story = {...input.story!,facts:[wish,...distractors]};
  input.recentMessages = [];
  input.settings.contextBudget = 2000;
  input.draft = ru ? "У кассы беру билеты на концерт группы «N»." : "At the counter I buy tickets for the concert of band N.";
  const out = compileGameContext(input);
  const rows = decodeStoryMemory(JSON.parse(out.text.split("<deeprole_story_memory>")[1]!.split("\n")[1]!));
  expect(rows?.map(row=>row.text)).toContain(wish.text);
  expect(rows!.length).toBeLessThan(20);
  expect(out.report.total).toBeLessThanOrEqual(out.report.limit);
});
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
it.each([
 ["Позже Лада снова обсуждала маховик и аккумулятор; новых действий или передач не было.","Лада вручную раскрутила резервный маховик при отказе; аккумулятор не включился.","Что произошло с аккумулятором?"],
 ["Later Lada again discussed the rotor and battery; no new actions or handovers occurred.","Lada hand-cranked the backup rotor during the outage; the battery did not engage.","What happened to the battery?"],
])("keeps a clearly non-advancing recap below played evidence for an event question",(recap,played,query)=>{
 const facts=[f(recap),f(played)];expect(rankStoryFacts(facts,query)[0]!.fact.text).toBe(played);
});
it.each([
 ["A rumor says the violet seal is in the north archive; the speaker does not know its owner.","Who owns the violet seal?"],
 ["Слух утверждает, что фиолетовая печать в северном архиве; рассказчик не знает владельца.","Кто владеет фиолетовой печатью?"],
])("matches an unknown-owner belief without treating it as fact",(belief,query)=>{
 const source=f(belief,{kind:"belief"}),noise=f(belief.includes("A rumor")?"Later they discussed the violet seal near the north archive.":"Позже снова обсуждали фиолетовую печать возле северного архива.");
 const match=storyContentRelevance([source,noise],query,[]);
 expect(match.score(source)).toBeGreaterThan(match.score(noise));expect(match.admission?.covers([source])).toBe(true);
});
it.each([
 ["An unverified note says the silver key was found near the clinic, but nobody identified its owner.","The clinic log also lists a silver key by the desk, but gives no further details.","Do we know whose silver key was found by the clinic?"],
 ["Непроверенная записка сообщает, что серебряный ключ нашли у клиники, но владелец неизвестен.","В журнале клиники тоже указан серебряный ключ у стойки, но больше ничего не сказано.","Мы знаем, чей серебряный ключ нашли у клиники?"],
])("keeps indirect whose-questions source-bound and excludes matching non-owner events",(belief,event,query)=>{
 const source=f(belief,{kind:"belief"}),neighbor=f(event),match=storyContentRelevance([source,neighbor],query,[]);
 expect(match.admission?.matches(source)).toBe(true);expect(match.admission?.matches(neighbor)).toBe(false);
 expect(match.admission?.covers([source])).toBe(true);expect(match.admission?.covers([source,neighbor])).toBe(true);
});
it.each([
 ["Позже Лада снова обсуждала маховик и аккумулятор; новых действий или передач не было.","Кто обсуждал аккумулятор?"],
 ["Later Lada again discussed the rotor and battery; no new actions or handovers occurred.","Who discussed the battery?"],
])("keeps the recap available when the user asks about discussion",(recap,query)=>{
 const facts=[f(recap),f("Unrelated record")];expect(rankStoryFacts(facts,query)[0]!.fact.text).toBe(recap);
});
it.each([
 ["Later the crew again discussed the red case; no new actions or handovers occurred.","What did the crew keep circling back to about the red case?"],
 ["Позже команда снова обсуждала красный кейс; новых действий или передач не было.","Что команда снова и снова возвращалась обсуждать насчёт красного кейса?"],
])("keeps narrative recaps available for conversational discussion paraphrases",(recap,query)=>{
 const facts=[f(recap),f("The red case was stored in the clinic."),f("A separate unrelated event happened.")];
 expect(rankStoryFacts(facts,query)[0]!.fact.text).toBe(recap);
});
it("never downranks a promise or a recap lacking the explicit no-new-action statement",()=>{
 const recap=f("Later Lada again discussed the battery; the crew then replaced it.");
 const promise=f("Later Lada again discussed the battery; no new actions or handovers occurred.",{kind:"promise",task:{key:"battery",title:"replace the battery",status:"open"}});
 expect(isNonAdvancingDiscussion(recap)).toBe(false);expect(isNonAdvancingDiscussion(promise)).toBe(false);
 expect(rankStoryFacts([recap,promise],"What happened before replacing the battery?").map(x=>x.fact)).toEqual([recap,promise]);
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
