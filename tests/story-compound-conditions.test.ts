import { expect, it } from 'vitest';
import { compoundActionDetails, compoundConditionEvidence, COMPOUND_CONDITION_GUIDE } from '../src/core/story-compound-conditions';
import { compileGameContext, type GameContextInput } from '../src/core/game-context';
import { memoryCoverageIssue, type GameMemoryCoverage } from '../src/core/game-memory-coverage';
import { decodeStoryMemory } from '../src/core/story-memory-transport';
import { storyFactIdentity } from '../src/core/story-memory-lifecycle';
import { storyWorld } from './fixtures/story-worlds';
import type { StoryFact } from '../src/core/story-update';

const event = (text:string):StoryFact => ({kind:'event',text,quote:text});
const promise = (text:string,key:string):StoryFact => ({...event(text),kind:'promise',task:{key,title:key,status:'open'}});
const facts = [
  event('A brass cupboard holds the violet pigment and the porcelain glaze.'),
  promise('Eda promised the violet pigment and porcelain glaze to the potter after a kiln inspection.','potter'),
  event('The inspector refused clearance for the porcelain glaze and violet pigment.'),
  event('In the linen chest are the theatre masks and their silk straps.'),
  promise('Ivo promised the theatre masks with their silk straps to the apprentices after the fitting.','apprentices'),
  event('The apprentices completed the fitting for the theatre masks with silk straps.'),
  promise('Eda promised to return a spare bicycle to the baker after lunch.','baker'),
];
const query = 'I unlock the brass cupboard, then check the linen chest. What can each apprentice take?';
const roles = {status:()=> 'unknown' as const,question:undefined,read:()=>undefined,score:()=>0};
const episodes = {position:(f:StoryFact)=>facts.indexOf(f)+1,read:(f:StoryFact)=>({revisionId:f.text,episode:1,period:'earlier-turn' as const})};
it('keeps a named detail with its own observation in a compound turn',()=>{
  const turn = 'I look under the copper lining in the brass cupboard, then check the linen chest. What can each apprentice take?';
  const lining = event('Violet pigment and porcelain glaze stained the copper lining.');
  const wrongMaterial = event('Violet pigment and porcelain glaze stained a paper lining.');
  const separateScene = event('A copper lining gleamed on the pier. The glaze and pigment stayed indoors.');
  const changedSummary = {...lining,quote:separateScene.quote};
  const select = (extra:StoryFact[]) => compoundActionDetails([...facts,...extra],turn,[],facts,roles,episodes);
  const result = select([lining,wrongMaterial,separateScene,changedSummary]);
  expect(result).toEqual([lining]);
  const other = event('The copper lining beside the violet pigment and porcelain glaze was dented.');
  const ambiguous = select([lining,other]);
  expect(ambiguous).toEqual([]);
  expect(compoundActionDetails([...facts,lining],turn,[],facts,roles,{...episodes,read:f=>f===lining?undefined:episodes.read(f)})).toEqual([]);
});
it('recovers separate obligations and outcome evidence for two distant objects without a shared character deciding relevance',()=>{
  const noise = Array.from({length:240},(_,i)=>event('Eda and Ivo logged the temperature in the foyer. Entry '+i+'.'));
  const before = structuredClone(facts);
  const result = compoundConditionEvidence([...facts,...noise],query,['Eda','Ivo'],roles,episodes);
  expect(new Set(result?.facts)).toEqual(new Set(facts.slice(0,6)));
  expect(facts).toEqual(before);
});
it('does not bridge through a name, a title alone, or a single grounded action',()=>{
  expect(compoundConditionEvidence(facts,'I greet Eda, then greet Ivo. What can each take?',['Eda','Ivo'],roles,episodes)).toBeUndefined();
  expect(compoundConditionEvidence(facts,'I open the brass cupboard. What can I take?',[],roles,episodes)).toBeUndefined();
  const unrelated = promise('The baker promised to lend a bicycle.','violet pigment and porcelain glaze');
  expect(compoundConditionEvidence([...facts,unrelated],query,[],roles,episodes)?.facts).not.toContain(unrelated);
});
it('keeps missing sources, unmatched handovers and an oversized set of equally relevant conditions uncertain',()=>{
  const missing = {...episodes, read:(f:StoryFact)=>f===facts[2]?undefined:episodes.read(f)};
  const partial = compoundConditionEvidence(facts,query,[],roles,missing);
  expect(partial?.partial).toBe(true);
  expect(partial?.facts).not.toContain(facts[2]);
  const extraAction = query.replace('. What', ', then offer the amber compass. What');
  expect(compoundConditionEvidence(facts,extraAction,[],roles,episodes)?.partial).toBe(true);
  const tied = Array.from({length:20},(_,i)=>event('The porcelain glaze and violet pigment require permit '+i+'.'));
  expect(compoundConditionEvidence([...facts,...tied],query,[],roles,episodes)).toMatchObject({reason:'capacity',facts:[]});
});
it('sends source-linked conditions through the game compiler with or without a preview, respecting the configured budget',()=>{
  const base = storyWorld('en');
  const sourceIds = facts.map((_,i)=>'scene-'+i);
  const input:GameContextInput = {
    draft:query, recentMessages:[], entries:[], books:[], entities:base.entities, worlds:[base.world], activeBookId:null,
    scene:{worldId:base.world.id,bookId:null,focusIds:[]}, settings:{contextBudget:6000,relevanceThreshold:6},
    story:{world:base.world,chat:base.binding.chatId,branch:'pottery',facts,sheetsEnabled:false,episodeSources:sourceIds,
      roleSeeds:facts.map((fact,i)=>({key:storyFactIdentity(fact),binding:{version:1,sourceRevisionId:sourceIds[i]!,quote:fact.quote,roles:{}}}))},
  };
  let coverage:GameMemoryCoverage|undefined;
  const compiled = compileGameContext(input,{},value=>{coverage=value});
  expect(compileGameContext(input).text).toBe(compiled.text);
  expect(compiled.text).toContain(COMPOUND_CONDITION_GUIDE);
  const payload = compiled.text.split('<deeprole_story_memory>')[1]!.split('</deeprole_story_memory>')[0]!;
  const hints = decodeStoryMemory(JSON.parse(payload.trim().split('\n').at(-1)!));
  for (const [index,fact] of facts.slice(0,6).entries()) {
    expect(hints.find(h=>h.text===fact.text)?.episodeSource?.revisionId).toBe(sourceIds[index]);
  }
  expect(hints.some(h=>h.text===facts[6]!.text)).toBe(false);
  expect(compileGameContext(input,{compoundActionBalance:false}).text).not.toContain(COMPOUND_CONDITION_GUIDE);
  input.settings.contextBudget=200;
  const tight=compileGameContext(input,{},value=>{coverage=value});
  expect(tight.text).not.toContain(COMPOUND_CONDITION_GUIDE);
  expect(['budget','required-overflow']).toContain(memoryCoverageIssue(coverage,tight.report)?.kind);
});
