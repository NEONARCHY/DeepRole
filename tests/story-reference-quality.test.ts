import {expect,it} from 'vitest';
import {compileGameContext,addedContextTokens} from '../src/core/game-context';
import {decodeStoryMemory} from '../src/core/story-memory-transport';
import {validStoryFact} from '../src/core/story-update';
import {referenceCorpus} from './fixtures/story-reference-quality';
const hints=(text:string)=>{const block=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return block?decodeStoryMemory(JSON.parse(block.split('\n')[1]!)):[];};
it('measures fixed reference guards and whole qualified evidence separately',()=>{let before=0,after=0,guardsBefore=0,guardsAfter=0,targets=0,controls=0;for(const locale of ['ru','en'] as const)for(const c of referenceCorpus(locale)){const old=compileGameContext(c.input,{referenceRecall:false}),out=compileGameContext(c.input);if(c.guard){guardsBefore+=Number(old.text.includes('<deeprole_reference_guard>'));guardsAfter+=Number(out.text.includes('<deeprole_reference_guard>'));if(c.wanted.length){targets++;before+=Number(c.wanted.every(f=>hints(old.text).some(h=>h.text===f.text)));after+=Number(c.wanted.every(f=>hints(out.text).some(h=>h.text===f.text)));}}else{controls++;expect(out).toEqual(old);}}console.info('References40',JSON.stringify({targets,before,after,guardsBefore,guardsAfter,controls}));expect(targets).toBe(6);expect(after).toBe(6);expect(guardsAfter).toBe(20);expect(controls).toBe(20);});
for(const locale of ['ru','en'] as const)for(const c of referenceCorpus(locale))it(`object references ${c.name}`,()=>{
 const snapshot=structuredClone(c.input),out=compileGameContext(c.input),selected=hints(out.text);
 if(c.guard){expect(out.text).toContain('<deeprole_reference_guard>');for(const fact of c.wanted){const hint=selected.find(h=>h.text===fact.text)!;expect(hint).toBeDefined();expect(hint.sourceQuote??hint.text).toBe(fact.quote);if(fact.task)expect(hint.task).toEqual(fact.task);}if(c.wanted.length)expect(selected[0]!.text).toBe(c.wanted[0]!.text);}else expect(out).toEqual(compileGameContext(c.input,{referenceRecall:false}));
 expect(c.input).toEqual(snapshot);expect(out.report.total).toBe(addedContextTokens(out.text));expect(out.report.total<=out.report.limit||out.report.required>out.report.limit).toBe(true);for(const fact of c.input.story!.facts)expect(validStoryFact(fact)).toBe(true);
});
