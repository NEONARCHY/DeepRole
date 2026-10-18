import {expect,it} from 'vitest';
import {taskProgressRecall} from '../src/core/story-task-progress-recall';
import type {StoryRoleReader} from '../src/core/story-source-roles';
import type {EpisodeReader} from '../src/core/story-episodes';
import {longHorizonScenarios} from './fixtures/story-rp05-long-horizon';

function fixture(){
  const s=longHorizonScenarios('en',80,6000)[0]!;
  const roles:StoryRoleReader={status:()=> 'bound',read:f=>s.input.story!.roleSeeds![s.facts.indexOf(f)]?.binding.roles,question:undefined,score:()=>0};
  const episodes:EpisodeReader={read:()=>({revisionId:'source',episode:1,period:'earlier-turn'}),position:()=>1};
  return{s,roles,episodes,run:()=>taskProgressRecall(s.facts,[s.facts[2]!],s.input.draft,roles,episodes)};
}
it('recalls the exact old progress without deleting the discussion tail or completing the promise',()=>{
  const f=fixture(),before=structuredClone(f.s.facts);expect(f.run()).toEqual([f.s.facts[2],f.s.facts[3]]);expect(f.s.facts).toEqual(before);
});
it.each(['unknown','unavailable','missing-episode','wrong-owner','other-progress-speaker','quote-does-not-support-label','no-task-label','conditional','quoted','oversize-group'] as const)('abstains safely for %s',mode=>{
  const f=fixture();
  if(mode==='unknown')f.roles.status=()=> 'unknown';
  if(mode==='unavailable')f.roles.read=()=>({speaker:{id:'gone',name:'Gone',unavailable:true}});
  if(mode==='missing-episode')f.episodes.read=()=>undefined;
  if(mode==='wrong-owner')f.roles.question={role:'promisor',personId:'someone-else'};
  if(mode==='other-progress-speaker'){const read=f.roles.read;f.roles.read=fact=>fact===f.s.facts[3]?{speaker:{id:'other',name:'Other'}}:read(fact);}
  if(mode==='quote-does-not-support-label')f.s.facts[3]!.quote='A statement without the object.';
  if(mode==='no-task-label')f.s.input.draft='What is already done and what is still missing?';
  if(mode==='conditional')f.s.input.draft='What if we pretend to open the diving hatch, is the promise fulfilled?';
  if(mode==='quoted')f.s.input.draft='What is done about “open the diving hatch”, is the promise fulfilled?';
  if(mode==='oversize-group'){
    const read=f.roles.read,progress=read(f.s.facts[3]!);f.roles.read=fact=>read(fact)??progress;
    for(let i=0;i<9;i++){const fact={...f.s.facts[3]!,text:f.s.facts[3]!.text+' '+i,quote:f.s.facts[3]!.quote+' '+i};f.s.facts.push(fact);}
  }
  expect(f.run()).toBeUndefined();
});
it('does not attach another speaker’s completed delivery merely because it shares a task key',()=>{
  const f=fixture();f.s.input.draft='What did Edda already deliver to Jun? Is the promise to open the diving hatch fulfilled?';
  const other={...f.s.facts[2]!,text:'Other promised to repair the station pump.',quote:'Other promised to repair the station pump.',task:{key:'other-duty',title:'repair the station pump',status:'open' as const}};f.s.facts.push(other);
  const read=f.roles.read;f.roles.read=fact=>fact===f.s.facts[4]?{speaker:{id:'someone-else',name:'Other'}}:read(fact);
  const previous=f.roles.read;f.roles.read=fact=>fact===other?{speaker:{id:'someone-else',name:'Other'},promisor:{id:'someone-else',name:'Other'}}:previous(fact);
  expect(taskProgressRecall(f.s.facts,[f.s.facts[2]!,other],f.s.input.draft,f.roles,f.episodes)).not.toContain(f.s.facts[4]);
});
