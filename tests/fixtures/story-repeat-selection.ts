import { storyWorld } from './story-worlds';
import { roleSeed } from '../../src/core/story-role-binding';
import type { StoryFact } from '../../src/core/story-update';
import type { GameContextInput } from '../../src/core/game-context';

// Independent source prose and gold authored before the retrieval change.
export function repeatSelectionWorld(locale: 'ru'|'en', count=80, plot='beacon') {
  const base=storyWorld(locale,2), s=(ru:string,en:string)=>locale==='ru'?ru:en;
  base.entities[0]!.name=s('Ирис','Iris');base.entities[1]!.name=s('Лев','Lev');
  const topic=plot==='beacon'?s('сигнальный маяк','signal beacon'):s('театральный занавес','theatre curtain');
  const texts=[
    s(`Ирис обещала проверить предмет ${topic} только после разрешения директора и подписи Льва.`, `Iris promised to check the ${topic} only after the director gives permission and Lev signs.`),
    s(`Предмет ${topic}: питание восстановлено, но подписи Льва ещё нет. Проверка не начата.`, `The ${topic}: power has been restored but Lev has not signed. The check has not started.`),
    s(`Предмет ${topic}: синий конверт уже доставлен Льву; это отдельное выполненное поручение, не проверка предмета.`, `The ${topic}: the blue envelope has already been delivered to Lev; this is a separate completed duty, not the check.`),
    s(`Лев считает, что предмет ${topic} принадлежит директору; это не проверено.`, `Lev believes the ${topic} belongs to the director; this has not been verified.`),
    s(`Лев сказал: «Мы снова говорили о предмете ${topic}; узнали о дополнительном осмотре; ничего не предприняли; ничего не обещали».`, `Lev said: “We discussed the ${topic} again; we learned about another inspection; no actions were taken; no promises were made.”`),
    s(`Предмет ${topic}: прежний допуск отозван; нужен новый.`, `The ${topic}: the previous pass has been revoked; a new one is needed.`),
    s(`Лев обещал проверить предмет ${topic} только после звонка охраны, не после разрешения директора.`, `Lev promised to check the ${topic} only after the guard calls, not after the director gives permission.`),
  ];
  const facts:StoryFact[]=texts.map((text,i)=>({kind:i===0||i===6?'promise':i===3?'belief':'event',text,quote:text,
    ...(i===0||i===2||i===6?{task:{key:'duty-'+i,title:topic,status:i===2?'completed' as const:'open' as const}}:{}),
    ...(i===5?{claim:{key:'pass',value:'revoked',scope:'state' as const,lifetime:'persistent' as const}}:{}),
  }));
  // Alphabetic location variation is prose, not an ID/counter feature.
  const repeats:StoryFact[]=Array.from({length:count},(_,i)=>{
    const place=String.fromCharCode(97+Math.floor(i/26)%26,97+i%26);
    const text=s(`Лев сказал: «Мы снова говорили о предмете ${topic} у сектора ${place}; новых сведений не появилось; ничего не предприняли; ничего не обещали».`, `Lev said: “We discussed the ${topic} again by sector ${place}; no new information emerged; no actions were taken; no promises were made.”`);
    return {kind:'event',text,quote:text};
  });
  const all=[...facts,...repeats],sources=all.map((_,i)=>'repeat-selection-source-'+i);
  const person=(i:number)=>({id:base.entities[i]!.id,name:base.entities[i]!.name});
  const seeds=all.map((fact,i)=>roleSeed(fact,{version:1,sourceRevisionId:sources[i]!,quote:fact.quote,
    roles:i===0?{promisor:person(0)}:i===6?{promisor:person(1)}:i===3?{believer:person(1)}:i===2?{recipient:person(1)}:{speaker:person(1)},
  }));
  const input:GameContextInput={draft:s(`Что известно о предмете ${topic}?`,`What do we know about the ${topic}?`),recentMessages:repeats.slice(-2).map(f=>f.text),entries:[],books:[],entities:base.entities,worlds:[base.world],activeBookId:null,scene:{worldId:base.world.id,bookId:null,focusIds:[]},settings:{contextBudget:6000,relevanceThreshold:6},story:{world:base.world,chat:base.binding.chatId,branch:'repeat-selection',facts:all,sheetsEnabled:false,roleSeeds:seeds,episodeSources:sources}};
  return {base,input,facts,repeats,sources,seeds,topic,s};
}
