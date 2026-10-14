import {expect,it} from 'vitest';
import {compileGameContext,addedContextTokens} from '../src/core/game-context';
import {decodeStoryMemory} from '../src/core/story-memory-transport';
import {validStoryFact} from '../src/core/story-update';
import {lastingRecallCorpus} from './fixtures/story-lasting-recall-quality';
const hints=(text:string)=>{const block=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return block?decodeStoryMemory(JSON.parse(block.split('\n')[1]!)):[];};
it('measures fixed standalone knowledge and terminal task recall',()=>{let before=0,after=0,positive=0,control=0;for(const locale of ['ru','en'] as const)for(const c of lastingRecallCorpus(locale)){const old=compileGameContext(c.input,{lastingRecall:false}),out=compileGameContext(c.input);if(c.positive){positive++;before+=Number(c.wanted.every(f=>hints(old.text).some(h=>h.text===f.text)));after+=Number(c.wanted.every(f=>hints(out.text).some(h=>h.text===f.text)));}else{control++;expect(out).toEqual(old);}}console.info('Lasting48',JSON.stringify({positive,control,before,after}));expect(positive).toBe(16);expect(control).toBe(32);expect(before).toBe(5);expect(after).toBe(16);});
for(const locale of ['ru','en'] as const)for(const c of lastingRecallCorpus(locale))it(`lasting recall ${c.name}`,()=>{
 const before=structuredClone(c.input),out=compileGameContext(c.input),selected=hints(out.text);
 if(c.positive){for(const fact of c.wanted){const hint=selected.find(h=>h.text===fact.text);expect(hint,c.name).toBeDefined();expect(hint!.sourceQuote??hint!.text).toBe(fact.quote);if(fact.task)expect(hint!.task).toEqual(fact.task);if(fact.claim)expect(hint!.timeStatus).toBe('persistent');}expect(selected[0]!.text).toBe(c.wanted[0]!.text);}else expect(out).toEqual(compileGameContext(c.input,{lastingRecall:false}));
 expect(c.input).toEqual(before);expect(out.report.total).toBe(addedContextTokens(out.text));expect(out.report.total<=out.report.limit||out.report.required>out.report.limit).toBe(true);for(const fact of c.input.story!.facts)expect(validStoryFact(fact)).toBe(true);
});
