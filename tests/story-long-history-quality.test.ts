import {expect,it} from 'vitest';
import {compileGameContext,addedContextTokens} from '../src/core/game-context';
import {decodeStoryMemory} from '../src/core/story-memory-transport';
import {validStoryFact} from '../src/core/story-update';
import {longHistoryCorpus} from './fixtures/story-long-history';
const hints=(text:string)=>{const block=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return block?decodeStoryMemory(JSON.parse(block.split('\n')[1]!)):[];};
const measured:{mode:'bundle'|'normal'|'fallback';before:boolean;after:boolean;falseBefore:boolean;falseAfter:boolean}[]=[];
for(const locale of ['ru','en'] as const)for(const c of longHistoryCorpus(locale))it(`mixed long history ${c.name}`,()=>{
 const snapshot=structuredClone(c.input),out=compileGameContext(c.input),selected=hints(out.text),old=c.mode!=='normal'?compileGameContext(c.input,{referenceBundle:false}):out,guard=c.mode!=='normal'?compileGameContext(c.input,{referenceRecall:'guard'}):out;
 const covers=(text:string,items=c.wanted)=>items.every(f=>hints(text).some(h=>h.text===f.text)),sources=(text:string)=>JSON.stringify(hints(text).map(h=>h.text));measured.push({mode:c.mode,before:covers(old.text),after:covers(out.text),falseBefore:c.mode!=='normal'&&sources(old.text)!==sources(guard.text)&&!covers(old.text,c.bundle),falseAfter:c.mode!=='normal'&&sources(out.text)!==sources(guard.text)&&!covers(out.text,c.bundle)});
 if(c.mode==='fallback')expect(out).toEqual(guard);else{for(const f of c.wanted){const hint=selected.find(h=>h.text===f.text);expect(hint,c.name).toBeDefined();expect(hint!.sourceQuote??hint!.text).toBe(f.quote);if(f.task)expect(hint!.task).toEqual(f.task);if(f.claim?.lifetime==='persistent')expect(hint!.timeStatus).toBe('persistent');}expect(selected[0]!.text).toBe(c.wanted[0]!.text);}
 expect(selected.some(h=>h.text===c.oldCode.text)).toBe(false);for(const h of selected){if(h.task?.key===c.closed.task!.key)expect(h.task.status).toBe(c.closed.task!.status);if(h.text===c.temporary.text)expect(h.timeStatus).not.toBe('persistent');}expect(c.input).toEqual(snapshot);expect(out.report.total).toBe(addedContextTokens(out.text));expect(out.report.total<=out.report.limit||out.report.required>out.report.limit).toBe(true);for(const f of c.input.story!.facts)expect(validStoryFact(f)).toBe(true);
});
it('measures complete recall and partial bundle priority separately on long mixed histories',()=>{
 const bundle=measured.filter(c=>c.mode==='bundle'),counts={bundle:bundle.length,before:bundle.filter(c=>c.before).length,after:bundle.filter(c=>c.after).length,falseBefore:measured.filter(c=>c.falseBefore).length,falseAfter:measured.filter(c=>c.falseAfter).length,normal:measured.filter(c=>c.mode==='normal').length,fallback:measured.filter(c=>c.mode==='fallback').length};
 console.info('LongHistory34',JSON.stringify(counts));expect(measured).toHaveLength(34);expect(counts).toEqual({bundle:10,before:0,after:10,falseBefore:20,falseAfter:0,normal:8,fallback:16});
});
