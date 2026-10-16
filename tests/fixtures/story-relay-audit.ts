import type {GameContextInput} from '../../src/core/game-context';
import type {Locale,SceneEntity,WorldProfile} from '../../src/core/types';
import type {StoryFact} from '../../src/core/story-update';
import {roleSeed} from '../../src/core/story-role-binding';

// RP303 authored before the first compiler invocation. No previous fixture/gold
// imports. The two settings, translations and repeated backgrounds are correlated.
interface Prose {names:string[];alias:string;records:Record<string,string>;queries:string[];bridge:string;raw:string;background:string[]}
const plots:{id:string;ru:Prose;en:Prose}[]=[{id:'winter-refuge',ru:{
 names:['Ада Лес','Ада Озеро','Борис','Эва'],alias:'Ада',records:{
 old:'Безопасный ночлег Ады Лес раньше устраивали в сторожке у перевала.',
 a0:'Я обещаю организовать безопасный ночлег Ады Лес лишь после согласия смотрителя и подтверждения свидетеля; до этого дверь жилого крыла не открывать.',
 a1:'Безопасный ночлег Ады Лес требует двух отдельных подтверждений; готовая постель не заменяет разрешение смотрителя.',
 a2:'Безопасный ночлег Ады Лес теперь организуют в каминном зале; сторожку у перевала закрыли.',
 a3:'Для безопасного ночлега Ады Лес свидетель уже подтвердил встречу, но смотритель ещё не согласился; Ада Лес пока остаётся снаружи.',
 b0:'Я обещаю организовать безопасный ночлег Ады Озеро, когда смотритель подтвердит свободное место.',
 b1:'Безопасный ночлег Ады Озеро относится к другой гостье, которая пришла со своей группой.',
 b2:'Безопасный ночлег Ады Озеро уже устроен, обещание выполнено; она заселилась в отдельную комнату.',
 b3:'Устроенный безопасный ночлег Ады Озеро не даёт согласия на размещение Ады Лес.',
 c0:'Я обещаю провести обход зимней тропы Бориса после выдачи фонаря; до обхода следы не затаптывать.',
 c1:'Обход зимней тропы Бориса нужен до прихода обозов; наличие фонаря не доказывает, что тропа проверена.',
 c2:'Обход зимней тропы Бориса в прежнем поручении отменён: Бориса освободили от этого обещания из-за травмы.',
 c3:'Я обещаю вместо Бориса провести обход зимней тропы Бориса после выдачи нового фонаря; это новое поручение Эвы.',
 c4:'Новый обход зимней тропы Бориса поручен Эве, но она ещё не вышла; отмена старого поручения не означает завершения нового.',
 d0:'Я обещаю не называть место укрытия беглеца без его личного согласия; разрешение принять гостя этого запрета не снимает.',
 d1:'Эва ненадолго разрешила читать закрытую гостевую книгу в своём присутствии.',
 d2:'Эва отозвала временное разрешение читать закрытую гостевую книгу; доступ к ней прекращён.',
 d3:'Место укрытия беглеца остаётся тайной; согласия на раскрытие нет, а доступ к гостевой книге не давал такого права.'
 },queries:[
 'Напомни все условия безопасного ночлега Ады Лес, нынешнее место и что ещё не выполнено.',
 'Постель-то давно застелили. Ну и как, с размещением нашей путницы вопрос уже решён?',
 'Как там с тем, что я обещал?',
 'Сперва устраиваю безопасный ночлег Ады Лес, затем иду в обход зимней тропы Бориса. Какие обязательства и запреты нужно учитывать?',
 'Безопасный ночлег Ады Озеро уже устроен. Значит, для безопасного ночлега Ады Лес тоже всё разрешено?',
 'Гостя разрешили принять. Теперь можно назвать место укрытия беглеца?',
 'Гостевую книгу раньше давали читать. Я всё ещё могу воспользоваться тем допуском?',
 'Обход зимней тропы Бориса отменили или просто передали Эве? Кто теперь должен идти и выполнено ли новое поручение?',
 'Что Борис обещал сделать для безопасного ночлега Ады Лес?',
 'Напомни обещание восстановить мост через Красный ручей.',
 'Что Ада обещала организовать?',
 'Как там с тем, что я обещал?'
 ],bridge:'Ада Лес уточнила: обещание из нашего разговора — организовать её безопасный ночлег. Ада Озеро подчеркнула, что её безопасный ночлег уже устроен и относится к отдельной гостье.',
 raw:'Непроверенный рассказчик говорит, будто наше обещание касалось восстановления моста через Красный ручей.',
 background:['Повар убрал пустые миски.','У коновязи переложили верёвку.','Дежурный пересчитал свечи.','Гонец высушил перчатки.','В зале поправили коврик.','Писарь проверил часы.']
 },en:{
 names:['Ada Forest','Ada Lake','Boris','Eva'],alias:'Ada',records:{
 old:'Ada Forest’s safe overnight stay used to be arranged in the pass watchhouse.',
 a0:'I promise to arrange Ada Forest’s safe overnight stay only after caretaker consent and witness confirmation; do not open the residential wing before then.',
 a1:'Ada Forest’s safe overnight stay needs two separate confirmations; a made bed does not replace caretaker permission.',
 a2:'Ada Forest’s safe overnight stay must now be arranged in the fireside hall; the pass watchhouse is closed.',
 a3:'For Ada Forest’s safe overnight stay the witness has confirmed the meeting, but the caretaker has not agreed; Ada Forest is still outside.',
 b0:'I promise to arrange Ada Lake’s safe overnight stay when the caretaker confirms a vacant place.',
 b1:'Ada Lake’s safe overnight stay concerns another guest who arrived with her own group.',
 b2:'Ada Lake’s safe overnight stay has been arranged and the promise fulfilled; she moved into a separate room.',
 b3:'Arranging Ada Lake’s safe overnight stay does not authorize accommodation for Ada Forest.',
 c0:'I promise to conduct Boris’s winter trail patrol after receiving a lantern; do not trample tracks before the patrol.',
 c1:'Boris’s winter trail patrol is needed before the wagons arrive; having a lantern does not prove the trail was checked.',
 c2:'Boris’s winter trail patrol under the former assignment was cancelled: Boris was released from his promise because of injury.',
 c3:'I promise to conduct Boris’s winter trail patrol in his place after receiving a new lantern; this is Eva’s new assignment.',
 c4:'The new Boris’s winter trail patrol is assigned to Eva, but she has not set out; cancelling the old assignment does not complete the new one.',
 d0:'I promise not to name the fugitive’s hiding place without personal consent; permission to admit a guest does not lift this restriction.',
 d1:'Eva briefly permitted reading the closed guest book in her presence.',
 d2:'Eva withdrew temporary permission to read the closed guest book; access has ended.',
 d3:'The fugitive’s hiding place remains secret and consent to disclose it is absent; guest book access never granted that right.'
 },queries:[
 'Remind me of every condition for Ada Forest’s safe overnight stay, the current place and what remains unfulfilled.',
 'The bed has been made for ages. So, is putting our traveller up all sorted now?',
 'How is the thing I gave my word about coming along?',
 'First I arrange Ada Forest’s safe overnight stay, then I start Boris’s winter trail patrol. Which obligations and prohibitions must I account for?',
 'Ada Lake’s safe overnight stay has been arranged. Does that mean Ada Forest’s safe overnight stay is authorized too?',
 'Admitting the guest was allowed. May I now name the fugitive’s hiding place?',
 'They let us read the guest book before. May I still use that clearance?',
 'Was Boris’s winter trail patrol cancelled or reassigned to Eva? Who must go now and is the new assignment fulfilled?',
 'What did Boris promise to do for Ada Forest’s safe overnight stay?',
 'Remind me of the promise to rebuild the Red Brook bridge.',
 'What did Ada promise to arrange?',
 'How is the thing I gave my word about coming along?'
 ],bridge:'Ada Forest clarified: the promise in our conversation was to arrange her safe overnight stay. Ada Lake stressed that her safe overnight stay is already arranged and concerns a separate guest.',
 raw:'An unverified narrator says our promise concerned rebuilding the Red Brook bridge.',
 background:['The cook put away empty bowls.','A rope was moved by the hitching post.','The watch counted candles.','A messenger dried gloves.','Someone straightened the hall mat.','The clerk checked the clock.']
 }},{id:'regatta-drill',ru:{
 names:['Ада Волна','Ада Парус','Борис','Эва'],alias:'Ада',records:{
 old:'Учебную тревогу Ады Волна раньше проводили в открытой бухте.',
 a0:'Я обещаю провести учебную тревогу Ады Волна только после подписи капитана и проверки связи; до этого аварийную сирену не включать.',
 a1:'Учебная тревога Ады Волна требует подписи капитана и проверки связи по отдельности; расстановка экипажа не даёт разрешения на запуск.',
 a2:'Учебную тревогу Ады Волна теперь проводят у внутреннего причала; открытую бухту исключили из плана.',
 a3:'Для учебной тревоги Ады Волна связь уже проверена, но подписи капитана пока нет; сирена ещё не звучала.',
 b0:'Я обещаю провести учебную тревогу Ады Парус, когда инструктор соберёт её экипаж.',
 b1:'Учебная тревога Ады Парус назначена другому экипажу и не является тренировкой Ады Волна.',
 b2:'Учебная тревога Ады Парус проведена, её обещание выполнено; инструктор закрыл ведомость этого экипажа.',
 b3:'Завершённая учебная тревога Ады Парус не заменяет подпись капитана для тренировки Ады Волна.',
 c0:'Я обещаю организовать учебный заплыв Бориса после осмотра спасательного жилета; до осмотра в воду не заходить.',
 c1:'Учебный заплыв Бориса требует записи в отдельной ведомости; готовый жилет не означает, что заплыв состоялся.',
 c2:'Учебный заплыв Бориса по старому поручению отменён; Борис освобождён от данного обещания из-за болезни.',
 c3:'Я обещаю вместо Бориса организовать учебный заплыв Бориса после осмотра другого жилета; это новое поручение Эвы.',
 c4:'Новый учебный заплыв Бориса организует Эва; она ещё не начала, отмена поручения Бориса не закрывает её новую задачу.',
 d0:'Я обещаю не сообщать запасную частоту без согласия начальника связи; разрешение начать тренировку не отменяет секретность.',
 d1:'Эва временно разрешила просматривать запечатанную таблицу позывных в рубке.',
 d2:'Эва отозвала временное разрешение просматривать запечатанную таблицу позывных; допуск прекращён.',
 d3:'Запасная частота остаётся закрытой; согласия начальника связи нет, просмотр позывных никогда не разрешал разглашать частоту.'
 },queries:[
 'Какие условия остались для учебной тревоги Ады Волна, где она должна пройти и был ли запуск?',
 'Народ уже по местам, рации шуршат. Ну что, с этой репетицией опасности можно считать всё улаженным?',
 'Чем кончилась та наша условленность?',
 'Сначала запускаю учебную тревогу Ады Волна, после этого организую учебный заплыв Бориса. Что из договорённостей ещё мешает этим действиям?',
 'Учебная тревога Ады Парус уже прошла. Значит, учебную тревогу Ады Волна тоже можно запускать без ожидания?',
 'Тренировку разрешили начать. Можно ли теперь сообщить запасную частоту?',
 'Таблицу позывных ведь раньше открывали для нас. Тот допуск ещё действителен?',
 'Учебный заплыв Бориса отменён окончательно или теперь за него отвечает Эва? Новое поручение уже выполнено?',
 'Что Борис обещал сделать для учебной тревоги Ады Волна?',
 'Что с обещанием заказать оранжевый спасательный плот?',
 'Что Ада обещала провести?',
 'Чем кончилась та наша условленность?'
 ],bridge:'Ада Волна напомнила: наша условленность касается её учебной тревоги. Ада Парус пояснила, что её учебная тревога относится к другому экипажу и уже завершена.',
 raw:'Непроверенный рассказчик отнёс нашу условленность к заказу оранжевого спасательного плота.',
 background:['Матрос свернул сухой трос.','Судья пересчитал флажки.','На берегу убрали пустые кружки.','Повар записал число обедов.','Механик закрыл ящик с болтами.','Секретарь выровнял стопку бланков.']
 },en:{
 names:['Ada Wave','Ada Sail','Boris','Eva'],alias:'Ada',records:{
 old:'Ada Wave’s emergency drill used to take place in the open bay.',
 a0:'I promise to conduct Ada Wave’s emergency drill only after captain signature and a radio check; do not sound the emergency siren before then.',
 a1:'Ada Wave’s emergency drill needs captain signature and a radio check separately; assembling the crew does not authorize starting it.',
 a2:'Ada Wave’s emergency drill must now take place at the inner quay; the open bay was removed from the plan.',
 a3:'For Ada Wave’s emergency drill the radio check is done, but captain signature is still missing; the siren has not sounded.',
 b0:'I promise to conduct Ada Sail’s emergency drill when the instructor gathers her crew.',
 b1:'Ada Sail’s emergency drill belongs to another crew and is not Ada Wave’s training.',
 b2:'Ada Sail’s emergency drill has taken place and her promise is fulfilled; the instructor closed that crew’s register.',
 b3:'Completing Ada Sail’s emergency drill does not replace captain signature for Ada Wave’s training.',
 c0:'I promise to organize Boris’s training swim after lifejacket inspection; do not enter the water before inspection.',
 c1:'Boris’s training swim needs its own register entry; a ready lifejacket does not mean the swim happened.',
 c2:'Boris’s training swim under the old assignment was cancelled; Boris was released from his promise because of illness.',
 c3:'I promise to organize Boris’s training swim in his place after inspecting a different lifejacket; this is Eva’s new assignment.',
 c4:'Eva organizes the new Boris’s training swim; she has not started, and cancelling Boris’s assignment does not close her new task.',
 d0:'I promise not to disclose the reserve frequency without communications chief consent; permission to start training does not lift secrecy.',
 d1:'Eva temporarily permitted viewing the sealed call-sign table in the cabin.',
 d2:'Eva revoked temporary permission to view the sealed call-sign table; clearance has ended.',
 d3:'The reserve frequency remains confidential and chief consent is absent; viewing call signs never permitted disclosing the frequency.'
 },queries:[
 'Which conditions remain for Ada Wave’s emergency drill, where should it happen, and has it started?',
 'Everyone is in position and the radios crackle. So is that pretend-danger exercise all squared away?',
 'Whatever became of that understanding of ours?',
 'First I start Ada Wave’s emergency drill, afterwards I organize Boris’s training swim. Which agreements still stand in the way of those actions?',
 'Ada Sail’s emergency drill has already happened. Does that mean Ada Wave’s emergency drill may start without waiting too?',
 'Starting training was allowed. May we now disclose the reserve frequency?',
 'They used to open the call-sign table for us. Is that clearance still in force?',
 'Is Boris’s training swim cancelled for good or is Eva responsible now? Has the new assignment been fulfilled?',
 'What did Boris promise to do for Ada Wave’s emergency drill?',
 'What about the promise to order an orange rescue raft?',
 'What did Ada promise to conduct?',
 'Whatever became of that understanding of ours?'
 ],bridge:'Ada Wave recalled that our understanding concerns her emergency drill. Ada Sail explained that her emergency drill belongs to another crew and is already finished.',
 raw:'An unverified narrator associated our understanding with ordering an orange rescue raft.',
 background:['A sailor coiled a dry rope.','The judge counted flags.','Empty mugs were cleared ashore.','The cook recorded meal numbers.','The mechanic closed a box of bolts.','The secretary straightened blank forms.']
 }}];
export const relayFamilies=['explicit','paraphrase','accepted-reference','compound-sequence','partial-condition','negative-duty','revoked-access','replacement-task','wrong-promisor','unknown-work','ambiguous-name','raw-only-reference'] as const;
const A=['a0','a1','a2','a3'],B=['b1','b2','b3'],C=['c1','c2','c3','c4'];
const gold=[A,A,[...A,...B],[...A,...C],[...A,'b3'],['d0','d3'],['d2'],C,[],[],[],[]];
export function relayWorld(locale:Locale,plotIndex:number,noiseCount:number,variant:number){
 const plot=plots[plotIndex]!,p=plot[locale],worldId='rp303-'+plot.id+'-'+locale;
 const world:WorldProfile={id:worldId,name:'RP303 '+plot.id,description:'',color:'#41746c',contextBudget:16000,relevanceThreshold:6,createdAt:1,updatedAt:1};
 const entities:SceneEntity[]=p.names.map((name,i)=>({id:worldId+'-p'+i,worldId,kind:'character',name,description:'',aliases:i<2?[p.alias]:[],memberIds:[],createdAt:1,updatedAt:1}));
 const ids:string[]=[],facts:StoryFact[]=[],owners:number[]=[];
 const add=(id:string,text:string,owner:number,extra:Partial<StoryFact>={})=>{ids.push(id);facts.push({kind:'event',text,quote:text,...extra});owners.push(owner);};
 const record=(id:string)=>{
  const text=p.records[id]!,owner=id.startsWith('b')?1:id==='c3'||id==='c4'||id.startsWith('d')&&id!=='d0'?3:id.startsWith('c')?2:0;
  const task=['a0','b0','b2','c0','c2','c3','d0'].includes(id);
  add(id,text,owner,task?{kind:id==='b2'||id==='c2'?'event':'promise',task:{key:worldId+'-task-'+(id==='c3'?'replacement':id[0]),title:id==='c3'?text:p.records[id[0]+'0']!,status:id==='b2'?'completed':id==='c2'?'cancelled':'open'}}:id==='old'||id==='a2'?{claim:{key:worldId+'-place',value:text,scope:'state',lifetime:'persistent'}}:id==='d1'||id==='d2'?{claim:{key:worldId+'-clearance',value:text,scope:'state',lifetime:'scene',status:id==='d1'?'active':'ended',...(id==='d2'?{transition:'progress' as const}:{})}}:{});
 };
 let cursor=0;const noise=(to:number)=>{for(;cursor<to;cursor++)add('background-'+cursor,`${locale==='ru'?'Журнал':'Log'} ${cursor}. ${p.background[(cursor+Math.floor(cursor/11))%6]}`,cursor%4);};
 noise(Math.floor(noiseCount*.07));['old',...A].forEach(record);
 noise(Math.floor(noiseCount*.29));['b0',...B].forEach(record);
 noise(Math.floor(noiseCount*.63));['c0',...C].forEach(record);
 noise(Math.floor(noiseCount*.87));['d0','d1','d2','d3'].forEach(record);noise(noiseCount);
 const latest=variant===2?p.bridge:locale==='ru'?'Участники обсуждают ужин и расклад дежурств.':'The group discusses dinner and the watch roster.';
 add('latest',latest,0);
 const sources=facts.map((_,i)=>worldId+'-revision-'+i),roleSeeds=facts.map((f,i)=>{const person=entities[owners[i]!]!,bound={id:person.id,name:person.name};return roleSeed(f,{version:1,sourceRevisionId:sources[i]!,quote:f.quote,roles:{speaker:bound,...(f.task?{promisor:bound}:{})}});});
 const input:GameContextInput={draft:p.queries[variant]!,recentMessages:[variant===11?p.raw:latest],entries:[],books:[],entities,worlds:[world],activeBookId:null,scene:{worldId,bookId:null,focusIds:[]},settings:{contextBudget:16000,relevanceThreshold:6},story:{world,chat:worldId+'-chat',branch:worldId+'-branch',facts,sheetsEnabled:false,roleSeeds,episodeSources:sources}};
 return {input,ids,sources,locale,noiseCount,plotId:plot.id};
}
export function relayScenarios(){
 const main=(['ru','en'] as const).flatMap(locale=>plots.flatMap((_,pi)=>relayFamilies.map((family,i)=>({...relayWorld(locale,pi,2200,i),id:`${locale}:${pi}:${family}`,family,gold:{wanted:[...gold[i]!],score:i<8,uncertainty:i===1||i===2||i>=8,control:i>=8,budget:false}}))));
 const scale=(['ru','en'] as const).flatMap(locale=>plots.flatMap((_,pi)=>[900,8200].map(n=>({...relayWorld(locale,pi,n,3),id:`${locale}:${pi}:scale:${n}`,family:'scale',gold:{wanted:[...A,...C],score:true,uncertainty:false,control:false,budget:false}}))));
 const budget=(['ru','en'] as const).flatMap(locale=>plots.flatMap((_,pi)=>[1000,4200].map(limit=>{const c=relayWorld(locale,pi,2200,3);c.input.settings.contextBudget=limit;c.input.story!.world.contextBudget=limit;return {...c,id:`${locale}:${pi}:budget:${limit}`,family:'budget',gold:{wanted:[...A,...C],score:false,uncertainty:false,control:false,budget:true}};})));
 return [...main,...scale,...budget];
}
