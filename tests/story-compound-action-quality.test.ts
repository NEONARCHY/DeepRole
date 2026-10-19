import {expect,it} from 'vitest';
import {compileGameContext,addedContextTokens} from '../src/core/game-context';
import {decodeStoryMemory} from '../src/core/story-memory-transport';
import {validStoryFact} from '../src/core/story-update';
import {compoundActionQualityCorpus} from './fixtures/story-compound-action-quality';
import {storyCompoundAction} from '../src/core/story-compound-action';
import type {GameMemoryCoverage} from '../src/core/game-memory-coverage';
// RP337 adds source-backed topic retrieval for these drafts; the strict action
// parser must still decline them, without treating the draft as played evidence.
const topicOnly=(name:string)=>/:(conditional|negated|personal-object|unknown-object|unsupported|quoted|third-person)$/.test(name);
const hints=(text:string)=>{const block=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return block?decodeStoryMemory(JSON.parse(block.split('\n')[1]!)):[];};
it('measures fixed compound targets and exact fallback independently',()=>{
 let before=0,after=0,positive=0,control=0;
 for(const locale of ['ru','en'] as const)for(const c of compoundActionQualityCorpus(locale)){
  const old=compileGameContext(c.input,{compoundActionBalance:false}),out=compileGameContext(c.input);
  if(c.balance){positive++;before+=Number(c.wanted.every(f=>hints(old.text).some(h=>h.text===f.text)));after+=Number(c.wanted.every(f=>hints(out.text).some(h=>h.text===f.text)));}else{control++;if(!topicOnly(c.name))expect(out).toEqual(old);}
 }
 console.info('Independent compound48:',JSON.stringify({positive,control,before,after}));expect(positive).toBe(16);expect(control).toBe(32);expect(before).toBe(0);expect(after).toBe(16);
});
for(const locale of ['ru','en'] as const)for(const c of compoundActionQualityCorpus(locale))it(`compound action ${c.name}`,()=>{
 const before=structuredClone(c.input),old=compileGameContext(c.input,{compoundActionBalance:false}),out=compileGameContext(c.input),selected=hints(out.text);
 if(c.balance){
  for(const fact of c.wanted){const hint=selected.find(h=>h.text===fact.text);expect(hint,c.name).toBeDefined();expect(hint!.sourceQuote??hint!.text).toBe(fact.quote);if(fact.task){expect(hint!.task).toEqual(fact.task);expect(hint!.sourceRoles?.[fact.kind==='plan'?'planner':'promisor']?.id).toBe(c.input.entities![fact.kind==='plan'?1:0]!.id);expect(hint!.episodeSource?.revisionId).toBeTruthy();}}
  expect(selected[0]!.text).toBe(c.wanted[0]!.text);expect(out.report.explanation?.openTasks).toBe(c.wanted.length-1);
 }else if(topicOnly(c.name)){
  let coverage:GameMemoryCoverage|undefined;compileGameContext(c.input,{},c=>{coverage=c});
  if(!c.name.endsWith(':unknown-object'))expect(storyCompoundAction(c.input.draft,c.input.entities!.map(e=>e.name))).toBeUndefined();
  expect(coverage?.kind).not.toBe('complete');
  expect(out.text).toContain('<deeprole_reference_guard>');
  for(const hint of selected){const fact=c.input.story!.facts.find(f=>f.text===hint.text);expect(fact).toBeDefined();expect(hint.task).toEqual(fact!.task);expect(hint.sourceQuote??hint.text).toBe(fact!.quote);}
 }else expect(out).toEqual(old);
 expect(out.report.total).toBe(addedContextTokens(out.text));expect(out.report.total<=out.report.limit||out.report.required>out.report.limit).toBe(true);expect(c.input).toEqual(before);for(const fact of c.input.story!.facts)expect(validStoryFact(fact)).toBe(true);
});
