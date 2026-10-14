import type {Locale} from '../../src/core/types';
import type {StoryFact} from '../../src/core/story-update';
import {roleSeed} from '../../src/core/story-role-binding';
import {taskGoalWorld} from './story-task-goal-quality';

/** Fixed sources and expected objects, independent of query parsing/scoring. */
export function naturalRecallWorld(locale:Locale){
 const f=taskGoalWorld(locale),[N,M]=f.base.entities,objects=f.s('ключ|дверь|код|ворота','key|door|code|gate').split('|');
 const quotes=[f.s('Нора обещала Мире вернуть ключ только после разрешения охраны.','Nora promised Mira to return the key only after the guards give permission.'),f.s('Мира планирует проверить дверь, если Нора согласится; согласие пока не получено.','Mira plans to inspect the door if Nora agrees; agreement has not been obtained.'),f.s('Нора обещала Мире вернуть код, только если охрана согласится.','Nora promised Mira to return the code only if the guards agree.'),f.s('Мира планирует починить ворота только после разрешения охраны.','Mira plans to repair the gate only after the guards give permission.')];
 const titles=f.s('Вернуть ключ|Проверить дверь|Вернуть код|Починить ворота','Return the key|Inspect the door|Return the code|Repair the gate').split('|');
 const duties:StoryFact[]=quotes.map((text,i)=>({kind:i%2?'plan':'promise',text,quote:text,task:{key:'natural-duty-'+i,title:titles[i]!,status:'open'}}));
 const text=f.s('Мира узнала: код остаётся секретом охраны; знание кода не разрешает входить.','Mira learned the code stays a secret of the guards; knowing the code does not permit entry.'),quote=f.s('Мира сказала: «Я узнала: код остаётся секретом охраны; знание кода не разрешает входить».','Mira said: “I learned the code stays a secret of the guards; knowing the code does not permit entry.”'),knowledge:StoryFact={kind:'event',text,quote,claim:{key:'lasting-code-rule',value:text,scope:'state',lifetime:'persistent'}};
 const noise:StoryFact[]=Array.from({length:40},(_,i)=>{const text=f.s(`Нора и Мира обсуждали ключ, дверь, код и ворота. Разговор ${i}.`,`Nora and Mira discussed the key, door, code and gate. Conversation ${i}.`);return {kind:'event',text,quote:text};});
 const sources=[...duties.map((_,i)=>'natural-duty-source-'+i),'natural-knowledge',...noise.map((_,i)=>'natural-scene-'+i)],seeds=[...duties.map((fact,i)=>f.seed(fact,sources[i]!,i%2?'planner':'promisor',i%2?M!:N!)),f.seed(knowledge,'natural-knowledge','speaker',M!),...noise.map((fact,i)=>roleSeed(fact,{version:1,sourceRevisionId:sources[i+5]!,quote:fact.quote,roles:{}}))];
 f.input.story!.facts=[...duties,knowledge,...noise];f.input.story!.roleSeeds=seeds;f.input.story!.episodeSources=sources;f.input.recentMessages=[noise.at(-1)!.text];f.input.character![6]=noise.at(-1)!.text;f.input.draft=f.s('Воспользовался ключом.','After a pause I used the key.');
 return {...f,duties,knowledge,noise,sources,seeds,objects,latest:noise.at(-1)!};
}
export function naturalRecallCorpus(locale:Locale){
 const positives=[['past',[0]],['instrument',[0]],['two-objects',[0,1]],['code-case',[2]],['four-actions',[0,1,2,3]],['many-actions',[0,1,2,3]],['conditional',[0,1]],['negated',[0,1]],['long',[0,1]]] as const;
 return [...positives.map(([id,indices])=>{const f=naturalRecallWorld(locale),input=f.input;
  if(id==='past')input.draft=f.s('Взял ключ и немного подождал.','I took the key and waited a moment.');
  if(id==='two-objects')input.draft=f.s('Проверяю дверь ключом.','I inspect the door with the key.');
  if(id==='code-case')input.draft=f.s('Сверяюсь с кодом из записки.','I looked up the code from the note.');
  if(id==='four-actions')input.draft=f.s('Я беру ключ, осматриваю дверь, проверяю код и открываю ворота.','I take the key, inspect the door, check the code and open the gate.');
  if(id==='many-actions')input.draft=f.s('Подошёл поближе, взял ключ, осмотрел дверь, сверился с кодом, прикоснулся к воротам и остановился.','I stepped closer, took the key, inspected the door, looked up the code, touched the gate and stopped.');
  if(id==='conditional')input.draft=f.s('Если охрана разрешит, воспользуюсь ключом и осмотрю дверь.','If the guards permit it, I will use the key and inspect the door.');
  if(id==='negated')input.draft=f.s('Не беру ключ без разрешения, просто осматриваю дверь.','I do not take the key without permission; I only inspect the door.');
  if(id==='long')input.draft=f.s('Жду возле мастерской и внимательно смотрю по сторонам. '.repeat(15)+'Проверяю дверь ключом.','I wait near the workshop and carefully look around. '.repeat(15)+'I inspect the door with the key.');
  return {name:locale+':'+id,input,wanted:[f.latest,...indices.map(i=>f.duties[i]!),...(indices.some(i=>i===2)?[f.knowledge]:[])],tasks:indices.length,balance:true};
 }),...['unknown','pronoun','quote','owner','roles','source','foreign','empty','reference','restart','evidence','terminal','overflow','ambiguous','legacy-single','legacy-compound'].map(id=>{const f=naturalRecallWorld(locale),input=f.input;
  if(id==='unknown')input.draft=f.s('Воспользовался зелёным жетоном.','I used the green token.');
  if(id==='pronoun')input.draft=f.s('Воспользовался её ключом.','I used her key.');
  if(id==='quote')input.draft='"'+input.draft+'"';
  if(id==='owner')input.draft=f.s('Что Нора обещала Мире?','What did Nora promise Mira?');
  if(id==='roles')input.story!.roleSeeds=[];
  if(id==='source')input.story!.episodeSources=[];
  if(id==='foreign'){input.entities=input.entities!.map(e=>({...e,worldId:'elsewhere'}));input.character![2]=input.entities;}
  if(id==='empty')input.character![3]!.presentIds=[];
  if(id==='reference')input.character![9]=true;
  if(id==='restart')input.restart=true;
  if(id==='evidence')f.duties[0]!.quote+=' Changed evidence.';
  if(id==='terminal'){for(const fact of f.duties){fact.kind='event';fact.task!.status='completed';}}
  if(id==='overflow'){input.settings.contextBudget=500;input.requiredContext='Entire immutable author instruction. '.repeat(200);}
  if(id==='ambiguous'){input.entities!.forEach(e=>e.aliases=['Alex']);input.draft=f.s('Alex, воспользовался ключом.','Alex, I used the key.');}
  if(id==='legacy-single')input.draft=f.s('Я беру ключ.','I take the key.');
  if(id==='legacy-compound')input.draft=f.s('Я открываю дверь и беру ключ.','I open the door and take the key.');
  return {name:'control:'+locale+':'+id,input,wanted:[],tasks:0,balance:false};
 })];
}
