import type {Locale} from "../../src/core/types";
import type {StoryFact} from "../../src/core/story-update";
import {roleSeed} from "../../src/core/story-role-binding";
import {DEFAULT_ACTIONS} from "../../src/core/characters";
import {admissionWorld} from "./story-topic-admission";

const settings=[
 {id:"home",ru:"дверь",en:"door"},
 {id:"space",ru:"шлюз",en:"airlock"},
 {id:"fantasy",ru:"сундук",en:"chest"},
] as const;
/** Independently declared source prose and wanted records, never scorer-produced gold. */
export function actionWorld(locale:Locale,setting:typeof settings[number]=settings[0]!) {
 const f=admissionWorld(locale),object=setting[locale],N=f.base.entities[0]!,M=f.base.entities[1]!;
 for(const person of f.base.entities)person.characterSheet!.protagonist=false;
 const taskText=f.s(`Нора обещала Мире проверить ${object} только после разрешения охраны.`,`Nora promised Mira to inspect the ${object} only after the guards give permission.`);
 const knowledgeText=f.s(`Мира узнала код: ${object} остаётся закрытым без разрешения охраны.`,`Mira learned the code: the ${object} stays closed without the guards' permission.`);
 const knowledgeQuote=f.s(`Мира сказала: «Я узнала код: ${object} остаётся закрытым без разрешения охраны».`,`Mira said: “I learned the code: the ${object} stays closed without the guards' permission.”`);
 const task:StoryFact={kind:"promise",text:taskText,quote:taskText,task:{key:"inspect-object",title:f.s(`Проверить ${object}`,`Inspect the ${object}`),status:"open"}};
 const knowledge:StoryFact={kind:"event",text:knowledgeText,quote:knowledgeQuote,claim:{key:"lasting-code",value:knowledgeText,scope:"state",lifetime:"persistent"}};
 const noise:StoryFact[]=Array.from({length:20},(_,i)=>{const text=f.s(`Нора и Мира обсуждали, как я открываю ${object}. Разговор ${i}.`,`Nora and Mira discussed how I open the ${object}. Conversation ${i}.`);return {kind:"event",text,quote:text};});
 const latest=noise.at(-1)!,sources=["old-task","old-knowledge",...noise.map((_,i)=>"recent-noise-"+i)];
 const seed=(fact:StoryFact,source:string,role:"promisor"|"planner"|"speaker",person:typeof N)=>roleSeed(fact,{version:1,sourceRevisionId:source,quote:fact.quote,roles:{[role]:{id:person.id,name:person.name}}});
 const seeds=[seed(task,sources[0]!,"promisor",N),seed(knowledge,sources[1]!,"speaker",M),...noise.map((fact,i)=>roleSeed(fact,{version:1,sourceRevisionId:sources[i+2]!,quote:fact.quote,roles:{}}))];
 const input=f.input;input.story!.facts=[task,knowledge,...noise];input.story!.roleSeeds=seeds;input.story!.episodeSources=sources;input.draft=f.s(`Я открываю ${object}.`,`I open the ${object}.`);input.recentMessages=[latest.text];
 input.character=[f.base.world.id,f.base.binding.chatId,f.base.entities,f.base.binding.characterScenes![f.base.world.id],DEFAULT_ACTIONS,[],latest.text,"action-request",true,false,false];
 return {...f,input,object,task,knowledge,noise,latest,sources,seeds,seed};
}
export function actionQualityCorpus(locale:Locale) {
 const positive=settings.flatMap(setting=>["object","gesture","named-gesture","many-obligations"].map(id=>{
  const f=actionWorld(locale,setting),input=f.input;
  if(id==="gesture")input.draft=f.s("Я киваю.","I nod.");
  if(id==="named-gesture")input.draft=f.s("Я киваю Мире.","I nod to Mira.");
  if(id==="many-obligations"){
   const extra:StoryFact[]=Array.from({length:100},(_,i)=>{const text=f.s(`Нора обещала Мире подготовить документ ${i} после разрешения.`,`Nora promised Mira to prepare document ${i} after permission.`);return {kind:"promise",text,quote:text,task:{key:"unrelated-"+i,title:text,status:"open"}};});
   const extraSources=extra.map((_,i)=>"other-duty-"+i);input.story!.facts=[...extra,...input.story!.facts];input.story!.episodeSources=[...extraSources,...f.sources];input.story!.roleSeeds=[...extra.map((fact,i)=>f.seed(fact,extraSources[i]!,"promisor",f.base.entities[0]!)),...f.seeds];
  }
  return {name:setting.id+":"+locale+":"+id,input,wanted:[f.latest,f.task,f.knowledge],balance:true};
 }));
 const controls=["topic","owner","unsupported","quoted","negated","attempt","personal-object","ambiguous","unknown-object","unknown-bindings","empty-scene","required-overflow"] as const;
 return [...positive,...controls.map(id=>{
  const f=actionWorld(locale),input=f.input;
  if(id==="topic")input.draft=f.s("Что известно о коде двери?","What do we know about the door code?");
  if(id==="owner")input.draft=f.s("Что Нора обещала Мире?","What did Nora promise Mira?");
  if(id==="unsupported")input.draft=f.s("Я созерцаю дверь.","I contemplate the door.");
  if(id==="quoted")input.draft=f.s("«Я открываю дверь».",'"I open the door".');
  if(id==="negated")input.draft=f.s("Я не открываю дверь.","I do not open the door.");
  if(id==="attempt")input.draft=f.s("Я пытаюсь открыть дверь.","I try to open the door.");
  if(id==="personal-object")input.draft=f.s("Я открываю её дверь.","I open her door.");
  if(id==="ambiguous"){for(const e of input.entities!)e.aliases=[f.s("Саша","Alex")];input.draft=f.s("Я киваю Саше.","I nod to Alex.");}
  if(id==="unknown-object")input.draft=f.s("Я открываю люк.","I open the hatch.");
  if(id==="unknown-bindings")input.story!.roleSeeds=[];
  if(id==="empty-scene")input.character![3]!.presentIds=[];
  if(id==="required-overflow"){input.settings.contextBudget=500;input.requiredContext="WHOLE AUTHOR RULE. ".repeat(200);}
  return {name:"control:"+locale+":"+id,input,wanted:[],balance:false};
 })];
}
