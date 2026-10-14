import {expect,it} from 'vitest';
import {storyTaskGoal,storyTaskGoalCandidates} from '../src/core/story-task-goal';
import {compileGameContext,addedContextTokens} from '../src/core/game-context';
import {createStoryRoleReaderV1} from '../src/core/story-source-roles';
import {createEpisodeReader} from '../src/core/story-episodes';
import {roleSeed} from '../src/core/story-role-binding';
import {decodeStoryMemory} from '../src/core/story-memory-transport';
import type {StoryFact} from '../src/core/story-update';
import {taskGoalWorld} from './fixtures/story-task-goal-quality';
const hints=(text:string)=>{const block=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return block?decodeStoryMemory(JSON.parse(block.split('\n')[1]!)):[];};
const old=(f:ReturnType<typeof taskGoalWorld>)=>compileGameContext(f.input,{taskGoalBalance:false});
it.each(['Моя цель — починить красные ворота.','Моя цель: вернуть синий альбом.','Продолжай: доставить медицинский набор.','Продолжай ремонт ворот.','Я ремонтирую красные ворота.','Я возвращаю альбом.','*Я доставляю медицинский набор.*','My goal is to repair the red gate.','Continue: return the blue album.','Continue delivering the medical kit.','I am repairing the red gate.',"I'm repairing the red gate.",'I’m returning the album.','**I am delivering the medical kit.**'])('recognizes only a bounded declared goal: %s',text=>{
 expect(storyTaskGoal(text)).toBeDefined();
});
it.each(['Continue.','Моя цель — любоваться воротами.','My goal is to contemplate the gate.','My goal is not to repair the gate.','Моя цель — не починить ворота.','My goal is to repair the gate if permitted.','Моя цель — починить ворота после разрешения.','My goal is to repair the gate and leave.','My goal is to return her album.','My goal is to repair Mira\'s gate.','I try to repair the gate.','She repairs the gate.','What did Nora promise?','"My goal is to repair the gate".','Моя цель — починить\nворота.','My goal is to repair the gate; then leave.','My goal is to repair the gate?','My goal is to repair '+ 'gate '.repeat(70)])('unknown, conditional, quoted or compound goals retain fallback: %s',text=>{
 expect(storyTaskGoal(text,['Мира','Mira'])).toBeUndefined();
});
it('names cannot manufacture a goal, action or object match',()=>{
 expect(storyTaskGoal('My goal is to repair the red gate.',['Repair'])).toBeUndefined();expect(storyTaskGoal('My goal is to repair the red gate.',['Red Gate'])).toBeUndefined();expect(storyTaskGoal('My goal is to repair the red gate.',['My Goal'])).toBeUndefined();
});
it('task title must name the goal at its beginning; body, quotes and keys cannot supply it',()=>{
 const goal=storyTaskGoal('My goal is to repair the red gate.')!;
 const fact:StoryFact={kind:'promise',text:'Repair the red gate.',quote:'Repair the red gate.',task:{key:'repair-red-gate',title:'Discuss repairing the red gate',status:'open'}};
 expect(goal.matchesTask(fact)).toBe(false);fact.task!.title='Repair the blue gate after the red roof';expect(goal.matchesTask(fact)).toBe(false);
 fact.task!.title='Mend the red gate only if permitted';expect(goal.matchesTask(fact)).toBe(true);fact.task!.status='completed';expect(goal.matchesTask(fact)).toBe(false);
});
it('object coverage never combines fields, original quote or claim values; title edits recompute',()=>{
 const goal=storyTaskGoal('My goal is to repair the red gate.')!,fact:StoryFact={kind:'event',text:'A red key.',quote:'The red gate.',claim:{key:'red-gate',value:'red gate',scope:'state'},task:{key:'red-gate',title:'Repair blue gate',status:'open'}};
 expect(goal.matchesTask(fact)).toBe(false);expect(goal.matchesObject(fact)).toBe(false);fact.task!.title='Repair red gate';expect(goal.matchesTask(fact)).toBe(true);fact.task!.title='Repair blue gate';expect(goal.matchesTask(fact)).toBe(false);
});
it.each(['Repair the blue gate after the red gate','Repair red. Gate','Repair red Mira gate','Discuss repair of the red gate','Red gate repair','Repair red key and blue gate'])('does not manufacture a title target from another object, clause or name: %s',title=>{
 const goal=storyTaskGoal('My goal is to repair the red gate.',['Mira'])!;expect(goal.matchesTask({kind:'promise',text:'Repair red gate',quote:'Repair red gate',task:{key:'opaque',title,status:'open'}})).toBe(false);
});
it.each(['ru','en'] as const)('declared goal owners use actual frozen source grammar: %s',locale=>{
 const f=taskGoalWorld(locale),reader=createStoryRoleReaderV1({worldId:f.base.world.id,entities:f.base.entities});expect(reader.read(f.oldest)?.promisor?.id).toBe(f.base.entities[0]!.id);expect(reader.read(f.newest)?.planner?.id).toBe(f.base.entities[1]!.id);
});
it('samples the oldest and newest matching sources, not extraction order or lexical frequency',()=>{
 const f=taskGoalWorld('en'),middle:StoryFact={kind:'plan',text:'Mira plans to repair the red gate only after permission.',quote:'Mira plans to repair the red gate only after permission.',task:{key:'middle-goal',title:'Repair the red gate',status:'open'}};
 const seeds=[...f.seeds,f.seed(middle,'middle-source','planner',f.base.entities[1]!)],episodes=createEpisodeReader(seeds,['first-goal-source','middle-source','last-goal-source']);
 const goal=storyTaskGoal(f.input.draft)!;expect(storyTaskGoalCandidates([f.newest,middle,f.oldest],goal,episodes)).toEqual([f.oldest,f.newest,middle]);expect(storyTaskGoalCandidates([f.oldest],goal,episodes)).toEqual([]);expect(storyTaskGoalCandidates([f.oldest,f.newest],goal,createEpisodeReader(seeds,[]))).toEqual([]);
});
it.each(['completed','cancelled','quote','source-order','recipient-only','replacement','reference-only','restart','absent-story','ambiguous-name'] as const)('protected goal sampling cannot bypass %s guards',mode=>{
 const f=taskGoalWorld('en');
 if(mode==='completed'||mode==='cancelled')f.input.story!.facts.push({...f.oldest,text:'The old duty is closed.',quote:'The old duty is closed.',task:{...f.oldest.task!,status:mode}});
 if(mode==='quote')f.oldest.quote+=' Changed evidence.';
 if(mode==='source-order')f.input.story!.episodeSources=[];
 if(mode==='recipient-only')f.input.character![3]!.presentIds=[f.base.entities[1]!.id];
 if(mode==='replacement'){f.input.entities=[{...f.base.entities[0]!,id:'replacement'},f.base.entities[1]!];f.input.character![2]=f.input.entities;f.input.character![3]!.presentIds=['replacement',f.base.entities[1]!.id];}
 if(mode==='reference-only')f.input.character![9]=true;
 if(mode==='restart')f.input.restart=true;
 if(mode==='absent-story')f.input.story=undefined;
 if(mode==='ambiguous-name'){for(const e of f.input.entities!)e.aliases=['Alex'];f.input.draft='Alex, my goal is to repair the red gate.';}
 expect(compileGameContext(f.input)).toEqual(old(f));
});
it('renames retain historical ownership and exact evidence without rewriting the source',()=>{
 const f=taskGoalWorld('en');f.base.entities[0]!.name='Renamed Nora';const result=compileGameContext(f.input),hint=hints(result.text).find(h=>h.text===f.oldest.text)!;
 expect(hint.sourceRoles?.promisor).toMatchObject({id:f.base.entities[0]!.id,name:'Renamed Nora',sourceName:'Nora'});expect(hint.sourceQuote??hint.text).toBe(f.oldest.quote);
});
it.each(['ru','en'] as const)('an oversized anchor or both oversized quotes restores exact fallback: %s',locale=>{
 for(const target of ['anchor','tasks']){const f=taskGoalWorld(locale);f.input.settings.contextBudget=2000;
  if(target==='anchor'){for(const [i,fact] of f.noise.entries()){fact.quote+=' Entire original context. '.repeat(400);f.input.story!.roleSeeds!.push(roleSeed(fact,{version:1,sourceRevisionId:'later-scene-'+i,quote:fact.quote,roles:{}}));}}
  else for(const task of [f.oldest,f.newest]){task.quote+=' Entire original condition. '.repeat(200);f.input.story!.roleSeeds!.push(f.seed(task,task===f.oldest?'first-goal-source':'last-goal-source',task===f.oldest?'promisor':'planner',task===f.oldest?f.base.entities[0]!:f.base.entities[1]!));}
  const before=structuredClone(f.input),out=compileGameContext(f.input);expect(out,target).toEqual(old(f));expect(out.report.total).toBe(addedContextTokens(out.text));expect(f.input).toEqual(before);
 }
});
