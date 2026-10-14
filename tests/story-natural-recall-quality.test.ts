import {expect,it} from 'vitest';
import {compileGameContext,addedContextTokens} from '../src/core/game-context';
import {decodeStoryMemory} from '../src/core/story-memory-transport';
import {validStoryFact} from '../src/core/story-update';
import {naturalRecallCorpus} from './fixtures/story-natural-recall-quality';
const hints=(text:string)=>{const block=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return block?decodeStoryMemory(JSON.parse(block.split('\n')[1]!)):[];};
it('measures independently fixed natural requests, without action-count templates',()=>{let before=0,after=0,positive=0,control=0;for(const locale of ['ru','en'] as const)for(const c of naturalRecallCorpus(locale)){const old=compileGameContext(c.input,{naturalRecall:false}),out=compileGameContext(c.input);if(c.balance){positive++;before+=Number(c.wanted.every(f=>hints(old.text).some(h=>h.text===f.text)));after+=Number(c.wanted.every(f=>hints(out.text).some(h=>h.text===f.text)));}else{control++;expect(out).toEqual(old);}}console.info('Natural50',JSON.stringify({positive,control,before,after}));expect(positive).toBe(18);expect(control).toBe(32);expect(before).toBe(7);expect(after).toBe(18);});
for(const locale of ['ru','en'] as const)for(const c of naturalRecallCorpus(locale))it(`natural recall ${c.name}`,()=>{
 const before=structuredClone(c.input),old=compileGameContext(c.input,{naturalRecall:false}),out=compileGameContext(c.input),selected=hints(out.text);
 if(c.balance){for(const fact of c.wanted){const hint=selected.find(h=>h.text===fact.text);expect(hint,c.name).toBeDefined();expect(hint!.sourceQuote??hint!.text).toBe(fact.quote);if(fact.task){expect(hint!.task).toEqual(fact.task);expect(hint!.sourceRoles?.[fact.kind==='plan'?'planner':'promisor']?.id).toBe(c.input.entities![fact.kind==='plan'?1:0]!.id);expect(hint!.episodeSource?.revisionId).toBeTruthy();}}expect(selected[0]!.text).toBe(c.wanted[0]!.text);expect(out.report.explanation?.openTasks).toBe(c.tasks);}else expect(out).toEqual(old);
 expect(c.input).toEqual(before);expect(out.report.total).toBe(addedContextTokens(out.text));expect(out.report.total<=out.report.limit||out.report.required>out.report.limit).toBe(true);for(const fact of c.input.story!.facts)expect(validStoryFact(fact)).toBe(true);
});
