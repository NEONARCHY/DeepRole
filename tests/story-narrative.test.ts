import { expect,it } from "vitest";
import { createStoryNarrativeReader } from "../src/core/story-narrative";
import { roleSeed } from "../src/core/story-role-binding";
import { storyFactIdentity } from "../src/core/story-memory-lifecycle";
import type { StoryFact } from "../src/core/story-update";
import { storyNarrativeText } from "../src/core/story-narrative-i18n";

const fact=(text:string,extra:Partial<StoryFact>={}):StoryFact=>({kind:"event",text,quote:text,...extra});
const seed=(f:StoryFact,s="s0")=>roleSeed(f,{version:1,sourceRevisionId:s,quote:f.quote,roles:{}});
it.each(["promise","plan","belief","secret"] as const)("temporal classification does not erase %s semantics",kind=>{
  const f=fact("Quoted record",{kind,claim:{key:"record",value:"record",scope:"state",lifetime:"persistent"}}),t=storyNarrativeText("en");
  const brief=createStoryNarrativeReader([f],[seed(f)],["s0"]).read([f]);
  expect(brief.parts[0]?.signal).toBe(kind);expect(brief.text).toContain(t[kind]);expect(brief.text).toContain(t.persistent);expect(brief.parts[0]?.reference.timeStatus).toBe("persistent");
});
it("whole-quote admission skips oversized evidence but does not remove it from accepted facts",()=>{
  const long=fact("Short fact",{kind:"promise",quote:"if permission is given, and not otherwise ".repeat(50)}),short=fact("Small complete event"),input=[long,short],before=structuredClone(input);
  const result=createStoryNarrativeReader(input,[seed(long),seed(short,"s1")],["s0","s1"]).read(input,{maxCharacters:250});
  expect(result.parts.map(p=>p.reference.fact)).toEqual([short]);expect(result.omitted).toBe(1);expect(result.text.length).toBeLessThanOrEqual(250);expect(result.text).not.toContain("Short fact");expect(input).toEqual(before);
});
it("limits facts with a visible omission count; invalid limits cannot produce unbounded output",()=>{
  const facts=Array.from({length:15},(_,i)=>fact("Recorded event "+i)),reader=createStoryNarrativeReader(facts);
  expect(reader.read(facts).parts).toHaveLength(6);expect(reader.read(facts).omitted).toBe(9);
  expect(reader.read(facts,{maxFacts:1000,maxCharacters:Infinity}).parts).toHaveLength(12);
  expect(reader.read(facts,{maxCharacters:0}).text).toBe("");expect(reader.read(facts,{maxFacts:0}).omitted).toBe(15);
});
it("only current accepted exact facts are summarized; replacements, rejection and undo rebuild",()=>{
  const old=fact("Old description"),next=fact("Corrected description",{replaces:[storyFactIdentity(old)]}),sources=["s0","s1"],seeds=[seed(old),seed(next,"s1")];
  expect(createStoryNarrativeReader([old,next],seeds,sources).read([old,next]).parts.map(p=>p.reference.fact)).toEqual([next]);
  expect(createStoryNarrativeReader([old],seeds,sources).read([old,next]).parts.map(p=>p.reference.fact)).toEqual([old]);
  expect(createStoryNarrativeReader([],seeds,sources).read([old,next]).parts).toEqual([]);
  const edited={...old,quote:"Other source"};expect(createStoryNarrativeReader([old],seeds,sources).read([edited]).parts).toEqual([]);
});
it("snapshot and returned references do not mutate sources or resolve changed source quotes",()=>{
  const f=fact("A record"),s=seed(f),reader=createStoryNarrativeReader([f],[s],["s0"]);
  f.text="Real later edit";s.binding.quote="Different source";
  expect(reader.read([f]).parts).toEqual([]);
  const result=reader.read([fact("A record")]);expect(result.parts[0]?.reference.quote).toBe("A record");expect(result.parts[0]?.reference.sourceRevisionId).toBe("s0");
});
it("invalid, missing and foreign-to-selected-order bindings do not manufacture source or roles",()=>{
  const f=fact("She promised help",{kind:"promise"}),s=seed(f);s.binding.quote="Does not match";
  const r=createStoryNarrativeReader([f],[s],["s0"]).read([f]);expect(r.parts[0]?.reference.sourceRevisionId).toBeNull();expect(r.parts[0]?.reference.roles).toBeUndefined();expect(r.parts[0]?.link).toBe("unplaced");
  expect(createStoryNarrativeReader([f],[seed(f)],["s0","s0"]).read([f]).parts[0]?.reference.episode).toBeNull();
});
it("search-selected subsets never include omitted unrelated facts and duplicate references stay unique",()=>{
  const a=fact("Mira's event"),b=fact("Nora's event"),reader=createStoryNarrativeReader([a,b]);
  const result=reader.read([b,b]);expect(result.parts).toHaveLength(1);expect(result.text).not.toContain(a.text);expect(result.total).toBe(1);
});
