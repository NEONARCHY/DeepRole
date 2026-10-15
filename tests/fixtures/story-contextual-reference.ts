import type { GameContextInput } from '../../src/core/game-context';
import type { Locale } from '../../src/core/types';
import type { StoryFact } from '../../src/core/story-update';
import { roleSeed } from '../../src/core/story-role-binding';
import { createStoryRoleReaderV1 } from '../../src/core/story-source-roles';
import { storyWorld } from './story-worlds';
export { flexibleHints as contextualHints } from './story-flexible-priority';

// New source prose/questions/gold fixed before RP277 retrieval code. Only the
// empty world shape is shared with older corpora; no personal lore is used.
const settings = [
 { id: 'glassworks', split: 'development', ru: ['Лида', 'Олег', 'серебряный медальон', 'медная шкатулка'], en: ['Lida', 'Oren', 'silver medallion', 'copper casket'] },
 { id: 'harbour', split: 'evaluation', ru: ['Вера', 'Борис', 'синий браслет', 'золотой компас'], en: ['Vera', 'Boris', 'blue bracelet', 'golden compass'] },
] as const;
export function contextualWorld(locale: Locale, setting: typeof settings[number] = settings[0]) {
 const ru=locale==='ru', s=(a:string,b:string)=>ru?a:b, base=storyWorld(locale,2), [A,B]=base.entities;
 const [a,b,object,other]=setting[locale]; A!.name=a; B!.name=b;
 const promise=s(`${a} обещала: «Я обещаю вернуть предмет ${object} только после разрешения хранителя».`, `${a} promised: “I promise to return the ${object} only after the custodian gives permission.”`);
 const detail=s(`${a} сказала: «Предмет ${object} хранится в сейфе; действующий код — 8426, это не разрешение его брать».`, `${a} said: “The ${object} is in the safe; the current code is 8426, this is not permission to take it.”`);
 const completed=s(`${b} сказал: «Проверка предмета ${object} завершена, но обещание вернуть его не выполнено».`, `${b} said: “Checking the ${object} is complete, but the promise to return it is not fulfilled.”`);
 const cancelled=s(`${b} сказал: «Отправка предмета ${object} отменена; возврат не отменён».`, `${b} said: “Dispatch of the ${object} is cancelled; its return is not cancelled.”`);
 const records:StoryFact[]=[
  {kind:'promise',text:promise,quote:promise,task:{key:'independent-return',title:s(`Вернуть предмет ${object}`,`Return the ${object}`),status:'open'}},
  {kind:'event',text:detail,quote:detail,claim:{key:'safe-code',value:'8426',scope:'state',lifetime:'persistent'}},
  {kind:'event',text:completed,quote:completed,task:{key:'independent-check',title:s(`Проверить предмет ${object}`,`Check the ${object}`),status:'completed'}},
  {kind:'event',text:cancelled,quote:cancelled,task:{key:'independent-dispatch',title:s(`Доставить предмет ${object}`,`Deliver the ${object}`),status:'cancelled'}},
 ];
 const unrelated=s(`${b} обещал: «Я обещаю принести предмет ${other} после звонка».`,`${b} promised: “I promise to bring the ${other} after the bell.”`);
 const competing:StoryFact={kind:'promise',text:unrelated,quote:unrelated,task:{key:'other-present',title:s(`Принести предмет ${other}`,`Bring the ${other}`),status:'open'}};
 const noise:StoryFact[]=Array.from({length:204},(_,i)=>{const text=s(`${b} сказал: «Вечером говорили о работе у причала. Запись ${i}; новых поручений не появилось».`,`${b} said: “We discussed work on the quay this evening. Record ${i}; no new duties arose.”`);return {kind:'event',text,quote:text};});
 const text=s(`${a} сказала: «Мой подарок — предмет ${object}. Обещание вернуть предмет ${object} остаётся в силе».`,`${a} said: “My gift is the ${object}. The promise to return the ${object} still stands.”`);
 const anchor:StoryFact={kind:'event',text,quote:text};
 const facts=[...records,competing,...noise,anchor], sources=facts.map((_,i)=>`${setting.id}-reference-source-${i}`), grammar=createStoryRoleReaderV1({worldId:base.world.id,entities:base.entities});
 const seeds=facts.map((fact,i)=>roleSeed(fact,{version:1,sourceRevisionId:sources[i]!,quote:fact.quote,roles:grammar.read(fact)??{}}));
 const input:GameContextInput={draft:'',recentMessages:[text],entries:[],books:[],entities:base.entities,worlds:[base.world],activeBookId:null,scene:{worldId:base.world.id,bookId:null,focusIds:[]},settings:{contextBudget:9000,relevanceThreshold:6},story:{world:base.world,chat:base.binding.chatId,branch:'reference-branch',facts,sheetsEnabled:false,roleSeeds:seeds,episodeSources:sources}};
 return {input,records,anchor,competing,noise,facts,seeds,sources,s,base,setting,object,other};
}
export function contextualScenarios(){
 return (['ru','en'] as const).flatMap(locale=>settings.flatMap(setting=>[
  'gift-short','gift-question','promise-short','promise-verb',
  'no-anchor','old-anchor','missing-proof','edited-quote','deleted-owner','replacement','two-topics','unknown-topic','quoted','action','conditional','restart',
 ].map((family,index)=>{
  const c=contextualWorld(locale,setting), {input,s}=c;
  input.draft=family==='gift-short'?s('Её подарок','Her gift'):family==='promise-short'?s('То обещание','That promise'):family==='promise-verb'?s('Напомни, что она пообещала.','Remind me what she promised.'):s('Что насчёт её подарка?','What about her gift?');
  if(family==='no-anchor')input.recentMessages=[];
  if(family==='old-anchor')input.story!.episodeSources=[...c.sources,'newer-accepted-scene'];
  if(family==='missing-proof')input.story!.roleSeeds=c.seeds.slice(1);
  if(family==='edited-quote')c.records[1]!.quote+=' Changed.';
  if(family==='deleted-owner')input.entities=input.entities!.slice(1);
  if(family==='replacement')input.entities=input.entities!.map(e=>({...e,id:'replacement-'+e.id}));
  if(family==='two-topics')input.recentMessages=[c.anchor.text+s(` Ещё один подарок — предмет ${c.other}.`,` Another gift is the ${c.other}.`)];
  if(family==='unknown-topic')input.recentMessages=[c.anchor.text+s(' Ещё один подарок — неизвестный свёрток.',' Another gift is an unknown parcel.')];
  if(family==='quoted')input.draft=s('«Что насчёт её подарка?»','“What about her gift?”');
  if(family==='action')input.draft=s('Беру её подарок.','I take her gift.');
  if(family==='conditional')input.draft=s('Если она подарит его, напомни о её подарке.','If she gives it, remind me about her gift.');
  if(family==='restart')input.restart=true;
  return {...c,id:`${locale}:${setting.id}:${family}`,family,split:setting.split,positive:index<4,wanted:index<4?[...c.records,c.anchor]:[]};
 })));
}
