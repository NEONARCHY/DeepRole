import type {Locale} from "../../src/core/types";
import type {StoryFact} from "../../src/core/story-update";
import type {GameContextInput} from "../../src/core/game-context";
import {roleSeed} from "../../src/core/story-role-binding";
import {storyWorld} from "./story-worlds";

// Independent exact source prose and expected subsets; no scorer-generated gold.
const settings=[
  {id:"fantasy",ru:["янтарь","зеркало"],en:["amber","mirror"]},
  {id:"space",ru:["кислород","телеметрия"],en:["oxygen","telemetry"]},
  {id:"detective",ru:["отпечаток","улика"],en:["fingerprint","evidence"]},
  {id:"home",ru:["альбом","квитанция"],en:["album","receipt"]},
] as const;
export function admissionWorld(locale:Locale,setting:typeof settings[number]=settings[1]!) {
  const f=storyWorld(locale,2),ru=locale==="ru",s=(a:string,b:string)=>ru?a:b;
  f.entities[0]!.name=s("Нора","Nora");f.entities[1]!.name=s("Мира","Mira");
  const [a,b]=setting[locale],N=f.entities[0]!.name;
  const title=s(`Нора должна передать «${b}» только после разрешения дежурного.`,`Nora must deliver ${b} only after the attendant gives permission.`);
  const texts=[
    s(`Нора считает: «${a}» находится в запертом шкафу, не у Миры; это мнение, не проверенный факт.`,`Nora believes ${a} is in the locked cupboard, not with Mira; this is a belief, not a verified fact.`),
    s("Назначенное поручение выполнено; квитанция осталась в архиве.","The assigned duty is complete; the receipt remains in the archive."),
    s("Нора обещала Мире починить ворота только после открытия дороги.","Nora promised Mira to repair the gate only after the road opens."),
  ];
  const facts:StoryFact[]=[
    {kind:"belief",text:texts[0]!,quote:texts[0]!},
    {kind:"event",text:texts[1]!,quote:title+s(" Поручение выполнено."," The duty is complete."),task:{key:"independent-duty",title,status:"completed"}},
    {kind:"promise",text:texts[2]!,quote:texts[2]!,task:{key:"independent-gate",title:s("Ремонт ворот","Repair the gate"),status:"open"}},
  ];
  const noise:StoryFact[]=Array.from({length:20},(_,i)=>{const text=s(`Нора и Мира обсуждали что известно и попросили напомнить о погоде у окна. Запись ${i}.`,`Nora and Mira discussed what we know and asked for a reminder about the weather by the window. Record ${i}.`);return {kind:"event",text,quote:text};});
  const sources=["earlier-topic-source",...noise.map((_,i)=>"later-noise-source-"+i)],seeds=facts.map((fact,i)=>roleSeed(fact,{version:1,sourceRevisionId:sources[0]!,quote:fact.quote,roles:i===0?{believer:{id:f.entities[0]!.id,name:N}}:i===2?{promisor:{id:f.entities[0]!.id,name:N},recipient:{id:f.entities[1]!.id,name:f.entities[1]!.name}}:{}}));
  const input:GameContextInput={draft:"",recentMessages:[],entries:[],books:[],entities:f.entities,worlds:[f.world],activeBookId:null,scene:{worldId:f.world.id,bookId:null,focusIds:[]},settings:{contextBudget:6000,relevanceThreshold:6},story:{world:f.world,chat:f.binding.chatId,branch:"admission-branch",facts:[...facts,...noise],sheetsEnabled:false,roleSeeds:seeds,episodeSources:sources}};
  return {base:f,input,facts,noise,a,b,s};
}
export function topicAdmissionCorpus(locale:Locale) {
  const positives=settings.flatMap(setting=>{
    const f=admissionWorld(locale,setting);
    return [
      {id:"body",draft:f.s(`Что известно о Норе и «${f.a}»?`,`What do we know about Nora and ${f.a}?`),wanted:[f.facts[0]!]},
      {id:"title",draft:f.s(`Напомни о «${f.b}».`,`Remind me about ${f.b}.`),wanted:[f.facts[1]!]},
      {id:"compound",draft:f.s(`Что известно о Норе, «${f.a}» и «${f.b}»?`,`What do we know about Nora, ${f.a} and ${f.b}?`),wanted:[f.facts[0]!,f.facts[1]!]},
    ].map(c=>({name:setting.id+":"+locale+":"+c.id,input:{...f.input,draft:c.draft},wanted:c.wanted,prune:true}));
  });
  const controls=["continuation","named-continuation","unknown","mixed-unknown","owner","ambiguous","pronoun","action","oversized","compound-oversized","required-overflow","common-topic"] as const;
  return [...positives,...controls.map(id=>{
    const f=admissionWorld(locale),input=f.input;
    const draft={
      continuation:f.s("Продолжай.","Continue."),
      "named-continuation":f.s("Нора, что происходит дальше?","Nora, what happens next?"),
      unknown:f.s("Что известно о драконе?","What do we know about the dragon?"),
      "mixed-unknown":f.s("Что известно о кислороде и драконе?","What do we know about oxygen and the dragon?"),
      owner:f.s("Напомни, что Нора обещала Мире.","Remind me what Nora promised Mira."),
      ambiguous:f.s("Что известно о Саше и кислороде?","What do we know about Alex and oxygen?"),
      pronoun:f.s("Что с её обещанием о кислороде?","What about her promise about oxygen?"),
      action:f.s("Как починить кислород?","How do we repair oxygen?"),
      oversized:f.s("Что известно о кислороде?","What do we know about oxygen?"),
      "compound-oversized":f.s("Что известно о кислороде и телеметрии?","What do we know about oxygen and telemetry?"),
      "required-overflow":f.s("Что известно о кислороде?","What do we know about oxygen?"),
      "common-topic":f.s("Что известно о погоде?","What do we know about the weather?"),
    }[id];input.draft=draft;
    if(id==="ambiguous")for(const e of input.entities!)e.aliases=[f.s("Саша","Alex")];
    if(id==="oversized"||id==="compound-oversized"){
      const fact=f.facts[id==="oversized"?0:1]!;fact.quote+=f.s(" Полный источник со всеми условиями."," Full evidence with all its conditions.").repeat(48);input.settings.contextBudget=1000;
    }
    if(id==="required-overflow"){input.settings.contextBudget=1000;input.requiredContext="Required uncut rule. ".repeat(900);}
    if(id==="common-topic")for(const fact of input.story!.facts)fact.text+=f.s(" Погода обсуждалась."," The weather was discussed.");
    // Recent open task and newest scene are independently specified continuation
    // anchors; a vague continuation must not lose either to the new admission.
    if(id==="continuation"||id==="named-continuation"){
      input.story!.facts=[f.facts[0]!,f.facts[1]!,...f.noise,f.facts[2]!];input.recentMessages=[f.facts[2]!.text];
    }
    return {name:"control:"+locale+":"+id,input,wanted:[],prune:false};
  })];
}
