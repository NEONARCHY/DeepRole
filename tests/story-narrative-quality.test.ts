import { expect, it } from "vitest";
import { narrativeQualityCorpus } from "./fixtures/story-narrative-quality";
import { createStoryNarrativeReader } from "../src/core/story-narrative";
import { storyFactIdentity } from "../src/core/story-memory-lifecycle";
import { storyEpisodes } from "../src/core/story-episodes";

for(const locale of ["ru","en"] as const) for(const c of narrativeQualityCorpus(locale)) it(`narrative fixed quality ${locale}: ${c.name}`,()=>{
  const before=structuredClone(c),reader=createStoryNarrativeReader(c.facts,c.seeds,c.sources,locale);
  const result=reader.read(c.facts);
  expect(result.omitted).toBe(0);expect(result.parts.map(p=>p.signal)).toEqual(c.signals);
  expect(result.parts.map(p=>p.reference.sourceRevisionId)).toEqual(c.expectedSources);
  expect(result.parts.map(p=>p.reference.fact)).toEqual(c.kept.map(i=>c.facts[i]));
  for(const [index,p] of result.parts.entries()){
    const fact=c.facts[c.kept[index]!]!;
    expect(p.reference.factId).toBe(storyFactIdentity(fact));expect(p.reference.quote).toBe(fact.quote);expect(p.text).toContain(fact.quote);
    const expectedRoles=c.expectedSources[index]===null?{}:c.roles?.[c.kept[index]!]??{};
    if(Object.keys(expectedRoles).length)expect(p.reference.roles).toEqual(expectedRoles);else expect(p.reference.roles).toBeUndefined();
  }
  for(const span of c.critical??[])expect(result.text).toContain(span);
  if(c.name==="unknown-chronology")expect(result.parts[0]?.link).toBe("unplaced");
  if(c.name==="same-source-distinct-obligations")expect(result.parts.map(p=>p.link)).toEqual(["first","same"]);
  if(c.name==="source-order-not-array-order")expect(result.parts.map(p=>p.link)).toEqual(["first","later"]);
  expect(c).toEqual(before);
  result.parts[0]!.reference.fact.text="UI copy mutation";
  expect(reader.read(c.facts).parts[0]!.reference.fact).toEqual(c.facts[c.kept[0]!]!);
});

it("compares visible critical spans with the old short outline, not with its already preserved full sources",()=>{
  let baseline=0,current=0,total=0;
  for(const locale of ["ru","en"] as const)for(const c of narrativeQualityCorpus(locale)){
    const outline=storyEpisodes(c.facts,c.seeds,c.sources).flatMap(e=>e.facts).map(f=>f.text).join(" ");
    const brief=createStoryNarrativeReader(c.facts,c.seeds,c.sources,locale).read(c.facts);
    for(const span of c.critical??[]){total++;baseline+=Number(outline.includes(span));current+=Number(brief.text.includes(span));}
  }
  expect(total).toBe(14);expect(baseline).toBe(0);expect(current).toBe(total);
});
