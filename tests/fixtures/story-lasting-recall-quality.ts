import type {Locale} from '../../src/core/types';
import type {StoryFact} from '../../src/core/story-update';
import {naturalRecallWorld} from './story-natural-recall-quality';

/** Fixed source prose and expected records, independent of query extraction. */
export function lastingRecallWorld(locale:Locale){
 const f=naturalRecallWorld(locale),M=f.base.entities[1]!;
 const knowledge=(id:string,ru:string,en:string):StoryFact=>{const text=f.s(ru,en),quote=f.s(`Мира сказала: «${text}».`,`Mira said: “${text}.”`);return {kind:'event',text,quote,claim:{key:id,value:text,scope:'state',lifetime:'persistent'}};};
 const storeroom=knowledge('storeroom-code','Код кладовой — 7319; знание кода не разрешает входить без охраны.','The storeroom code is 7319; knowing the code does not permit entry without the guards.');
 const archive=knowledge('archive-door','Дверь архива заклинивает; открывать её можно только с разрешения Норы.','The archive door jams; opening it requires permission from Nora.');
 const closedText=f.s('Мира сказала: «Я вернула ключ Норе; это не разрешение открывать дверь».','Mira said: “I returned the key to Nora; this is not permission to open the door.”');
 const closed:StoryFact={kind:'event',text:closedText,quote:closedText,task:{key:'natural-duty-0',title:f.s('Вернуть ключ','Return the key'),status:'completed'}};
 const open=f.duties[1]!;
 const noise:StoryFact[]=Array.from({length:40},(_,i)=>{const text=f.s(`Нора и Мира обсуждали кладовую, дверь архива и ключ. Разговор ${i}.`,`Nora and Mira discussed the storeroom, archive door and key. Conversation ${i}.`);return {kind:'event',text,quote:text};});
 const records=[closed,storeroom,archive,open,...noise],sources=records.map((_,i)=>'lasting-source-'+i),seeds=records.map((fact,i)=>f.seed(fact,sources[i]!,fact===open?'planner':'speaker',M));
 f.input.story!.facts=records;f.input.story!.roleSeeds=seeds;f.input.story!.episodeSources=sources;f.input.recentMessages=[noise.at(-1)!.text];f.input.character![6]=noise.at(-1)!.text;f.input.draft=f.s('Открываю кладовую.','I opened the storeroom.');
 return {...f,storeroom,archive,closed,open,noise,records,sources,seeds,latest:noise.at(-1)!};
}
export function lastingRecallCorpus(locale:Locale){
 return ['present','past','two','closed','mixed','conditional','long','qualified'].map(id=>{
  const f=lastingRecallWorld(locale),input=f.input;let wanted=[f.storeroom];
  if(id==='present')input.draft=f.s('Открываю кладовую.','I open the storeroom.');
  if(id==='past')input.draft=f.s('Я открыл кладовую.','I opened the storeroom.');
  if(id==='two'){input.draft=f.s('Открываю кладовую и проверяю дверь архива.','I opened the storeroom and checked the archive door.');wanted=[f.storeroom,f.archive];}
  if(id==='closed'){input.draft=f.s('Беру ключ.','I took the key.');wanted=[f.closed];}
  if(id==='mixed'){input.draft=f.s('Осматриваю дверь, открываю кладовую и беру ключ.','I inspected the door, opened the storeroom and took the key.');wanted=[f.open,f.storeroom,f.closed];}
  if(id==='conditional')input.draft=f.s('Если охрана разрешит, открываю кладовую.','If the guards permit it, I open the storeroom.');
  if(id==='long')input.draft=f.s('Жду у мастерской и смотрю по сторонам. '.repeat(20)+'Открываю кладовую.','I wait near the workshop and look around. '.repeat(20)+'I opened the storeroom.');
  if(id==='qualified'){input.draft=f.s('Проверяю дверь архива.','I checked the archive door.');wanted=[f.archive];}
  return {name:locale+':'+id,input,wanted:[f.latest,...wanted],positive:true};
 }).concat(['unknown','pronoun','quote','owner-question','roles','source','foreign','empty','reference','restart','evidence','temporary','overflow','ambiguous','cross-clause','wrong-qualifier'].map(id=>{
  const f=lastingRecallWorld(locale),input=f.input;
  if(id==='unknown')input.draft=f.s('Открываю оранжерею.','I opened the greenhouse.');
  if(id==='pronoun')input.draft=f.s('Открываю её кладовую.','I opened her storeroom.');
  if(id==='quote')input.draft='"'+input.draft+'"';
  if(id==='owner-question')input.draft=f.s('Что Нора обещала Мире?','What did Nora promise Mira?');
  if(id==='roles')input.story!.roleSeeds=[];
  if(id==='source')input.story!.episodeSources=[];
  if(id==='foreign'){input.entities=input.entities!.map(e=>({...e,worldId:'foreign'}));input.character![2]=input.entities;}
  if(id==='empty')input.character![3]!.presentIds=[];
  if(id==='reference')input.character![9]=true;
  if(id==='restart')input.restart=true;
  if(id==='evidence')f.storeroom.quote+=' Changed evidence.';
  if(id==='temporary')f.storeroom.claim!.lifetime='scene';
  if(id==='overflow'){input.settings.contextBudget=500;input.requiredContext='Immutable author instruction. '.repeat(200);}
  if(id==='ambiguous'){input.entities!.forEach(e=>e.aliases=['Alex']);input.draft=f.s('Alex, открываю кладовую.','Alex, I opened the storeroom.');}
  if(id==='cross-clause'){input.draft=f.s('Проверяю дверь архива.','I checked the archive door.');f.archive.text=f.s('Дверь закрыта. Архива здесь нет.','The archive is elsewhere. The door is shut.');f.archive.claim!.value=f.archive.text;input.story!.roleSeeds=recordsSeeds();}
  if(id==='wrong-qualifier')input.draft=f.s('Проверяю дверь гаража.','I checked the garage door.');
  return {name:'control:'+locale+':'+id,input,wanted:[],positive:false};
  function recordsSeeds(){return f.records.map((fact,i)=>f.seed(fact,f.sources[i]!,fact===f.open?'planner':'speaker',f.base.entities[1]!));}
 }));
}
