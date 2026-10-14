import type {Locale} from '../../src/core/types';
import type {StoryFact} from '../../src/core/story-update';
import {roleSeed} from '../../src/core/story-role-binding';
import {GAME_TIME_KEY} from '../../src/core/story-time';
import {referenceWorld} from './story-reference-quality';

/** Fixed distinct contexts sharing a literal label; no object-ID inference. */
export function longHistoryWorld(locale:Locale,sceneCount=300){
 const f=referenceWorld(locale),[N,M]=f.base.entities;
 const firstText=f.s('Нора обещала Мире вернуть синий ключ от кладовой только после разрешения охраны.','Nora promised Mira to return the blue key for the storeroom only after the guards give permission.');
 const otherText=f.s('Мира планирует вернуть синий ключ от архива, если Нора согласится; разрешение пока не получено.','Mira plans to return the blue key for the archive if Nora agrees; permission has not been obtained.');
 const title=f.s('Вернуть синий ключ','Return the blue key');
 const first:StoryFact={kind:'promise',text:firstText,quote:firstText,task:{key:'storeroom-blue-key',title,status:'open'}},other:StoryFact={kind:'plan',text:otherText,quote:otherText,task:{key:'archive-blue-key',title,status:'open'}};
 const knowledge=(key:string,text:string):StoryFact=>({kind:'event',text,quote:f.s(`Мира сказала: «${text}».`,`Mira said: “${text}.”`),claim:{key,value:text,scope:'state',lifetime:'persistent'}});
 const oldCode=knowledge('storeroom-blue-code',f.s('Про синий ключ от кладовой: код 1133; вход без охраны запрещён.','About the blue key for the storeroom: the code is 1133; entry without guards is forbidden.'));
 const archiveCode=knowledge('archive-blue-code',f.s('Про синий ключ от архива: код 7755; это не разрешение входить.','About the blue key for the archive: the code is 7755; this is not permission to enter.'));
 const currentCode=knowledge('storeroom-blue-code',f.s('Про синий ключ от кладовой: код теперь 4926 вместо 1133; вход без охраны по-прежнему запрещён.','About the blue key for the storeroom: the code is now 4926 instead of 1133; entry without guards is still forbidden.'));
 currentCode.claim!.transition='progress';
 const copperText=f.s('Мира сказала: «Я вернула медный ключ Норе; это не разрешение открывать шкаф».','Mira said: “I returned the copper key to Nora; this is not permission to open the cupboard.”'),closed:StoryFact={kind:'event',text:copperText,quote:copperText,task:{key:'copper-duty',title:f.s('Вернуть медный ключ','Return the copper key'),status:'completed'}};
 const clock=(label:string):StoryFact=>({kind:'event',text:label,quote:label,claim:{key:GAME_TIME_KEY,value:label,scope:'state',transition:'progress'}}),early=clock(f.s('День 4','Day 4')),now=clock(f.s('День 20','Day 20'));
 const temporaryText=f.s('Мира сказала: «Синий ключ временно лежит на столе».','Mira said: “The blue key is temporarily on the table.”'),temporary:StoryFact={kind:'event',text:temporaryText,quote:temporaryText,claim:{key:'temporary-key-position',value:temporaryText,scope:'state',lifetime:'scene'}};
 const noise:StoryFact[]=Array.from({length:sceneCount},(_,i)=>{const text=f.s(`Нора и Мира обсуждали синий ключ, кладовую и архив. Поздняя сцена ${i}, без нового обещания или изменения кода.`,`Nora and Mira discussed the blue key, storeroom and archive. Later scene ${i}, with no new promise or code change.`);return {kind:'event',text,quote:text};});
 const anchorText=f.s('Мира сказала: «На столе синий ключ от кладовой и синий ключ от архива. Это разные предметы; я не выбирала ни один».','Mira said: “On the table are the blue key for the storeroom and the blue key for the archive. These are different objects; I have not chosen either.”'),anchor:StoryFact={kind:'event',text:anchorText,quote:anchorText};
 const facts=[early,first,other,oldCode,archiveCode,closed,temporary,...noise,now,currentCode,anchor];
 const sources=facts.map((_,i)=>'long-history-source-'+i),seedAll=()=>facts.map((fact,i)=>fact===early||fact===now?roleSeed(fact,{version:1,sourceRevisionId:sources[i]!,quote:fact.quote,roles:{}}):f.seed(fact,sources[i]!,fact.kind==='promise'?'promisor':fact.kind==='plan'?'planner':'speaker',fact.kind==='promise'?N!:M!));
 f.input.story!.facts=facts;f.input.story!.roleSeeds=seedAll();f.input.story!.episodeSources=sources;f.input.recentMessages=[anchor.quote];f.input.character![6]=anchor.quote;f.input.draft=f.s('Я беру этот ключ.','I take this key.');
 return {...f,first,other,oldCode,archiveCode,currentCode,closed,temporary,early,now,noise,anchor,facts,sources,seedAll,bundle:[first,other,archiveCode,currentCode]};
}
export function longHistoryCorpus(locale:Locale){
 return ['bundle','direct-shared-label','reordered','cancelled-copper','three-contexts','explicit-storeroom','closed-copper','current-code','plain-continue','many-candidates','small-budget','unbound-task','unbound-code','unavailable-owner','closed-shadow','missing-anchor','unknown-object'].map(id=>{
  const f=longHistoryWorld(locale),input=f.input;let wanted=f.bundle,mode:'bundle'|'normal'|'fallback'='bundle';
  if(id==='direct-shared-label')input.draft=f.s('Я беру синий ключ.','I take the blue key.');
  if(id==='reordered')input.entities!.reverse();
  if(id==='cancelled-copper'){f.closed.task!.status='cancelled';f.closed.text=f.s('Мира сказала: «Я отменила поручение вернуть медный ключ Норе; ключ не передавала».','Mira said: “I cancelled the duty to return the copper key to Nora; I did not hand it over.”');f.closed.quote=f.closed.text;input.story!.roleSeeds=f.seedAll();}
  if(id==='three-contexts'||id==='many-candidates'){
   const count=id==='three-contexts'?1:6;for(let n=0;n<count;n++){const fact=structuredClone(f.first);fact.text=f.s(`Нора обещала Мире вернуть синий ключ для мастерской ${n}, только после отдельного разрешения.`,`Nora promised Mira to return the blue key for workshop ${n}, only after separate permission.`);fact.quote=fact.text;fact.task!.key='workshop-'+n;f.facts.splice(3,0,fact);f.sources.splice(3,0,'workshop-source-'+n);f.bundle.push(fact);}input.story!.roleSeeds=f.seedAll();
  }
  if(['explicit-storeroom','closed-copper','current-code','plain-continue'].includes(id)){mode='normal';wanted=[];
   if(id==='explicit-storeroom'){input.draft=f.s('Я беру синий ключ от кладовой.','I take the blue key for the storeroom.');wanted=[f.anchor,f.first,f.currentCode];}
   if(id==='closed-copper'){input.draft=f.s('Беру медный ключ.','I took the copper key.');wanted=[f.anchor,f.closed];}
   if(id==='current-code'){input.draft=f.s('Я проверяю синий ключ от кладовой.','I check the blue key for the storeroom.');wanted=[f.anchor,f.currentCode];}
   if(id==='plain-continue'){input.draft=f.s('Продолжай.','Continue.');wanted=[f.anchor];}
  }
  if(['many-candidates','small-budget','unbound-task','unbound-code','unavailable-owner','closed-shadow','missing-anchor','unknown-object'].includes(id)){mode='fallback';wanted=[];
   if(id==='small-budget')input.settings.contextBudget=1500;
   if(id==='unbound-task')input.story!.roleSeeds=input.story!.roleSeeds!.filter(seed=>seed.binding.sourceRevisionId!==f.sources[f.facts.indexOf(f.other)]);
   if(id==='unbound-code')input.story!.roleSeeds=input.story!.roleSeeds!.filter(seed=>seed.binding.sourceRevisionId!==f.sources[f.facts.indexOf(f.archiveCode)]);
   if(id==='unavailable-owner'){input.entities=input.entities!.filter(p=>p.id!==f.base.entities[0]!.id);input.character![2]=input.entities;input.character![3]!.presentIds=input.entities.map(p=>p.id);}
   if(id==='closed-shadow'){f.other.kind='event';f.other.task!.status='completed';f.other.text=f.s('Мира сказала: «Я вернула синий ключ от архива; это не разрешение входить».','Mira said: “I returned the blue key for the archive; this is not permission to enter.”');f.other.quote=f.other.text;input.story!.roleSeeds=f.seedAll();}
   if(id==='missing-anchor')input.story!.episodeSources=f.sources.slice(0,-1);
   if(id==='unknown-object')input.recentMessages=[f.anchor.quote+f.s(' Рядом лежит ещё один ключ без описания.',' Another undescribed key lies nearby.')];
  }
  return {name:locale+':'+id,input,wanted:mode==='bundle'?[f.anchor,...wanted]:wanted,bundle:f.bundle,mode,oldCode:f.oldCode,closed:f.closed,temporary:f.temporary};
 });
}
