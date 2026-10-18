import type {GameContextInput} from '../../src/core/game-context';
import type {Locale} from '../../src/core/types';
import type {StoryFact} from '../../src/core/story-update';
import {roleSeed} from '../../src/core/story-role-binding';
import {storyWorld} from './story-worlds';

type Plot='lighthouse'|'ferry';
type Query={id:string;draft:[string,string];wanted:string[];control?:boolean};
const plots:Record<Plot,{names:[string,string];facts:Record<string,[string,string]>;queries:Query[]}>={
 lighthouse:{names:['Лада','Марк'],facts:{
  action:['Во время ночного отказа маяка Лада вручную раскрутила резервный маховик; автоматический аккумулятор не включился.','During the overnight lighthouse failure, Lada hand-cranked the backup rotor; the automatic battery did not engage.'],
  plan:['До ночного отказа Лада лишь предложила проверить аккумулятор; эту проверку не проводили.','Before the overnight outage, Lada only proposed checking the battery; no check was performed.'],
  promise:['Марк обещал передать карту Иве только после того, как три свидетеля подпишут журнал; ни одной подписи ещё нет.','Mark promised to hand the map to Iva only after three witnesses sign the log; no signatures have been collected yet.'],
  rumor:['Слух утверждает, что фиолетовая печать лежит в северном архиве, но рассказчик её не видел и не знает владельца.','A rumor claims the violet seal is in the north archive, but the speaker has not seen it and does not know who owns it.'],
  noise:['Позже Лада снова обсуждала отказ маяка, маховик, аккумулятор, карту и фиолетовую печать; новых действий или передач не было.','Later Lada again discussed the lighthouse failure, rotor, battery, map, and violet seal; no new actions or handovers occurred.'],
 },queries:[
  {id:'lighthouse-action-direct',draft:['Что Лада сделала при ночном отказе маяка?','What did Lada do during the overnight lighthouse failure?'],wanted:['action']},
  {id:'lighthouse-action-paraphrase',draft:['Кто вернул свет у маяка после ночного сбоя?','Who brought the lighthouse back to light after the overnight failure?'],wanted:['action']},
  {id:'lighthouse-battery',draft:['Лада проверила аккумулятор во время отказа?','Did Lada check the battery during the outage?'],wanted:['action','plan']},
  {id:'map-condition',draft:['Что должно случиться до передачи карты Марком?','What must happen before Mark hands over the map?'],wanted:['promise']},
  {id:'map-completion',draft:['Марк уже передал Иве карту?','Has Mark handed Iva the map yet?'],wanted:['promise']},
  {id:'seal-owner-unknown',draft:['Кто владеет фиолетовой печатью?','Who owns the violet seal?'],wanted:['rumor'],control:true},
 ]},
 ferry:{names:['Оса','Рен'],facts:{
  action:['Во время паводка Оса закрепила красный ящик на восточной платформе; поднять его на судно не успели.','During the flood, Osa secured the red crate on the east platform; it was not loaded onto the vessel.'],
  plan:['Перед паводком команда только обсуждала погрузку красного ящика; погрузка не начиналась.','Before the flood, the crew only discussed loading the red crate; loading never began.'],
  promise:['Рен обещал поднять красный ящик на судно только после спада воды и зелёного сигнала диспетчера; ни одно условие ещё не выполнено.','Ren promised to load the red crate onto the vessel only after the water recedes and the dispatcher gives a green signal; neither condition has been met.'],
  completed:['Синий ящик погрузили на судно после проверки креплений; его погрузка завершена.','The blue crate was loaded onto the vessel after its fastenings were checked; its loading is complete.'],
  rumor:['Слух утверждает, что латунная печать унесена с платформы, но источник не видел её и не называет владельца.','A rumor claims that the brass seal was taken from the platform, but the source did not see it and names no owner.'],
  noise:['После паводка снова обсуждали красный ящик, восточную платформу, зелёный сигнал, синий ящик и латунную печать; новых передач не было.','After the flood, people again discussed the red crate, east platform, green signal, blue crate, and brass seal; no new handovers occurred.'],
 },queries:[
  {id:'ferry-location',draft:['Где Оса оставила красный ящик?','Where did Osa leave the red crate?'],wanted:['action']},
  {id:'ferry-loading-status',draft:['Красный ящик уже погрузили на судно?','Has the red crate been loaded onto the vessel?'],wanted:['action','promise']},
  {id:'ferry-condition',draft:['Что нужно для погрузки красного ящика Реном?','What must happen before Ren loads the red crate?'],wanted:['promise']},
  {id:'ferry-neighbour-task',draft:['Синий ящик уже погрузили. Можно ли теперь грузить красный?','The blue crate was loaded. Can they load the red one now?'],wanted:['promise','completed']},
  {id:'brass-seal-owner-unknown',draft:['Кому принадлежит латунная печать?','Who owns the brass seal?'],wanted:['rumor'],control:true},
 ]},
};

export function rp05GroundingScenarios(locale:Locale){
 const lang=locale==='ru'?0:1,all:Array<{id:string;plot:Plot;locale:Locale;input:GameContextInput;facts:StoryFact[];ids:string[];sources:string[];wanted:string[];control:boolean}>=[];
 for(const plot of ['lighthouse','ferry'] as const){
  const p=plots[plot],f=storyWorld(locale,4);f.world.storyAutomation={mode:'automatic',revision:'rp05-grounding'};
  f.entities[2]!.name=p.names[0];f.entities[3]!.name=p.names[1];
  const noiseCount=48,ids=['action','plan','promise',...(plot==='ferry'?['completed']:[]),'rumor',...Array.from({length:noiseCount},(_,i)=>`noise-${i}`)];
  const facts:StoryFact[]=ids.map(id=>{
   const base=id.startsWith('noise-')?'noise':id;let text=p.facts[base]![lang];
   if(id.startsWith('noise-'))text+=lang?` Recap ${Number(id.slice(6))+1}.`:` Повтор ${Number(id.slice(6))+1}.`;
   if(id==='promise')return {kind:'promise',text,quote:text,task:{key:`${plot}.primary`,title:plot==='lighthouse'?(lang?'hand over map':'передать карту'):(lang?'load red crate':'погрузить красный ящик'),status:'open'}};
   if(id==='completed')return {kind:'event',text,quote:text,task:{key:'ferry.blue-crate',title:lang?'load blue crate':'погрузить синий ящик',status:'completed'}};
   if(id==='plan')return {kind:'plan',text,quote:text};
   if(id==='rumor')return {kind:'belief',text,quote:text};
   return {kind:'event',text,quote:text};
  });
  const sources=ids.map(id=>`rp05-${plot}-${id}`),roleSeeds=facts.map((fact,i)=>roleSeed(fact,{version:1,sourceRevisionId:sources[i]!,quote:fact.quote,roles:i===0||ids[i]!.startsWith('noise-')?{speaker:{id:f.entities[2]!.id,name:p.names[0]}}:ids[i]==='plan'?{speaker:{id:f.entities[2]!.id,name:p.names[0]}}:ids[i]==='promise'?{promisor:{id:f.entities[3]!.id,name:p.names[1]}}:{}}));
  for(const query of p.queries){
   const draft=query.draft[lang];const input:GameContextInput={draft,recentMessages:facts.slice(-2).map(x=>x.text),entries:[f.entry],books:[],entities:f.entities,worlds:[f.world],scene:{worldId:f.world.id,bookId:null,focusIds:[]},activeBookId:null,settings:{contextBudget:6000,relevanceThreshold:6},character:[f.world.id,f.binding.chatId,f.entities,f.binding.characterScenes![f.world.id],[],[],draft,'rp05-audit',true,false,false],story:{world:f.world,chat:f.binding.chatId,branch:'branch-a',sheetsEnabled:true,facts,roleSeeds,episodeSources:sources}};
   all.push({id:query.id,plot,locale,input,facts,ids,sources,wanted:query.wanted,control:!!query.control});
  }
 }
 return all;
}
