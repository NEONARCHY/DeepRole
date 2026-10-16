// @vitest-environment node
import {it,expect} from 'vitest';
import {crossOwnerScenarios,crossOwnerWorld} from './fixtures/story-cross-owner-audit';
import {compileGameContext} from '../src/core/game-context';
import {decodeStoryMemory} from '../src/core/story-memory-transport';
for(const c of crossOwnerScenarios().filter(c=>c.gold.score||c.gold.uncertainty))it(`${c.id}: complete conditions and explicit uncertainty`,()=>{
 const before=structuredClone(c.input),coverage:any[]=[];
 const out=compileGameContext(c.input,{memoryTransport:'columns'},v=>coverage.push(v));
 const b=out.text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];
 const hints=b?decodeStoryMemory(JSON.parse(b.split('\n')[1]!)):[];
 const ids=hints.map(h=>c.ids[c.input.story!.facts.findIndex(f=>f.text===h.text)]);
 if(c.gold.score)expect(c.gold.wanted.filter(id=>!ids.includes(id))).toEqual([]);
 if(c.gold.uncertainty){expect(out.text).toContain('<deeprole_reference_guard>');expect(coverage[0].kind).toBe('unverified');}
 expect(c.input).toEqual(before);
},30000);
for(const locale of ['ru','en'] as const)for(const variant of [1,6,7,12])for(const mode of ['quote','episode','budget'] as const)it(`${locale}/${variant}/${mode}: no partial source bundle or budget bypass`,()=>{
 const c=crossOwnerWorld(locale,0,120,variant),input=c.input,s=input.story!,at=c.ids.indexOf('a1');
 if(mode==='quote')s.facts[at]!.quote+=' altered evidence';
 if(mode==='episode')s.episodeSources=s.episodeSources!.filter((_,i)=>i!==at);
 if(mode==='budget'){input.settings.contextBudget=900;s.world.contextBudget=900;}
 expect(compileGameContext(input,{memoryTransport:'columns'})).toEqual(compileGameContext(input,{memoryTransport:'columns',contextualRecall:false}));
});
for(const option of ['actionBalance','compoundActionBalance'] as const)it(`${option} opt-out remains effective for supplementary compound recall`,()=>{
 const c=crossOwnerWorld('en',0,120,12);
 expect(compileGameContext(c.input,{[option]:false})).toEqual(compileGameContext(c.input,{[option]:false,contextualRecall:false}));
});
