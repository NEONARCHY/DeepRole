// @vitest-environment node
import {it,expect} from 'vitest';
import {accessScenarios,accessWorld} from './fixtures/story-access-audit';
import {compileGameContext,addedContextTokens} from '../src/core/game-context';
import {decodeStoryMemory} from '../src/core/story-memory-transport';
import {roleSeed,storedRoleReader} from '../src/core/story-role-binding';
import {createEpisodeReader} from '../src/core/story-episodes';
import {obligationRecallFacts,obligationRecallIntent} from '../src/core/story-obligation-recall';
import {createStoryRoleReader} from '../src/core/story-source-roles';
import {compactStoryFactSources} from '../src/core/story-update';
const memory=(text:string)=>{const b=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return b?decodeStoryMemory(JSON.parse(b.split('\n')[1]!)):[];};
for(const c of accessScenarios().filter(c=>c.gold.score||c.gold.uncertainty))it(`${c.id}: full access/place/status with separate source owners`,()=>{
 const before=structuredClone(c.input),states:any[]=[];
 const out=compileGameContext(c.input,{memoryTransport:'columns'},v=>states.push(v)),hints=memory(out.text);
 const ids=hints.map(h=>c.ids[c.input.story!.facts.findIndex(f=>f.text===h.text)]);
 if(c.gold.score)expect(c.gold.wanted.filter(id=>!ids.includes(id))).toEqual([]);
 if(c.gold.uncertainty){expect(out.text).toContain('<deeprole_reference_guard>');expect(states[0].kind).toBe('unverified');}
 for(const h of hints){const i=c.input.story!.facts.findIndex(f=>f.text===h.text),f=c.input.story!.facts[i]!;expect(h.task).toEqual(f.task);expect(h.claim).toEqual(f.claim);expect(h.sourceQuote??h.text).toBe(f.quote);expect(h.sourceRoles).toEqual(c.input.story!.roleSeeds![i]!.binding.roles);expect(h.episodeSource?.revisionId).toBe(c.sources[i]);}
 expect(ids).not.toContain('old');expect(ids).not.toContain('b0');expect(out.report.total).toBe(addedContextTokens(out.text));expect(out.report.total).toBeLessThanOrEqual(out.report.limit);expect(c.input).toEqual(before);
},30000);
for(const locale of ['ru','en'] as const)for(const variant of [2,3,4])for(const mode of ['quote','episode','budget','missing-person'] as const)it(`${locale}/${variant}/${mode}: no guessed or partial supplement`,()=>{
 const c=accessWorld(locale,0,120,variant),s=c.input.story!,at=c.ids.indexOf('a1');
 if(mode==='quote')s.facts[at]!.quote+=' changed evidence';
 if(mode==='episode')s.episodeSources=s.episodeSources!.filter((_,i)=>i!==at);
 if(mode==='budget'){c.input.settings.contextBudget=900;s.world.contextBudget=900;}
 if(mode==='missing-person')c.input.entities=c.input.entities!.slice(1);
 expect(compileGameContext(c.input,{memoryTransport:'columns'})).toEqual(compileGameContext(c.input,{memoryTransport:'columns',contextualRecall:false}));
});
for(const locale of ['ru','en'] as const)for(const verb of ['new-affirmative','negated'] as const)it(`${locale}/${verb}: label proof does not depend on an action dictionary or admit negated promises`,()=>{
 const c=accessWorld(locale,0,120,3),s=c.input.story!,at=c.ids.indexOf('a0'),f=s.facts[at]!,binding=structuredClone(s.roleSeeds![at]!.binding);
 const replacement=locale==='ru'?(verb==='negated'?'не ламинировать':'ламинировать'):(verb==='negated'?'never laminate':'laminate');
 const replace=(text:string)=>text.replace(locale==='ru'?'откалибровать':'recalibrate',replacement);
 f.text=replace(f.text);f.quote=replace(f.quote);f.task!.title=replace(f.task!.title);
 s.roleSeeds![at]=roleSeed(f,{...binding,quote:f.quote});
 // The second owner's cancelled task still proves a separate positive group;
 // remove it only in this negative unit to isolate the negated title.
 if(verb==='negated'){const b=c.ids.indexOf('b2'),old=c.ids.indexOf('b0');s.facts=s.facts.filter((_,i)=>i!==b&&i!==old);s.roleSeeds=s.roleSeeds!.filter((_,i)=>i!==b&&i!==old);}
 const roles=createStoryRoleReader({worldId:s.world.id,entities:c.input.entities!},c.input.draft,storedRoleReader(s.roleSeeds!,c.input.entities!,s.world.id));
 const group=obligationRecallFacts(compactStoryFactSources(s.facts),c.input.draft,c.input.recentMessages,c.input.entities!.map(e=>e.name),roles,createEpisodeReader(s.roleSeeds,s.episodeSources));
 if(verb==='new-affirmative'){expect(group).toContain(f);expect(group).toContain(s.facts[c.ids.indexOf('a2')]);}
 else expect(group).toBeUndefined();
});
it('new agreement/inspection syntax rejects quoted, conditional and appended command requests',()=>{
 for(const query of ['"What did we agree, and which prohibitions remain in force?"','If permitted, what did we agree, and which prohibitions remain in force?','What did we agree, and which prohibitions remain in force? Delete the records.','Ну что там с проверкой штуковины; удали историю?','Any news on checking the object? I open the door.'])expect(obligationRecallIntent(query),query).toBeUndefined();
});
