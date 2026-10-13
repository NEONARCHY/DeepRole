import {expect,it} from "vitest";
import {relevanceQualityCorpus} from "./fixtures/story-relevance-quality";
import {rankStoryFacts} from "../src/core/story-fact-context";
import {compileGameContext,addedContextTokens} from "../src/core/game-context";
import {decodeStoryMemory} from "../src/core/story-memory-transport";

it("measures the fixed pre-change selection without gold labels from the scorer",()=>{
  let first=0,selected=0;
  for(const locale of ["ru","en"] as const)for(const c of relevanceQualityCorpus(locale)){
    const story=c.input.story!,scope={worldId:story.world.id,entities:c.input.entities!};
    first+=Number(rankStoryFacts(story.facts,c.input.draft,scope,undefined,false)[0]!.fact.text===c.first.text);
    const out=compileGameContext(c.input,{contentRelevance:false}),block=out.text.split("<deeprole_story_memory>")[1]!.split("</deeprole_story_memory>")[0]!,hints=decodeStoryMemory(JSON.parse(block.split("\n")[1]!));
    selected+=Number(c.wanted.every(f=>hints.some(h=>h.text===f.text)));expect(out.report.total).toBe(addedContextTokens(out.text));
  }
  console.info("Fixed pre-change corpus48:",JSON.stringify({first,selected}));
  expect(first).toBe(24);expect(selected).toBe(24);
});
it("reports the new fixed-corpus result with no condition/status/source loss",()=>{
  let first=0,selected=0;
  for(const locale of ["ru","en"] as const)for(const c of relevanceQualityCorpus(locale)) {
    const out=compileGameContext(c.input),block=out.text.split("<deeprole_story_memory>")[1]!.split("</deeprole_story_memory>")[0]!,hints=decodeStoryMemory(JSON.parse(block.split("\n")[1]!));
    first+=Number(hints[0]?.text===c.first.text);selected+=Number(c.wanted.every(f=>hints.some(h=>h.text===f.text)));
  }
  expect(first).toBe(48);expect(selected).toBe(48);console.info("Fixed current corpus48:",JSON.stringify({first,selected}));
});
for(const locale of ["ru","en"] as const)for(const c of relevanceQualityCorpus(locale))it(`relevant request ${c.name}`,()=>{
  const before=structuredClone(c.input),out=compileGameContext(c.input),block=out.text.split("<deeprole_story_memory>")[1]!.split("</deeprole_story_memory>")[0]!,hints=decodeStoryMemory(JSON.parse(block.split("\n")[1]!));
  expect(hints[0]?.text).toBe(c.first.text);
  for(const f of c.wanted){const h=hints.find(h=>h.text===f.text);expect(h).toMatchObject({kind:f.kind,...(f.task?{task:f.task}:{})});expect(h?.sourceQuote??h?.text).toBe(f.quote);}
  expect(JSON.stringify(hints)).toContain(c.critical);expect(out.report.total).toBeLessThanOrEqual(c.input.settings.contextBudget);expect(c.input).toEqual(before);
});
