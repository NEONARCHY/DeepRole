import type {Locale} from '../../src/core/types';
import type {StoryFact} from '../../src/core/story-update';
import {lastingRecallWorld} from './story-lasting-recall-quality';

/** Independently authored sources: two doors, different obligations and codes. */
export function referenceWorld(locale:Locale){
 const f=lastingRecallWorld(locale),[N,M]=f.base.entities;
 const duty=(key:string,text:string,title:string,kind:'promise'|'plan'):StoryFact=>({kind,text,quote:text,task:{key,title,status:'open'}});
 const blue=duty('blue-door',f.s('Нора обещала Мире проверить синюю дверь только после разрешения охраны.','Nora promised Mira to inspect the blue door only after the guards give permission.'),f.s('Проверить синюю дверь','Inspect the blue door'),'promise');
 const red=duty('red-door',f.s('Мира планирует проверить красную дверь, если Нора согласится.','Mira plans to inspect the red door if Nora agrees.'),f.s('Проверить красную дверь','Inspect the red door'),'plan');
 const lasting=(key:string,text:string):StoryFact=>({kind:'event',text,quote:f.s(`Мира сказала: «${text}».`,`Mira said: “${text}.”`),claim:{key,value:text,scope:'state',lifetime:'persistent'}});
 const blueCode=lasting('blue-code',f.s('Про синюю дверь: код 1133; знание кода не разрешает входить.','About the blue door: the code is 1133; knowing it does not permit entry.'));
 const redCode=lasting('red-code',f.s('Про красную дверь: код 7755; знание кода не разрешает входить.','About the red door: the code is 7755; knowing it does not permit entry.'));
 const noise:StoryFact[]=Array.from({length:36},(_,i)=>{const text=f.s(`Нора и Мира обсуждали дверь. Разговор ${i}.`,`Nora and Mira discussed the door. Conversation ${i}.`);return {kind:'event',text,quote:text};});
 const anchorText=f.s('Мира сказала: «Я показала на синюю дверь».','Mira said: “I pointed at the blue door.”'),anchor:StoryFact={kind:'event',text:anchorText,quote:anchorText};
 const facts=[blue,red,blueCode,redCode,...noise,anchor],sources=facts.map((_,i)=>'reference-source-'+i),seeds=facts.map((fact,i)=>f.seed(fact,sources[i]!,fact===blue?'promisor':fact===red?'planner':'speaker',fact===blue?N!:M!));
 f.input.story!.facts=facts;f.input.story!.roleSeeds=seeds;f.input.story!.episodeSources=sources;f.input.recentMessages=[anchor.quote];f.input.character![6]=anchor.quote;f.input.draft=f.s('Я открываю эту дверь.','I open this door.');
 return {...f,blue,red,blueCode,redCode,noise,anchor,facts,sources,seeds};
}
export function referenceCorpus(locale:Locale){
 const positive=['this','that','omitted-subject','personal','named-personal','pronoun-alias','both-doors','no-anchor-proof','quote-only-anchor','cross-clause-anchor'].map(id=>{
  const f=referenceWorld(locale),input=f.input;let wanted:StoryFact[]=[];
  if(['this','that','omitted-subject'].includes(id)){wanted=[f.anchor,f.blue,f.blueCode];if(id==='that')input.draft=f.s('Я осматриваю ту дверь.','I inspect that door.');if(id==='omitted-subject')input.draft=f.s('Открываю эту дверь.','I open this door.');}
  if(id==='personal')input.draft=f.s('Беру её ключ.','I take her key.');
  if(id==='named-personal')input.draft=f.s('Мира, беру её ключ.','Mira, I take her key.');
  if(id==='pronoun-alias'){input.entities![0]!.aliases=[f.s('Её','Her')];input.draft=f.s('Беру её ключ.','I take her key.');}
  if(id==='both-doors'){input.recentMessages=[f.s('Мира показала на синюю дверь и на красную дверь.','Mira pointed at the blue door and the red door.')];input.character![6]=input.recentMessages[0]!;}
  if(id==='no-anchor-proof')input.story!.roleSeeds=input.story!.roleSeeds!.filter(seed=>seed.binding.sourceRevisionId!==f.sources.at(-1));
  if(id==='quote-only-anchor'){f.anchor.text=f.s('Мира огляделась.','Mira looked around.');input.story!.roleSeeds=input.story!.roleSeeds!.filter(seed=>seed.binding.sourceRevisionId!==f.sources.at(-1));input.story!.roleSeeds!.push(f.seed(f.anchor,f.sources.at(-1)!,'speaker',f.base.entities[1]!));}
  if(id==='cross-clause-anchor'){const text=f.s('Мира сказала: «Синюю отметку видно. Дверь закрыта».','Mira said: “The blue sign is visible. The door is shut.”');f.anchor.text=text;f.anchor.quote=text;input.recentMessages=[text];input.character![6]=text;input.story!.roleSeeds=input.story!.roleSeeds!.filter(seed=>seed.binding.sourceRevisionId!==f.sources.at(-1));input.story!.roleSeeds!.push(f.seed(f.anchor,f.sources.at(-1)!,'speaker',f.base.entities[1]!));}
  return {name:locale+':'+id,input,wanted,guard:true};
 });
 const controls=['explicit','rename','deleted','replaced','ambiguous','foreign','reference','restart','quoted','unrelated-this'].map(id=>{
  const f=referenceWorld(locale),input=f.input;input.draft=f.s('Я открываю синюю дверь.','I open the blue door.');
  if(id==='rename')input.entities![0]!.name=f.s('Переименованная Нора','Renamed Nora');
  if(id==='deleted'){input.entities=input.entities!.slice(1);input.character![2]=input.entities;}
  if(id==='replaced'){input.entities![0]!.id='new-nora';input.character![3]!.presentIds=[input.entities![0]!.id,input.entities![1]!.id];}
  if(id==='ambiguous'){input.entities!.forEach(p=>p.aliases=['Alex']);input.draft=f.s('Alex, я открываю синюю дверь.','Alex, I open the blue door.');}
  if(id==='foreign'){input.entities=input.entities!.map(e=>({...e,worldId:'foreign'}));input.character![2]=input.entities;}
  if(id==='reference')input.character![9]=true;
  if(id==='restart')input.restart=true;
  if(id==='quoted')input.draft='"'+f.s('Я открываю эту дверь.','I open this door.')+'"';
  if(id==='unrelated-this')input.draft=f.s('Это было давно.','This was long ago.');
  return {name:'control:'+locale+':'+id,input,wanted:[] as StoryFact[],guard:false};
 });return [...positive,...controls];
}
