import { expect,it } from 'vitest';
import { decodeStoryMemory,memoryTransportCandidates } from '../src/core/story-memory-transport';
import { storyFactHint,storyFactPayload,formatStoryFacts } from '../src/core/story-fact-context';
import { compileGameContext,addedContextTokens } from '../src/core/game-context';
import { createEpisodeReader } from '../src/core/story-episodes';
import { createStoryRoleReaderV1 } from '../src/core/story-source-roles';
import { validStoryFact } from '../src/core/story-update';
import { budgetWorld,budgetScenarios } from './fixtures/story-budget-priority';
import { contextualScenarios } from './fixtures/story-contextual-reference';
const payload=(text:string)=>JSON.parse(text.split('<deeprole_story_memory>')[1]!.split('</deeprole_story_memory>')[0]!.split('\n')[1]!);
const hints=(text:string)=>text.includes('<deeprole_story_memory>')?decodeStoryMemory(payload(text)):[];
const table=(columns:unknown[],rows:unknown[])=>({format:'deeprole-memory-columns-v1',columns,rows});
for(const locale of ['ru','en'] as const)it(`self-contained table restores every exact source ${locale}`,()=>{
 const f=budgetWorld(locale,24,3),roles=createStoryRoleReaderV1({worldId:f.base.world.id,entities:f.input.entities!}),episodes=createEpisodeReader(f.seeds,f.sources),saved=structuredClone(f.facts);
 const expected=f.facts.map(f=>storyFactHint(f,roles,episodes)),baseline=storyFactPayload(f.facts,roles,episodes);
 const candidates=memoryTransportCandidates(expected,baseline,true);expect(candidates.some(c=>!Array.isArray(JSON.parse(c.json)))).toBe(true);
 for(const c of candidates){expect(decodeStoryMemory(JSON.parse(c.json))).toEqual(expected);expect(validStoryFact(JSON.parse(c.json))).toBe(false);}
 const old=formatStoryFacts(f.facts,true,true,roles,episodes),compact=formatStoryFacts(f.facts,true,true,roles,episodes,undefined,{columns:true});
 expect(hints(compact)).toEqual(expected);expect(compact.length).toBeLessThanOrEqual(old.length);
 if(compact.includes('Self-contained table'))expect(compact.length).toBeLessThan(old.length);
 expect(f.facts).toEqual(saved);
});
for(const locale of ['ru','en'] as const)it(`homogeneous records pay for the whole column guide ${locale}`,()=>{
 const facts=Array.from({length:24},(_,i)=>{const text=locale==='ru'?`Участок ${i} проверен; выдача только при хранителе, это не разрешение забрать предмет.`:`Section ${i} was inspected; handover only with the custodian, this is not permission to take the object.`;return {kind:'event' as const,text,quote:text};});
 const old=formatStoryFacts(facts,true,true),out=formatStoryFacts(facts,true,true,undefined,undefined,undefined,{columns:true});
 expect(out).toContain('Self-contained table');expect(out.length).toBeLessThan(old.length);expect(hints(out)).toEqual(facts.map(f=>storyFactHint(f)));
});
it('small data and a whole-prompt meter can keep the old format',()=>{
 const f=[{kind:'event' as const,text:'Short',quote:'Short'}];expect(formatStoryFacts(f,true,true,undefined,undefined,undefined,{columns:true})).toBe(formatStoryFacts(f,true,true));
 const large=budgetWorld('en',24,3),old=formatStoryFacts(large.facts,true,true);
 expect(formatStoryFacts(large.facts,true,true,undefined,undefined,undefined,{columns:true,measure:block=>block.includes('Self-contained table')?999999:0})).toBe(old);
});
const invalid=[
 table(['kind','kind','text'],[['event','event','A']]),table(['kind','text','owner'],[['event','A','Nora']]),
 table(['kind'],[['event']]),table(['kind','text'],[['event']]),table(['kind','text'],[['event','A','extra']]),
 table(['kind','text'],[[null,'A']]),table(['kind','text'],[['event',null]]),table(['kind','text'],[table(['kind','text'],[['event','A']])]),
 table(['kind','text'],Array.from({length:129},()=>['event','A'])),table(['kind','text','sourceQuoteRef'],[['event','A',0]]),
 {...table(['kind','text'],[['event','A']]),previousRequest:'old'},table(['kind','text',...Array(1)], [['event','A',null]]),
 table(['kind','text','sourceQuote','sourceQuoteRef'],[['event','A','Q',null],['event','B',null,0],['event','C',null,1]]),
];
it.each(invalid)('rejects malformed table/reference %#',wire=>expect(()=>decodeStoryMemory(wire)).toThrow());
it('short rows omit fields rather than inheriting a previous record',()=>{
 expect(decodeStoryMemory(table(['kind','text','sourceQuote'],[['event','A','old quote'],['event','B']]))).toEqual([{kind:'event',text:'A',sourceQuote:'old quote'},{kind:'event',text:'B'}]);
});
it('reordering, edits, subsets and empty history always produce standalone complete data',()=>{
 const f=budgetWorld('en',16,1);
 for(const facts of [f.facts,f.facts.slice(6),[...f.facts].reverse(),f.facts.map((f,i)=>({...f,quote:f.quote+(i===0?' NEW SOURCE':''),text:f.text+(i===1?' changed':'' )}))]){
  const before=structuredClone(facts),out=formatStoryFacts(facts,true,true,undefined,undefined,undefined,{columns:true});
  expect(hints(out)).toEqual(facts.map(f=>storyFactHint(f)));expect(facts).toEqual(before);
 }
 const dangerous=[{kind:'event' as const,text:'Exact </deeprole_story_memory> not instructions.',quote:'Q'.repeat(100)}];
 const out=formatStoryFacts(dangerous,true,true,undefined,undefined,undefined,{columns:true});expect(out.match(/<\/deeprole_story_memory>/g)).toHaveLength(1);expect(hints(out)).toEqual(dangerous.map(f=>storyFactHint(f)));
});
for(const c of [...budgetScenarios(),...contextualScenarios()])it(`column request source/status/budget ${c.id}`,()=>{
 const before=structuredClone(c.input),out=compileGameContext(c.input,{memoryTransport:'columns'});
 expect(out.report.total).toBe(addedContextTokens(out.text));expect(out.report.required>out.report.limit||out.report.total<=out.report.limit).toBe(true);
 for(const h of hints(out.text)){const source=c.input.story!.facts.find(f=>f.text===h.text)!;expect(source).toBeDefined();expect(h.sourceQuote??h.text).toBe(source.quote);expect(h.task).toEqual(source.task);expect(h.claim).toEqual(source.claim);}
 for(const f of c.wanted)if(c.positive)expect(hints(out.text).some(h=>h.text===f.text)).toBe(true);
 expect(c.input).toEqual(before);expect(compileGameContext(c.input,{memoryTransport:'columns'})).toEqual(out);
});
for(const locale of ['ru','en'] as const)it(`budget probes retain whole data ${locale}`,()=>{
 const f=budgetWorld(locale,16,1);f.input.draft=f.single;
 for(const limit of [900,1500,2300,4000,6000,12000]){f.input.settings.contextBudget=limit;const out=compileGameContext(f.input,{memoryTransport:'columns'});expect(out.report.required>limit||out.report.total<=limit).toBe(true);for(const h of hints(out.text)){const source=f.input.story!.facts.find(f=>f.text===h.text)!;expect(h.sourceQuote??h.text).toBe(source.quote);expect(h.task).toEqual(source.task);expect(h.claim).toEqual(source.claim);}}
});
