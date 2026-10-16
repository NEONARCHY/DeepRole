// @vitest-environment node
import {expect,it} from 'vitest';
import {crossOwnerWorld} from './fixtures/story-cross-owner-audit';
import {compileGameContext,type GameContextOptions} from '../src/core/game-context';
import {GameSearchIndex} from '../src/core/game-search-index';

for(const locale of ['ru','en'] as const)it(`${locale}: shared index cannot retain another world, old branch or removed facts`,()=>{
 const index=new GameSearchIndex();
 try{
  const first=crossOwnerWorld(locale,0,1100,3).input;
  const fresh=(input:typeof first)=>compileGameContext(structuredClone(input),{memoryTransport:'columns'});
  expect(compileGameContext(first,{memoryTransport:'columns',searchIndex:index})).toEqual(fresh(first));
  const other=crossOwnerWorld(locale,2,1100,6).input;
  expect(compileGameContext(other,{memoryTransport:'columns',searchIndex:index})).toEqual(fresh(other));
  expect(compileGameContext(first,{memoryTransport:'columns',searchIndex:index})).toEqual(fresh(first));
  const branch=structuredClone(first);branch.story!.branch+='-alternative';
  branch.story!.facts=[];branch.story!.roleSeeds=[];branch.story!.episodeSources=[];
  expect(compileGameContext(branch,{memoryTransport:'columns',searchIndex:index})).toEqual(fresh(branch));
  expect(compileGameContext(first,{memoryTransport:'columns',searchIndex:index})).toEqual(fresh(first));
 }finally{index.clear();}
});
for(const enabled of [false,true])for(const transport of ['legacy','compact','columns'] as const)it(`multiway all options=${enabled}, ${transport}, long history and required overflow`,()=>{
 const c=crossOwnerWorld('en',1,6500,3).input;
 c.settings.contextBudget=900;c.story!.world.contextBudget=900;
 c.requiredContext='PLAYER_CANON: do not replace this explicit correction. '.repeat(100);
 const flags=Object.fromEntries(['contentRelevance','topicAdmission','continuationBalance','actionBalance','taskGoalBalance','compoundActionBalance','naturalRecall','lastingRecall','referenceRecall','referenceBundle','discussionPriority','flexiblePriority','sequencePriority','budgetPriority','contextualRecall'].map(k=>[k,enabled]));
 const options={...flags,memoryTransport:transport} as GameContextOptions;
 const before=structuredClone(c),observed:unknown[]=[];
 const result=compileGameContext(c,options,v=>observed.push(v));
 expect(result.report.required).toBeGreaterThan(result.report.limit);
 expect(result.text).toContain(c.requiredContext);
 expect(observed).toEqual([{kind:'required-overflow'}]);
 expect(c).toEqual(before);
});
