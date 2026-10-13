import {expect,it} from "vitest";
import {storyContentRelevance} from "../src/core/story-content-relevance";
import {compileGameContext,addedContextTokens} from "../src/core/game-context";
import {decodeStoryMemory} from "../src/core/story-memory-transport";
import {validStoryFact,type StoryFact} from "../src/core/story-update";
import {admissionWorld,topicAdmissionCorpus} from "./fixtures/story-topic-admission";

const fact=(text:string,extra:Partial<StoryFact>={}):StoryFact=>({kind:"event",text,quote:text,...extra});
const hints=(text:string)=>{const block=text.split("<deeprole_story_memory>")[1]?.split("</deeprole_story_memory>")[0];return block?decodeStoryMemory(JSON.parse(block.split("\n")[1]!)):[]};
it.each(["Continue.","Nora, what happens next?","Nora oxygen","Oxygen is here.","What about oxygen and a dragon?","What about repair oxygen?","Where is she?"])("does not prune without a completely supported explicit topic request: %s",query=>{
  expect(storyContentRelevance([fact("Oxygen is here"),fact("Nora spoke")],query,["Nora"]).admission).toBeUndefined();
});
it("coverage requires whole admitted records for EVERY requested term, not just a positive score",()=>{
  const a=fact("Oxygen is here"),b=fact("Telemetry is pending"),noise=fact("Nora spoke"),r=storyContentRelevance([a,b,noise],"What about oxygen and telemetry?",["Nora"]);
  expect(r.admission).toBeDefined();expect(r.admission!.matches(noise)).toBe(false);expect(r.admission!.covers([])).toBe(false);expect(r.admission!.covers([a])).toBe(false);expect(r.admission!.covers([a,b])).toBe(true);
});
it("a common requested topic protects its open task without manufacturing a new score",()=>{
  const a=fact("The clock key is blue"),b=fact("The clock needs repair",{kind:"task",task:{key:"clock",title:"Repair the clock",status:"open"}}),r=storyContentRelevance([a,b],"Where is the clock key?",[]);
  expect(r.score(b)).toBe(0);expect(r.admission!.matches(b)).toBe(true);expect(r.admission!.covers([a,b])).toBe(true);
});
it.each(["quote","claimKey","claimValue","taskKey"] as const)("opaque %s cannot establish supported admission",field=>{
  const a=fact("Ordinary note",{...(field==="quote"?{quote:"Oxygen condition"}:{}),...(field.startsWith("claim")?{claim:{key:field==="claimKey"?"oxygen":"opaque",value:field==="claimValue"?"oxygen":"ordinary",scope:"state" as const}}:{}),...(field==="taskKey"?{task:{key:"oxygen",title:"Ordinary duty",status:"open" as const}}:{})});
  expect(storyContentRelevance([a,fact("Other ordinary note")],"Where is oxygen?",[]).admission).toBeUndefined();
});
it("fresh masks/frequencies and edits change admission; previous query coverage is not cached",()=>{
  const a=fact("Oxygen"),b=fact("Telemetry"),read=(query:string,names:string[]=[])=>storyContentRelevance([a,b],query,names);
  expect(read("What about oxygen?").admission).toBeDefined();expect(read("What about oxygen?",["oxygen"]).admission).toBeUndefined();
  b.text="Oxygen";expect(read("What about oxygen?").admission).toBeUndefined();b.text="Other";expect(read("What about telemetry?").admission).toBeUndefined();
  a.text="Other";a.task={key:"duty",title:"Telemetry",status:"completed"};expect(read("What about telemetry?").admission!.covers([a])).toBe(true);
});
it("source-shaped facts in the entire corpus satisfy the accepted schema, even oversized-budget targets",()=>{
  for(const locale of ["ru","en"] as const)for(const c of topicAdmissionCorpus(locale))for(const f of c.input.story!.facts)expect(validStoryFact(f),c.name).toBe(true);
});
it.each(["ru","en"] as const)("fails closed when the eight-fact cap cannot cover nine independent topics: %s",locale=>{
  const f=admissionWorld(locale),targets=Array.from({length:9},(_,i)=>fact("object_"+i+" requires permission."));
  f.input.story!.facts=[...targets,...f.noise];f.input.draft=f.s("Что известно о ","What do we know about ")+targets.map((_,i)=>"object_"+i).join(" ");
  const r=storyContentRelevance(f.input.story!.facts,f.input.draft,["Nora","Mira","Нора","Мира"]);
  expect(r.admission).toBeDefined();expect(r.admission!.covers(targets.slice(0,8))).toBe(false);expect(r.admission!.covers(targets)).toBe(true);
  expect(compileGameContext(f.input)).toEqual(compileGameContext(f.input,{topicAdmission:false}));
});
it.each(["ru","en"] as const)("selected latest claim replaces an older source without admitting superseded text: %s",locale=>{
  const f=admissionWorld(locale),old=fact(f.s("Кислород находится в шкафу.","Oxygen is in the cupboard."),{claim:{key:"supply",value:"cupboard",scope:"state"}}),next=fact(f.s("Кислород находится в кладовой, не в шкафу.","Oxygen is in the pantry, not the cupboard."),{claim:{key:"supply",value:"pantry",scope:"state",transition:"progress"}});
  f.input.story!.facts=[old,next,...f.noise];f.input.draft=f.s("Что известно о кислороде?","What do we know about oxygen?");const before=structuredClone(f.input),out=compileGameContext(f.input),selected=hints(out.text);
  expect(selected).toHaveLength(1);expect(selected[0]!.text).toBe(next.text);expect(selected[0]!.claim).toEqual(next.claim);expect(out.report.omitted.facts).toBe(20);expect(f.input).toEqual(before);
});
it.each(["ru","en"] as const)("small budget preserves entire source and unrelated manual required lore: %s",locale=>{
  const f=admissionWorld(locale);f.input.draft=f.s("Что известно о кислороде?","What do we know about oxygen?");f.input.settings.contextBudget=2000;
  f.base.entry.activation="always";f.base.entry.content=f.s("НЕ ВХОДИТЬ БЕЗ РАЗРЕШЕНИЯ.","DO NOT ENTER WITHOUT PERMISSION.");f.input.entries=[f.base.entry];
  const out=compileGameContext(f.input),selected=hints(out.text);expect(selected).toHaveLength(1);expect(selected[0]!.sourceQuote??selected[0]!.text).toBe(f.facts[0]!.quote);expect(out.text).toContain(f.base.entry.content);expect(out.report.total).toBe(addedContextTokens(out.text));expect(out.report.total).toBeLessThanOrEqual(2000);
});
it("no scoped game and reference-only service retain the previous selection",()=>{
  const f=admissionWorld("en");f.input.draft="What about oxygen?";f.input.story=undefined;f.input.scene=undefined;
  expect(compileGameContext(f.input)).toEqual(compileGameContext(f.input,{topicAdmission:false}));
});
