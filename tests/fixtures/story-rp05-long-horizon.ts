import type { GameContextInput } from '../../src/core/game-context';
import type { Locale } from '../../src/core/types';
import type { StoryFact } from '../../src/core/story-update';
import { roleSeed } from '../../src/core/story-role-binding';
import { storyWorld } from './story-worlds';

// Registered before running the audit. Fresh plots, not renamed old fixtures.
const plots = [
  {
    id: 'reef-laboratory', names: [['Edda', 'Jun'], ['Эдда', 'Джун']],
    place: ['reef laboratory', 'рифовая лаборатория'], object: ['ceramic sample capsule', 'керамическая капсула с пробой'],
    first: ['quarantine shelf', 'карантинная полка'], later: ['sealed refrigerator', 'опечатанный холодильник'],
    task: ['open the diving hatch', 'открыть водолазный люк'],
    promise: ['Edda promised to open the diving hatch only after the pressure test passed and Jun signed the diving log.', 'Эдда обещала открыть водолазный люк только после проверки давления и подписи Джун в водолазном журнале.'],
    progress: ['The pressure test passed, but Jun has not signed the diving log; Edda has not opened the diving hatch.', 'Проверка давления завершена, но Джун ещё не подписала водолазный журнал; Эдда не открыла водолазный люк.'],
    done: ['Edda delivered the spare oxygen gauge to Jun; that delivery is complete.', 'Эдда передала Джун запасной кислородный манометр; эта передача завершена.'],
    rumor: ['An unverified note mentions a copper compass with an unknown owner; nobody identified who owns it.', 'Непроверенная записка упоминает медный компас с неизвестным владельцем; никто не установил, кому он принадлежит.'],
    item: ['copper compass', 'медный компас'],
  },
  {
    id: 'puppet-theatre', names: [['Basil', 'Oona'], ['Базиль', 'Уна']],
    place: ['puppet theatre', 'кукольный театр'], object: ['ivory puppet mask', 'маска марионетки из слоновой кости'],
    first: ['rehearsal bench', 'репетиционная скамья'], later: ['locked costume trunk', 'запертый костюмерный сундук'],
    task: ['raise the stage curtain', 'поднять театральный занавес'],
    promise: ['Basil promised to raise the stage curtain only after the rigging was inspected and Oona approved the lighting.', 'Базиль обещал поднять театральный занавес только после осмотра подвесов и одобрения освещения Уной.'],
    progress: ['The rigging inspection passed, but Oona has not approved the lighting; Basil has not raised the stage curtain.', 'Осмотр подвесов завершён, но Уна ещё не одобрила освещение; Базиль не поднял театральный занавес.'],
    done: ['Basil delivered the silver tuning fork to Oona; that delivery is complete.', 'Базиль передал Уне серебряный камертон; эта передача завершена.'],
    rumor: ['An unverified note mentions a velvet brooch with an unknown owner; nobody identified who owns it.', 'Непроверенная записка упоминает бархатную брошь с неизвестным владельцем; никто не установил, кому она принадлежит.'],
    item: ['velvet brooch', 'бархатная брошь'],
  },
  {
    id: 'mountain-post', names: [['Kellan', 'Yara'], ['Келлан', 'Яра']],
    place: ['mountain post office', 'горная почтовая станция'], object: ['leather dispatch pouch', 'кожаная курьерская сумка'],
    first: ['sorting table', 'сортировочный стол'], later: ['locked mail cabinet', 'запертый почтовый шкаф'],
    task: ['send the mountain courier', 'отправить горного курьера'],
    promise: ['Kellan promised to send the mountain courier only after the avalanche patrol returned and Yara confirmed the route.', 'Келлан обещал отправить горного курьера только после возвращения лавинного патруля и подтверждения маршрута Ярой.'],
    progress: ['The avalanche patrol returned, but Yara has not confirmed the route; Kellan has not sent the mountain courier.', 'Лавинный патруль вернулся, но Яра ещё не подтвердила маршрут; Келлан не отправил горного курьера.'],
    done: ['Kellan delivered the brass whistle to Yara; that delivery is complete.', 'Келлан передал Яре латунный свисток; эта передача завершена.'],
    rumor: ['An unverified note mentions a jade pendant with an unknown owner; nobody identified who owns it.', 'Непроверенная записка упоминает нефритовый кулон с неизвестным владельцем; никто не установил, кому он принадлежит.'],
    item: ['jade pendant', 'нефритовый кулон'],
  },
] as const;

export function longHorizonScenarios(locale: Locale, repeats: number, budget: number) {
  const l = locale === 'ru' ? 1 : 0;
  return plots.flatMap(plot => {
    const f = storyWorld(locale, 3), [actor, recipient] = plot.names[l];
    f.world.description = plot.place[l]; f.world.contextBudget = budget;
    f.world.storyAutomation = {mode:'automatic',revision:'rp323-long-horizon'};
    f.entities[0]!.name = locale==='ru'?'Путник':'Traveller';
    f.entities[1]!.name = actor; f.entities[2]!.name = recipient;
    const source = (kind: StoryFact['kind'], text: string, task?: StoryFact['task']): StoryFact => ({kind,text,quote:text,...(task?{task}:{})});
    const facts: StoryFact[] = [
      source('event',l ? `${actor}: ${plot.object[l]} сначала лежала здесь: ${plot.first[l]}.` : `${actor} first left the ${plot.object[l]} here: ${plot.first[l]}.`),
      source('event',l ? `${actor} позже перенёс предмет «${plot.object[l]}» сюда: ${plot.later[l]}; получатель ${recipient} ничего не получал.` : `${actor} later moved the ${plot.object[l]} here: ${plot.later[l]}; ${recipient} did not receive it.`),
      source('promise',plot.promise[l],{key:`${plot.id}.open`,title:plot.task[l],status:'open'}),
      source('event',plot.progress[l]),
      source('event',plot.done[l],{key:`${plot.id}.delivery`,title:l?'отдельная передача':'separate delivery',status:'completed'}),
      source('belief',plot.rumor[l]),
    ];
    const labels = ['first','later','promise','progress','completed','rumor'];
    for(let i=0;i<repeats;i++){
      const text=l
        ? `${actor} и ${recipient} ${i%2?'вспоминали прежний разговор':'снова обсуждали прежние условия'}: ${plot.task[l]}, ${plot.object[l]}, ${plot.item[l]}. Новых событий не было. Разговор ${i+1}.`
        : `${actor} and ${recipient} ${i%2?'recalled their earlier conversation':'discussed the old conditions again'}: ${plot.task[l]}, ${plot.object[l]}, ${plot.item[l]}. No new events occurred. Conversation ${i+1}.`;
      facts.push(source('event',text));labels.push('repeat');
    }
    const sources=facts.map((_,i)=>`${plot.id}-${locale}-${i}`);
    const roleSeeds=facts.map((fact,i)=>roleSeed(fact,{version:1,sourceRevisionId:sources[i]!,quote:fact.quote,roles:i===5?{}:{speaker:{id:f.entities[1]!.id,name:actor},...(i===2?{promisor:{id:f.entities[1]!.id,name:actor}}:{}),...(i===4?{recipient:{id:f.entities[2]!.id,name:recipient}}:{})}}));
    const queries = [
      {id:'open-with-partial-progress', draft:l?`Что ${actor} обещал: ${plot.task[l]}? Что уже выполнено и чего ещё не хватает?`:`What did ${actor} promise about ${plot.task[l]}? What is already done and what is still missing?`,wanted:['promise','progress']},
      {id:'earlier-and-later-location',draft:l?`Где ${plot.object[l]} лежала сначала и куда ${actor} перенёс её потом?`:`Where was the ${plot.object[l]} first, and where did ${actor} move it afterward?`,wanted:['first','later']},
      {id:'completed-is-separate',draft:l?`Что ${actor} уже передал персонажу ${recipient}? Выполнено ли обещание: ${plot.task[l]}?`:`What did ${actor} already deliver to ${recipient}? Is the promise to ${plot.task[l]} fulfilled?`,wanted:['completed','promise','progress']},
      {id:'owner-stays-unknown',draft:l?`Известно, кому принадлежит ${plot.item[l]}, или это только слух?`:`Do we know whose ${plot.item[l]} it is, or is that only a rumor?`,wanted:['rumor']},
    ];
    return queries.map(query=>{
      const input:GameContextInput={draft:query.draft,recentMessages:facts.slice(-2).map(f=>f.text),entries:[],books:[],entities:f.entities,worlds:[f.world],scene:{worldId:f.world.id,bookId:null,focusIds:[]},activeBookId:null,settings:{contextBudget:budget,relevanceThreshold:6},character:[f.world.id,f.binding.chatId,f.entities,f.binding.characterScenes![f.world.id],[],[],query.draft,'long-horizon',true,false,false],story:{world:f.world,chat:f.binding.chatId,branch:plot.id,sheetsEnabled:true,facts,roleSeeds,episodeSources:sources}};
      return{id:`${plot.id}/${locale}/${repeats}/${budget}/${query.id}`,locale,repeats,budget,input,facts,sources,labels,wanted:query.wanted,owner:query.id==='owner-stays-unknown'};
    });
  });
}
