import {expect,it} from 'vitest';
import {taskHistorySources} from '../src/core/story-task-history';
import {storyFactIdentity} from '../src/core/story-memory-lifecycle';
import type {StoryFact} from '../src/core/story-update';
import {compileGameContext,type GameContextInput} from '../src/core/game-context';
import {longHoldout,longHoldoutWorld} from './fixtures/story-rp344-world';

const old:StoryFact={kind:'promise',text:'Ira promised: amber visitor badge after inspection.',quote:'Ira promised: amber visitor badge after inspection.',task:{key:'same',title:'amber visitor badge',status:'open'}};
const latest:StoryFact={kind:'event',text:'Ira completed: amber visitor badge delivered.',quote:'Ira completed: amber visitor badge delivered.',task:{key:'same',title:'amber visitor badge',status:'completed'}};
const roles={question:undefined,score:()=>0,status:()=> 'unknown' as const,read:()=>undefined};
const episodes={position:(f:StoryFact)=>f===old?1:2,read:(f:StoryFact)=>({revisionId:f===old?'old-source':'latest-source',episode:1,period:'earlier-turn' as const})};
const query='What happened to the amber visitor badge?';
it('history preserves exact sources, current status and unknown roles without mutation',()=>{
 const all=[old,latest],before=structuredClone(all),out=taskHistorySources(all,[latest],query,['Ira'],roles,episodes);
 expect(out?.primary).toEqual([old]);expect(out?.guide).toContain('NOT current obligations');expect(out?.guide).toContain('"status":"completed"');expect(out?.guide).toContain('latest-source');expect(all).toEqual(before);
});
it('historical sources need their readers and monotonically ordered exact episodes',()=>{
 expect(taskHistorySources([old,latest],[latest],query,['Ira'],roles)).toBeUndefined();
 expect(taskHistorySources([old,latest],[latest],query,['Ira'],roles,{...episodes,read:f=>f===old?undefined:episodes.read(f)})).toMatchObject({primary:[],reason:'source'});
 expect(taskHistorySources([old,latest],[latest],query,['Ira'],roles,{...episodes,position:()=>2})).toMatchObject({primary:[],reason:'source'});
});
it('unavailable historical participant never becomes an inferred current owner',()=>{
 const missing={...roles,read:()=>({promisor:{id:'absent',name:'Ira',unavailable:true as const}})};
 expect(taskHistorySources([old,latest],[latest],query,['Ira'],missing,episodes)).toMatchObject({primary:[],reason:'source'});
});
it('explicitly replaced erroneous source is not restored as task history',()=>{
 const corrected={...latest,replaces:[storyFactIdentity(old)]};
 expect(taskHistorySources([old,corrected],[corrected],query,['Ira'],roles,episodes)).toBeUndefined();
});
it('history cannot introduce an unrelated task or run for a greeting',()=>{
 expect(taskHistorySources([old,latest],[],query,['Ira'],roles,episodes)).toBeUndefined();
 expect(taskHistorySources([old,latest],[latest],'Hello.',['Ira'],roles,episodes)).toBeUndefined();
 expect(taskHistorySources([old,latest],[latest],'Where is the cobalt visitor badge?',['Ira'],roles,episodes)).toBeUndefined();
});
it('history row bound is atomic and explicit',()=>{
 const previous=Array.from({length:128},(_,i)=>({...old,text:old.text+' '+i,quote:old.quote+' '+i}));
 const ep={...episodes,position:(f:StoryFact)=>f===latest?200:1};
 expect(taskHistorySources([...previous,latest],[latest],query,['Ira'],roles,ep)).toMatchObject({primary:[],reason:'capacity'});
});
it('metadata-only task labels do not manufacture a historical object match',()=>{
 const before={...old,text:'Ira promised an unrelated task.',quote:'Ira promised an unrelated task.'};
 const after={...latest,text:'Ira completed an unrelated task.',quote:'Ira completed an unrelated task.'};
 expect(taskHistorySources([before,after],[after],query,['Ira'],roles,episodes)).toBeUndefined();
});
for(const flag of ['contextualRecall','referenceRecall','referenceBundle','contentRelevance','topicAdmission','actionBalance','compoundActionBalance','sequencePriority','flexiblePriority','discussionPriority','budgetPriority'] as const)it(`history respects ${flag} opt-out`,()=>{
 const gold=longHoldout.worlds[0]!,f=longHoldoutWorld(gold,0),q=gold.queries.find(q=>q.id==='completed-history')!;
 const input:GameContextInput={draft:q.draft,recentMessages:[],entries:[],books:[],entities:f.base.entities,worlds:[f.base.world],activeBookId:null,scene:{worldId:f.base.world.id,bookId:null,focusIds:[]},settings:{contextBudget:6000,relevanceThreshold:6},story:{world:f.base.world,chat:f.base.binding.chatId,branch:'rp346',facts:f.facts,sheetsEnabled:false}};
 expect(compileGameContext(input,{[flag]:false}).text).not.toContain('<deeprole_task_history>');
});
it('history fails with exact prior text when its additional whole bundle cannot fit',()=>{
 const gold=longHoldout.worlds[0]!,f=longHoldoutWorld(gold,0),q=gold.queries.find(q=>q.id==='completed-history')!;
 const make=(facts:StoryFact[]):GameContextInput=>({draft:q.draft,recentMessages:[],entries:[],books:[],entities:f.base.entities,worlds:[f.base.world],activeBookId:null,scene:{worldId:f.base.world.id,bookId:null,focusIds:[]},settings:{contextBudget:200,relevanceThreshold:6},story:{world:f.base.world,chat:f.base.binding.chatId,branch:'rp346',facts,sheetsEnabled:false}});
 const input=make(f.facts),before=structuredClone(input),out=compileGameContext(input),withoutOld=compileGameContext(make(f.facts.filter(x=>x!==f.important[16])));
 expect(out.text).not.toContain('<deeprole_task_history>');expect(out.text).toBe(withoutOld.text);expect(input).toEqual(before);
});
