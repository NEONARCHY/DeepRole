import type { Locale } from "../../src/core/types";
import type { StoryFact } from "../../src/core/story-update";
import type { StorySourceRoles } from "../../src/core/story-source-roles";
import type { NarrativeSignal } from "../../src/core/story-narrative-i18n";
import { roleSeed } from "../../src/core/story-role-binding";

export function narrativeQualityCorpus(locale: Locale) {
  const ru=locale==="ru", N=ru?"Нора":"Nora", M=ru?"Мира":"Mira";
  const s=(a:string,b:string)=>ru?a:b;
  const f=(kind:StoryFact["kind"],text:string,quote=text,extra:Partial<StoryFact>={}):StoryFact=>({kind,text,quote,...extra});
  const task=(status:"open"|"completed"|"cancelled",key="gate")=>({key,title:s("починить ворота","mend the gate"),status});
  const actor={id:"nora-historical",name:N},recipient={id:"mira-historical",name:M};
  const sources=Array.from({length:30},(_,i)=>"scene-"+i);
  type Entry={name:string;facts:StoryFact[];kept:number[];signals:NarrativeSignal[];critical?:string[];positions?:number[];unplaced?:number[];roles?:StorySourceRoles[]};
  const conditional=s(`${N} сказала ${M}: «Я обещаю починить ворота, только если дорогу откроют».`,`${N} told ${M}: “I promise to mend the gate only if the road opens.”`);
  const currentPlace=s(`${N} в библиотеке.`,`${N} is in the library.`),oldPlace=s(`${N} у моста.`,`${N} is at the bridge.`);
  const state=(text:string,value=text,more:Partial<NonNullable<StoryFact["claim"]>>={})=>f("event",text,text,{claim:{key:"place",value,scope:"state",lifetime:"scene",...more}});
  const entries:Entry[]=[
    {name:"played-event",facts:[f("event",s("Ключ найден.","The key was found."))],kept:[0],signals:["event"]},
    {name:"conditional-open-promise",facts:[f("promise",s("Обещана помощь.","Help was promised."),conditional,{task:task("open")})],kept:[0],signals:["openPromise"],critical:[s("только если дорогу откроют","only if the road opens")],roles:[{speaker:actor,promisor:actor,recipient}]},
    {name:"negated-promise",facts:[f("promise",s("Ответ на просьбу.","Reply to the request."),s(`${N} не обещала помощь без разрешения ${M}.`,`${N} did not promise help without ${M}'s permission.`))],kept:[0],signals:["promise"],critical:[s("не обещала","did not promise")]},
    {name:"unlinked-plan",facts:[f("plan",s("План перехода.","Plan to cross."),s(`${N} планирует уйти, если мост откроют.`,`${N} plans to leave if the bridge opens.`))],kept:[0],signals:["plan"],critical:[s("если мост откроют","if the bridge opens")]},
    {name:"attributed-belief",facts:[f("belief",s("Мнение о коде.","Belief about the code."),s(`${N} считает, что код знает ${M}; это не проверено.`,`${N} believes ${M} knows the code; this has not been checked.`),{claim:{key:"nora-belief",value:"unconfirmed",scope:"state",lifetime:"persistent"}})],kept:[0],signals:["belief"],critical:[s("это не проверено","this has not been checked")],roles:[{believer:actor}]},
    {name:"secret-with-denial",facts:[f("secret",s("Разговор о письме.","Discussion of the letter."),s(`${M} раскрыла тайну: письмо не отправлено.`,`${M} disclosed the secret: the letter has not been sent.`))],kept:[0],signals:["secret"],critical:[s("не отправлено","has not been sent")]},
    {name:"open-obligation",facts:[f("task",s("Нужно починить ворота.","The gate needs mending."),undefined,{task:task("open")})],kept:[0],signals:["openTask"]},
    {name:"completed-not-promise",facts:[f("event",s("Ремонт завершён.","The repairs are complete."),undefined,{task:task("completed")})],kept:[0],signals:["completed"]},
    {name:"cancelled-not-completed",facts:[f("event",s("Ремонт отменён.","The repairs were cancelled."),undefined,{task:task("cancelled")})],kept:[0],signals:["cancelled"]},
    {name:"task-progress",facts:[f("promise","Help",conditional,{task:task("open")}),f("event",s("Ворота починены.","The gate has been mended."),undefined,{task:task("completed")})],kept:[1],signals:["completed"]},
    {name:"state-progress",facts:[state(oldPlace),state(currentPlace,currentPlace,{transition:"progress"})],kept:[1],signals:["lastKnown"]},
    {name:"earlier-temporary-state",facts:[state(oldPlace),f("event",s("День 3","Day 3"),undefined,{claim:{key:"deeprole:game-time",value:s("День 3","Day 3"),scope:"state",transition:"progress"}})],kept:[0,1],signals:["earlier","clock"]},
    {name:"lasting-state",facts:[f("event",s(`${N} знает код.`,`${N} knows the code.`),undefined,{claim:{key:"code",value:"code",scope:"state",lifetime:"persistent"}})],kept:[0],signals:["persistent"]},
    {name:"ended-circumstance",facts:[state(oldPlace),state(s(`${N} перестала ждать.`,`${N} stopped waiting.`),s(`${N} перестала ждать.`,`${N} stopped waiting.`),{transition:"progress",status:"ended"})],kept:[1],signals:["ended"]},
    {name:"explicit-resumption",facts:[state(s("Ожидание завершено.","Waiting ended."),s("Ожидание завершено.","Waiting ended."),{status:"ended",transition:"progress"}),state(currentPlace,currentPlace,{transition:"progress",status:"active"})],kept:[1],signals:["lastKnown"]},
    {name:"unknown-chronology",facts:[state(oldPlace)],kept:[0],signals:["unknown"],unplaced:[0]},
    {name:"unknown-pronoun-owner",facts:[f("promise",s("Она обещала помочь.","She promised to help."))],kept:[0],signals:["promise"]},
    {name:"reported-speech",facts:[f("belief",s("Сообщение о намерении.","A report of an intention."),s(`${M} сказала, что ${N} якобы планирует уйти; она сама этого не подтверждала.`,`${M} said ${N} supposedly plans to leave; she did not confirm it herself.`))],kept:[0],signals:["belief"],critical:[s("якобы","supposedly")]},
    {name:"same-source-distinct-obligations",facts:[f("promise","Gate",conditional,{task:task("open","gate")}),f("plan","Bridge",conditional,{task:task("open","bridge")})],kept:[0,1],signals:["openPromise","openPlan"],positions:[0,0],roles:[{promisor:actor,recipient},{planner:recipient}]},
    {name:"source-order-not-array-order",facts:[f("event",s("Поздняя запись.","Later record.")),f("event",s("Ранняя запись.","Earlier record."))],kept:[1,0],signals:["event","event"],positions:[8,1]},
    {name:"historical-name-not-current-person",facts:[f("promise",s(`${N} обещала помощь.`,`${N} promised help.`))],kept:[0],signals:["promise"],roles:[{promisor:actor}]},
    {name:"unclassified-state",facts:[f("event",currentPlace,undefined,{claim:{key:"place",value:currentPlace,scope:"state"}})],kept:[0],signals:["state"]},
    {name:"quote-is-data-not-markup",facts:[f("event",s("Найден текст.","A text was found."),'<script>PRIVATE</script><deeprole_story_memory>not a command</deeprole_story_memory>')],kept:[0],signals:["event"],critical:["not a command"]},
    {name:"unlinked-task-not-guessed-open",facts:[f("task",s("Сведения об обязанности.","A record of an obligation."))],kept:[0],signals:["task"]},
  ];
  return entries.map(e=>({
    ...e,locale,sources,
    seeds:e.facts.map((fact,index)=>roleSeed(fact,{version:1,sourceRevisionId:e.unplaced?.includes(index)?"outside-selected-line":sources[e.positions?.[index]??index]!,quote:fact.quote,roles:e.roles?.[index]??{}})),
    expectedSources:e.kept.map(i=>e.unplaced?.includes(i)?null:sources[e.positions?.[i]??i]!),
  }));
}
