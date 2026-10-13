import {expect,it} from "vitest";
import {compileGameContext,addedContextTokens} from "../src/core/game-context";
import {decodeStoryMemory} from "../src/core/story-memory-transport";
import {validStoryFact} from "../src/core/story-update";
import {actionQualityCorpus} from "./fixtures/story-action-quality";
const hints=(text:string)=>{const block=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return block?decodeStoryMemory(JSON.parse(block.split('\n')[1]!)):[];};
it('measures the complete manually specified action subset, preserving exact controls',()=>{
 let before=0,after=0,positive=0,control=0;
 for(const locale of ['ru','en'] as const)for(const c of actionQualityCorpus(locale)){
  const old=compileGameContext(c.input,{actionBalance:false}),out=compileGameContext(c.input);
  if(c.balance){positive++;before+=Number(c.wanted.every(f=>hints(old.text).some(h=>h.text===f.text)));after+=Number(c.wanted.every(f=>hints(out.text).some(h=>h.text===f.text)));}
  else{control++;expect(out).toEqual(old);}
 }
 console.info('Independent action48:',JSON.stringify({positive,control,before,after}));expect(positive).toBe(24);expect(control).toBe(24);expect(before).toBe(0);expect(after).toBe(24);
});
for(const locale of ['ru','en'] as const)for(const c of actionQualityCorpus(locale))it(`ordinary action ${c.name}`,()=>{
 const before=structuredClone(c.input),old=compileGameContext(c.input,{actionBalance:false}),out=compileGameContext(c.input),selected=hints(out.text);
 if(c.balance){
  for(const fact of c.wanted){const hint=selected.find(h=>h.text===fact.text);expect(hint).toBeDefined();expect(hint!.kind).toBe(fact.kind);expect(hint!.sourceQuote??hint!.text).toBe(fact.quote);if(fact.task)expect(hint!.task).toEqual(fact.task);if(fact.claim)expect(hint!.claim).toEqual(fact.claim);}
  expect(selected[0]!.text).toBe(c.wanted[0]!.text);expect(out.report.explanation?.persistentFacts).toBe(1);expect(out.report.explanation?.openTasks).toBe(1);expect(selected).toHaveLength(8);
 }else expect(out).toEqual(old);
 expect(out.report.total).toBe(addedContextTokens(out.text));expect(out.report.total<=out.report.limit||out.report.required>out.report.limit).toBe(true);expect(c.input).toEqual(before);for(const fact of c.input.story!.facts)expect(validStoryFact(fact)).toBe(true);
});
