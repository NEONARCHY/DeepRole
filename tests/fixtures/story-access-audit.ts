import type {GameContextInput} from '../../src/core/game-context';
import type {Locale,SceneEntity,WorldProfile} from '../../src/core/types';
import type {StoryFact} from '../../src/core/story-update';
import {roleSeed} from '../../src/core/story-role-binding';

// Authored RP295 inputs/gold, without old fixtures, query recognizers or scorer.
interface Prose {names:string[];records:Record<string,string>;queries:string[];bridge:string;raw:string;two:string;tail:string;background:string[]}
const plots:{id:string;ru:Prose;en:Prose}[]=[
 {id:'lunar-greenhouse',ru:{names:['Варвара','Есения','Агата','Олеся'],records:{
  old:'Серебристый пыльцевой дозатор Варвары раньше настраивали у внешнего шлюза.',
  a0:'Я обещаю откалибровать серебристый пыльцевой дозатор Варвары после стабилизации давления, при дежурном агрономе; пломбу не снимать.',
  a1:'Серебристый пыльцевой дозатор Варвары лежит в герметичном пенале; открыть пенал может только агроном своим жетоном.',
  a2:'Серебристый пыльцевой дозатор Варвары теперь калибруют в теневом отсеке; внешний шлюз закрыт на весь цикл.',
  a3:'Серебристый пыльцевой дозатор Варвары подключили к стенду, но настройку не закончили и допуск к посевам не выдали.',
  b0:'Я обещаю откалибровать серебристый пыльцевой дозатор Есении после сверки проб.',
  b1:'Серебристый пыльцевой дозатор Есении находится в малом боксе и не подходит к стенду Варвары.',
  b2:'Калибровка серебристого пыльцевого дозатора Есении отменена: эту работу не следует выполнять.',
  b3:'Серебристый пыльцевой дозатор Есении остался неопробованным; отмена работы не означает исправность.',
  c0:'Я обещаю распечатать зелёный семенной контейнер Агаты только при свидетеле и после окончания карантина.',
  c1:'Зелёный семенной контейнер Агаты находится в холодном сейфе; код у начальницы карантина.',
  c2:'Зелёный семенной контейнер Агаты вынули из сейфа, но крышка не вскрыта и срок карантина не истёк.',
  d0:'Я обещаю скрывать координаты опытной грядки до публикации результатов; технический допуск не разрешает разглашение.',
  d1:'Олеся разрешила перевозку семян внутри станции, но не вскрытие контейнеров и не публикацию координат.',
 },queries:[
  'Какие условия Варвара поставила для калибровки серебристого пыльцевого дозатора и закончена ли работа?',
  'Как обстоят дела с настройкой той штуки для пыльцы — подключили, значит уже можно сеять?',
  'Я открываю пенал и достаю зелёный семенной контейнер; напомни ограничения настройки дозатора и вскрытия.',
  'Напомни о том обещании.', 'Мы ведь о чём-то условились — что пока нельзя делать?',
  'Можно ли распечатать зелёный семенной контейнер Агаты после того, как его вынули из сейфа?',
  'Олеся разрешила перевозку семян. Можно теперь вскрыть контейнер и назвать координаты?',
  'Что Олеся обещала откалибровать в серебристом пыльцевом дозаторе Варвары?',
  'Что с обещанием распечатать фиолетовый бактериальный тубус?',
  'Напомни о том обещании.','Напомни о том обещании.','Напомни о том обещании.',
 ],bridge:'Варвара напомнила: то обещание касается серебристого пыльцевого дозатора. Есения уточнила, что её серебристый пыльцевой дозатор — иной прибор, настройка которого отменена.',
 raw:'В неподтверждённой записке написано, будто то обещание касается фиолетового бактериального тубуса.',
 two:'Варвара связала обещание с серебристым пыльцевым дозатором. Агата отдельно напомнила о зелёном семенном контейнере и другом обещании.',
 tail:'Затем упомянули ещё одну договорённость без названия предмета и имени участника.',
 background:['Садовник проверил пустые лотки.','На панели сменили цвет подсветки.','Техник пересчитал крепления.','Дежурная записала расход воды.']},
 en:{names:['Varvara','Yesenia','Agatha','Olesya'],records:{
  old:'Varvara’s silver pollen dispenser used to be adjusted beside the outer airlock.',
  a0:'I promise to recalibrate Varvara’s silver pollen dispenser after pressure stabilizes, with the duty agronomist present; leave the seal intact.',
  a1:'Varvara’s silver pollen dispenser is in a pressure-tight case; only the agronomist can open it with her badge.',
  a2:'Varvara’s silver pollen dispenser must now be calibrated in the shaded compartment; the outer airlock is closed for the entire cycle.',
  a3:'Varvara’s silver pollen dispenser was connected to the bench, but adjustment is unfinished and sowing clearance was not issued.',
  b0:'I promise to recalibrate Yesenia’s silver pollen dispenser after comparing samples.',
  b1:'Yesenia’s silver pollen dispenser is in the small enclosure and does not fit Varvara’s bench.',
  b2:'Calibration of Yesenia’s silver pollen dispenser was cancelled; that work must not be carried out.',
  b3:'Yesenia’s silver pollen dispenser remains untested; cancellation is not proof of working order.',
  c0:'I promise to unseal Agatha’s green seed container only with a witness and after quarantine ends.',
  c1:'Agatha’s green seed container is in the cold safe; the quarantine supervisor holds the code.',
  c2:'Agatha’s green seed container was taken out of the safe, but its lid remains sealed and quarantine has not ended.',
  d0:'I promise to conceal the trial bed coordinates until results are published; technical clearance does not permit disclosure.',
  d1:'Olesya allowed seeds to travel within the station, not opening containers or publishing coordinates.',
 },queries:[
  'What restrictions apply to recalibrating Varvara’s silver pollen dispenser, and is the work finished?',
  'Any news on tuning that pollen gadget—being plugged in means we can sow now, right?',
  'I open the case and take the green seed container; recall the dispenser adjustment and unsealing restrictions.',
  'Remind me of that promise.','We had an understanding, didn’t we? What remains forbidden?',
  'May Agatha’s green seed container be unsealed now that it is out of the safe?',
  'Olesya allowed seeds to travel. May we open the container and name the coordinates now?',
  'What did Olesya promise to recalibrate in Varvara’s silver pollen dispenser?',
  'What about the promise to unseal the violet bacterial tube?',
  'Remind me of that promise.','Remind me of that promise.','Remind me of that promise.',
 ],bridge:'Varvara reminded us that promise concerns the silver pollen dispenser. Yesenia said her silver pollen dispenser is a distinct instrument whose adjustment was cancelled.',
 raw:'An unverified note allegedly says that promise concerns the violet bacterial tube.',two:'Varvara tied her promise to the silver pollen dispenser. Agatha separately recalled the green seed container and another promise.',tail:'Then another arrangement was mentioned without naming its object or participant.',
 background:['The gardener checked empty trays.','A panel changed its backlight colour.','The technician counted fasteners.','The watch keeper logged water use.']}},
 {id:'submerged-museum',ru:{names:['Злата','Милена','Эрика','Лиана'],records:{
  old:'Ребристую костяную печать Златы раньше проверяли в верхней галерее.',
  a0:'Я обещаю удостоверить ребристую костяную печать Златы после отлива, в присутствии двух хранителей; восковой слепок не делать.',
  a1:'Ребристая костяная печать Златы находится в свинцовом футляре; доступ выдаёт хранительница по письменному требованию.',
  a2:'Ребристую костяную печать Златы теперь проверяют в сухом архиве; верхняя галерея затоплена.',
  a3:'Ребристую костяную печать Златы сфотографировали, но подлинность не удостоверена и акт не подписан.',
  b0:'Я обещаю удостоверить ребристую костяную печать Милены после сравнения каталогов.',
  b1:'Ребристая костяная печать Милены хранится у реставратора; письменное требование Златы сюда не относится.',
  b2:'Удостоверение ребристой костяной печати Милены отменено по решению совета.',
  b3:'Ребристая костяная печать Милены не получила сертификат; отмена проверки не подтверждает подлинность.',
  c0:'Я обещаю обнародовать синий приливный реестр Эрики только после снятия эмбарго и с согласия наследницы.',
  c1:'Синий приливный реестр Эрики заперт в тубусе; открыть его может только архивариус.',
  c2:'Синий приливный реестр Эрики оцифровали, но эмбарго действует и наследница согласия не давала.',
  d0:'Я обещаю не разглашать имя дарителя до заседания; доступ к экспонату не разрешает раскрывать личность.',
  d1:'Лиана разрешила фотографировать футляр снаружи, но не открывать его и не называть дарителя.',
 },queries:[
  'Что нужно для удостоверения ребристой костяной печати Златы и подтверждена ли её подлинность?',
  'Ну что там с проверкой резной штуковины из кости — фото уже есть, значит вопрос закрыт?',
  'Я беру печать и читаю синий приливный реестр; вспомни условия проверки и публикации.',
  'А что с тем обещанием?','О чём мы договорились и какие запреты ещё в силе?',
  'Можно ли обнародовать синий приливный реестр Эрики, если цифровая копия уже готова?',
  'Лиана разрешила фото футляра. Значит можно его открыть и назвать дарителя?',
  'Что Лиана обещала удостоверить в ребристой костяной печати Златы?',
  'Как продвигается обещание опубликовать красный абиссальный атлас?',
  'А что с тем обещанием?','А что с тем обещанием?','А что с тем обещанием?',
 ],bridge:'Злата сказала: то обещание про ребристую костяную печать. Милена подчеркнула, что её ребристая костяная печать — самостоятельный экспонат с отменённой проверкой.',
 raw:'Вне принятой сцены кто-то утверждал, что то обещание относится к красному абиссальному атласу.',two:'Злата заговорила про ребристую костяную печать и обещание. Эрика независимо упомянула синий приливный реестр и свою договорённость.',tail:'Позже вспомнили другое неназванное обязательство неизвестного ныряльщика.',
 background:['Смотритель протёр пустую витрину.','В коридоре проверили лампу.','Экскурсовод сложил табуреты.','На причале пересчитали буйки.']},
 en:{names:['Zlata','Milena','Erica','Liana'],records:{
  old:'Zlata’s ribbed bone seal used to be checked in the upper gallery.',
  a0:'I promise to authenticate Zlata’s ribbed bone seal after low tide, with two custodians present; do not make a wax impression.',
  a1:'Zlata’s ribbed bone seal is in a lead-lined case; the custodian grants access against a written requisition.',
  a2:'Zlata’s ribbed bone seal must now be checked in the dry archive; the upper gallery is flooded.',
  a3:'Zlata’s ribbed bone seal was photographed, but authenticity is unconfirmed and the certificate remains unsigned.',
  b0:'I promise to authenticate Milena’s ribbed bone seal after comparing catalogues.',
  b1:'Milena’s ribbed bone seal is with the conservator; Zlata’s requisition does not apply to it.',
  b2:'Authentication of Milena’s ribbed bone seal was cancelled by the council.',
  b3:'Milena’s ribbed bone seal has no certificate; cancelling examination does not establish authenticity.',
  c0:'I promise to publish Erica’s blue tidal register only after the embargo lifts and with the heiress’s consent.',
  c1:'Erica’s blue tidal register is locked in a tube; only the archivist may open it.',
  c2:'Erica’s blue tidal register was digitized, but the embargo remains and the heiress has not consented.',
  d0:'I promise not to disclose the donor’s name until the hearing; access to an exhibit does not permit identifying its donor.',
  d1:'Liana allowed photographs of the case exterior, not opening it or identifying the donor.',
 },queries:[
  'What is required to authenticate Zlata’s ribbed bone seal, and has authenticity actually been established?',
  'Where are we with examining that carved bone thing—photos exist, so can we call it settled?',
  'I take the seal and read the blue tidal register; recall the examination and publication restrictions.',
  'So what about that promise?','What did we agree, and which prohibitions remain in force?',
  'May Erica’s blue tidal register be published because its digital copy is ready?',
  'Liana permitted a photo of the case. Does that allow opening it and naming the donor?',
  'What did Liana promise to authenticate in Zlata’s ribbed bone seal?',
  'How is the promise to publish the red abyssal atlas going?',
  'So what about that promise?','So what about that promise?','So what about that promise?',
 ],bridge:'Zlata said that promise concerns the ribbed bone seal. Milena stressed her ribbed bone seal is an independent exhibit whose examination was cancelled.',
 raw:'Outside the accepted scene somebody claimed that promise concerns the red abyssal atlas.',two:'Zlata discussed the ribbed bone seal and her promise. Erica independently mentioned the blue tidal register and her arrangement.',tail:'Later they recalled another unnamed duty of an unknown diver.',
 background:['The attendant wiped an empty display.','A corridor lamp was checked.','The guide stacked stools.','Buoys were counted beside the pier.']}},
];
const A=['a0','a1','a2','a3'],B=['b1','b2','b3'],C=['c0','c1','c2'],D=['d0','d1'];
export const accessFamilies=['explicit','paraphrase','compound','same-label','free-reference','publication-access','permission-boundary','wrong-promisor','unknown-object','raw-only','independent-things','unknown-tail'] as const;
const gold=[A,A,[...A,...C],[...A,...B],[...A,...B],C,D,[],[],[],[],[]];
export function accessWorld(locale:Locale,plotIndex=0,noiseCount=1300,variant=0){
 const plot=plots[plotIndex]!,p=plot[locale],worldId=`rp295-${plot.id}-${locale}`;
 const world:WorldProfile={id:worldId,name:plot.id,description:'Synthetic access and condition audit.',color:'#477a8a',contextBudget:16000,relevanceThreshold:6,createdAt:1,updatedAt:1};
 const entities:SceneEntity[]=p.names.map((name,i)=>({id:worldId+'-person-'+i,worldId,kind:'character',name,description:'',aliases:[],memberIds:[],createdAt:1,updatedAt:1}));
 const facts:StoryFact[]=[],ids:string[]=[],owners:number[]=[];
 const add=(id:string,text:string,owner:number,extra:Partial<StoryFact>={})=>{ids.push(id);owners.push(owner);facts.push({kind:'event',text,quote:text,...extra});};
 const record=(id:string,owner:number)=>{const body=p.records[id]!,text=locale==='ru'?`${p.names[owner]} сказала: «${body}»`:`${p.names[owner]} said: “${body}”`;
  const task=['a0','b0','b2','c0','d0'].includes(id);
  add(id,text,owner,task?{kind:id==='b2'?'event':'promise',task:{key:worldId+'-task-'+id[0],title:p.records[id[0]+'0']!,status:id==='b2'?'cancelled':'open'}}:id==='old'||id==='a2'?{claim:{key:worldId+'-workplace',value:body,scope:'state',lifetime:'persistent'}}:{});
 };
 let cursor=0;const noise=(to:number)=>{for(;cursor<to;cursor++)add('noise-'+cursor,`${locale==='ru'?'Запись':'Entry'} ${cursor}. ${p.background[(cursor*7+Math.floor(cursor/11))%4]}`,cursor%4);};
 noise(Math.floor(noiseCount*.12));['old',...A].forEach(id=>record(id,0));noise(Math.floor(noiseCount*.39));['b0',...B].forEach(id=>record(id,1));noise(Math.floor(noiseCount*.71));C.forEach(id=>record(id,2));noise(Math.floor(noiseCount*.91));record('d0',0);record('d1',3);noise(noiseCount);
 const latest=[3,4,11].includes(variant)?p.bridge:variant===10?p.two:locale==='ru'?'Все вернулись в столовую и обсуждают меню.':'Everyone returned to the canteen to discuss the menu.';
 add('latest',latest,0);
 const sources=facts.map((_,i)=>worldId+'-revision-'+i),roleSeeds=facts.map((f,i)=>{const person=entities[owners[i]!]!;return roleSeed(f,{version:1,sourceRevisionId:sources[i]!,quote:f.quote,roles:{speaker:{id:person.id,name:person.name},...(f.task?{promisor:{id:person.id,name:person.name}}:{})}});});
 const input:GameContextInput={draft:p.queries[variant]!,recentMessages:[variant===9?p.raw:variant===11?latest+' '+p.tail:latest],entries:[],books:[],entities,worlds:[world],activeBookId:null,scene:{worldId,bookId:null,focusIds:[]},settings:{contextBudget:16000,relevanceThreshold:6},story:{world,chat:worldId+'-chat',branch:worldId+'-branch',facts,sheetsEnabled:false,roleSeeds,episodeSources:sources}};
 return {input,ids,sources,locale,noiseCount,plotId:plot.id};
}
export function accessScenarios(){
 const main=(['ru','en'] as const).flatMap(locale=>plots.flatMap((_,pi)=>accessFamilies.map((family,i)=>({...accessWorld(locale,pi,1300,i),id:`${locale}:${pi}:${family}`,family:family as string,gold:{wanted:[...gold[i]!],score:i<7,uncertainty:i===3||i===4||i>=7,control:i>=7,budget:false}}))));
 const scale=(['ru','en'] as const).flatMap(locale=>[500,2600,7000].map((n,i)=>({...accessWorld(locale,i%2,n,0),id:`${locale}:scale:${n}`,family:'scale',gold:{wanted:[...A],score:true,uncertainty:false,control:false,budget:false}})));
 const budget=(['ru','en'] as const).flatMap(locale=>[900,2600,5200].map((limit,i)=>{const c=accessWorld(locale,i%2,1300,2);c.input.settings.contextBudget=limit;c.input.story!.world.contextBudget=limit;return {...c,id:`${locale}:budget:${limit}`,family:'budget',gold:{wanted:[...A,...C],score:false,uncertainty:false,control:false,budget:true}};}));
 return [...main,...scale,...budget];
}
