import { describe,expect,it } from 'vitest';
import { GameSearchIndex } from '../src/core/game-search-index';
import { MemorySearchIndexOwner,memorySearchIndex } from '../src/core/memory-search-index';
import { StoryFactSearchIndexOwner,storyFactSearchEntry } from '../src/core/story-fact-search-index';
import { compileGameContext } from '../src/core/game-context';
import { rankStoryFacts } from '../src/core/story-fact-context';
import type { StoryFact } from '../src/core/story-update';
import type { MemoryEntry } from '../src/core/types';
import { contextualScenarios,contextualWorld } from './fixtures/story-contextual-reference';
import { budgetScenarios } from './fixtures/story-budget-priority';

const fact=(n:number):StoryFact=>({kind:'event',text:`The blue parcel ${n} is in the cellar.`,quote:`Recorded parcel ${n}.`});
const entry=(n:number):MemoryEntry=>({id:`entry-${n}`,worldId:'w',bookId:null,title:`Parcel ${n}`,content:`The parcel ${n} is in the cellar.`,keywords:['parcel',`parcel ${n}`],enabled:true,activation:'smart',priority:'normal',source:{type:'manual'},createdAt:0,updatedAt:0});
describe('scoped incremental search across storage clones',()=>{
 it('reuses 1000 fact projections across clones; only three edited lexical records rebuild',()=>{
  const owner=new StoryFactSearchIndexOwner(),facts=Array.from({length:1000},(_,i)=>fact(i));
  expect(owner.prepare(facts)).toEqual({built:1000,reused:0,removed:0,size:1000});const before=facts.map(storyFactSearchEntry);
  const clone=structuredClone(facts);expect(owner.prepare(clone)).toEqual({built:0,reused:1000,removed:0,size:1000});
  clone.forEach((f,i)=>expect(storyFactSearchEntry(f)).toBe(before[i]));
  for(const row of rankStoryFacts(clone,'parcel'))expect(storyFactSearchEntry(row.fact)).toBe(before[row.index]);
  clone[20]!.text='A green lantern is outside.';
  clone[40]!.claim={key:'lamp location',value:'outside',scope:'state'};
  clone[60]!.task={key:'parcel-duty',title:'Return the parcel',status:'open'};clone[60]!.kind='promise';
  expect(owner.prepare(clone)).toEqual({built:3,reused:997,removed:3,size:1000});
  clone.forEach((f,i)=>[20,40,60].includes(i)?expect(storyFactSearchEntry(f)).not.toBe(before[i]):expect(storyFactSearchEntry(f)).toBe(before[i]));
  clone.splice(100,1);clone.push(fact(1001));expect(owner.prepare(clone)).toEqual({built:1,reused:999,removed:1,size:1000});
  owner.clear();expect(owner.size).toBe(0);expect(owner.prepare(clone).built).toBe(1000);
 });
 it('reuses 1000 lore indexes and only retokenizes the edited field',()=>{
  const owner=new MemorySearchIndexOwner(),records=Array.from({length:1000},(_,i)=>entry(i));owner.prepare(records);const before=records.map(memorySearchIndex);
  const clone=structuredClone(records);expect(owner.prepare(clone)).toEqual({built:0,reused:1000,removed:0,size:1000});
  clone.forEach((e,i)=>expect(memorySearchIndex(e)).toBe(before[i]));
  clone[500]!.content='The parcel was returned.';expect(owner.prepare(clone)).toMatchObject({built:1,reused:999});
  const after=memorySearchIndex(clone[500]!);expect(after.contentTokens).not.toBe(before[500]!.contentTokens);expect(after.titleTokens).toBe(before[500]!.titleTokens);expect(after.keywords).toBe(before[500]!.keywords);
  clone.pop();expect(owner.prepare(clone)).toMatchObject({removed:1,size:999});owner.clear();expect(owner.size).toBe(0);
 });
 it('metadata, status and quote edits never reuse old source data or scores',()=>{
  const owner=new StoryFactSearchIndexOwner(),a=fact(0);a.kind='promise';a.task={key:'parcel',title:'Return the parcel',status:'open'};
  owner.prepare([a]);const indexed=storyFactSearchEntry(a),open=rankStoryFacts([a],'parcel');
  const b=structuredClone(a);b.kind='event';b.task!.status='completed';b.quote='The handover was played explicitly.';
  expect(owner.prepare([b])).toMatchObject({built:0,reused:1});expect(storyFactSearchEntry(b)).toBe(indexed);
  const done=rankStoryFacts([b],'parcel');expect(done[0]!.score).toBe(open[0]!.score-2);expect(done[0]!.fact).toEqual(b);expect(open[0]!.fact).toEqual(a);
  b.task!.status='cancelled';owner.prepare([b]);expect(rankStoryFacts([b],'parcel')[0]!.fact.task!.status).toBe('cancelled');
 });
 it('identical lexical data never merges independent facts',()=>{
  const a=fact(0),b={...a,kind:'promise' as const,quote:'A different speaker said it.'};const owner=new StoryFactSearchIndexOwner();
  expect(owner.prepare([a,b])).toEqual({built:1,reused:1,removed:0,size:1});expect(storyFactSearchEntry(a)).toBe(storyFactSearchEntry(b));
  const ranked=rankStoryFacts([a,b],'parcel');expect(ranked.map(r=>r.fact)).toContainEqual(a);expect(ranked.map(r=>r.fact)).toContainEqual(b);
 });
 it('world/game/branch scope changes release all owned projections',()=>{
  const index=new GameSearchIndex(),a=fact(0),e=entry(0);index.begin('world/game/branch-a',[a]);index.lore.prepare([e]);const before=storyFactSearchEntry(a);
  const clone=structuredClone(a);expect(index.begin('world/game/branch-a',[clone]).built).toBe(0);expect(storyFactSearchEntry(clone)).toBe(before);
  expect(index.begin('world/game/branch-b',[clone]).built).toBe(1);expect(storyFactSearchEntry(clone)).not.toBe(before);expect(index.lore.size).toBe(0);
  index.clear();expect(index.facts.size).toBe(0);expect(index.lore.size).toBe(0);
 });
});

// Retrieval quality/gold are unchanged. Compare the complete prompt, selected
// data, counters AND diagnostic channel against a fresh compiler at each step.
for(const locale of ['ru','en'] as const)it(`full compiler invalidation sequence ${locale}`,()=>{
 const c=contextualWorld(locale),index=new GameSearchIndex(),input=c.input;
 input.entries=[{...entry(0),worldId:c.base.world.id,title:'Lida appearance',content:'Green coat.',keywords:['medallion']}];
 input.draft=c.s('Что насчёт её подарка?','What about her gift?');
 const check=()=>{const snapshot=structuredClone(input);let warmStatus:unknown,coldStatus:unknown;
  const warm=compileGameContext(input,{searchIndex:index},c=>{warmStatus=c}),cold=compileGameContext(structuredClone(input),{},c=>{coldStatus=c});
  expect(warm).toEqual(cold);expect(warmStatus).toEqual(coldStatus);expect(input).toEqual(snapshot);
 };
 check();input.story!.facts=structuredClone(input.story!.facts);input.entries=structuredClone(input.entries);check();
 input.story!.facts[0]!.quote+=' Changed without source proof.';check();
 input.story!.facts[0]!.quote=c.records[0]!.text;input.story!.facts[0]!.task!.status='completed';input.story!.facts[0]!.kind='event';check();
 input.story!.facts.pop();check();input.story!.facts.push(structuredClone(c.anchor));check();
 input.entries[0]!.content='Yellow coat.';check();input.entries[0]!.keywords.splice(0,1,'bell');check();
 input.entries[0]!.enabled=false;check();expect(index.lore.size).toBe(0);
 input.entries[0]!.enabled=true;input.entries[0]!.activation='manual';input.manualIds=[input.entries[0]!.id];check();
 input.entries[0]!.activation='smart';input.excludedIds=[input.entries[0]!.id];check();
 input.entities![0]!.name=c.s('Рен','Ren');check();input.entities![0]!.id='replacement-id';check();
 input.story!.branch='other-branch';check();input.story!.facts=[];check();expect(index.facts.size).toBe(0);
 input.story!.facts=structuredClone(c.facts);check(); // synthetic undo/import
 input.entries=[];check();expect(index.lore.size).toBe(0);
 index.clear();check(); // fresh page/reload or unlock
});
for(const c of contextualScenarios())it(`RP277 warm/cold full equality ${c.id}`,()=>{
 const index=new GameSearchIndex();compileGameContext(c.input,{searchIndex:index});
 expect(compileGameContext(structuredClone(c.input),{searchIndex:index})).toEqual(compileGameContext(structuredClone(c.input)));
});
for(const c of budgetScenarios())it(`RP273 warm/cold full equality ${c.id}`,()=>{
 const index=new GameSearchIndex();compileGameContext(c.input,{searchIndex:index});
 expect(compileGameContext(structuredClone(c.input),{searchIndex:index})).toEqual(compileGameContext(structuredClone(c.input)));
});
