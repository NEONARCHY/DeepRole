import {expect,it} from "vitest";
import {compileGameContext,addedContextTokens} from "../src/core/game-context";
import {decodeStoryMemory} from "../src/core/story-memory-transport";
import {validStoryFact} from "../src/core/story-update";
import {continuationQualityCorpus} from "./fixtures/story-continuation-quality";
const hints=(text:string)=>{const block=text.split("<deeprole_story_memory>")[1]?.split("</deeprole_story_memory>")[0];return block?decodeStoryMemory(JSON.parse(block.split("\n")[1]!)):[]};
it("measures complete-target recall on the fixed continuation corpus, with unchanged controls",()=>{
  let oldRecall=0,recall=0,positive=0,control=0;
  for(const locale of ["ru","en"] as const)for(const c of continuationQualityCorpus(locale)){
    const old=compileGameContext(c.input,{continuationBalance:false}),out=compileGameContext(c.input);
    if(c.balanced){positive++;oldRecall+=Number(c.wanted.every(f=>hints(old.text).some(h=>h.text===f.text)));recall+=Number(c.wanted.every(f=>hints(out.text).some(h=>h.text===f.text)));}
    else{control++;expect(out).toEqual(old);}
  }
  console.info("Independent continuation48:",JSON.stringify({positive,control,oldRecall,recall}));expect(positive).toBe(24);expect(control).toBe(24);expect(oldRecall).toBe(0);expect(recall).toBe(24);
});
for(const locale of ["ru","en"] as const)for(const c of continuationQualityCorpus(locale))it(`ordinary continuation ${c.name}`,()=>{
  const before=structuredClone(c.input),old=compileGameContext(c.input,{continuationBalance:false}),out=compileGameContext(c.input),selected=hints(out.text);
  if(c.balanced){
    for(const f of c.wanted){const h=selected.find(h=>h.text===f.text);expect(h,c.name).toBeDefined();expect(h!.kind).toBe(f.kind);expect(h!.sourceQuote??h!.text).toBe(f.quote);if(f.task)expect(h!.task).toEqual(f.task);if(f.claim)expect(h!.claim).toEqual(f.claim);}
    expect(selected[0]!.text).toBe(c.wanted[0]!.text);expect(selected.filter(h=>h.task?.status==="open")).toHaveLength(1);expect(out.report.explanation?.openTasks).toBe(1);expect(out.report.explanation?.persistentFacts).toBe(1);expect(selected).toHaveLength(8);
  }else expect(out).toEqual(old);
  expect(out.report.total).toBe(addedContextTokens(out.text));expect(out.report.total<=out.report.limit||out.report.required>out.report.limit).toBe(true);expect(c.input).toEqual(before);
  for(const fact of c.input.story!.facts)expect(validStoryFact(fact)).toBe(true);
});
