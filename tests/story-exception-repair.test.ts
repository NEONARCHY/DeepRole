// @vitest-environment node
import {it,expect} from 'vitest';
import {exceptionScenarios,exceptionWorld} from './fixtures/story-exception-audit';
import {compileGameContext,addedContextTokens} from '../src/core/game-context';
import {decodeStoryMemory} from '../src/core/story-memory-transport';
import {roleSeed} from '../src/core/story-role-binding';
const memory=(text:string)=>{const b=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return b?decodeStoryMemory(JSON.parse(b.split('\n')[1]!)):[];};
for(const c of exceptionScenarios().filter(c=>c.gold.score||c.gold.uncertainty))it(`${c.id}: full access/place/status with separate source owners`,()=>{
 const before=structuredClone(c.input),states:any[]=[];
 const out=compileGameContext(c.input,{memoryTransport:'columns'},v=>states.push(v)),hints=memory(out.text);
 const ids=hints.map(h=>c.ids[c.input.story!.facts.findIndex(f=>f.text===h.text)]);
 if(c.gold.score)expect(c.gold.wanted.filter(id=>!ids.includes(id))).toEqual([]);
 if(c.gold.uncertainty){expect(out.text).toContain('<deeprole_reference_guard>');expect(states[0].kind).toBe('unverified');}
 for(const h of hints){const i=c.input.story!.facts.findIndex(f=>f.text===h.text),f=c.input.story!.facts[i]!;expect(h.task).toEqual(f.task);expect(h.claim).toEqual(f.claim);expect(h.sourceQuote??h.text).toBe(f.quote);expect(h.sourceRoles).toEqual(c.input.story!.roleSeeds![i]!.binding.roles);expect(h.episodeSource?.revisionId).toBe(c.sources[i]);}
 expect(ids).not.toContain('old');expect(ids).not.toContain('b0');expect(ids).not.toContain('d1');expect(out.report.total).toBe(addedContextTokens(out.text));expect(out.report.total).toBeLessThanOrEqual(out.report.limit);expect(c.input).toEqual(before);
},30000);
for(const locale of ['ru','en'] as const)for(const variant of [2,3,4])for(const mode of ['quote','episode','budget','missing-person'] as const)it(`${locale}/${variant}/${mode}: no guessed or partial supplement`,()=>{
 const c=exceptionWorld(locale,0,120,variant),s=c.input.story!,at=c.ids.indexOf('a1');
 if(mode==='quote')s.facts[at]!.quote+=' changed evidence';
 if(mode==='episode')s.episodeSources=s.episodeSources!.filter((_,i)=>i!==at);
 if(mode==='budget'){c.input.settings.contextBudget=900;s.world.contextBudget=900;}
 if(mode==='missing-person')c.input.entities=c.input.entities!.slice(1);
 expect(compileGameContext(c.input,{memoryTransport:'columns'})).toEqual(compileGameContext(c.input,{memoryTransport:'columns',contextualRecall:false}));
});
for(const locale of ['ru','en'] as const)for(const mode of ['two-labels','title-only'] as const)it(`${locale}/${mode}: a exception title cannot guess one object or contradict its own quote`,()=>{
 const c=exceptionWorld(locale,0,120,3),s=c.input.story!,at=c.ids.indexOf('a0'),f=s.facts[at]!,binding=structuredClone(s.roleSeeds![at]!.binding);
 if(mode==='title-only'){f.text=f.quote=locale==='ru'?'Обсудили другой предмет.':'A different object was discussed.';}
 else{
  const suffix=locale==='ru'?' и керамический дорожный значок':' and a ceramic travel badge';
  f.text+=suffix;f.quote=f.text;f.task!.title+=suffix;
  for(let n=0;n<2;n++){
   const text=(locale==='ru'?'Керамический дорожный значок хранится отдельно.':'The ceramic travel badge is stored separately.')+' '+n;
   const fact={kind:'event' as const,text,quote:text},source='independent-badge-'+n;
   s.facts.splice(-1,0,fact);s.roleSeeds!.splice(-1,0,roleSeed(fact,{...binding,quote:text,sourceRevisionId:source}));s.episodeSources!.splice(-1,0,source);
  }
 }
 s.roleSeeds![at]=roleSeed(f,{...binding,quote:f.quote});
 expect(compileGameContext(c.input,{memoryTransport:'columns'})).toEqual(compileGameContext(c.input,{memoryTransport:'columns',contextualRecall:false}));
});


