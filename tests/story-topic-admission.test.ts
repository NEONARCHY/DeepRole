import {expect,it} from "vitest";
import {compileGameContext,addedContextTokens} from "../src/core/game-context";
import {decodeStoryMemory} from "../src/core/story-memory-transport";
import {topicAdmissionCorpus} from "./fixtures/story-topic-admission";

const hints=(text:string)=>{const block=text.split("<deeprole_story_memory>")[1]?.split("</deeprole_story_memory>")[0];return block?decodeStoryMemory(JSON.parse(block.split("\n")[1]!)):[]};
it("measures the independent fixed admission corpus baseline and current full added request",()=>{
  let oldFacts=0,newFacts=0,oldChars=0,newChars=0,positive=0,controls=0,oldRecall=0,newRecall=0,comparableOldChars=0,comparableNewChars=0;
  for(const locale of ["ru","en"] as const)for(const c of topicAdmissionCorpus(locale)) {
    const old=compileGameContext(c.input,{topicAdmission:false}),out=compileGameContext(c.input);
    if(c.prune){positive++;oldFacts+=old.report.selected.facts;newFacts+=out.report.selected.facts;oldChars+=old.text.length;newChars+=out.text.length;
      const previous=hints(old.text),current=hints(out.text),covered=c.wanted.every(f=>previous.some(h=>h.text===f.text));oldRecall+=Number(covered);newRecall+=Number(c.wanted.every(f=>current.some(h=>h.text===f.text)));
      if(covered){comparableOldChars+=old.text.length;comparableNewChars+=out.text.length;}
    }
    else{controls++;expect(out).toEqual(old);}
  }
  console.info("Independent admission corpus48:",JSON.stringify({positive,controls,oldFacts,newFacts,oldChars,newChars,oldRecall,newRecall,comparableOldChars,comparableNewChars}));
  expect(positive).toBe(24);expect(controls).toBe(24);expect(oldFacts).toBe(192);expect(newFacts).toBe(32);expect(newChars).toBeLessThan(oldChars);expect(oldRecall).toBe(20);expect(newRecall).toBe(24);expect(comparableNewChars).toBeLessThan(comparableOldChars);
});
for(const locale of ["ru","en"] as const)for(const c of topicAdmissionCorpus(locale))it(`topic admission ${c.name}`,()=>{
  const before=structuredClone(c.input),old=compileGameContext(c.input,{topicAdmission:false}),out=compileGameContext(c.input),selected=hints(out.text);
  if(c.prune){
    const previous=hints(old.text),covered=c.wanted.every(f=>previous.some(h=>h.text===f.text));
    expect(selected).toHaveLength(c.wanted.length);
    expect(selected.map(h=>h.text).sort()).toEqual(c.wanted.map(f=>f.text).sort());
    for(const f of c.wanted){const h=selected.find(h=>h.text===f.text)!;expect(h.kind).toBe(f.kind);expect(h.sourceQuote??h.text).toBe(f.quote);if(f.task)expect(h.task).toEqual(f.task);}
    expect(out.report.omitted.facts).toBe(c.input.story!.facts.length-c.wanted.length);if(covered)expect(out.text.length).toBeLessThan(old.text.length);
  }else{
    expect(out).toEqual(old);
    if(c.name.endsWith(":continuation")){expect(selected.some(h=>h.task?.status==="open")).toBe(true);expect(selected.some(h=>h.text===c.input.story!.facts.at(-2)!.text)).toBe(true);}
  }
  expect(c.input).toEqual(before);expect(out.report.total).toBe(addedContextTokens(out.text));expect(out.report.total<=out.report.limit||out.report.required>out.report.limit).toBe(true);
});
