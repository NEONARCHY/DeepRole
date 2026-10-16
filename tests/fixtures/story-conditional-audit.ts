import type {GameContextInput} from '../../src/core/game-context';
import type {Locale,SceneEntity,WorldProfile} from '../../src/core/types';
import type {StoryFact} from '../../src/core/story-update';
import {roleSeed} from '../../src/core/story-role-binding';

// RP297 fresh prose and manual gold, no previous fixtures/search/scorer imports.
interface Prose {names:string[];alias:string;records:Record<string,string>;queries:string[];bridge:string;raw:string;tail:string;background:string[]}
const plots:{id:string;ru:Prose;en:Prose}[]=[
 {id:'volcanic-post',ru:{names:['Алина Север','Алина Юг','Рина','Марсель'],alias:'Алина',records:{
  old:'Красный штормовой фонарь для Алины Север раньше выдавали на восточном пирсе.',
  a0:'Если пеплопад прекратится и смотритель подпишет журнал, доставлю красный штормовой фонарь Алине Север; защитную сетку не снимать.',
  a1:'Красный штормовой фонарь для Алины Север хранится в железном ящике; ключ выдаёт смотритель, не курьер.',
  a2:'Красный штормовой фонарь для Алины Север теперь принимают в каменном ангаре; восточный пирс закрыт.',
  a3:'Красный штормовой фонарь для Алины Север упакован, но курьер ещё не вышел и получательница его не видела.',
  b0:'После сверки накладной берусь доставить красный штормовой фонарь Алине Юг.',
  b1:'Красный штормовой фонарь для Алины Юг был на западном складе; восточный ящик относится к другому фонарю.',
  b2:'Красный штормовой фонарь для Алины Юг передан ей лично; накладная подписана, доставка завершена.',
  b3:'Доставка красного штормового фонаря Алине Юг завершена, но это не разрешает снимать сетку с фонаря Алины Север.',
  c0:'Как только высохнет изоляция, беру на себя проверку запасного красного штормового фонаря Рины; испытывать только на холостом ходу.',
  c1:'Запасной красный штормовой фонарь Рины находится в ремонтной клети, а не в ящике смотрителя.',
  c2:'Запасной красный штормовой фонарь Рины перенесли на сухой стенд; старый испытательный стол разобран.',
  c3:'Запасной красный штормовой фонарь Рины просушен снаружи, но изоляция ещё влажная и испытаний не было.',
  d0:'Я обещаю не называть получательницу тайного пакета до заседания совета; доставка фонарей не снимает этот запрет.',
  d1:'Марсель временно разрешил фотографировать опечатанный пакет снаружи.',
  d2:'Марсель отозвал разрешение фотографировать пакет; временное разрешение больше не действует.',
  d3:'Имя получательницы пакета остаётся тайной; отозванное разрешение на фото не разрешает вскрывать пакет.',
 },queries:[
  'При каких условиях доставят красный штормовой фонарь Алине Север, куда и передан ли он уже?',
  'Как там дела с той красной штукой для шторма: раз завернули, её уже можно считать доставленной?',
  'Я достаю красный штормовой фонарь и проверяю запасной; напомни оба набора ограничений.',
  'Напомни о том обещании.','Вернёмся к тому, на чём сошлись: что нас ещё сдерживает?',
  'Где сейчас запасной красный штормовой фонарь Рины, высохла ли изоляция и можно ли испытывать?',
  'Доставку другого фонаря закончили. Можно теперь назвать получательницу тайного пакета?',
  'Фото пакета раньше разрешали — это разрешение ещё действует и можно ли его вскрыть?',
  'Что Рина обещала сделать с красным штормовым фонарём Алины Север?',
  'Что с обещанием доставить белый приливный колокольчик?',
  'Напомни о том обещании.','Напомни о том обещании.','Что Алина обещала доставить?',
 ],bridge:'Алина Север напомнила: то обещание про красный штормовой фонарь. Алина Юг пояснила, что её красный штормовой фонарь — другой экземпляр, уже полученный лично.',
 raw:'Непроверенный рассказчик утверждал, что то обещание касается белого приливного колокольчика.',tail:'Затем вспомнили другое неназванное обещание неизвестного путешественника.',
 background:['Почтальон пересчитал пустые мешки.','На крыше смахнули пепел.','Повар переставил чайник.','Дежурный проверил скамейки.']},
 en:{names:['Alina North','Alina South','Rina','Marcel'],alias:'Alina',records:{
  old:'The red storm lantern for Alina North used to be collected at the east pier.',
  a0:'If the ashfall stops and the keeper signs the log, I will deliver the red storm lantern to Alina North; leave its protective mesh on.',
  a1:'The red storm lantern for Alina North is in an iron chest; the keeper, not the courier, issues the key.',
  a2:'The red storm lantern for Alina North must now go to the stone hangar; the east pier is closed.',
  a3:'The red storm lantern for Alina North is wrapped, but the courier has not departed and its recipient has not seen it.',
  b0:'After checking the waybill, I undertake delivery of the red storm lantern to Alina South.',
  b1:'The red storm lantern for Alina South was in the western store; the east chest belongs to a different lantern.',
  b2:'The red storm lantern for Alina South was handed to her personally; the waybill is signed and delivery completed.',
  b3:'Delivery of the red storm lantern to Alina South is complete, but that does not permit removing mesh from Alina North’s lantern.',
  c0:'Once insulation dries, I take responsibility for checking Rina’s spare red storm lantern; test it only without load.',
  c1:'Rina’s spare red storm lantern is in the repair cage, not the keeper’s chest.',
  c2:'Rina’s spare red storm lantern was moved to the dry bench; the old test table was dismantled.',
  c3:'Rina’s spare red storm lantern is dry outside, but its insulation is still wet and no test has been performed.',
  d0:'I promise not to name the secret parcel’s recipient until the council meeting; delivering lanterns does not lift this restriction.',
  d1:'Marcel temporarily allowed photographs of the sealed parcel’s exterior.',
  d2:'Marcel withdrew permission to photograph the parcel; that temporary permission is no longer in force.',
  d3:'The parcel’s recipient remains confidential; withdrawn photo permission does not permit opening the parcel.',
 },queries:[
  'Under what conditions will the red storm lantern reach Alina North, where must it go, and has she received it?',
  'How are things with that red storm gadget: wrapping done means delivery done, doesn’t it?',
  'I take the red storm lantern and inspect the spare one; remind me of both sets of restrictions.',
  'Remind me of that promise.','Back to what we settled on: what is still holding us back?',
  'Where is Rina’s spare red storm lantern now, is its insulation dry, and may it be tested?',
  'The other lantern was delivered. May we name the secret parcel’s recipient now?',
  'Taking photos of the parcel used to be allowed. Is that permission still valid, and may it be opened?',
  'What did Rina promise to do with Alina North’s red storm lantern?',
  'What about the promise to deliver the white tidal bell?',
  'Remind me of that promise.','Remind me of that promise.','What did Alina promise to deliver?',
 ],bridge:'Alina North recalled that promise concerns the red storm lantern. Alina South explained that her red storm lantern is a separate specimen she has already received personally.',
 raw:'An unverified narrator claimed that promise concerns the white tidal bell.',tail:'Then another unnamed promise of an unknown traveller came up.',
 background:['The post worker counted empty sacks.','Ash was brushed off the roof.','The cook moved a kettle.','The attendant checked benches.']}},
 {id:'mountain-observatory',ru:{names:['Вера Лунная','Вера Звёздная','Нелли','Дамир'],alias:'Вера',records:{
  old:'Синий спектральный фильтр для Веры Лунной раньше принимали в нижнем павильоне.',
  a0:'Когда купол остынет и инженер подтвердит герметичность, отвечаю за установку синего спектрального фильтра Веры Лунной; заводскую рамку не разбирать.',
  a1:'Синий спектральный фильтр Веры Лунной заперт в теплоизолированном сейфе; код выдаёт инженер, а не наблюдатель.',
  a2:'Синий спектральный фильтр Веры Лунной теперь устанавливают в верхней башне; нижний павильон недоступен.',
  a3:'Синий спектральный фильтр Веры Лунной подняли к куполу, но его не закрепили и проверку герметичности не закончили.',
  b0:'После приёмки оптики обязуюсь установить синий спектральный фильтр Веры Звёздной.',
  b1:'Синий спектральный фильтр Веры Звёздной был в соседней башне; сейф Лунной к нему не относится.',
  b2:'Синий спектральный фильтр Веры Звёздной закреплён и принят комиссией; обязательство по установке выполнено.',
  b3:'Монтаж синего спектрального фильтра Веры Звёздной завершён, но рамку фильтра Веры Лунной разбирать по-прежнему нельзя.',
  c0:'После проверки покрытия ручаюсь за настройку малого синего спектрального фильтра Нелли; не направлять на него прямой солнечный свет.',
  c1:'Малый синий спектральный фильтр Нелли находится в чёрном кофре, а не в инженерном сейфе.',
  c2:'Малый синий спектральный фильтр Нелли теперь настраивают в лаборатории под куполом; прежний стол разобран.',
  c3:'Малый синий спектральный фильтр Нелли распаковали, но покрытие ещё не проверено и настройку не начинали.',
  d0:'Я обещаю не разглашать имя автора сигнала до заседания; завершённый монтаж не отменяет секретность.',
  d1:'Дамир временно разрешил снимать внешний вид закрытого журнала наблюдений.',
  d2:'Дамир отменил разрешение на съёмку журнала; временное разрешение больше не действует.',
  d3:'Имя автора сигнала остаётся закрытым; отменённое разрешение на съёмку не даёт права читать журнал.',
 },queries:[
  'Что требуется перед установкой синего спектрального фильтра Веры Лунной, где это делают и установлен ли он?',
  'Ну что там с той синей штукой для спектра — её подняли наверх, значит монтаж можно закрывать?',
  'Я беру синий спектральный фильтр и настраиваю малый; вспомни условия обеих работ.',
  'А что с тем обещанием?','Вернись к нашей прежней договорённости: какие препятствия ещё остались?',
  'Где настраивать малый синий спектральный фильтр Нелли, проверено ли покрытие и допустим ли солнечный свет?',
  'В соседней башне монтаж завершён. Теперь можно раскрыть имя автора сигнала?',
  'Разве журнал нельзя было снимать? Можно ли делать это сейчас и прочитать записи?',
  'Что Нелли обещала сделать с синим спектральным фильтром Веры Лунной?',
  'Что с обещанием установить чёрный полярный искатель?',
  'А что с тем обещанием?','А что с тем обещанием?','Что Вера обещала установить?',
 ],bridge:'Вера Лунная сказала: то обещание касается синего спектрального фильтра. Вера Звёздная уточнила, что её синий спектральный фильтр — самостоятельный прибор с уже завершённой установкой.',
 raw:'В неподтверждённом пересказе написано, что то обещание относится к чёрному полярному искателю.',tail:'Позже прозвучала ещё одна неназванная договорённость неизвестного гостя.',
 background:['Ассистент пересчитал пустые кассеты.','На лестнице сменили коврик.','В кухне вытерли чашки.','Смотритель поправил расписание.']},
 en:{names:['Vera Moon','Vera Star','Nellie','Damir'],alias:'Vera',records:{
  old:'Vera Moon’s blue spectral filter used to be accepted in the lower pavilion.',
  a0:'When the dome cools and the engineer confirms the seal, I am responsible for installing Vera Moon’s blue spectral filter; do not dismantle its factory frame.',
  a1:'Vera Moon’s blue spectral filter is locked in an insulated safe; the engineer, not the observer, issues the code.',
  a2:'Vera Moon’s blue spectral filter must now be installed in the upper tower; the lower pavilion is unavailable.',
  a3:'Vera Moon’s blue spectral filter was hoisted to the dome, but it has not been fixed in place and the seal check is unfinished.',
  b0:'After optical acceptance, I undertake installation of Vera Star’s blue spectral filter.',
  b1:'Vera Star’s blue spectral filter was in the neighbouring tower; Moon’s safe is unrelated to it.',
  b2:'Vera Star’s blue spectral filter is fixed and accepted by the commission; the installation duty is fulfilled.',
  b3:'Installation of Vera Star’s blue spectral filter is complete, but Vera Moon’s filter frame still must not be dismantled.',
  c0:'Following the coating check, I vouch for adjusting Nellie’s small blue spectral filter; keep direct sunlight away from it.',
  c1:'Nellie’s small blue spectral filter is in a black case, not the engineer’s safe.',
  c2:'Nellie’s small blue spectral filter must now be adjusted in the dome laboratory; the previous table was dismantled.',
  c3:'Nellie’s small blue spectral filter was unpacked, but its coating is unchecked and adjustment has not begun.',
  d0:'I promise not to disclose the signal author’s name before the hearing; completed installation does not end confidentiality.',
  d1:'Damir temporarily permitted filming the closed observation log’s exterior.',
  d2:'Damir revoked permission to film the log; temporary permission is no longer in force.',
  d3:'The signal author’s name remains restricted; revoked filming permission grants no right to read the log.',
 },queries:[
  'What must precede installation of Vera Moon’s blue spectral filter, where must it happen, and is it installed?',
  'Any word on that blue spectral thing—hoisted upstairs means installation can be signed off, right?',
  'I take the blue spectral filter and adjust the small one; recall the conditions of both jobs.',
  'So what about that promise?','Return to our earlier understanding: which obstacles are still outstanding?',
  'Where should Nellie’s small blue spectral filter be adjusted, is its coating checked, and is sunlight permitted?',
  'Installation next door is complete. May the signal author’s name be disclosed now?',
  'Weren’t we allowed to film the log? May we do that now and read the entries?',
  'What did Nellie promise to do with Vera Moon’s blue spectral filter?',
  'What about the promise to install the black polar finder?',
  'So what about that promise?','So what about that promise?','What did Vera promise to install?',
 ],bridge:'Vera Moon said that promise concerns the blue spectral filter. Vera Star explained that her blue spectral filter is an independent instrument whose installation is already complete.',
 raw:'An unverified retelling says that promise concerns the black polar finder.',tail:'Later another unnamed arrangement of an unknown guest was mentioned.',
 background:['The assistant counted empty cartridges.','A stair mat was changed.','Cups were wiped in the kitchen.','The keeper straightened a timetable.']}},
];
const A=['a0','a1','a2','a3'],B=['b1','b2','b3'],C=['c0','c1','c2','c3'];
export const conditionalFamilies=['explicit-conditional','work-paraphrase','compound','same-label-reference','free-reference','qualified-neighbour','negative-duty','revoked-permission','wrong-promisor','unknown-object','raw-only','unknown-tail','ambiguous-first-name'] as const;
const gold=[A,A,[...A,...C],[...A,...B],[...A,...B],C,['d0','d3'],['d2','d3'],[],[],[],[],[]];
export function conditionalWorld(locale:Locale,plotIndex=0,noiseCount=1500,variant=0){
 const plot=plots[plotIndex]!,p=plot[locale],worldId=`rp297-${plot.id}-${locale}`;
 const world:WorldProfile={id:worldId,name:plot.id,description:'Synthetic conditional commitment audit.',color:'#647b8c',contextBudget:16000,relevanceThreshold:6,createdAt:1,updatedAt:1};
 const entities:SceneEntity[]=p.names.map((name,i)=>({id:worldId+'-p'+i,worldId,kind:'character',name,description:'',aliases:i<2?[p.alias]:[],memberIds:[],createdAt:1,updatedAt:1}));
 const facts:StoryFact[]=[],ids:string[]=[],owners:number[]=[];
 const add=(id:string,text:string,owner:number,extra:Partial<StoryFact>={})=>{ids.push(id);owners.push(owner);facts.push({kind:'event',text,quote:text,...extra});};
 const record=(id:string,owner:number)=>{const body=p.records[id]!,text=locale==='ru'?`${p.names[owner]} сказала: «${body}»`:`${p.names[owner]} said: “${body}”`;
  const task=['a0','b0','b2','c0','d0'].includes(id);
  add(id,text,owner,task?{kind:id==='b2'?'event':'promise',task:{key:worldId+'-task-'+id[0],title:p.records[id[0]+'0']!,status:id==='b2'?'completed':'open'}}:id==='old'||id==='a2'?{claim:{key:worldId+'-destination',value:body,scope:'state',lifetime:'persistent'}}:id==='d1'||id==='d2'?{claim:{key:worldId+'-temporary-permission',value:id==='d2'?text:body,scope:'state',lifetime:'scene',status:id==='d1'?'active':'ended',...(id==='d2'?{transition:'progress' as const}:{})}}:{});
 };
 let cursor=0;const noise=(to:number)=>{for(;cursor<to;cursor++)add('background-'+cursor,`${locale==='ru'?'Отметка':'Note'} ${cursor}. ${p.background[(cursor*5+Math.floor(cursor/17))%4]}`,cursor%4);};
 noise(Math.floor(noiseCount*.09));['old',...A].forEach(id=>record(id,0));noise(Math.floor(noiseCount*.34));['b0',...B].forEach(id=>record(id,1));noise(Math.floor(noiseCount*.66));C.forEach(id=>record(id,2));noise(Math.floor(noiseCount*.89));['d0','d1','d2','d3'].forEach(id=>record(id,id==='d0'?0:3));noise(noiseCount);
 const latest=[3,4,11].includes(variant)?p.bridge:locale==='ru'?'Все заняты ужином и выбором музыки.':'Everyone is occupied with dinner and choosing music.';
 add('latest',latest,0);
 const sources=facts.map((_,i)=>worldId+'-revision-'+i),roleSeeds=facts.map((f,i)=>{const person=entities[owners[i]!]!;return roleSeed(f,{version:1,sourceRevisionId:sources[i]!,quote:f.quote,roles:{speaker:{id:person.id,name:person.name},...(f.task?{promisor:{id:person.id,name:person.name}}:{})}});});
 const input:GameContextInput={draft:p.queries[variant]!,recentMessages:[variant===10?p.raw:variant===11?latest+' '+p.tail:latest],entries:[],books:[],entities,worlds:[world],activeBookId:null,scene:{worldId,bookId:null,focusIds:[]},settings:{contextBudget:16000,relevanceThreshold:6},story:{world,chat:worldId+'-chat',branch:worldId+'-branch',facts,sheetsEnabled:false,roleSeeds,episodeSources:sources}};
 return {input,ids,sources,locale,noiseCount,plotId:plot.id};
}
export function conditionalScenarios(){
 const main=(['ru','en'] as const).flatMap(locale=>plots.flatMap((_,pi)=>conditionalFamilies.map((family,i)=>({...conditionalWorld(locale,pi,1500,i),id:`${locale}:${pi}:${family}`,family:family as string,gold:{wanted:[...gold[i]!],score:i<8,uncertainty:i===3||i===4||i>=8,control:i>=8,budget:false}}))));
 const scale=(['ru','en'] as const).flatMap(locale=>[600,2800,7500].map((n,i)=>({...conditionalWorld(locale,i%2,n,0),id:`${locale}:scale:${n}`,family:'scale',gold:{wanted:[...A],score:true,uncertainty:false,control:false,budget:false}})));
 const budget=(['ru','en'] as const).flatMap(locale=>[900,2800,5600].map((limit,i)=>{const c=conditionalWorld(locale,i%2,1500,2);c.input.settings.contextBudget=limit;c.input.story!.world.contextBudget=limit;return {...c,id:`${locale}:budget:${limit}`,family:'budget',gold:{wanted:[...A,...C],score:false,uncertainty:false,control:false,budget:true}};}));
 return [...main,...scale,...budget];
}
