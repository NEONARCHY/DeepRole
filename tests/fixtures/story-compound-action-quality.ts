import type {Locale} from '../../src/core/types';
import type {StoryFact} from '../../src/core/story-update';
import {roleSeed} from '../../src/core/story-role-binding';
import {taskGoalWorld} from './story-task-goal-quality';

/** Gold objects and entire conditional source statements are fixed independently. */
export function compoundActionWorld(locale:Locale) {
 const f=taskGoalWorld(locale),[N,M]=f.base.entities;
 const text1=f.s('Нора обещала Мире починить красные ворота только после разрешения охраны.','Nora promised Mira to repair the red gate only after the guards give permission.');
 const text2=f.s('Мира планирует вернуть синий ключ, если Нора согласится; согласие пока не получено.','Mira plans to return the blue key if Nora agrees; agreement has not been obtained.');
 const text3=f.s('Нора обещала Мире доставить медицинский набор, когда дорога будет безопасна.','Nora promised Mira to deliver the medical kit when the road is safe.');
 const duties:StoryFact[]=[{kind:'promise',text:text1,quote:text1,task:{key:'gate-duty',title:f.s('Починить красные ворота','Repair the red gate'),status:'open'}},{kind:'plan',text:text2,quote:text2,task:{key:'key-duty',title:f.s('Вернуть синий ключ','Return the blue key'),status:'open'}},{kind:'promise',text:text3,quote:text3,task:{key:'kit-duty',title:f.s('Доставить медицинский набор','Deliver the medical kit'),status:'open'}}];
 const noise:StoryFact[]=Array.from({length:40},(_,i)=>{const text=f.s(`Нора и Мира обсуждали красные ворота, синий ключ и медицинский набор. Беседа ${i}.`,`Nora and Mira discussed the red gate, blue key and medical kit. Talk ${i}.`);return {kind:'event',text,quote:text};});
 const sources=['gate-source','key-source','kit-source',...noise.map((_,i)=>'compound-scene-'+i)];
 const seeds=[...duties.map((fact,i)=>f.seed(fact,sources[i]!,i===1?'planner':'promisor',i===1?M!:N!)),...noise.map((fact,i)=>roleSeed(fact,{version:1,sourceRevisionId:sources[i+3]!,quote:fact.quote,roles:{}}))];
 f.input.story!.facts=[...duties,...noise];f.input.story!.episodeSources=sources;f.input.story!.roleSeeds=seeds;f.input.recentMessages=[noise.at(-1)!.text];f.input.character![6]=noise.at(-1)!.text;
 f.input.draft=f.s('Я открываю красные ворота и беру синий ключ.','I open the red gate and take the blue key.');
 return {...f,duties,noise,sources,seeds,latest:noise.at(-1)!};
}
export function compoundActionQualityCorpus(locale:Locale) {
 const forms=['actions','sequence','repeated-subject','wrapped','goals','directed-goals','three-actions','tight-budget'] as const;
 const positives=forms.map(id=>{const f=compoundActionWorld(locale),input=f.input;
  if(id==='sequence')input.draft=f.s('Я открываю красные ворота и затем беру синий ключ.','I open the red gate and then take the blue key.');
  if(id==='repeated-subject')input.draft=f.s('Я открываю красные ворота и я беру синий ключ.','I open the red gate and I take the blue key.');
  if(id==='wrapped')input.draft='**'+input.draft+'**';
  if(id==='goals')input.draft=f.s('Моя цель — починить красные ворота и вернуть синий ключ.','My goal is to repair the red gate and return the blue key.');
  if(id==='directed-goals')input.draft=f.s('Продолжай: починить красные ворота и вернуть синий ключ.','Continue: repair the red gate and return the blue key.');
  if(id==='three-actions')input.draft=f.s('Я открываю красные ворота и беру синий ключ и осматриваю медицинский набор.','I open the red gate and take the blue key and inspect the medical kit.');
  if(id==='tight-budget')input.settings.contextBudget=2000;
  return {name:locale+':'+id,input,wanted:[f.latest,...f.duties.slice(0,id==='three-actions'?3:2)],balance:true};
 });
 const controls=['single','unsupported','conditional','negated','quoted','third-person','unknown-object','personal-object','unknown-roles','missing-source','empty-scene','foreign','required-overflow','one-closed','cross-field','name-gap'] as const;
 return [...positives,...controls.map(id=>{const f=compoundActionWorld(locale),input=f.input;
  if(id==='single')input.draft=f.s('Я открываю красные ворота.','I open the red gate.');
  if(id==='unsupported')input.draft=f.s('Я открываю красные ворота и ухожу.','I open the red gate and leave.');
  if(id==='conditional')input.draft=f.s('Я открываю красные ворота и беру синий ключ, если разрешат.','I open the red gate and take the blue key if permitted.');
  if(id==='negated')input.draft=f.s('Я открываю красные ворота и не беру синий ключ.','I open the red gate and do not take the blue key.');
  if(id==='quoted')input.draft='"'+input.draft+'"';
  if(id==='third-person')input.draft=f.s('Нора открывает красные ворота и берёт синий ключ.','Nora opens the red gate and takes the blue key.');
  if(id==='unknown-object')input.draft=f.s('Я открываю красные ворота и беру зелёный жетон.','I open the red gate and take the green token.');
  if(id==='personal-object')input.draft=f.s('Я открываю красные ворота и беру её ключ.','I open the red gate and take her key.');
  if(id==='unknown-roles')input.story!.roleSeeds=[];
  if(id==='missing-source')input.story!.episodeSources=['gate-source',...f.sources.slice(3)];
  if(id==='empty-scene')input.character![3]!.presentIds=[];
  if(id==='foreign'){input.entities=input.entities!.map(e=>({...e,worldId:'elsewhere'}));input.character![2]=input.entities;}
  if(id==='required-overflow'){input.requiredContext='ENTIRE AUTHOR RULE. '.repeat(200);input.settings.contextBudget=500;}
  if(id==='one-closed'){f.duties[1]!.kind='event';f.duties[1]!.task!.status='completed';input.story!.roleSeeds=[...f.seeds,f.seed(f.duties[1]!,'key-source','planner',f.base.entities[1]!)];}
  if(id==='cross-field'){const fact=f.duties[1]!;fact.text=fact.quote=f.s('Мира планирует вернуть синий альбом.','Mira plans to return the blue album.');fact.task!.title=f.s('Вернуть красный ключ','Return the red key');input.story!.roleSeeds=[...f.seeds,f.seed(fact,'key-source','planner',f.base.entities[1]!)];}
  if(id==='name-gap'){const fact=f.duties[1]!;fact.text=fact.quote=f.s('Мира планирует вернуть синий Нора ключ.','Mira plans to return the blue Nora key.');fact.task!.title=f.s('Вернуть синий Нора ключ','Return the blue Nora key');input.story!.roleSeeds=[...f.seeds,f.seed(fact,'key-source','planner',f.base.entities[1]!)];}
  return {name:'control:'+locale+':'+id,input,wanted:[],balance:false};
 })];
}
