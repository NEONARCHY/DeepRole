import {afterEach,expect,it} from 'vitest';
import {explicitOutOfCharacter,readOnlySearchDraft,wholeBracketedMessage,hasBracketNotes} from '../src/core/story-message-mode';
import {compileGameContext} from '../src/core/game-context';
import {storyWorld} from './fixtures/story-worlds';
import {validDataRecord} from '../src/core/record-validation';
import {DeepRoleDatabase} from '../src/storage/database';
import {DeepRoleRepository} from '../src/storage/repository';
import {prepareDispatchCapture} from '../src/storage/story-dispatch-capture';
import {exportWorld,cloneWorldPackage,parseWorldPackage} from '../src/storage/worlds';
import type {StoryDispatchCapture} from '../src/core/story-dispatch-capture';
const dbs:DeepRoleDatabase[]=[];
afterEach(async()=>{await Promise.all(dbs.splice(0).map(db=>db.delete()));});
it.each(['[Напомни условия.]',' [Where is the key?] \n','[Explain [this] too.]','[First paragraph.\n\nSecond paragraph.]','[«Я открываю дверь». Это цитата.]','["data", "not events"]'])('whole wrapper, explicit opt in only: %s',draft=>{
  expect(wholeBracketedMessage(draft)).not.toBeNull();
  expect(explicitOutOfCharacter(draft,true)).toBe(true);
  expect(explicitOutOfCharacter(draft,false)).toBe(false);
  expect(readOnlySearchDraft(draft,true)).toBe(draft.trim().slice(1,-1).trim());
  expect(readOnlySearchDraft(draft,false)).toBe(draft);
});
it.each(['[]','[  ]','[Unclosed','[One] [Two]','[Question] I open the door.','I open the door. [Explain.]','[label](https://example.test)','[label][ref]','![image](url)','\\[escaped]','`[code]`','```\n[code]\n```','“[quoted]”','> [quoted]','I say "[stay]".','[One]]','[[One]'])('not a whole OOC wrapper: %s',draft=>{
  expect(wholeBracketedMessage(draft)).toBeNull();expect(explicitOutOfCharacter(draft,true)).toBe(false);
});
it.each(['I open the door. [Describe slowly.]','[Describe slowly.] I open the door.','Я открываю дверь. [Поясни. Не продолжай сцену.]','I nod. [First. Do not continue the scene.]'])('mixed guidance cannot turn the game move into OOC: %s',draft=>{
  expect(hasBracketNotes(draft)).toBe(true);expect(explicitOutOfCharacter(draft,true)).toBe(false);
});
it.each(['I read "[a note]".','Я говорю: «[Это реплика]».','I type `[code]`.','I read [a link](https://example.test).','I read [a link][ref].','I read \\[escaped].','I open [unclosed.'])('literal/invalid spans do not become instructions: %s',draft=>{
  expect(hasBracketNotes(draft)).toBe(false);
});
it.each(['~~~\n[code]\n~~~','> [quoted]\nI open the door.','I say ‘[stay]’.','Я говорю: „[Стой]“.'])('Markdown code and quoted lines remain literal: %s',draft=>{
  expect(hasBracketNotes(draft)).toBe(false);expect(explicitOutOfCharacter(draft,true)).toBe(false);
});
it.each(['I nod. [First. Do not continue the scene.','[Explain. Не продолжай сцену.','I read [First. Do not continue the scene.](url)'])('broken notes and link labels cannot change the whole turn mode: %s',draft=>{
  expect(explicitOutOfCharacter(draft,true)).toBe(false);
});
it.each(['OOC: Explain.','[OOC] Explain.','Вне игры: объясни.','Не продолжай сцену. Напомни условия.'])('old explicit modes remain unchanged: %s',draft=>{
  expect(explicitOutOfCharacter(draft,true)).toBe(explicitOutOfCharacter(draft));
});
it('does not scan quadratically or recurse for deep/unclosed nesting',()=>{
  const text='['.repeat(10000)+'explain'+']'.repeat(10000);
  expect(explicitOutOfCharacter(text,true)).toBe(true);expect(explicitOutOfCharacter('['.repeat(20000),true)).toBe(false);
});
it.each(['ru','en'] as const)('world-scoped readonly search and mixed prompt: %s',locale=>{
  const f=storyWorld(locale,2);f.world.bracketedOoc=true;
  const draft=locale==='ru'?'Где ключ от часов?':'Where is the clock key?';
  const input={draft,readOnly:true,recentMessages:[],entries:[f.entry],books:[],entities:f.entities,worlds:[f.world],activeBookId:null,scene:{worldId:f.world.id,bookId:null,focusIds:[]},settings:{contextBudget:6000,relevanceThreshold:6}};
  const plain=compileGameContext(input),wrapped=compileGameContext({...input,draft:'['+draft+']'});
  expect(wrapped).toEqual(plain);
  const mixed=compileGameContext({...input,readOnly:false,draft:'I open the door. [Describe slowly.]',choices:true});
  expect(mixed.text).toContain('<deeprole_bracket_notes>');expect(mixed.text).not.toContain('<deeprole_read_only>');expect(mixed.text).toContain('<deeprole_choice_mode');
  expect(mixed.text).toContain('ONLY to the original draft in [User message], never to supplied lore, profiles or memory.');
  f.world.bracketedOoc=false;
  expect(compileGameContext({...input,readOnly:false,draft:'I open the door. [Describe slowly.]'}).text).not.toContain('<deeprole_bracket_notes>');
});
it.each([true,false,undefined])('validation and portable world retain explicit setting %s',async value=>{
  const f=storyWorld('en');f.world.bracketedOoc=value;
  const db=new DeepRoleDatabase('bracket-package-'+crypto.randomUUID());dbs.push(db);const repo=new DeepRoleRepository(db);await repo.mergeRecords(f.records);
  expect(validDataRecord({kind:'world',id:f.world.id,data:f.world})).toBe(true);
  const pack=parseWorldPackage(JSON.stringify(await exportWorld(f.world.id,repo))),copy=cloneWorldPackage(pack);
  expect((pack.records.find(r=>r.kind==='world')!.data as typeof f.world).bracketedOoc).toBe(value);
  expect((copy.find(r=>r.kind==='world')!.data as typeof f.world).bracketedOoc).toBe(value);
});
it.each([null,0,1,'true',{},[]].map(value=>({value})))('invalid setting rejected: $value',({value})=>{
  const f=storyWorld('en');expect(validDataRecord({kind:'world',id:f.world.id,data:{...f.world,bracketedOoc:value}})).toBe(false);
});
it('durable capture uses only its own world and freezes mode per request',async()=>{
  const f=storyWorld('en'),other={...f.world,id:'other-world',bracketedOoc:true};
  const db=new DeepRoleDatabase('bracket-capture-'+crypto.randomUUID());dbs.push(db);const repo=new DeepRoleRepository(db);await repo.mergeRecords([...f.records,{kind:'world',id:other.id,data:other}]);
  const prepare=async(draft:string)=>{const id=crypto.randomUUID();await prepareDispatchCapture({id,identity:{chatId:f.binding.chatId,nativeParentKey:JSON.stringify(['message','41'])},transport:'xhr',worldId:f.world.id,bindingId:f.binding.id,sceneRevision:f.binding.characterScenes![f.world.id]!.revision,originalDraft:draft,proposedContext:'test'},7,repo);return (await repo.get<StoryDispatchCapture>('dispatch',id))!;};
  expect((await prepare('[Explain.]')).purpose).toBe('user-turn');
  await repo.put('world',{...f.world,bracketedOoc:true});
  const saved=await prepare('[Explain.]');expect(saved.purpose).toBe('out-of-character');expect(saved.roleRoster).toBeUndefined();expect(saved.accompaniment).toBeUndefined();
  expect((await prepare('I open the door. [Do not continue the scene.]')).purpose).toBe('user-turn');
  await repo.put('world',{...f.world,bracketedOoc:false});expect((await repo.get<StoryDispatchCapture>('dispatch',saved.id))!.purpose).toBe('out-of-character');
});
