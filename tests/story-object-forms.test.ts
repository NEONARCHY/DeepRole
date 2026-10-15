// @vitest-environment node
import {expect,it} from 'vitest';
import {storyActionBalance} from '../src/core/story-action-balance';
import {storyCompoundAction} from '../src/core/story-compound-action';
import {storyNarrativeActions} from '../src/core/story-narrative-action';
import {storyObjectForms} from '../src/core/story-object-forms';
import {normalizeText,tokenize} from '../src/core/text';
import {compileGameContext,addedContextTokens} from '../src/core/game-context';
import {decodeStoryMemory} from '../src/core/story-memory-transport';
import {GameSearchIndex} from '../src/core/game-search-index';
import {independentScenarios} from './fixtures/story-independent-sequences';
import previous from '../docs/benchmarks/rp284-narrative-seen-results.json';
import type {StoryFact} from '../src/core/story-update';

const fact=(text:string):StoryFact=>({kind:'event',text,quote:text});
const action=(object:string,names:string[]=[])=>{const a=storyActionBalance('Я проверяю '+object+'.',names);if(a?.kind!=='object')throw Error('Missing object action');return a;};
const memory=(text:string)=>{const b=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return b?decodeStoryMemory(JSON.parse(b.split('\n')[1]!)):[];};
const cases=independentScenarios().filter(c=>c.locale==='ru'&&c.plotId==='mountain'&&previous.results.find(r=>r.id===c.id)!.missing.some(id=>id==='c1'));

it.each([
 ['спасательные сани','Полозья спасательных саней осмотрены.'],
 ['спасательных саней','Спасательные сани закреплены двумя тросами.'],
 ['старые часы','В старых часах заменили батарейку.'],
 ['старых часах','Старые часы ещё не сверили.'],
 ['черные очки','В черных очках есть трещина.'],
 ['черных очках','Черные очки лежат на столе.'],
 ['дворовые коты','Дворовых котов уже покормили.'],
])('whole qualified object case pair %s / %s',(query,text)=>expect(action(query).matches(fact(text))).toBe(true));

it.each(['сани','саней','саням','санями','санях'])('finds short plural in either direction: %s',word=>{
 expect(action(word).matches(fact('Сани пока не испытывали.'))).toBe(true);
 expect(action('сани').matches(fact(word+' пока не испытывали.'))).toBe(true);
});
it.each([
 'Полозья обычных саней осмотрены.',
 'Спасательные носилки лежат на столе.',
 'Спасательные санитарные машины готовы.',
 'Спасательные. Полозья саней осмотрены.',
 'Спасательные; саней не было.',
 'Спасательные, а полозья саней осмотрены.',
 'Спасательные большие полозья саней осмотрены.',
 'Спасательные Саней осмотрены.',
])('does not manufacture qualified object from prefixes/other clauses/names: %s',text=>expect(action('спасательные сани',['Саней']).matches(fact(text))).toBe(false));
it('keeps fields separate, ignores quotes/claim values/opaque keys, and refreshes its request-local cache',()=>{
 const a=action('спасательные сани'),f:StoryFact={kind:'event',text:'Спасательные носилки осмотрены.',quote:'Спасательных саней пока не испытывали.',task:{key:'спасательные-сани',title:'Полозья саней осмотрены',status:'completed'},claim:{key:'сани',value:'спасательные сани',scope:'state'}};
 expect(a.matches(f)).toBe(false);f.task!.title='Полозья спасательных саней осмотрены';expect(a.matches(f)).toBe(true);
 f.task=undefined;expect(a.matches(f)).toBe(false);f.text='Полозья спасательных саней осмотрены';expect(a.matches(f)).toBe(true);f.text='Спасательные носилки';expect(a.matches(f)).toBe(false);
});
it('does not join a qualified object across a masked character name',()=>expect(action('спасательные сани',['Мира']).matches(fact('Спасательных Мира саней не касалась.'))).toBe(false));
it.each(['санаторий','санитар','санок','саня','сам','вес','они','оно'])('does not implement arbitrary prefix/semantic/fleeting-vowel matching: %s',word=>expect(action('сани').matches(fact(word))).toBe(false));
it('leaves global lexical tokens and English stemming unchanged',()=>{
 expect(tokenize('спасательные сани')).toEqual(['спасательн','сани']);expect(tokenize('спасательных саней')).toEqual(['спасательн','сан']);
 expect(storyObjectForms(['rescue','sled'])).toBeUndefined();expect(storyObjectForms(['дверь'])).toBeUndefined();
 expect(storyObjectForms(['сани'])?.(normalizeText('санями'))).toBe(true);
 // This supplement does not add a general adjective lemmatizer either.
 expect(action('дворовые коты').matches(fact('За дворовыми котами уже ухаживали.'))).toBe(false);
});
it.each(['Я проверяю спасательные сани и осматриваю старые часы.','Я проверяю спасательных саней, осматриваю старых часах и беру книгу.'])('compound action uses the same whole-clause forms: %s',query=>{
 const c=storyCompoundAction(query)!;expect(c).toBeDefined();expect(c[0]!.matchesObject(fact('Полозья спасательных саней осмотрены.'))).toBe(true);expect(c[1]!.matchesObject(fact('Старые часы идут неточно.'))).toBe(true);
 expect(c[0]!.matchesObject(fact('Спасательных; полозья саней осмотрены.'))).toBe(false);
});
it.each(['Я проверяю сани и осматриваю саней.','Я проверяю саней и осматриваю сани.'])('case forms cannot disguise a duplicate object: %s',query=>{
 expect(storyCompoundAction(query)).toBeUndefined();expect(storyNarrativeActions('Зал стал тише. '+query)).toBeUndefined();
});
it('keeps explicit task goals on their existing literal object matcher',()=>{
 const goal=storyCompoundAction('Моя цель — починить сани и вернуть книгу.');expect(goal).toBeDefined();expect(goal![0]!.goal).toBe(true);expect(goal![0]!.matchesObject(fact('Полозья саней осмотрены.'))).toBe(false);
});
it.each(['Я не проверяю сани.','Я проверяю её сани.','Я проверяю сани если разрешат.','«Я проверяю сани».'])('case matching cannot bypass existing syntax guards: %s',query=>expect(storyActionBalance(query)).toBeUndefined());

for(const c of cases)it(`${c.id}: current compiler keeps c1 with complete source/roles/status and every RP284 selection`,()=>{
 const original=structuredClone(c.input),index=new GameSearchIndex();let coverage:unknown,warmCoverage:unknown;
 const out=compileGameContext(c.input,{memoryTransport:'columns',searchIndex:index},v=>{coverage=v}),hints=memory(out.text);
 expect(compileGameContext(structuredClone(c.input),{memoryTransport:'columns',searchIndex:index},v=>{warmCoverage=v})).toEqual(out);expect(warmCoverage).toEqual(coverage);
 for(const id of c.gold.wanted){const at=c.ids.indexOf(id),f=c.input.story!.facts[at]!,h=hints.find(h=>h.text===f.text)!;expect(h).toBeDefined();expect(h.sourceQuote??h.text).toBe(f.quote);expect(h.task).toEqual(f.task);expect(h.claim).toEqual(f.claim);expect(h.sourceRoles).toEqual(c.input.story!.roleSeeds![at]!.binding.roles);expect(h.episodeSource?.revisionId).toBe(c.sources[at]);}
 for(const id of previous.results.find(r=>r.id===c.id)!.selectedIds)expect(hints.some(h=>h.text===c.input.story!.facts[c.ids.indexOf(id)]!.text)).toBe(true);
 if(c.family==='narrative-sequence')expect(coverage).toEqual({kind:'unverified',reason:'query'});
 expect(out.report.total).toBe(addedContextTokens(out.text));expect(out.report.total).toBeLessThanOrEqual(out.report.limit);expect(c.input).toEqual(original);
});
it('the regression selects the four original RU c1 misses including the budget probe, not relabelled gold',()=>expect(cases).toHaveLength(4));
for(const mode of ['quote','seed','episode','replacement','foreign','budget'] as const)it(`inflected group ${mode} keeps source/scope/budget protections`,()=>{
 const c=cases.find(c=>c.family==='narrative-sequence')!,input=structuredClone(c.input),at=c.ids.indexOf('c1');
 if(mode==='quote')input.story!.facts[at]!.quote+=' Changed evidence.';
 if(mode==='seed')input.story!.roleSeeds=input.story!.roleSeeds!.filter((_,i)=>i!==at);
 if(mode==='episode')input.story!.episodeSources=input.story!.episodeSources!.filter((_,i)=>i!==at);
 if(mode==='replacement')input.entities=input.entities!.map(e=>({...e,id:'new-'+e.id}));
 if(mode==='foreign')input.entities=input.entities!.map(e=>({...e,worldId:'foreign'}));
 if(mode==='budget')input.settings.contextBudget=800;
 const original=structuredClone(input),out=compileGameContext(input,{memoryTransport:'columns'}),prior=compileGameContext(input,{sequencePriority:false,budgetPriority:false,memoryTransport:'columns'});
 expect(out).toEqual(prior);expect(input).toEqual(original);expect(out.report.total<=out.report.limit||out.report.required>out.report.limit).toBe(true);
});
