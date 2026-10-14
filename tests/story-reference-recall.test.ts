import {expect,it} from 'vitest';
import {storyObjectReference,storyReferenceCandidates,UNRESOLVED_STORY_OBJECT} from '../src/core/story-reference-recall';
import {storyRetrievalQuery,UNRESOLVED_STORY_REFERENCE} from '../src/core/story-retrieval-query';
import {createStoryRoleReader} from '../src/core/story-source-roles';
import {storedRoleReader} from '../src/core/story-role-binding';
import {createEpisodeReader} from '../src/core/story-episodes';
import {compileGameContext} from '../src/core/game-context';
import {referenceWorld} from './fixtures/story-reference-quality';
const read=(f:ReturnType<typeof referenceWorld>,tasks=[f.blue,f.red])=>{
 const scope={worldId:f.base.world.id,entities:f.input.entities!},names=storyRetrievalQuery(f.input.draft,scope).relevanceNames,roles=createStoryRoleReader(scope,f.input.draft,storedRoleReader(f.input.story!.roleSeeds!,scope.entities,scope.worldId)),episodes=createEpisodeReader(f.input.story!.roleSeeds!,f.input.story!.episodeSources!);
 const reference=storyObjectReference(f.input.draft,names);return reference?storyReferenceCandidates(reference,tasks,[f.blueCode,f.redCode],f.anchor,f.input.recentMessages,names,roles,episodes):undefined;
};
for(const locale of ['ru','en'] as const){
 it(`${locale} returns whole candidate sources without binding or changing the reference`,()=>{const f=referenceWorld(locale),before=structuredClone(f.input);expect(read(f)).toEqual({tasks:[f.blue],persistent:[f.blueCode]});expect(f.input).toEqual(before);const out=compileGameContext(f.input);expect(out.text).toContain(UNRESOLVED_STORY_OBJECT);expect(out.report.explanation?.openTasks).toBe(1);expect(out.report.explanation?.persistentFacts).toBe(1);});
 for(const id of ['missing-seed','edited-quote','missing-source','both-doors','unknown-door','bare-door','unknown-unbound-door','older-scene','source-only','split-object','actor-only','recipient-only'] as const)it(`${locale} never narrows to one object from ${id}`,()=>{
  const f=referenceWorld(locale);let tasks=[f.blue,f.red];
  if(id==='missing-seed')f.input.story!.roleSeeds=f.input.story!.roleSeeds!.slice(0,-1);
  if(id==='edited-quote')f.anchor.quote+=' edit';
  if(id==='missing-source')f.input.story!.episodeSources=f.sources.slice(0,-1);
  if(id==='both-doors')f.input.recentMessages=[f.anchor.quote+f.s(' Ещё видна красную дверь.',' The red door is also visible.')];
  if(id==='unknown-door')f.input.recentMessages=[f.anchor.quote+f.s(' Рядом видна жёлтая дверь.',' A yellow door is nearby.')];
  if(id==='bare-door')f.input.recentMessages=[f.anchor.quote+f.s(' Ещё одна дверь закрыта.',' Another door is shut.')];
  if(id==='unknown-unbound-door'){tasks=[f.blue];f.input.recentMessages=[f.anchor.quote+f.s(' Ещё видна красную дверь.',' The red door is also visible.')];}
  if(id==='older-scene')f.input.recentMessages=[f.anchor.quote,f.s('Мира ушла в сад.','Mira left for the garden.')];
  if(id==='source-only')f.anchor.text=f.s('Мира посмотрела вокруг.','Mira looked around.');
  if(id==='split-object')f.input.recentMessages=[f.s('Синюю отметку видно. Дверь закрыта.','The blue sign is visible. The door is shut.')];
  if(id==='actor-only')f.input.draft=f.s('Мира открывает эту дверь.','Mira opens this door.');
  if(id==='recipient-only')f.input.draft=f.s('Беру её ключ.','I take her key.');
  expect(read(f,tasks)).toBeUndefined();if(id!=='unknown-unbound-door')expect(compileGameContext(f.input)).toEqual(compileGameContext(f.input,{referenceRecall:'guard'}));
 });
 for(const id of ['rename','reorder','new-same-name','foreign','unavailable'] as const)it(`${locale} keeps historical source identities across ${id}`,()=>{
  const f=referenceWorld(locale),N=f.input.entities![0]!,original=N.id;
  if(id==='rename')N.name=f.s('Переименованная Нора','Renamed Nora');
  if(id==='reorder'){f.input.entities!.reverse();f.input.character![2]=f.input.entities!;}
  if(id==='new-same-name')N.id='replacement-nora';
  if(id==='foreign')N.worldId='elsewhere';
  if(id==='unavailable'){f.input.entities=f.input.entities!.filter(p=>p.id!==original);f.input.character![2]=f.input.entities;}
  const out=compileGameContext(f.input);expect(out.text).toContain(UNRESOLVED_STORY_OBJECT);
  if(id==='rename'||id==='reorder')expect(out.report.explanation?.openTasks).toBe(1);else expect(out.report.explanation?.openTasks??0).toBe(0);
  expect(f.seeds[0]!.binding.roles.promisor!.id).toBe(original);
 });
 it(`${locale} warns for ordinary personal references without assigning a person`,()=>{const f=referenceWorld(locale);f.input.draft=f.s('Мира, беру её ключ.','Mira, I take her key.');const out=compileGameContext(f.input);expect(out.text).toContain(UNRESOLVED_STORY_REFERENCE);expect(out.report.explanation?.openTasks??0).toBe(0);expect(f.input.draft).toBe(f.s('Мира, беру её ключ.','Mira, I take her key.'));});
 it(`${locale} preserves a complete required guard when the author instruction exceeds budget`,()=>{const f=referenceWorld(locale);f.input.settings.contextBudget=500;f.input.requiredContext='Entire author condition. '.repeat(200);const out=compileGameContext(f.input);expect(out.text).toContain(f.input.requiredContext);expect(out.text).toContain(UNRESOLVED_STORY_OBJECT);expect(out.report.selected.facts).toBe(0);expect(out.report.required).toBeGreaterThan(out.report.limit);});
 it(`${locale} rolls back oversized whole evidence without retaining a protected task count`,()=>{const f=referenceWorld(locale);f.blueCode.text=f.s('Про синюю дверь: ','About the blue door: ')+'Entire condition. '.repeat(60);f.blueCode.claim!.value=f.blueCode.text;f.blueCode.quote=f.s(`Мира сказала: «${f.blueCode.text}».`,`Mira said: “${f.blueCode.text}.”`);f.input.story!.roleSeeds![2]=f.seed(f.blueCode,f.sources[2]!,'speaker',f.base.entities[1]!);let failed=false;for(let budget=1000;budget<3500;budget+=100){f.input.settings.contextBudget=budget;const out=compileGameContext(f.input);if(!out.report.explanation?.openTasks){expect(out.report.explanation?.persistentFacts??0).toBe(0);expect(out).toEqual(compileGameContext(f.input,{referenceRecall:'guard'}));failed=true;}}expect(failed).toBe(true);});
}
