import {expect,it} from 'vitest';
import {storyActionSequence} from '../src/core/story-sequence-priority';
import {storyCompoundAction} from '../src/core/story-compound-action';
import {compileGameContext,addedContextTokens} from '../src/core/game-context';
import {decodeStoryMemory} from '../src/core/story-memory-transport';
import {GameSearchIndex} from '../src/core/game-search-index';
import {longScenarios} from './fixtures/story-long-holdout';
const memory=(text:string)=>{const b=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return b?decodeStoryMemory(JSON.parse(b.split('\n')[1]!)):[];};
const failed=longScenarios().filter(c=>c.family==='three-actions');
for(const c of failed)it(`${c.id}: now-seen failure retains every whole source, status and previous substantive fact`,()=>{
 const before=structuredClone(c.input),old=compileGameContext(c.input,{sequencePriority:false,compoundActionBalance:false,memoryTransport:'columns'}),index=new GameSearchIndex();
 expect(storyActionSequence(c.input.draft)?.matches).toHaveLength(3);
 const out=compileGameContext(c.input,{memoryTransport:'columns',searchIndex:index}),hints=memory(out.text);
 expect(compileGameContext(structuredClone(c.input),{memoryTransport:'columns',searchIndex:index})).toEqual(out);
 for(const id of c.gold.wanted){const at=c.ids.indexOf(id),f=c.input.story!.facts[at]!,h=hints.find(h=>h.text===f.text)!;expect(h,id).toBeDefined();expect(h.sourceQuote??h.text).toBe(f.quote);expect(h.task).toEqual(f.task);expect(h.claim).toEqual(f.claim);expect(h.sourceRoles).toEqual(c.input.story!.roleSeeds![at]!.binding.roles);expect(h.episodeSource?.revisionId).toBe(c.sources[at]);}
 for(const h of memory(old.text))expect(hints).toContainEqual(h);
 expect(hints).toHaveLength(11);expect(out.report.total).toBe(addedContextTokens(out.text));expect(out.report.total).toBeLessThanOrEqual(out.report.limit);expect(c.input).toEqual(before);
});
it.each([
 ['I examine the red gate, check the blue key and untie the green raft.',3],
 ['I connect the battery, move the panel.',2],
 ['I am examining the gate, checking the key, and untying the raft.',3],
 ['Я осматриваю ворота, проверяю ключ и отвязываю плот.',3],
 ['осматриваю ворота, затем подключаю блок, и передвигаю щит.',3],
 ['**I disconnect the battery, then move the panel.**',2],
 ['Я развязываю узел, отключаю кабель.',2],
] as const)('whole finite comma sequence %s',(query,count)=>expect(storyActionSequence(query)?.matches).toHaveLength(count));
it.each([
 'I open the gate, if allowed then take the key.','I open the gate, take the key if permitted.',
 'I open the gate, do not take the key.','I open the gate, never take the key.',
 'I open the gate, take her key.','I open the gate, take that key.',
 'I open the gate, she takes the key.','I open the gate, then leave.',
 'I open the gate, nod.','I take the red key, the blue key.',
 'I open the gate,, take the key.','I open the gate, and, take the key.',
 'I open the gate, take the key, inspect the kit, read the letter.',
 'I open the gate, close the gate.','"I open the gate, take the key."',
 'I open the gate, take the key?','I open the gate; take the key.',
 'I open the gate,\ntake the key.','I open <gate>, take the key.',
 'Я открываю ворота, если разрешат беру ключ.','Я открываю ворота, не беру ключ.',
 'Я открываю ворота, беру её ключ.','Открываю ворота, беру этот ключ.',
 'Я открываю ворота, она берёт ключ.','Я открываю ворота, улыбаюсь.',
])('rejects the ENTIRE unsafe/unknown query, never keeps a valid-looking prefix: %s',query=>expect(storyActionSequence(query)).toBeUndefined());
it.each(['And Then','Examine','Blue Key','Move'])('names are masked before delimiters and new verbs: %s',name=>{
 const query=name==='And Then'?'I examine the red gate, and then check the blue key and move the panel.':'I examine the red gate, then check the blue key and move the panel.';
 expect(storyActionSequence(query,[name])).toBeUndefined();
});
it('comma syntax does not silently expand goal grammar',()=>{
 expect(storyCompoundAction('My goal is to repair the gate, return the key.')).toBeUndefined();
 expect(storyCompoundAction('Моя цель — починить ворота, вернуть ключ.')).toBeUndefined();
});
for(const locale of ['ru','en'] as const)it(`${locale}: insufficient whole budget never sends clipped quotes or an over-budget optional selection`,()=>{
 const c=failed.find(c=>c.locale===locale)!,input=structuredClone(c.input);input.settings.contextBudget=950;
 const before=structuredClone(input),out=compileGameContext(input,{memoryTransport:'columns'});
 for(const h of memory(out.text)){const f=input.story!.facts.find(f=>f.text===h.text)!;expect(f).toBeDefined();expect(h.sourceQuote??h.text).toBe(f.quote);expect(h.task).toEqual(f.task);expect(h.claim).toEqual(f.claim);}
 expect(out.report.total).toBeLessThanOrEqual(out.report.limit);expect(input).toEqual(before);
});
for(const locale of ['ru','en'] as const)it.each(['quote','seed','episode','replacement','foreign'] as const)(`${locale}: current evidence/identity guard preserves exact fallback for %s`,mode=>{
 const c=failed.find(c=>c.locale===locale)!,input=structuredClone(c.input),at=c.ids.indexOf('a1');
 if(mode==='quote')input.story!.facts[at]!.quote+=' Changed evidence.';
 if(mode==='seed')input.story!.roleSeeds=input.story!.roleSeeds!.filter((_,i)=>i!==at);
 if(mode==='episode')input.story!.episodeSources=input.story!.episodeSources!.filter((_,i)=>i!==at);
 if(mode==='replacement')input.entities=input.entities!.map(e=>({...e,id:'replacement-'+e.id}));
 if(mode==='foreign')input.entities=input.entities!.map(e=>({...e,worldId:'another-world'}));
 const before=structuredClone(input),out=compileGameContext(input,{memoryTransport:'columns'});
 expect(out).toEqual(compileGameContext(input,{memoryTransport:'columns',sequencePriority:false,budgetPriority:false}));
 expect(input).toEqual(before);
});
for(const locale of ['ru','en'] as const)it(`${locale}: rename keeps historical evidence without resolving to a replacement`,()=>{
 const c=failed.find(c=>c.locale===locale)!,input=structuredClone(c.input),owner=input.entities![0]!;owner.name='Renamed '+owner.name;
 const out=compileGameContext(input,{memoryTransport:'columns'}),hints=memory(out.text);
 for(const id of c.gold.wanted){const f=input.story!.facts[c.ids.indexOf(id)]!,h=hints.find(h=>h.text===f.text)!;expect(h).toBeDefined();if(c.speakers[c.ids.indexOf(id)]===0)expect(h.sourceRoles?.speaker).toMatchObject({id:owner.id,name:owner.name,sourceName:c.input.entities![0]!.name});}
});
