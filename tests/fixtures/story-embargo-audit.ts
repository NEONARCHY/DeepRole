import type {GameContextInput} from '../../src/core/game-context';
import type {Locale,SceneEntity,WorldProfile} from '../../src/core/types';
import type {StoryFact} from '../../src/core/story-update';
import {roleSeed} from '../../src/core/story-role-binding';

// RP301: authored from scratch before running the compiler. Gold is source IDs,
// never copied from compiler output. Translations and repeated noise are correlated.
const prose={ru:{names:['Нина Север','Нина Юг','Марк','Илья'],alias:'Нина',records:{
 old:'Архив наблюдений Нины Север раньше публиковали на открытом портале.',
 a0:'Я обещаю опубликовать архив наблюдений Нины Север только после подписи этического совета и снятия эмбарго; до этого не раскрывать координаты гнёзд.',
 a1:'Архив наблюдений Нины Север содержит координаты гнёзд; контрольная сумма не заменяет подпись этического совета.',
 a2:'Архив наблюдений Нины Север теперь публикуют в закрытом исследовательском хранилище, открытый портал больше не используется.',
 a3:'Архив наблюдений Нины Север проверен и загружен в черновик, но публикация не состоялась; эмбарго не снято, подпись совета не получена.',
 b0:'Я обещаю опубликовать архив наблюдений Нины Юг после согласования руководителя.',
 b1:'Архив наблюдений Нины Юг относится к отдельному исследованию без координат гнёзд.',
 b2:'Архив наблюдений Нины Юг опубликован после согласования руководителя; работа завершена.',
 b3:'Публикация архива наблюдений Нины Юг не снимает эмбарго с исследования Нины Север.',
 c0:'Я обещаю подготовить публичную выставку снимков Марка, если владельцы дадут письменное согласие; лица участников до согласия не показывать.',
 c1:'Снимки Марка подготовлены в низком разрешении; уменьшение размера не является согласием владельцев.',
 c2:'Публичную выставку снимков Марка отменили; обещание подготовить её отменено, согласия владельцев нет.',
 c3:'Отмена публичной выставки снимков Марка не разрешает показывать лица участников.',
 d0:'Я обещаю не разглашать имена волонтёров до их личного согласия; разрешение на просмотр архива к именам не относится.',
 d1:'Илья временно разрешил просматривать закрытый архив наблюдений на терминале станции.',
 d2:'Илья отозвал разрешение просматривать закрытый архив наблюдений на терминале станции; доступ больше не разрешён.',
 d3:'Имена волонтёров остаются закрытыми, личного согласия ещё нет; отозванный доступ к архиву не давал права на публикацию.',
 e0:'Нина Север считает, что подпись совета уже получена, но это её предположение: подтверждающего документа никто не видел.'
 },queries:[
 'Какие условия у публикации архива наблюдений Нины Север, куда его публикуют и выполнено ли обещание?',
 'Контрольная сумма сошлась, значит те материалы о птицах уже можно выложить или ещё рано?',
 'Что с той договорённостью?',
 'Публикую архив наблюдений Нины Север и показываю снимки Марка на выставке. Какие условия и запреты ещё важны?',
 'Нина Север думает, что подпись есть. Архив наблюдений Нины Север уже разрешено публиковать?',
 'Можно ли разгласить имена волонтёров после публикации другого архива?',
 'Закрытый архив раньше разрешали просматривать на терминале. Разрешение ещё действует?',
 'Что с публикацией архива наблюдений Нины Юг, выполнена ли она и снимает ли эмбарго с другого исследования?',
 'Что стало с обещанием подготовить публичную выставку снимков Марка и можно ли теперь показывать лица?',
 'Что Марк обещал сделать с архивом наблюдений Нины Север?',
 'Что с обещанием оцифровать журнал приливов?',
 'Что Нина обещала опубликовать?',
 'Что с той договорённостью?',
 'Что с той договорённостью?'
 ],bridge:'Нина Север пояснила: та договорённость — публикация её архива наблюдений. Нина Юг напомнила, что публикация её архива наблюдений уже закончена и это другое исследование.',
 raw:'Непроверенный рассказчик утверждает, что та договорённость касается оцифровки журнала приливов.',
 tail:'Затем обсуждали ещё одну неназванную договорённость неизвестного стажёра.',
 background:['Лаборант пересчитал пустые пробирки.','На причале проверили верёвки.','В столовой переставили чашки.','Метеоролог записал температуру воздуха.']
 },en:{names:['Nina North','Nina South','Mark','Ilya'],alias:'Nina',records:{
 old:'Nina North’s observation archive used to be published on the public portal.',
 a0:'I promise to publish Nina North’s observation archive only after ethics council signature and embargo release; do not disclose nest coordinates before then.',
 a1:'Nina North’s observation archive contains nest coordinates; a checksum does not replace ethics council signature.',
 a2:'Nina North’s observation archive must now be published in the restricted research repository; the public portal is no longer used.',
 a3:'Nina North’s observation archive was checked and uploaded as a draft, but publication has not happened; the embargo remains and council signature is missing.',
 b0:'I promise to publish Nina South’s observation archive after supervisor approval.',
 b1:'Nina South’s observation archive belongs to a separate study without nest coordinates.',
 b2:'Nina South’s observation archive was published after supervisor approval; the job is complete.',
 b3:'Publication of Nina South’s observation archive does not lift the embargo on Nina North’s study.',
 c0:'I promise to prepare a public exhibition of Mark’s photographs if the owners provide written consent; do not show participants’ faces before consent.',
 c1:'Mark’s photographs were prepared at low resolution; reducing size is not owner consent.',
 c2:'The public exhibition of Mark’s photographs was cancelled; the promise to prepare it was cancelled and the owners have not consented.',
 c3:'Cancellation of the public exhibition of Mark’s photographs does not permit showing participants’ faces.',
 d0:'I promise not to disclose volunteer names until they personally consent; archive viewing permission does not cover names.',
 d1:'Ilya temporarily permitted viewing the restricted observation archive on the station terminal.',
 d2:'Ilya withdrew permission to view the restricted observation archive on the station terminal; access is no longer permitted.',
 d3:'Volunteer names remain confidential and personal consent is absent; withdrawn archive access never granted publication rights.',
 e0:'Nina North believes council signature has already been obtained, but this is her assumption: nobody has seen a confirming document.'
 },queries:[
 'What conditions apply to publishing Nina North’s observation archive, where should it be published, and is the promise fulfilled?',
 'The checksum matches, so may we put those bird materials online already, or is it too early?',
 'What about that arrangement?',
 'I publish Nina North’s observation archive and show Mark’s photographs at the exhibition. Which conditions and prohibitions still matter?',
 'Nina North thinks the signature exists. Is publishing Nina North’s observation archive permitted already?',
 'May we disclose volunteer names after publication of the other archive?',
 'Viewing the restricted archive on the terminal used to be allowed. Is permission still valid?',
 'What about publication of Nina South’s observation archive, is it complete and does it lift the other study’s embargo?',
 'What happened to the promise to prepare a public exhibition of Mark’s photographs, and may we show faces now?',
 'What did Mark promise to do with Nina North’s observation archive?',
 'What about the promise to digitize the tide log?',
 'What did Nina promise to publish?',
 'What about that arrangement?',
 'What about that arrangement?'
 ],bridge:'Nina North clarified: that arrangement means publication of her observation archive. Nina South recalled that publication of her observation archive is already finished and belongs to another study.',
 raw:'An unverified narrator claims that arrangement concerns digitizing the tide log.',
 tail:'Then they discussed another unnamed arrangement belonging to an unknown intern.',
 background:['The technician counted empty test tubes.','Someone checked the ropes at the pier.','Cups were rearranged in the canteen.','The meteorologist recorded air temperature.']
 }};
export const embargoFamilies=['explicit','paraphrase','accepted-reference','compound','belief-not-permission','negative-duty','revoked-permission','other-owner-completed','cancelled-work','wrong-promisor','nonexistent-work','ambiguous-name','raw-only-reference','unknown-tail'] as const;
const A=['a0','a1','a2','a3'],B=['b1','b2','b3'],C=['c1','c2','c3'];
const gold=[A,A,[...A,...B],[...A,...C],[...A,'e0'],['d0','d3'],['d2'],B,C,[],[],[],[],[]];
export function embargoWorld(locale:Locale,noiseCount:number,variant:number){
 const p=prose[locale],worldId='rp301-station-'+locale;
 const world:WorldProfile={id:worldId,name:'RP301 station',description:'',color:'#457181',contextBudget:16000,relevanceThreshold:6,createdAt:1,updatedAt:1};
 const entities:SceneEntity[]=p.names.map((name,i)=>({id:worldId+'-p'+i,worldId,kind:'character',name,description:'',aliases:i<2?[p.alias]:[],memberIds:[],createdAt:1,updatedAt:1}));
 const ids:string[]=[],facts:StoryFact[]=[],owners:number[]=[];
 const add=(id:string,text:string,owner:number,extra:Partial<StoryFact>={})=>{ids.push(id);facts.push({kind:'event',text,quote:text,...extra});owners.push(owner);};
 const record=(id:string)=>{
  const text=p.records[id as keyof typeof p.records],owner=id.startsWith('b')?1:id.startsWith('c')?2:id.startsWith('d')&&id!=='d0'?3:0;
  const task=['a0','b0','b2','c0','c2','d0'].includes(id);
  add(id,text,owner,task?{kind:id==='b2'||id==='c2'?'event':'promise',task:{key:worldId+'-task-'+id[0],title:p.records[(id[0]+'0') as keyof typeof p.records],status:id==='b2'?'completed':id==='c2'?'cancelled':'open'}}:id==='old'||id==='a2'?{claim:{key:worldId+'-destination',value:text,scope:'state',lifetime:'persistent'}}:id==='d1'||id==='d2'?{claim:{key:worldId+'-permission',value:text,scope:'state',lifetime:'scene',status:id==='d1'?'active':'ended',...(id==='d2'?{transition:'progress' as const}:{})}}:id==='e0'?{kind:'belief'}:{});
 };
 let cursor=0;const noise=(to:number)=>{for(;cursor<to;cursor++)add('background-'+cursor,`${locale==='ru'?'Запись':'Record'} ${cursor}. ${p.background[cursor%4]}`,cursor%4);};
 noise(Math.floor(noiseCount*.08));['old',...A].forEach(record);
 noise(Math.floor(noiseCount*.32));['b0',...B].forEach(record);
 noise(Math.floor(noiseCount*.61));['c0',...C].forEach(record);
 noise(Math.floor(noiseCount*.83));['d0','d1','d2','d3','e0'].forEach(record);noise(noiseCount);
 const latest=[2,13].includes(variant)?p.bridge:locale==='ru'?'Сотрудники обсуждают ужин и погоду.':'The staff discuss dinner and weather.';
 add('latest',latest,0);
 const sources=facts.map((_,i)=>worldId+'-revision-'+i);
 const roleSeeds=facts.map((f,i)=>{const person=entities[owners[i]!]!;const bound={id:person.id,name:person.name};return roleSeed(f,{version:1,sourceRevisionId:sources[i]!,quote:f.quote,roles:{speaker:bound,...(f.task?{promisor:bound}:{}),...(f.kind==='belief'?{believer:bound}:{})}});});
 const input:GameContextInput={draft:p.queries[variant]!,recentMessages:[variant===12?p.raw:variant===13?latest+' '+p.tail:latest],entries:[],books:[],entities,worlds:[world],activeBookId:null,scene:{worldId,bookId:null,focusIds:[]},settings:{contextBudget:16000,relevanceThreshold:6},story:{world,chat:worldId+'-chat',branch:worldId+'-branch',facts,sheetsEnabled:false,roleSeeds,episodeSources:sources}};
 return {input,ids,sources,locale,noiseCount,plotId:'island-research-station'};
}
export function embargoScenarios(){
 const main=(['ru','en'] as const).flatMap(locale=>embargoFamilies.map((family,i)=>({...embargoWorld(locale,1800,i),id:`${locale}:${family}`,family,gold:{wanted:[...gold[i]!],score:i<9,uncertainty:i===1||i===2||i>=9,control:i>=9,budget:false}})));
 const scale=(['ru','en'] as const).flatMap(locale=>[700,3200,9000].map(n=>({...embargoWorld(locale,n,3),id:`${locale}:scale:${n}`,family:'scale',gold:{wanted:[...A,...C],score:true,uncertainty:false,control:false,budget:false}})));
 const budget=(['ru','en'] as const).flatMap(locale=>[900,3000,6000].map(limit=>{const c=embargoWorld(locale,1800,3);c.input.settings.contextBudget=limit;c.input.story!.world.contextBudget=limit;return {...c,id:`${locale}:budget:${limit}`,family:'budget',gold:{wanted:[...A,...C],score:false,uncertainty:false,control:false,budget:true}};}));
 return [...main,...scale,...budget];
}
