import {expect,it} from 'vitest';
import {compileGameContext,addedContextTokens} from '../src/core/game-context';
import {decodeStoryMemory} from '../src/core/story-memory-transport';
import {validStoryFact} from '../src/core/story-update';
import {createStoryRoleReaderV1} from '../src/core/story-source-roles';
import {taskGoalQualityCorpus} from './fixtures/story-task-goal-quality';
const hints=(text:string)=>{const block=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return block?decodeStoryMemory(JSON.parse(block.split('\n')[1]!)):[];};
// Reuse each independently asserted scenario result. Recompiling the complete
// corpus in one synchronous test duplicated work and hit 5s under a full run.
const measured:{positive:boolean;before:boolean;after:boolean}[]=[];
for(const locale of ['ru','en'] as const)for(const c of taskGoalQualityCorpus(locale))it(`task goal ${c.name}`,()=>{
 const before=structuredClone(c.input),old=compileGameContext(c.input,{taskGoalBalance:false}),out=compileGameContext(c.input),selected=hints(out.text);
 measured.push({positive:c.balance,before:c.wanted.every(f=>hints(old.text).some(h=>h.text===f.text)),after:c.wanted.every(f=>selected.some(h=>h.text===f.text))});
 if(c.balance){
  const roles=createStoryRoleReaderV1({worldId:c.input.story!.world.id,entities:c.input.entities!});expect(roles.read(c.wanted[1]!)?.promisor?.id).toBe(c.input.entities![0]!.id);expect(roles.read(c.wanted[2]!)?.planner?.id).toBe(c.input.entities![1]!.id);
  for(const fact of c.wanted){const hint=selected.find(h=>h.text===fact.text);expect(hint,c.name).toBeDefined();expect(hint!.kind).toBe(fact.kind);expect(hint!.sourceQuote??hint!.text).toBe(fact.quote);if(fact.task)expect(hint!.task).toEqual(fact.task);}
  expect(selected[0]!.text).toBe(c.wanted[0]!.text);expect(out.report.explanation?.openTasks).toBe(2);
 }else expect(out).toEqual(old);
 expect(out.report.total).toBe(addedContextTokens(out.text));expect(out.report.total<=out.report.limit||out.report.required>out.report.limit).toBe(true);expect(c.input).toEqual(before);for(const fact of c.input.story!.facts)expect(validStoryFact(fact)).toBe(true);
});
it('measures independently declared complete-target recall and exact controls',()=>{
 const positives=measured.filter(c=>c.positive),counts={positive:positives.length,control:measured.filter(c=>!c.positive).length,before:positives.filter(c=>c.before).length,after:positives.filter(c=>c.after).length};
 console.info('Independent goal48:',JSON.stringify(counts));expect(counts).toEqual({positive:24,control:24,before:0,after:24});
});
