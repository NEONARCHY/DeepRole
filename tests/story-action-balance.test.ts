import {expect,it} from "vitest";
import {storyActionBalance} from "../src/core/story-action-balance";
import {compileGameContext,addedContextTokens} from "../src/core/game-context";
import {decodeStoryMemory} from "../src/core/story-memory-transport";
import {createStoryRoleReaderV1} from "../src/core/story-source-roles";
import type {StoryFact} from "../src/core/story-update";
import {actionWorld} from "./fixtures/story-action-quality";
const names=['Нора','Норе','Мира','Мире','Миры','Nora','Mira',"O'Connor"];
const hints=(text:string)=>{const block=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return block?decodeStoryMemory(JSON.parse(block.split('\n')[1]!)):[];};
const prior=(f:ReturnType<typeof actionWorld>)=>compileGameContext(f.input,{actionBalance:false});
it.each(['Я открываю дверь после разрешения.','Я открываю дверь перед проверкой.','Я открываю дверь потом киваю.','I open the door after permission.','I open the door unless barred.','I open the door then wait.','I open the door without consent.','I open the door while waiting.'])('conditional/sequence modifiers are not treated as object names: %s',draft=>{
 expect(storyActionBalance(draft,names)).toBeUndefined();const f=actionWorld('en');f.input.draft=draft;expect(compileGameContext(f.input)).toEqual(prior(f));
});
it.each(['Я открываю дверь.','Я осторожно открываю дверь.','*Я открываю дверь.*','**Я беру ключ.**','Я читаю книгу.','Я киваю.','Я киваю Мире.','Я молча улыбаюсь.','I open the door.','I carefully open the red door.','*I nod.*','**I inspect the chest.**','I am opening the door.',"I'm opening the door.",'I’m opening the door.','I nod to Mira.','I am smiling.','I nod to O\'Connor.'])('recognizes finite single first-person action syntax: %s',draft=>{
 expect(storyActionBalance(draft,names)).toBeDefined();
});
it.each(['','Continue.','Я созерцаю дверь.','I contemplate the door.','Она открывает дверь.','She opens the door.','Nora opens the door.','Я не открываю дверь.','I do not open the door.','Я открываю её дверь.','I open her door.','Я открываю дверь, если охрана разрешит.','I open the door if the guards allow.','Я пытаюсь открыть дверь.','I try to open the door.','I want to open the door.','I will open the door.','"I open the door".','«Я киваю».','I say “I open the door”.','I open the door and take the key.','I open the door?','I open\nthe door.','(I open the door)','I open the door; then nod.','I nod to someone.','Я киваю ей.','I open Mira\'s door.','I open '+ 'door '.repeat(60)])('unsupported, quoted, tentative, referential or compound syntax keeps its old path: %s',draft=>{
 expect(storyActionBalance(draft,names)).toBeUndefined();
});
it('names cannot manufacture a gesture or action; longest names mask as one target',()=>{
 expect(storyActionBalance('I open the door.',['Open'])).toBeUndefined();expect(storyActionBalance('I nod.',['Nod'])).toBeUndefined();
 expect(storyActionBalance('I nod to Anna Lee.',['Anna','Anna Lee'])?.kind).toBe('context');
});
it('object coverage reads whole text/title separately, never quotes, opaque keys, values or status',()=>{
 const query=storyActionBalance('I open the red door.')!;expect(query.kind).toBe('object');if(query.kind!=='object')throw Error('Missing literal matcher');
 const fact:StoryFact={kind:'event',text:'The blue door is closed.',quote:'The red door is closed.',claim:{key:'red-door',value:'red door',scope:'state'},task:{key:'red-door',title:'Red key',status:'completed'}};
 expect(query.matches(fact)).toBe(false);fact.task!.title='The red door';expect(query.matches(fact)).toBe(true);
 fact.task=undefined;fact.text='The red door is closed.';expect(query.matches(fact)).toBe(true);
});
it.each(['ru','en'] as const)('the corpus uses the real frozen source grammar, not fabricated ownership: %s',locale=>{
 const f=actionWorld(locale),roles=createStoryRoleReaderV1({worldId:f.base.world.id,entities:f.base.entities});
 expect(roles.read(f.task)?.promisor?.id).toBe(f.base.entities[0]!.id);expect(roles.read(f.knowledge)?.speaker?.id).toBe(f.base.entities[1]!.id);
});
it('a newer unrelated duty or lasting detail cannot replace matching object data',()=>{
 const f=actionWorld('en'),otherTask:StoryFact={kind:'promise',text:'Nora promised Mira to inspect the roof after permission.',quote:'Nora promised Mira to inspect the roof after permission.',task:{key:'roof',title:'Inspect roof',status:'open'}},otherDetail:StoryFact={kind:'event',text:'Mira learned the attic code.',quote:'Mira said: “I learned the attic code.”',claim:{key:'attic-code',value:'known attic code',scope:'state',lifetime:'persistent'}};
 f.input.story!.facts.push(otherTask,otherDetail);f.input.story!.episodeSources!.push('new-roof','new-attic');f.input.story!.roleSeeds!.push(f.seed(otherTask,'new-roof','promisor',f.base.entities[0]!),f.seed(otherDetail,'new-attic','speaker',f.base.entities[1]!));
 const out=compileGameContext(f.input),selected=hints(out.text);expect(selected[0]!.text).toBe(f.latest.text);
 for(const wanted of [f.task,f.knowledge])expect(selected.some(h=>h.text===wanted.text)).toBe(true);
 expect(out.report.explanation?.openTasks).toBe(1);expect(out.report.explanation?.persistentFacts).toBe(1);
});
it('recipients and inactive people do not become owners of the protected task',()=>{
 const f=actionWorld('en');f.input.character![3]!.presentIds=[f.base.entities[1]!.id];f.input.story!.facts=f.input.story!.facts.filter(fact=>fact!==f.knowledge);
 expect(compileGameContext(f.input)).toEqual(prior(f));
});
it('an object request keeps a whole direct match even when the recent anchor is about another subject',()=>{
 const f=actionWorld('en');f.latest.text=f.latest.quote='Nora and Mira just moved to the window.';f.input.recentMessages=[f.latest.text];f.input.character![6]=f.latest.text;
 const out=compileGameContext(f.input),selected=hints(out.text);expect(selected[0]!.text).toBe(f.latest.text);
 for(const wanted of [f.task,f.knowledge])expect(selected.some(h=>h.text===wanted.text)).toBe(true);
});
it.each(['quote','order','lifetime'])('missing historical/lifetime proof cannot create an extra lane: %s',mode=>{
 const f=actionWorld('en');f.input.story!.facts=f.input.story!.facts.filter(fact=>fact!==f.task);
 if(mode==='quote')f.knowledge.quote+=' Altered quote.';
 if(mode==='order')f.input.story!.episodeSources=[];
 if(mode==='lifetime')f.knowledge.claim!.lifetime='scene';
 expect(compileGameContext(f.input)).toEqual(prior(f));
});
it.each(['completed','cancelled'] as const)('closed obligations are never reopened by a user action: %s',status=>{
 const f=actionWorld('en'),done:StoryFact={kind:'event',text:'The door duty is closed.',quote:'The door duty is closed.',task:{...f.task.task!,status}};
 f.input.story!.facts.push(done);f.input.story!.facts=f.input.story!.facts.filter(fact=>fact!==f.knowledge);
 expect(compileGameContext(f.input)).toEqual(prior(f));expect(f.task.task!.status).toBe('open');expect(done.task!.status).toBe(status);
 expect(hints(compileGameContext(f.input).text).some(h=>h.task?.key===f.task.task!.key&&h.task?.status==='open')).toBe(false);
});
it('same-name replacements cannot inherit the old promise; a rename preserves the exact ID',()=>{
 const f=actionWorld('en'),N=f.base.entities[0]!;f.input.story!.facts=f.input.story!.facts.filter(fact=>fact!==f.knowledge);
 f.input.entities=[{...N,id:'replacement'},f.base.entities[1]!];f.input.character![2]=f.input.entities;f.input.character![3]!.presentIds=['replacement'];
 expect(compileGameContext(f.input)).toEqual(prior(f));
 f.input.entities=[{...N,name:'Renamed Nora'},f.base.entities[1]!];f.input.character![2]=f.input.entities;f.input.character![3]!.presentIds=[N.id];
 const fact=hints(compileGameContext(f.input).text).find(h=>h.text===f.task.text)!;expect(fact.sourceRoles?.promisor?.id).toBe(N.id);expect(fact.sourceRoles?.promisor?.sourceName).toBe('Nora');
});
it.each(['ru','en'] as const)('whole-budget fallback is exact, and fitting action memory stays within2000: %s',locale=>{
 const f=actionWorld(locale),before=structuredClone(f.input);f.input.settings.contextBudget=2000;let out=compileGameContext(f.input);for(const target of [f.latest,f.task,f.knowledge])expect(hints(out.text).some(h=>h.text===target.text)).toBe(true);expect(out.report.total).toBeLessThanOrEqual(2000);
 f.input.settings.contextBudget=900;f.latest.quote+=' Entire original source condition. '.repeat(60);out=compileGameContext(f.input);expect(out).toEqual(prior(f));expect(out.report.total).toBe(addedContextTokens(out.text));
 expect(before.story!.facts[0]!.quote).toBe(f.task.quote);
});
it.each(['reference','absent','restart','foreign','no-current-source'] as const)('out-of-game/unknown scope never reserves action memory: %s',mode=>{
 const f=actionWorld('en');if(mode==='reference')f.input.character![9]=true;if(mode==='absent')f.input.story=undefined;if(mode==='restart')f.input.restart=true;if(mode==='foreign'){f.input.entities=f.input.entities!.map(e=>({...e,worldId:'foreign'}));f.input.character![2]=f.input.entities;}if(mode==='no-current-source')f.input.story!.roleSeeds=[];
 expect(compileGameContext(f.input)).toEqual(prior(f));
});
