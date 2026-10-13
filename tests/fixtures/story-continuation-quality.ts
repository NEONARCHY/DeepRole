import type {Locale} from "../../src/core/types";
import type {StoryFact} from "../../src/core/story-update";
import {DEFAULT_ACTIONS} from "../../src/core/characters";
import {roleSeed} from "../../src/core/story-role-binding";
import {admissionWorld} from "./story-topic-admission";

const settings=[
  {id:"workshop",ru:["ворота","код кладовой"],en:["gate","pantry code"]},
  {id:"space",ru:["антенну","частоту маяка"],en:["antenna","beacon frequency"]},
  {id:"fantasy",ru:["мост","слово печати"],en:["bridge","seal word"]},
] as const;
export function continuationWorld(locale:Locale,setting:typeof settings[number]=settings[0]!) {
  const f=admissionWorld(locale),[object,detail]=setting[locale],s=f.s,N=f.base.entities[0]!,M=f.base.entities[1]!;
  for(const e of f.base.entities)e.characterSheet!.protagonist=false;
  const taskText=s(`Нора обещала Мире восстановить ${object} только после разрешения охраны.`,`Nora promised Mira to repair the ${object} only after the guards give permission.`);
  const planText=s(`Мира планирует проверить ${object} после разрешения охраны.`,`Mira plans to inspect the ${object} after the guards give permission.`);
  const knowledgeText=s(`Мира узнала «${detail}», но это не даёт разрешения входить.`,`Mira learned the ${detail}, but it does not give permission to enter.`);
  const task:StoryFact={kind:"promise",text:taskText,quote:taskText,task:{key:"repair",title:s(`Восстановить ${object}`,`Repair the ${object}`),status:"open"}};
  const plan:StoryFact={kind:"plan",text:planText,quote:planText,task:{key:"inspect",title:s(`Проверить ${object}`,`Inspect the ${object}`),status:"open"}};
  const knowledgeQuote=s(`Мира сказала: «Я узнала ${detail}, но это не даёт разрешения входить».`,`Mira said: “I learned the ${detail}, but it does not give permission to enter.”`);
  const knowledge:StoryFact={kind:"event",text:knowledgeText,quote:knowledgeQuote,claim:{key:"knowledge",value:knowledgeText,scope:"state",lifetime:"persistent"}};
  const noise:StoryFact[]=Array.from({length:20},(_,i)=>{const text=s(`Нора и Мира обсуждали погоду у окна. Разговор ${i}.`,`Nora and Mira discussed the weather by the window. Conversation ${i}.`);return {kind:"event",text,quote:text};});
  // Declared newest context, not an inferred calendar/presence update.
  const latest=noise.at(-1)!;
  const sources=["old-plan","old-task","old-knowledge",...noise.map((_,i)=>"current-noise-"+i)];
  const seed=(fact:StoryFact,source:string,role:"promisor"|"planner"|"speaker",person:typeof N)=>roleSeed(fact,{version:1,sourceRevisionId:source,quote:fact.quote,roles:{[role]:{id:person.id,name:person.name}}});
  const seeds=[seed(plan,sources[0]!,"planner",M),seed(task,sources[1]!,"promisor",N),seed(knowledge,sources[2]!,"speaker",M),...noise.map((fact,i)=>roleSeed(fact,{version:1,sourceRevisionId:sources[3+i]!,quote:fact.quote,roles:{}}))];
  const input=f.input;input.story!.facts=[plan,task,knowledge,...noise];input.story!.roleSeeds=seeds;input.story!.episodeSources=sources;input.draft=s("Продолжай.","Continue.");input.recentMessages=[latest.text];
  input.character=[f.base.world.id,f.base.binding.chatId,f.base.entities,f.base.binding.characterScenes![f.base.world.id],DEFAULT_ACTIONS,[],latest.text,"continuation-request",true,false,false];
  return {...f,input,task,plan,knowledge,noise,latest,sources,seeds,seed};
}
export function continuationQualityCorpus(locale:Locale) {
  const positive=settings.flatMap(setting=>["plain","named","focus-other","many-obligations"].map(id=>{
    const f=continuationWorld(locale,setting),input=f.input;let open=f.task;
    if(id==="named")input.draft=f.s("Нора, давай дальше.","Nora, go on.");
    if(id==="focus-other"){input.character![3]!.presentIds=[];input.scene!.focusIds=[f.base.entities[1]!.id];input.character![5]=[f.base.entities[1]!.id];open=f.plan;}
    if(id==="many-obligations"){
      const extras:StoryFact[]=Array.from({length:100},(_,i)=>{const text=f.s(`Нора обещала Мире подготовить документ ${i} после разрешения.`,`Nora promised Mira to prepare document ${i} after permission.`);return {kind:"promise",text,quote:text,task:{key:"document-"+i,title:text,status:"open"}};});
      const extraSources=extras.map((_,i)=>"old-extra-"+i);input.story!.facts=[...extras,...input.story!.facts];input.story!.episodeSources=[...extraSources,...f.sources];input.story!.roleSeeds=[...extras.map((fact,i)=>f.seed(fact,extraSources[i]!,"promisor",f.base.entities[0]!)),...f.seeds];
    }
    return {name:setting.id+":"+locale+":"+id,input,wanted:[f.latest,open,f.knowledge],balanced:true};
  }));
  const controls=["explicit-topic","owner","action","quoted","negated","ambiguous","unknown-bindings","completed","cancelled","removed-owners","foreign-scope","required-overflow"] as const;
  return [...positive,...controls.map(id=>{
    const f=continuationWorld(locale),input=f.input;
    const terminal=(status:"completed"|"cancelled")=>{for(const target of [f.task,f.plan]){const text=f.s(status==="completed"?"Дело выполнено.":"Дело отменено.",status==="completed"?"The duty is complete.":"The duty is cancelled.");const done:StoryFact={kind:"event",text,quote:target.quote+" "+text,task:{...target.task!,status}};input.story!.facts.push(done);input.story!.roleSeeds!.push(roleSeed(done,{version:1,sourceRevisionId:f.sources.at(-1)!,quote:done.quote,roles:{}}));}input.story!.facts=input.story!.facts.filter(fact=>fact!==f.knowledge);};
    if(id==="explicit-topic")input.draft=f.s("Что известно о коде кладовой?","What do we know about the pantry code?");
    if(id==="owner")input.draft=f.s("Что Нора обещала Мире?","What did Nora promise Mira?");
    if(id==="action")input.draft=f.s("Продолжай ремонт ворот.","Continue repairing the gate.");
    if(id==="quoted")input.draft=f.s("«Продолжай».","\"Continue\".");
    if(id==="negated")input.draft=f.s("Не продолжай.","Do not continue.");
    if(id==="ambiguous"){for(const e of input.entities!)e.aliases=[f.s("Саша","Alex")];input.draft=f.s("Саша, продолжай.","Alex, continue.");}
    if(id==="unknown-bindings")input.story!.roleSeeds=[];
    if(id==="completed"||id==="cancelled")terminal(id);
    if(id==="removed-owners"){input.entities=[];input.character![2]=[];input.character![3]!.presentIds=[];}
    if(id==="foreign-scope"){input.entities=input.entities!.map(e=>({...e,worldId:"other-world"}));input.character![2]=input.entities;}
    if(id==="required-overflow"){input.settings.contextBudget=500;input.requiredContext="KEEP ENTIRE AUTHOR RULE. ".repeat(200);}
    return {name:"control:"+locale+":"+id,input,wanted:[],balanced:false};
  })];
}
