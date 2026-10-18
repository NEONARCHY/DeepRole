import {expect,it} from 'vitest';
import {compileGameContext,addedContextTokens} from '../src/core/game-context';
import {decodeStoryMemory} from '../src/core/story-memory-transport';
import {longHorizonScenarios} from './fixtures/story-rp05-long-horizon';
import {validStoryFact} from '../src/core/story-update';

const decode=(text:string)=>{const block=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return block?decodeStoryMemory(JSON.parse(block.split('\n')[1]!)):[];};
const results:Array<{id:string;missing:string[];selected:string[];extras:number;total:number}>=[];
for(const locale of ['ru','en'] as const)for(const repeats of [0,80,400])for(const budget of [6000,10000])for(const s of longHorizonScenarios(locale,repeats,budget))it(`long horizon ${s.id}`,()=>{
  const before=structuredClone(s.input),result=compileGameContext(s.input),selected=decode(result.text);
  expect(s.facts.every(validStoryFact)).toBe(true);
  const prior=decode(compileGameContext(s.input,{taskProgressRecall:false}).text);
  for(const old of prior)expect(selected.some(f=>f.text===old.text&&f.episodeSource?.revisionId===old.episodeSource?.revisionId)).toBe(true);
  const labels:string[]=[];
  for(const hint of selected){
    const i=s.facts.findIndex(f=>f.text===hint.text);expect(i).toBeGreaterThanOrEqual(0);
    const fact=s.facts[i]!,seed=s.input.story!.roleSeeds![i]!;labels.push(s.labels[i]!);
    expect(hint.kind).toBe(fact.kind);expect(hint.sourceQuote??hint.text).toBe(fact.quote);
    expect(hint.task??null).toEqual(fact.task??null);expect(hint.sourceRoles??{}).toEqual(seed.binding.roles);
    expect(hint.episodeSource?.revisionId).toBe(s.sources[i]);
  }
  const missing=s.wanted.filter(id=>!labels.includes(id));
  results.push({id:s.id,missing,selected:labels,extras:labels.filter(id=>!s.wanted.includes(id)).length,total:result.report.total});
  expect(result.report.total).toBe(addedContextTokens(result.text));expect(result.report.total).toBeLessThanOrEqual(result.report.limit);
  expect(s.input).toEqual(before);
  if(s.owner)expect(selected.every(f=>f.kind==='belief')).toBe(true);
});
for(const locale of ['ru','en'] as const)for(const budget of [1200,1800,2400])for(const s of longHorizonScenarios(locale,400,budget).filter(s=>s.id.endsWith('open-with-partial-progress')))it(`tight budget rollback ${s.id}`,()=>{
  const before=structuredClone(s.input),prior=compileGameContext(s.input,{taskProgressRecall:false}),next=compileGameContext(s.input);
  const old=decode(prior.text),chosen=decode(next.text);
  for(const fact of old)expect(chosen.some(f=>f.text===fact.text)).toBe(true);
  for(const hint of chosen){const fact=s.facts.find(f=>f.text===hint.text)!;expect(hint.sourceQuote??hint.text).toBe(fact.quote);expect(hint.task??null).toEqual(fact.task??null);}
  expect(next.report.total).toBe(addedContextTokens(next.text));expect(next.report.total<=budget||next.report.required>budget).toBe(true);
  // Never admit just one member of a newly supplemented group.
  if(chosen.some(f=>f.text===s.facts[3]!.text)&&!old.some(f=>f.text===s.facts[3]!.text))expect(chosen.some(f=>f.text===s.facts[2]!.text)).toBe(true);
  expect(s.input).toEqual(before);
});
for(const locale of ['ru','en'] as const)it(`OOC retrieval does not lose task progress: ${locale}`,()=>{
  const s=longHorizonScenarios(locale,400,6000)[0]!,plain=compileGameContext({...s.input,readOnly:true});
  const draft=(locale==='ru'?'Вне игры: ':'OOC: ')+s.input.draft;
  const character=[...s.input.character!] as NonNullable<typeof s.input.character>;character[6]=draft;
  const wrapped=compileGameContext({...s.input,readOnly:true,draft,character});
  expect(wrapped).toEqual(plain);
});
it('reports every registered miss, without treating added context as proof of model recall',()=>{
  const misses=results.filter(r=>r.missing.length);
  console.info('RP323-long-horizon',JSON.stringify({cases:results.length,complete:results.length-misses.length,missing:misses,extraRecords:results.reduce((n,r)=>n+r.extras,0)}));
  expect(results).toHaveLength(144);expect(misses).toEqual([]);
});
