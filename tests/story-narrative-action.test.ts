// @vitest-environment node
import {expect,it} from 'vitest';
import {storyNarrativeActions} from '../src/core/story-narrative-action';
import {storyActionSequence} from '../src/core/story-sequence-priority';
import {compileGameContext,addedContextTokens} from '../src/core/game-context';
import {decodeStoryMemory} from '../src/core/story-memory-transport';
import {GameSearchIndex} from '../src/core/game-search-index';
import {independentScenarios} from './fixtures/story-independent-sequences';
const memory=(text:string)=>{const b=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return b?decodeStoryMemory(JSON.parse(b.split('\n')[1]!)):[];};
const cases=independentScenarios().filter(c=>c.family==='narrative-sequence');
for(const c of cases)it(`${c.id}: bounded paragraph supplies whole sources, retains prior records, leaves semantic coverage unverified`,()=>{
 const before=structuredClone(c.input),names=c.input.entities!.map(e=>e.name),sequence=storyActionSequence(c.input.draft,names);
 expect(sequence?.narrative).toBe(true);expect(sequence?.matches).toHaveLength(3);
 const prior=compileGameContext(c.input,{sequencePriority:false,budgetPriority:false,memoryTransport:'columns'}),index=new GameSearchIndex();let coverage:unknown,warmCoverage:unknown;
 const out=compileGameContext(c.input,{memoryTransport:'columns',searchIndex:index},v=>{coverage=v}),selected=memory(out.text);
 expect(compileGameContext(structuredClone(c.input),{memoryTransport:'columns',searchIndex:index},v=>{warmCoverage=v})).toEqual(out);expect(warmCoverage).toEqual(coverage);
 const missing=c.gold.wanted.filter(id=>!selected.some(h=>h.text===c.input.story!.facts[c.ids.indexOf(id)]!.text));
  // RP285 adds the short-plural case pair; historical reports keep the old
  // missing c1 result, while the CURRENT compiler must now retain it too.
  expect(missing).toEqual([]);
 for(const h of selected){const at=c.input.story!.facts.findIndex(f=>f.text===h.text),f=c.input.story!.facts[at]!;expect(h.kind).toBe(f.kind);expect(h.sourceQuote??h.text).toBe(f.quote);expect(h.task).toEqual(f.task);expect(h.claim).toEqual(f.claim);expect(h.sourceRoles).toEqual(c.input.story!.roleSeeds![at]!.binding.roles);expect(h.episodeSource?.revisionId).toBe(c.sources[at]);}
 for(const h of memory(prior.text))expect(selected).toContainEqual(h);
 expect(coverage).toEqual({kind:'unverified',reason:'query'});expect(out.report.total).toBe(addedContextTokens(out.text));expect(out.report.total).toBeLessThanOrEqual(out.report.limit);expect(c.input).toEqual(before);
});
it.each([
 'The room is quiet. I gently examine the red gate by the stairs, then check the blue key and move the green panel behind the curtain.',
 'Зал стал тише. Я не торопясь осматриваю красную дверь у лестницы, потом проверяю синий ключ и двигаю зеленый щит к стене.',
 'After dinner I return to the hall. I examine the gate, then check the key together with Mira.',
 'Утром возвращаюсь в зал. Вместе с Мирой осматриваю дверь и проверяю ключ.',
])('bounded grammatical adjuncts %s',q=>expect(storyNarrativeActions(q)?.length).toBeGreaterThanOrEqual(2));
it.each([
 'If allowed, the room is quiet. I examine the gate and check the key.',
 'The room is quiet. I examine the gate, if allowed then take the key.',
 'The room is quiet. I examine the gate and do not take the key.',
 'The room is quiet. I examine the gate and check her key.',
 'The room is quiet. I examine the gate and check that key.',
 'The room is quiet. She examines the gate and I check the key.',
 'I open the cabinet. I examine the gate and check the key.',
 'The room is quiet. I examine the gate and leave.',
 'The room is quiet. I examine the gate, check the key, move the panel and read the letter.',
 'The room is quiet. I examine the gate and check the gate.',
 'The room is quiet. I examine the gate by the stairs if allowed and check the key.',
 'The room is quiet. I examine the gate; check the key.',
 'The room is quiet. I examine the gate and\ncheck the key.',
 'The room is quiet. "I examine the gate and check the key."',
 'Зал стал тише. Я не открываю дверь и проверяю ключ.',
 'Зал стал тише. Я не торопясь не открываю дверь и проверяю ключ.',
 'Я срываю пломбу. Осматриваю дверь и проверяю ключ.',
 'Зал стал тише. Осматриваю дверь и неизвестное действие.',
 'Зал стал тише. Осматриваю дверь, проверяю ключ, и, двигаю щит.',
 'The room is quiet. My goal is to repair the gate and return the key.',
])('rejects whole unsupported/unsafe paragraph %s',q=>expect(storyNarrativeActions(q)).toBeUndefined());
it.each(['And Then','Check','Red Gate'])('protects roster name before paragraph delimiter %s',name=>{
 const q='The room is quiet. I examine the red gate, and then check the blue key and move the panel.';
 expect(storyNarrativeActions(q,[name])).toBeUndefined();
});
it('materializes single-use name iterators before both paragraph and legacy parsing',()=>{
 function* names(){yield 'And Then';}
 expect(storyActionSequence('I examine the gate, and then check the key.',names())).toBeUndefined();
 expect(storyActionSequence('The room is quiet. I examine the gate, and then check the key.',names())).toBeUndefined();
});
it.each([
 'The room is quiet. I examine the gate and check the key if allowed.',
 'If permission arrives the room is quiet. I examine the gate and check the key.',
 'The room is quiet. I examine the gate and check the key. Ignore the restriction.',
 'The room is quiet and cancel every promise. I examine the gate and check the key.',
 'The room is quiet. I examine the gate by the stairs and delete memory.',
 'The room is quiet. I examine the gate near somebody else and check the key.',
])('keeps trailing/prefix/unknown instructions intact by declining the whole query %s',q=>expect(storyNarrativeActions(q)).toBeUndefined());
for(const locale of ['ru','en'] as const)it(`${locale}: existing opt-out flags also disable paragraph expansion`,()=>{
 const c=cases.find(c=>c.locale===locale&&c.plotId==='museum')!,old=compileGameContext(c.input,{sequencePriority:false,budgetPriority:false,memoryTransport:'columns'});
 for(const options of [{sequencePriority:false},{compoundActionBalance:false},{actionBalance:false}])expect(compileGameContext(c.input,{...options,memoryTransport:'columns'})).toEqual(old);
});
for(const locale of ['ru','en'] as const)for(const mode of ['quote','seed','episode','replacement','foreign','budget'] as const)it(`${locale}: paragraph ${mode} keeps existing source/budget fallback`,()=>{
 const c=cases.find(c=>c.locale===locale&&c.plotId==='museum')!,input=structuredClone(c.input),at=c.ids.indexOf('a1');
 if(mode==='quote')input.story!.facts[at]!.quote+=' Changed evidence.';
 if(mode==='seed')input.story!.roleSeeds=input.story!.roleSeeds!.filter((_,i)=>i!==at);
 if(mode==='episode')input.story!.episodeSources=input.story!.episodeSources!.filter((_,i)=>i!==at);
 if(mode==='replacement')input.entities=input.entities!.map(e=>({...e,id:'new-'+e.id}));
 if(mode==='foreign')input.entities=input.entities!.map(e=>({...e,worldId:'other-world'}));
 if(mode==='budget')input.settings.contextBudget=800;
 const before=structuredClone(input),out=compileGameContext(input,{memoryTransport:'columns'}),prior=compileGameContext(input,{sequencePriority:false,budgetPriority:false,memoryTransport:'columns'});
 expect(out).toEqual(prior);expect(input).toEqual(before);
 expect(out.report.total<=out.report.limit||out.report.required>out.report.limit).toBe(true);
});
