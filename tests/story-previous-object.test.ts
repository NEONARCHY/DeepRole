import { expect, it } from 'vitest';
import { previousObjectEvidence, PREVIOUS_OBJECT_GUIDE, UNCERTAIN_PREVIOUS_OBJECT } from '../src/core/story-previous-object';
import { compileGameContext, type GameContextInput } from '../src/core/game-context';
import { storyFactIdentity } from '../src/core/story-memory-lifecycle';
import type { GameMemoryCoverage } from '../src/core/game-memory-coverage';
import type { StoryFact } from '../src/core/story-update';
import { storyWorld } from './fixtures/story-worlds';
import { plots } from './fixtures/story-rp404-corpus';
import { probes } from './fixtures/story-rp404-expectations';

const event=(text:string):StoryFact=>({kind:'event',text,quote:text});
const drum=event('The velvet drum is kept in the gatehouse.');
const flute=event('The velvet flute is kept in the library.');
const draft='Where is the one she came for?';
const recent='The visitor came for the velvet drum.';
const roles={status:()=>'unknown' as const,read:()=>undefined,question:undefined,score:()=>0};
const evidence=(facts:StoryFact[],last=recent,query=draft)=>previousObjectEvidence(facts,query,[last],[],roles,{
  position:f=>facts.indexOf(f)+1,read:f=>({episode:1,revisionId:'scene-'+facts.indexOf(f),period:'earlier-turn'}),
});
it('uses an event even without a task and keeps a neighbouring object out',()=>{
  expect(evidence([drum,flute])).toEqual({facts:[drum],certain:true});
  const secret:StoryFact={...drum,kind:'secret'};
  expect(evidence([secret,flute])).toEqual({facts:[secret],certain:true});
});
it.each([0,1] as const)('finds the location, original obligation and signed condition in the radio history, language %i',lang=>{
  const story=plots.find(p=>p.id==='radio')!, q=probes.radio!.find(p=>p.id==='grounded')!;
  const facts=story.beats.map(b=>({...event(b.prose[lang]),kind:b.kind,...(b.task?{task:{key:b.id,title:b.task[0][lang],status:b.task[1]}}:{})}));
  const result=evidence(facts,q.recent![0]![lang],q.draft[lang]);
  expect(result?.certain).toBe(true);
  const ids=result!.facts.map(f=>story.beats[facts.findIndex(candidate=>candidate.text===f.text)]!.id);
  for(const id of q.wanted)expect(ids).toContain(id);
  for(const id of q.exclude)expect(ids).not.toContain(id);
});
it('does not manufacture a qualified item across two neighbouring objects',()=>{
  const shelving=event('The velvet flute rests beside the tin drum.');
  expect(evidence([drum,flute,shelving])?.facts).toEqual([drum]);
  expect(evidence([flute,shelving])).toEqual({facts:[],certain:false});
});
it('accepts an unambiguous inanimate shorthand and direct first-person speech',()=>{
  expect(evidence([drum,flute],'Ruth said: “I came for the velvet drum.”','Where did they put it?')).toEqual({facts:[drum],certain:true});
  expect(evidence([drum,flute],recent,'Where is she?')).toBeUndefined();
});
it('retains uncertainty when two visitors requested the same literal label',()=>{
  const result=evidence([drum,flute],'Ruth asked for the velvet drum. Nellie asked for the velvet drum.');
  expect(result).toEqual({facts:[drum],certain:false});
});
it('requires a verified current location and handles a later loss and recovery in order',()=>{
  const missing=event('The velvet drum is missing.'),found=event('The velvet drum was placed in the gallery.');
  expect(evidence([event('They polished the velvet drum.')])?.certain).toBe(false);
  expect(evidence([drum,missing])?.certain).toBe(false);
  expect(evidence([drum,missing,found])?.certain).toBe(true);
  expect(evidence([{...drum,quote:'The velvet flute is kept in the gatehouse.'}])?.facts).toEqual([]);
});
it.each(['If the visitor came for the velvet drum, someone could help.',
  "The visitor hasn't asked for the velvet drum.",
  'The visitor came for the velvet drum. She changed her mind.',
  'According to a rumour, the visitor came for the velvet drum.'])('keeps an uncertain antecedent open: %s',latest=>{
  expect(evidence([drum,flute],latest)).toEqual({facts:[],certain:false});
});
it('a different question in the same draft keeps the ordinary multi-topic selection',()=>{
  expect(evidence([drum,flute],recent,'Where is the one she came for, and where did the watchman leave the key?')).toBeUndefined();
});
it('retains the latest grounded evidence and a caution when many scenes share a label',()=>{
  const facts=Array.from({length:100},(_,i)=>event('The velvet drum was moved into locker '+i+'.'));
  const result=evidence(facts)!;
  expect(result.certain).toBe(false);
  expect(result.facts).toHaveLength(16);
  expect(result.facts.at(-1)).toBe(facts.at(-1));
});
it('observed preview and send agree, including missing evidence, opt-out and insufficient room',()=>{
  const base=storyWorld('en');
  const input:GameContextInput={draft,recentMessages:[recent],entries:[],books:[],entities:base.entities,worlds:[base.world],activeBookId:null,
    scene:{worldId:base.world.id,bookId:null,focusIds:[]},settings:{contextBudget:6000,relevanceThreshold:6},
    story:{world:base.world,branch:'branch',chat:base.binding.chatId,facts:[drum,flute],sheetsEnabled:false,
      roleSeeds:[drum,flute].map((f,i)=>({key:storyFactIdentity(f),binding:{version:1,sourceRevisionId:'s'+i,quote:f.quote,roles:{}}})),episodeSources:['s0','s1']}};
  let coverage:GameMemoryCoverage|undefined;
  const render=()=>compileGameContext(input,{},c=>{coverage=c;});
  const full=render();
  expect(compileGameContext(input)).toEqual(full);
  expect(full.text).toContain(PREVIOUS_OBJECT_GUIDE);
  expect(compileGameContext(input,{contextualRecall:false}).text).not.toContain(PREVIOUS_OBJECT_GUIDE);
  input.settings.contextBudget=full.report.total-5;
  expect(render().text).toContain(UNCERTAIN_PREVIOUS_OBJECT);
  expect(coverage?.kind).toBe('budget');
  input.settings.contextBudget=6000;
  input.story!.episodeSources=['s1'];
  expect(render().text).not.toContain(drum.text);
  expect(coverage?.kind).toBe('incomplete');
});
