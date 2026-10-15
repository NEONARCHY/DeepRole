import type {GameContextInput} from '../../src/core/game-context';
import type {Locale,SceneEntity,WorldProfile} from '../../src/core/types';
import type {StoryFact} from '../../src/core/story-update';
import {roleSeed} from '../../src/core/story-role-binding';

// RP283: fresh authored plots, requests and labels. No import of earlier corpora,
// compiler output, scorer, token matcher or parser. Freeze before any evaluation.
interface Translation {names:[string,string,string];records:Record<string,string>;drafts:string[];bridge:string;scenery:string[]}
interface Plot {id:string;ru:Translation;en:Translation}
const plots:Plot[]=[
 {id:'museum',ru:{names:['Илона','Маркел','Зоя'],records:{
  'a-old':'Медную астролябию нужно вернуть к главному входу.',
  a0:'Я обещаю вернуть медную астролябию владельцу после описи; разрешения на вывоз это не даёт.',
  a1:'Медная астролябия хранится в запертом футляре под лестницей; ключ выдаёт только хранитель.',
  a2:'Медную астролябию теперь принимают в архивном крыле. Пункт у главного входа закрыт.',
  a3:'Чистка медной астролябии завершена, но возврат владельцу ещё не состоялся.',
  'b-old':'Отвезти восковый цилиндр в городскую мастерскую.',
  b0:'Восковый цилиндр нельзя проигрывать старой иглой: звуковую дорожку ещё не оцифровали.',
  b1:'Я обещаю оцифровать восковый цилиндр после получения новой иглы; её пока не привезли.',
  b2:'Перевозку воскового цилиндра в город отменили; оцифровка по-прежнему нужна.',
  c0:'Выставочный столик стоит у западной стены; двигать его можно только вдвоём.',
  c1:'Крепление выставочного столика проверено. Проверку устойчивости на новом полу ещё не проводили.',
  c2:'Я считаю, что выставочный столик поместится в нише; размеры ниши мы не измеряли.',
 },drafts:[
  'Проверяю медную астролябию и осматриваю восковый цилиндр.',
  'Осматриваю медную астролябию, проверяю восковый цилиндр и передвигаю выставочный столик.',
  'После ужина возвращаюсь в музей. Бережно осматриваю медную астролябию у лестницы, затем проверяю восковый цилиндр и вместе с Зоей передвигаю выставочный столик к нише.',
  'Куда теперь нести старинный прибор для измерения звёзд, и разве его чистка уже закрыла обещанный возврат?',
  'Что там с её договорённостью?',
  'Прошло сорок дней. Куда теперь сдавать медную астролябию, кто даст ключ и исполнен ли возврат?',
  'Что Илона обещала сделать и какое условие ещё мешает?',
  'Напомни отдельно обещание Илоны про медную астролябию и обещание Маркела про восковый цилиндр. Кто чего ждёт?',
  'В записке пример: «Осматриваю медную астролябию, проверяю восковый цилиндр и передвигаю выставочный столик». Я этого не делаю.',
  'Если хранитель разрешит, осмотрю медную астролябию, проверю восковый цилиндр и передвину выставочный столик.',
  'Не осматриваю медную астролябию, не проверяю восковый цилиндр и не передвигаю выставочный столик.',
  'Осматриваю медную астролябию, проверяю восковый цилиндр, передвигаю выставочный столик и открываю шкаф.',
 ],bridge:'Илона напомнила: мы говорим о её договорённости вернуть медную астролябию, а не о работе Маркела.',scenery:[
  'Во дворе сняли строительные леса, посетителей пустили через боковую калитку.', 'Зоя переписала расписание экскурсий для школьных групп.',
  'Маркел нашёл в гардеробе забытый зонтик и передал его дежурному.', 'Илона обсудила с кассиром новые бумажные билеты.',
  'В читальном зале заменили перегоревший светильник.', 'Дождь промочил афиши, сотрудники повесили новые.',
  'В кафе подали яблочный пирог, компания выбрала стол у окна.', 'Соседний зал закрыли ради покраски потолка.',
  'Курьер привёз пустые упаковочные коробки для сувенирной лавки.', 'Участники спорили о маршруте вечерней прогулки.',
  'На репетиции хора попросили не хлопать дверью.', 'После ярмарки дворники собрали деревянные указатели.',
 ]},en:{names:['Ilona','Marcell','Zoya'],records:{
  'a-old':'The copper astrolabe must be returned at the main entrance.',
  a0:'I promise to return the copper astrolabe to its owner after inventory; this grants no permission to take it away.',
  a1:'The copper astrolabe is in a locked case beneath the stairs; only the curator can issue the key.',
  a2:'The copper astrolabe is now accepted in the archive wing. The main entrance collection point is closed.',
  a3:'Cleaning the copper astrolabe is complete, but its return to the owner has not happened.',
  'b-old':'Take the wax cylinder to the city workshop.',
  b0:'The wax cylinder must not be played with the old stylus: its sound has not been digitised.',
  b1:'I promise to digitise the wax cylinder after the new stylus arrives; it has not arrived yet.',
  b2:'Transporting the wax cylinder to town was cancelled; digitisation is still needed.',
  c0:'The display stand is by the west wall; two people are required to move it.',
  c1:'The display stand fastenings have been checked. Its stability on the new floor has not been tested.',
  c2:'I believe the display stand will fit in the alcove; we have not measured the alcove.',
 },drafts:[
  'I check the copper astrolabe and examine the wax cylinder.',
  'I examine the copper astrolabe, check the wax cylinder and move the display stand.',
  'After supper I return to the museum. I gently examine the copper astrolabe beneath the stairs, then check the wax cylinder and move the display stand towards the alcove together with Zoya.',
  'Where should that antique instrument for measuring the stars go now, and did cleaning it really fulfil the promised return?',
  'What about her arrangement?',
  'Forty days have passed. Where should I hand in the copper astrolabe now, who can issue the key, and was it returned?',
  'What did Ilona promise to do, and what condition is still in the way?',
  'Remind me separately of Ilona’s promise about the copper astrolabe and Marcell’s promise about the wax cylinder. Who is waiting for what?',
  'The note gives an example: “I examine the copper astrolabe, check the wax cylinder and move the display stand.” I am not doing that.',
  'If the curator agrees, I will examine the copper astrolabe, check the wax cylinder and move the display stand.',
  'I do not examine the copper astrolabe, do not check the wax cylinder and do not move the display stand.',
  'I examine the copper astrolabe, check the wax cylinder, move the display stand and open the cabinet.',
 ],bridge:'Ilona reminded us: we mean her arrangement to return the copper astrolabe, not Marcell’s work.',scenery:[
  'The scaffolding was removed from the courtyard; visitors used the side gate.', 'Zoya rewrote the guided tour timetable for school groups.',
  'Marcell found an abandoned umbrella in the cloakroom and gave it to the attendant.', 'Ilona discussed new paper tickets with the cashier.',
  'A burnt-out light was replaced in the reading room.', 'Rain soaked the posters and the staff hung fresh ones.',
  'The cafe served apple pie and the group chose a window table.', 'The neighbouring hall was closed to repaint its ceiling.',
  'A courier delivered empty packing boxes for the gift shop.', 'The visitors debated the route for their evening walk.',
  'During choir rehearsal everyone was asked not to slam the door.', 'After the fair the caretakers collected wooden direction signs.',
 ]}},
 {id:'mountain',ru:{names:['Кира','Демьян','Оскар'],records:{
  'a-old':'Схему троп надо отдавать в нижнем приюте.',
  a0:'Я обещаю вернуть схему троп проводнице после схода снега; на закрытый перевал идти нельзя.',
  a1:'Схема троп лежит в красном тубусе у печи. Копировать её без согласия проводницы нельзя.',
  a2:'Схему троп теперь возвращают у верхней станции; нижний приют больше не принимает вещи.',
  a3:'Промокшие края схемы троп высушены. Обещанный возврат ещё не выполнен.',
  'b-old':'Отправить сигнальный маяк вертолётом на базу.',
  b0:'Сигнальный маяк не прошёл проверку батарей; включать его для игры запрещено.',
  b1:'Я обещаю заменить батареи сигнального маяка после открытия склада; склад пока опечатан.',
  b2:'Отправка сигнального маяка вертолётом отменена. Замена батарей остаётся в плане.',
  c0:'Спасательные сани закреплены у сарая двумя тросами. Спускать их без страхующего нельзя.',
  c1:'Полозья спасательных саней осмотрены, но испытания с грузом ещё не было.',
  c2:'Я считаю, что спасательные сани выдержат тяжёлый рюкзак; испытания этого не подтверждали.',
 },drafts:[
  'Осматриваю схему троп и проверяю сигнальный маяк.',
  'Проверяю схему троп, осматриваю сигнальный маяк и отвязываю спасательные сани.',
  'С утра в лагере стало тише. Подхожу к печи, осторожно проверяю схему троп, потом осматриваю сигнальный маяк и с помощью Оскара отвязываю спасательные сани.',
  'Где теперь отдать тот чертёж горных маршрутов? Его ведь просушили, но это ещё не значит, что долг закрыт.',
  'Напомни об этом обещании.',
  'Минуло два месяца. Где сейчас схема троп, куда её отдавать и был ли выполнен возврат?',
  'Что Кира обещала проводнице и когда она может это сделать?',
  'Сопоставь долг Киры вернуть схему троп и обещание Демьяна заменить батареи сигнального маяка. Одно не отменяет другое.',
  'В дневнике написано: «Проверяю схему троп, осматриваю сигнальный маяк и отвязываю спасательные сани». Это чужая запись.',
  'Если получу разрешение, проверю схему троп, осмотрю сигнальный маяк и отвяжу спасательные сани.',
  'Не проверяю схему троп, не осматриваю сигнальный маяк и не отвязываю спасательные сани.',
  'Проверяю схему троп, осматриваю сигнальный маяк, отвязываю спасательные сани и закрываю ворота.',
 ],bridge:'Кира вернулась к разговору о схеме троп: речь именно о её обещании вернуть этот документ проводнице.',scenery:[
  'Ночью на кухне замёрзла вода в ведре, утром её отогрели.', 'Демьян укрепил скрипящую ступеньку крыльца.',
  'Кира расписала дежурства по приготовлению ужина.', 'Оскар заштопал порванный рукав куртки.',
  'В столовой делили сушёные яблоки и обсуждали погоду.', 'Соседи принесли свежие газеты из долины.',
  'Днём фотографировали облака над восточным хребтом.', 'У окна поставили рассаду горной мяты.',
  'В сарае пересчитали пустые мешки для мусора.', 'Гости сыграли в шахматы и договорились о реванше.',
  'На крыше починили водосток после сильного дождя.', 'Перед сном записали температуру воздуха в общий журнал.',
 ]},en:{names:['Kira','Damian','Oscar'],records:{
  'a-old':'The trail chart should be returned to the lower shelter.',
  a0:'I promise to return the trail chart to the guide after the snow melts; the closed pass remains off limits.',
  a1:'The trail chart is in a red tube beside the stove. Copying it requires the guide’s consent.',
  a2:'The trail chart must now be returned at the upper station; the lower shelter no longer accepts belongings.',
  a3:'The wet edges of the trail chart have been dried. The promised return is still pending.',
  'b-old':'Send the signal beacon to the base by helicopter.',
  b0:'The signal beacon has not passed its battery check; switching it on for fun is forbidden.',
  b1:'I promise to replace the signal beacon batteries once the storeroom opens; the storeroom is still sealed.',
  b2:'The helicopter dispatch of the signal beacon was cancelled. Battery replacement remains planned.',
  c0:'The rescue sled is fastened to the shed with two ropes. It must not be lowered without a safety partner.',
  c1:'The rescue sled runners have been inspected, but it has not been tested with a load.',
  c2:'I believe the rescue sled can carry a heavy backpack; no trial has confirmed this.',
 },drafts:[
  'I examine the trail chart and check the signal beacon.',
  'I check the trail chart, examine the signal beacon and untie the rescue sled.',
  'The camp is quieter this morning. I walk over to the stove, carefully check the trail chart, then examine the signal beacon and untie the rescue sled with Oscar’s help.',
  'Where should that drawing of mountain routes go now? Drying it did not necessarily settle the debt.',
  'Remind me about that promise.',
  'Two months have passed. Where is the trail chart, where must it be handed in, and was its return completed?',
  'What did Kira promise the guide, and when can she do it?',
  'Compare Kira’s duty to return the trail chart with Damian’s promise to replace the signal beacon batteries. Neither cancels the other.',
  'The diary says: “I check the trail chart, examine the signal beacon and untie the rescue sled.” This is somebody else’s entry.',
  'If I get permission, I will check the trail chart, examine the signal beacon and untie the rescue sled.',
  'I do not check the trail chart, do not examine the signal beacon and do not untie the rescue sled.',
  'I check the trail chart, examine the signal beacon, untie the rescue sled and close the gate.',
 ],bridge:'Kira returned to the subject of the trail chart: we mean her promise to give that document back to the guide.',scenery:[
  'Water froze in a kitchen bucket overnight and was thawed in the morning.', 'Damian secured a creaking porch step.',
  'Kira wrote a rota for cooking supper.', 'Oscar mended a torn jacket sleeve.',
  'The group shared dried apples in the dining room and discussed the weather.', 'Neighbours brought fresh newspapers from the valley.',
  'In the afternoon they photographed clouds above the eastern ridge.', 'A tray of mountain mint seedlings was placed by the window.',
  'Empty rubbish sacks were counted in the shed.', 'Visitors played chess and arranged a rematch.',
  'The roof gutter was repaired after heavy rain.', 'Before bed they recorded the air temperature in the shared log.',
 ]}},
 {id:'kitchen',ru:{names:['Таисия','Леон','Майя'],records:{
  'a-old':'Ларец специй возвращают в лавку у моста.',
  a0:'Я обещаю вернуть ларец специй хозяйке после праздника; расходовать последние зёрна без неё нельзя.',
  a1:'Ларец специй стоит на верхней полке кладовой. Ключ от кладовой хранится у хозяйки.',
  a2:'Ларец специй теперь принимают в задней кухне пекарни; лавка у моста закрылась.',
  a3:'Этикетки ларца специй восстановлены; сам ларец хозяйке ещё не возвращён.',
  'b-old':'Отправить водяной фильтр соседней общине.',
  b0:'Водяной фильтр пропускает осадок. Воду после него пока нужно кипятить.',
  b1:'Я обещаю заменить картридж водяного фильтра после доставки; заказ ещё в пути.',
  b2:'Отправка водяного фильтра соседям отменена. Потребность заменить картридж не исчезла.',
  c0:'Раздаточная тележка стоит за занавеской. На пандусе её удерживают два человека.',
  c1:'Колёса раздаточной тележки смазаны, но тормоза под нагрузкой ещё не проверены.',
  c2:'Я считаю, что раздаточная тележка вместит все кастрюли; взвешивания не было.',
 },drafts:[
  'Осматриваю ларец специй и проверяю водяной фильтр.',
  'Осматриваю ларец специй, проверяю водяной фильтр и передвигаю раздаточную тележку.',
  'Обед закончился, гости вышли во двор. Я не торопясь осматриваю ларец специй на верхней полке, потом проверяю водяной фильтр и вместе с Майей передвигаю раздаточную тележку за занавеску.',
  'Куда отдать ту коробку с пряностями? Восстановленные надписи ведь не означают, что её уже получила хозяйка.',
  'Так что с тем долгом?',
  'С праздника прошло пять недель. Куда вернуть ларец специй, кто держит ключ и был ли возврат?',
  'Какое обещание Таисия дала хозяйке и когда собиралась его выполнить?',
  'Напомни обе договорённости: Таисия и ларец специй, Леон и водяной фильтр. Какие условия у каждой?',
  'На листке пример: «Осматриваю ларец специй, проверяю водяной фильтр и передвигаю раздаточную тележку». Это не мой ход.',
  'Если хозяйка разрешит, осмотрю ларец специй, проверю водяной фильтр и передвину раздаточную тележку.',
  'Не осматриваю ларец специй, не проверяю водяной фильтр и не передвигаю раздаточную тележку.',
  'Осматриваю ларец специй, проверяю водяной фильтр, передвигаю раздаточную тележку и открываю кладовую.',
 ],bridge:'Таисия пояснила, что тот долг — её обещание вернуть ларец специй хозяйке; к заказу Леона он не относится.',scenery:[
  'Во дворе накрыли столы бумажными скатертями.', 'Майя развесила детские рисунки у входа.',
  'Леон принял мешок картофеля и расписался в накладной.', 'Таисия сверила количество чистых полотенец.',
  'Соседи принесли варенье к вечернему чаю.', 'Из-за ветра перенесли концерт под навес.',
  'В буфете закончились синие салфетки, достали белые.', 'Пекарь рассказал историю старого здания.',
  'Дети собрали бумажных журавликов для украшения зала.', 'Гости выбрали музыку для следующего вечера.',
  'Вечером отмыли следы мела со ступеней.', 'После закрытия пересчитали пустые бутылки для переработки.',
 ]},en:{names:['Tessa','Leon','Maya'],records:{
  'a-old':'The spice chest is returned at the shop by the bridge.',
  a0:'I promise to return the spice chest to its owner after the festival; the last seeds must not be used without her.',
  a1:'The spice chest is on the top pantry shelf. The owner keeps the pantry key.',
  a2:'The spice chest is now accepted in the bakery’s back kitchen; the shop by the bridge has closed.',
  a3:'The spice chest labels have been restored; the chest itself has not been returned to its owner.',
  'b-old':'Send the water filter to the neighbouring community.',
  b0:'The water filter lets sediment through. Water from it must still be boiled.',
  b1:'I promise to replace the water filter cartridge after delivery; the order is still on its way.',
  b2:'Sending the water filter to the neighbours was cancelled. The cartridge still needs replacement.',
  c0:'The serving trolley is behind the curtain. Two people must hold it on the ramp.',
  c1:'The serving trolley wheels have been oiled, but its loaded brakes have not been tested.',
  c2:'I believe the serving trolley will hold every cooking pot; nothing has been weighed.',
 },drafts:[
  'I examine the spice chest and check the water filter.',
  'I examine the spice chest, check the water filter and move the serving trolley.',
  'Lunch is over and the guests have gone outside. I slowly examine the spice chest on the top shelf, then check the water filter and move the serving trolley behind the curtain together with Maya.',
  'Where should that box of seasonings go? Restoring the lettering does not mean the owner has received it.',
  'So what about that debt?',
  'Five weeks have passed since the festival. Where should the spice chest go, who holds the key, and was the return completed?',
  'What promise did Tessa make to the owner, and when did she intend to fulfil it?',
  'Remind me of both arrangements: Tessa and the spice chest, Leon and the water filter. What condition belongs to each?',
  'The sheet gives an example: “I examine the spice chest, check the water filter and move the serving trolley.” This is not my turn.',
  'If the owner agrees, I will examine the spice chest, check the water filter and move the serving trolley.',
  'I do not examine the spice chest, do not check the water filter and do not move the serving trolley.',
  'I examine the spice chest, check the water filter, move the serving trolley and open the pantry.',
 ],bridge:'Tessa explained that the debt means her promise to return the spice chest to its owner; it is unrelated to Leon’s order.',scenery:[
  'Tables in the yard were covered with paper cloths.', 'Maya hung children’s drawings beside the entrance.',
  'Leon accepted a sack of potatoes and signed the delivery slip.', 'Tessa checked the number of clean towels.',
  'Neighbours brought jam for the evening tea.', 'Wind forced the concert beneath the canopy.',
  'The buffet ran out of blue napkins and brought out white ones.', 'The baker told a story about the old building.',
  'Children folded paper cranes to decorate the hall.', 'Guests chose music for the following evening.',
  'Chalk marks were washed off the steps in the evening.', 'After closing they counted empty bottles for recycling.',
 ]}},
];
export const independentFamilies=['two-actions','three-actions','narrative-sequence','paraphrase','reference','time-jump','named-duty','independent-duties','quoted-actions','conditional-actions','negated-actions','four-actions'] as const;
const A=['a0','a1','a2','a3'],B=['b0','b1','b2'],C=['c0','c1','c2'];
export function independentWorld(locale:Locale,plotIndex=0,noiseCount=480,reference=false){
 const plot=plots[plotIndex]!,p=plot[locale],worldId=`rp283-${plot.id}-${locale}`;
 const world:WorldProfile={id:worldId,name:`RP283 ${plot.id}`,description:'Fictional accepted-memory audit, adult characters.',color:'#547681',contextBudget:16000,relevanceThreshold:6,createdAt:1,updatedAt:1};
 const entities:SceneEntity[]=p.names.map((name,i)=>({id:`${worldId}-person-${i}`,worldId,kind:'character',name,description:'',aliases:[],memberIds:[],createdAt:1,updatedAt:1}));
 const facts:StoryFact[]=[],ids:string[]=[],speakers:number[]=[];
 const add=(id:string,body:string,owner:number,extra:Partial<StoryFact>={})=>{const name=p.names[owner]!,text=locale==='ru'?`${name} ${owner===1||plot.id==='mountain'&&owner===2?'сказал':'сказала'}: «${body}»`:`${name} said: “${body}”`;ids.push(id);speakers.push(owner);facts.push({kind:'event',text,quote:text,...extra});};
 const record=(id:string,owner:number)=>{const body=p.records[id]!;add(id,body,owner,
  id==='a-old'||id==='a2'?{claim:{key:worldId+'-return-point',value:body,scope:'state',lifetime:'persistent'}}:
  id==='a0'||id==='b1'?{kind:'promise',task:{key:worldId+'-'+id,title:body,status:'open'}}:
  id==='a3'||id==='c1'?{task:{key:worldId+'-'+id,title:body,status:'completed'}}:
  id==='b-old'||id==='b2'?{task:{key:worldId+'-dispatch',title:body,status:id==='b2'?'cancelled':'open'}}:
  id==='c2'?{kind:'belief'}:{});};
 const noise=(from:number,to:number)=>{for(let i=from;i<to;i++){const day=Math.floor(i/6)+2,phase=locale==='ru'?['утро','день','вечер'][i%3]:['morning','afternoon','evening'][i%3],body=p.scenery[(i*7+Math.floor(i/12))%p.scenery.length]!;add('scene-'+i,locale==='ru'?`День ${day}, ${phase}, запись ${i+1}. ${body}`:`Day ${day}, ${phase}, entry ${i+1}. ${body}`,Math.floor(i/4)%3);}};
 noise(0,Math.floor(noiseCount/12));['a-old',...A].forEach(id=>record(id,0));
 noise(Math.floor(noiseCount/12),Math.floor(noiseCount*0.57));['b-old',...B].forEach(id=>record(id,1));
 noise(Math.floor(noiseCount*0.57),Math.floor(noiseCount*0.82));C.forEach(id=>record(id,2));
 noise(Math.floor(noiseCount*0.82),noiseCount);
 add('bridge',reference?p.bridge:locale==='ru'?'Мы собрались в общей комнате и ещё не решили, чем займёмся дальше.':'We gathered in the common room and have not decided what to do next.',0);
 const sources=facts.map((_,i)=>`${worldId}-revision-${i}`),seeds=facts.map((fact,i)=>{const owner=entities[speakers[i]!]!;return roleSeed(fact,{version:1,sourceRevisionId:sources[i]!,quote:fact.quote,roles:{speaker:{id:owner.id,name:owner.name},...(fact.kind==='promise'?{promisor:{id:owner.id,name:owner.name}}:{}),...(fact.kind==='belief'?{believer:{id:owner.id,name:owner.name}}:{})}});});
 const input:GameContextInput={draft:'',recentMessages:[facts.at(-1)!.text],entries:[],books:[],entities,worlds:[world],activeBookId:null,scene:{worldId,bookId:null,focusIds:[]},settings:{contextBudget:16000,relevanceThreshold:6},story:{world,chat:worldId+'-chat',branch:worldId+'-branch',facts,sheetsEnabled:false,roleSeeds:seeds,episodeSources:sources}};
 return {input,ids,sources,speakers,locale,noiseCount,plotId:plot.id,drafts:p.drafts};
}
export function independentScenarios(){
 const main=(['ru','en'] as const).flatMap(locale=>plots.flatMap((_,pi)=>independentFamilies.map((family,fi)=>{
  const c=independentWorld(locale,pi,480,fi===4);c.input.draft=c.drafts[fi]!;
  const wanted=fi===0?[...A,...B]:fi===1||fi===2?[...A,...B,...C]:fi===3||fi===4||fi===5?[...A]:fi===6?['a0']:fi===7?['a0','b1']:[];
  return {...c,id:`${locale}:${c.plotId}:${family}`,family:family as string,gold:{wanted,score:wanted.length>0,rejectCompound:fi>=8,noGoldReason:fi>=8?'Non-executed or unsupported compound action; test rejection/integrity, not recall completeness.':null}};
 })));
 const scale=(['ru','en'] as const).flatMap(locale=>[250,1000,5000].map((size,i)=>{const c=independentWorld(locale,i,size);c.input.draft=c.drafts[1]!;return {...c,id:`${locale}:scale:${size}`,family:'scale',gold:{wanted:[...A,...B,...C],score:true,rejectCompound:false,noGoldReason:null}};}));
 const budget=(['ru','en'] as const).flatMap(locale=>[800,1800,4000].map((limit,i)=>{const c=independentWorld(locale,i);c.input.draft=c.drafts[1]!;c.input.settings.contextBudget=limit;c.input.story!.world.contextBudget=limit;return {...c,id:`${locale}:budget:${limit}`,family:'budget',gold:{wanted:[...A,...B,...C],score:false,rejectCompound:false,noGoldReason:'Budget stress is reported separately; missing whole records is allowed when they do not fit.'}};}));
 return [...main,...scale,...budget];
}
