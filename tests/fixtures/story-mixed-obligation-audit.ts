import type {GameContextInput} from '../../src/core/game-context';
import type {Locale,SceneEntity,WorldProfile} from '../../src/core/types';
import type {StoryFact} from '../../src/core/story-update';
import {roleSeed} from '../../src/core/story-role-binding';

// RP289: new authored narratives/gold. No previous corpus, matcher, scorer or
// compiler is imported/executed here. These are synthetic accepted records,
// not a blind external author or a model's entire organically played novel.
interface Prose {names:string[]; records:Record<string,string>; queries:string[]; bridge:string; separate:string; falseBridge:string; tail:string; background:string[]}
interface Plot {id:string;ru:Prose;en:Prose}
const plots:Plot[]=[
 {id:'bakery',ru:{names:['Зоя','Валерия','Жанна','Рената'],records:{
  aOld:'Запечатанный сахарный ящик Зои С-29 следовало доставить через торговую дверь.',
  a0:'Я обещаю доставить запечатанный сахарный ящик Зои С-29 в пекарню только после проверки пломбы; открывать его нельзя.',
  a1:'Запечатанный сахарный ящик Зои С-29 хранится в холодной кладовой; вход разрешает заведующая, не курьер.',
  a2:'Запечатанный сахарный ящик Зои С-29 теперь принимают у грузового подъёмника; торговая дверь закрыта.',
  a3:'Запечатанный сахарный ящик Зои С-29 погрузили на тележку, но доставка ещё не состоялась.',
  b0:'Я обещаю починить запечатанный сахарный дозатор Валерии Д-13 после отключения питания; это не доставка ящика Зои.',
  b1:'Запечатанный сахарный дозатор Валерии Д-13 находится за защитной решёткой; снять её может только электрик.',
  b2:'Запечатанный сахарный дозатор Валерии Д-13 осмотрен; ремонт и проверка изоляции ещё не выполнены.',
  c0:'Я обещаю оплатить хранение мешков Жанны до утра.',
  c1:'Оплата хранения мешков Жанны завершена; кассир принял всю сумму.',
  c2:'Квитанция Жанны подтверждает оплату хранения мешков, но не доставку сахарного ящика.',
  d0:'Я обещаю проводить Ренату к ночному складу после закрытия смены.',
  d1:'Обещание проводить Ренату к ночному складу отменено по её просьбе; идти туда не нужно.',
  d2:'Ренату уже забрал брат; отменённое сопровождение не стало выполненным сопровождением.',
  e0:'Я обещаю сохранить рецепт начинки в тайне до конкурса; разрешение доставить продукты не разрешает раскрывать рецепт.',
 },queries:[
  'Куда Зоя обещала доставить запечатанный сахарный ящик С-29, кто разрешает вход и состоялась ли доставка?',
  'Как там отправка сладкого груза с целой пломбой: тележку подготовили — значит обещанное уже исполнено?',
  'Что Валерия обещала починить в запечатанном сахарном дозаторе Д-13 и какие условия ещё не выполнены?',
  'Сравни доставку запечатанного сахарного ящика Зои и ремонт запечатанного сахарного дозатора Валерии; условия не смешивай.',
  'Осталась ли неоплаченная сумма за хранение мешков Жанны?',
  'Должна ли Рената всё ещё идти к ночному складу с сопровождающей после отмены обещания?',
  'Можно ли раскрыть рецепт начинки до конкурса, раз доставку продуктов разрешили?',
  'Что с тем обещанием?', 'Что с тем обещанием?', 'Что с тем обещанием?', 'Что с тем обещанием?',
  'Куда Рената обещала доставить запечатанный сахарный ящик С-29?',
  'Что с обещанием починить хрустальный термометр?', 'Что с тем обещанием?',
 ],bridge:'Зоя сказала: то обещание относится к доставке запечатанного сахарного ящика С-29 после проверки пломбы.',
 separate:'Зоя упомянула запечатанный сахарный ящик С-29. Затем Валерия отдельно упомянула запечатанный сахарный дозатор Д-13. Это два разных обязательства.',
 falseBridge:'Кто-то будто бы уточнил: то обещание — починить хрустальный термометр.',
 tail:'Затем заговорили ещё об одном обещании, не назвав ни человека, ни предмет.',
 background:['На витрину поставили пустую корзину.','Булочница проверила цвет корочки.','Покупательница забыла зонтик.','На стене заменили расписание смен.','Во дворе подмели снег.','На кухне пересчитали чистые чашки.']},en:{names:['Zoe','Valeria','Jeanne','Renata'],records:{
  aOld:'Zoe’s sealed sugar crate S-29 was to be delivered through the shop door.',
  a0:'I promise to deliver Zoe’s sealed sugar crate S-29 to the bakery only after the seal is checked; it must not be opened.',
  a1:'Zoe’s sealed sugar crate S-29 is kept in the cold storeroom; the manager, not the courier, grants entry.',
  a2:'Zoe’s sealed sugar crate S-29 is now accepted at the freight lift; the shop door is closed.',
  a3:'Zoe’s sealed sugar crate S-29 was loaded onto a trolley, but delivery has not happened.',
  b0:'I promise to repair Valeria’s sealed sugar dispenser D-13 after the power is isolated; this is not delivery of Zoe’s crate.',
  b1:'Valeria’s sealed sugar dispenser D-13 is behind a safety grille; only an electrician may remove it.',
  b2:'Valeria’s sealed sugar dispenser D-13 was inspected; repairs and the insulation test remain unfinished.',
  c0:'I promise to pay for storing Jeanne’s sacks before morning.',
  c1:'Payment for storing Jeanne’s sacks is complete; the cashier received the full amount.',
  c2:'Jeanne’s receipt confirms sack storage payment, not delivery of the sugar crate.',
  d0:'I promise to escort Renata to the night warehouse after the shift ends.',
  d1:'The promise to escort Renata to the night warehouse was cancelled at her request; the trip is not required.',
  d2:'Renata’s brother collected her; the cancelled escort did not become a completed escort.',
  e0:'I promise to keep the filling recipe secret until the contest; permission to deliver ingredients is not permission to disclose the recipe.',
 },queries:[
  'Where did Zoe promise to deliver the sealed sugar crate S-29, who grants entry, and has delivery happened?',
  'How is the shipment of that sweet cargo with the intact seal going: does preparing the trolley fulfil the promise?',
  'What did Valeria promise to repair in the sealed sugar dispenser D-13, and which conditions remain unmet?',
  'Compare Zoe’s sealed sugar crate delivery and Valeria’s sealed sugar dispenser repair without mixing their conditions.',
  'Is any payment still owed for storing Jeanne’s sacks?',
  'Must Renata still go to the night warehouse with an escort after the promise was cancelled?',
  'May the filling recipe be disclosed before the contest because ingredient delivery was allowed?',
  'What about that promise?', 'What about that promise?', 'What about that promise?', 'What about that promise?',
  'Where did Renata promise to deliver the sealed sugar crate S-29?',
  'What about the promise to repair the crystal thermometer?', 'What about that promise?',
 ],bridge:'Zoe said the promise means delivering the sealed sugar crate S-29 after the seal check.',
 separate:'Zoe mentioned the sealed sugar crate S-29. Then Valeria independently mentioned the sealed sugar dispenser D-13. These are different obligations.',
 falseBridge:'Somebody allegedly clarified that the promise means repairing the crystal thermometer.',
 tail:'Then another promise came up without naming its person or object.',
 background:['An empty basket was put in the shop window.','The baker checked the crust colour.','A customer forgot an umbrella.','The shift timetable was replaced.','Snow was swept from the yard.','Clean cups were counted in the kitchen.']}},
 {id:'glacier',ru:{names:['Василиса','Кира','Есения','Агата'],records:{
  aOld:'Красный полевой контейнер Василисы В-61 следовало доставить к нижней палатке.',
  a0:'Я обещаю доставить красный полевой контейнер Василисы В-61 на ледник после допуска проводника; холодовую упаковку вскрывать нельзя.',
  a1:'Красный полевой контейнер Василисы В-61 лежит в морозильном боксе; замок открывает только врач экспедиции.',
  a2:'Красный полевой контейнер Василисы В-61 теперь принимают на верхней площадке; нижняя палатка эвакуирована.',
  a3:'Красный полевой контейнер Василисы В-61 привязали к саням, но адресату его ещё не доставили.',
  b0:'Я обещаю починить красный полевой обогреватель Киры К-22 после снятия топлива; это отдельная работа, не доставка контейнера.',
  b1:'Красный полевой обогреватель Киры К-22 заперт в техническом тенте; доступ согласует механик.',
  b2:'Красный полевой обогреватель Киры К-22 разобрали для осмотра, но ремонт не завершён.',
  c0:'Я обещаю оплатить аренду верёвок Есении до выхода группы.',
  c1:'Аренда верёвок Есении полностью оплачена; касса подтвердила получение денег.',
  c2:'Есения получила квитанцию за аренду верёвок; перевозку контейнера квитанция не подтверждает.',
  d0:'Я обещаю проводить Агату до метеопоста после улучшения видимости.',
  d1:'Сопровождение Агаты до метеопоста отменено по её просьбе; обещание больше не действует.',
  d2:'Агата осталась на базе; отмена сопровождения не доказывает поход на метеопост.',
  e0:'Я обещаю не разглашать координаты образца до разрешения исследовательницы; разрешение перевозить контейнер не относится к координатам.',
 },queries:[
  'Куда Василиса обещала доставить красный полевой контейнер В-61 и кто разрешает открыть бокс?',
  'Что с отправкой того охлаждённого груза вверх: привязали к саням — уже выполнили обещание?',
  'Что Кира обещала починить в красном полевом обогревателе К-22 и кто даёт доступ?',
  'Сопоставь доставку красного полевого контейнера Василисы и ремонт красного полевого обогревателя Киры.',
  'Нужно ли ещё платить за аренду верёвок Есении после квитанции?',
  'Нужно ли вести Агату к метеопосту после отмены сопровождения?',
  'Можно ли рассказывать координаты образца, если перевозку контейнера разрешили?',
  'Напомни о её обещании.', 'Напомни о её обещании.', 'Напомни о её обещании.', 'Напомни о её обещании.',
  'Куда Агата обещала доставить красный полевой контейнер В-61?',
  'Как там обещание починить серебряный ледоруб?', 'Напомни о её обещании.',
 ],bridge:'Василиса пояснила: её обещание — доставить красный полевой контейнер В-61 после допуска проводника.',
 separate:'Сначала Василиса назвала красный полевой контейнер В-61. Кира независимо назвала красный полевой обогреватель К-22; их договорённости не совпадают.',
 falseBridge:'Кто-то якобы уточнил: её обещание означает ремонт серебряного ледоруба.',
 tail:'После этого упомянули неизвестное обязательство другой участницы без деталей.',
 background:['На склоне измерили глубину снега.','В лагере погасили керосиновую лампу.','На стол положили карту осадков.','Фотограф протёр объектив.','В столовой выдали горячую воду.','Смотритель пересчитал сигнальные флажки.']},en:{names:['Vasilisa','Kira','Yesenia','Agatha'],records:{
  aOld:'Vasilisa’s red field container V-61 was to be delivered to the lower tent.',
  a0:'I promise to deliver Vasilisa’s red field container V-61 to the glacier after the guide gives clearance; the cold packaging must not be opened.',
  a1:'Vasilisa’s red field container V-61 is in the freezer box; only the expedition doctor opens the lock.',
  a2:'Vasilisa’s red field container V-61 is now accepted on the upper platform; the lower tent was evacuated.',
  a3:'Vasilisa’s red field container V-61 was fastened to the sledge but has not been delivered to its recipient.',
  b0:'I promise to repair Kira’s red field heater K-22 after the fuel is removed; this is a separate job, not container delivery.',
  b1:'Kira’s red field heater K-22 is locked in the technical shelter; the mechanic approves access.',
  b2:'Kira’s red field heater K-22 was disassembled for inspection, but the repair is not complete.',
  c0:'I promise to pay Yesenia’s rope rental before the group leaves.',
  c1:'Yesenia’s rope rental is fully paid; the cashier confirmed receipt of the money.',
  c2:'Yesenia received the rope rental receipt; it does not confirm container transport.',
  d0:'I promise to escort Agatha to the weather post after visibility improves.',
  d1:'Agatha’s escort to the weather post was cancelled at her request; the promise no longer applies.',
  d2:'Agatha stayed at base; cancellation does not prove a hike to the weather post.',
  e0:'I promise not to disclose the sample coordinates before the researcher allows it; permission to transport the container says nothing about coordinates.',
 },queries:[
  'Where did Vasilisa promise to deliver the red field container V-61, and who may open the box?',
  'How is shipping that chilled cargo uphill going: does fastening it to the sledge fulfil the promise?',
  'What did Kira promise to repair in the red field heater K-22, and who grants access?',
  'Compare Vasilisa’s red field container delivery and Kira’s red field heater repair.',
  'Is Yesenia’s rope rental still unpaid after the receipt?',
  'Must Agatha still be escorted to the weather post after cancellation?',
  'May the sample coordinates be disclosed because container transport was permitted?',
  'Remind me of her promise.', 'Remind me of her promise.', 'Remind me of her promise.', 'Remind me of her promise.',
  'Where did Agatha promise to deliver the red field container V-61?',
  'What about the promise to repair the silver ice axe?', 'Remind me of her promise.',
 ],bridge:'Vasilisa explained that her promise means delivering the red field container V-61 after the guide gives clearance.',
 separate:'First Vasilisa named the red field container V-61. Kira independently named the red field heater K-22; their obligations differ.',
 falseBridge:'Somebody supposedly clarified that her promise means repairing the silver ice axe.',
 tail:'Afterwards an unknown obligation of another participant was mentioned without details.',
 background:['Snow depth was measured on the slope.','The camp extinguished a paraffin lamp.','A precipitation chart was placed on the table.','The photographer wiped a lens.','Hot water was served in the dining tent.','The keeper counted the signal flags.']}},
 {id:'planetarium',ru:{names:['Милена','София','Нина','Ульяна'],records:{
  aOld:'Синий оптический футляр Милены М-74 следовало доставить к билетной кассе.',
  a0:'Я обещаю доставить синий оптический футляр Милены М-74 в планетарий после проверки креплений; линзы вынимать запрещено.',
  a1:'Синий оптический футляр Милены М-74 стоит в тёмной аппаратной; вход открывает хранитель оптики.',
  a2:'Синий оптический футляр Милены М-74 теперь принимают в кабинете реставратора; билетная касса закрыта на ремонт.',
  a3:'Синий оптический футляр Милены М-74 упакован, но до планетария его ещё не довезли.',
  b0:'Я обещаю починить синий оптический проектор Софии П-35 после остывания лампы; доставка футляра не закрывает ремонт.',
  b1:'Синий оптический проектор Софии П-35 закрыт противопожарным экраном; снять экран разрешает инженер.',
  b2:'Синий оптический проектор Софии П-35 подключили к диагностике, но исправность пока не подтверждена.',
  c0:'Я обещаю оплатить печать карт Нины до открытия выставки.',
  c1:'Печать карт Нины полностью оплачена; типография подтвердила перевод.',
  c2:'Нина получила чек за печать карт; он не свидетельствует о доставке оптики.',
  d0:'Я обещаю проводить Ульяну в башню после окончания экскурсии.',
  d1:'Обещание проводить Ульяну в башню отменено по её просьбе; сопровождать её не нужно.',
  d2:'Ульяна выбрала другую экскурсию; отмена не считается выполнением похода в башню.',
  e0:'Я обещаю не разглашать пароль хранилища до смены экспозиции; разрешение ремонтировать проектор не даёт права раскрыть пароль.',
 },queries:[
  'Куда Милена обещала доставить синий оптический футляр М-74 и кто открывает аппаратную?',
  'Что с отправкой той упаковки для линз: собрали её — значит доставку уже выполнили?',
  'Что София обещала починить в синем оптическом проекторе П-35, какие ограничения сохраняются?',
  'Сопоставь доставку синего оптического футляра Милены и ремонт синего оптического проектора Софии.',
  'Остался ли долг за печать карт Нины после подтверждения перевода?',
  'Нужно ли всё ещё вести Ульяну в башню после отмены обещания?',
  'Разрешено ли сообщить пароль хранилища до смены экспозиции, раз ремонт проектора разрешили?',
  'А что с тем обещанием?', 'А что с тем обещанием?', 'А что с тем обещанием?', 'А что с тем обещанием?',
  'Куда Ульяна обещала доставить синий оптический футляр М-74?',
  'Как там обещание починить зелёный астрономический глобус?', 'А что с тем обещанием?',
 ],bridge:'Милена сказала: то обещание — доставить синий оптический футляр М-74 после проверки креплений.',
 separate:'Милена назвала синий оптический футляр М-74. После этого София отдельно назвала синий оптический проектор П-35; речь о разных работах.',
 falseBridge:'Кто-то будто бы пояснил, что то обещание означает ремонт зелёного астрономического глобуса.',
 tail:'Затем прозвучало другое неназванное обещание неизвестной посетительницы.',
 background:['На потолке включили карту созвездий.','У входа пересчитали складные стулья.','На стенде поправили расписание лекций.','Посетительница забыла шарф.','Смотритель протёр лестничные перила.','В буфете налили воду в стаканы.']},en:{names:['Milena','Sophia','Nina','Ulyana'],records:{
  aOld:'Milena’s blue optical case M-74 was to be delivered to the ticket desk.',
  a0:'I promise to deliver Milena’s blue optical case M-74 to the planetarium after the fastenings are checked; removing the lenses is forbidden.',
  a1:'Milena’s blue optical case M-74 is in the dark control room; the optics keeper opens the entrance.',
  a2:'Milena’s blue optical case M-74 is now accepted in the conservator’s office; the ticket desk is closed for repairs.',
  a3:'Milena’s blue optical case M-74 is packed but has not reached the planetarium.',
  b0:'I promise to repair Sophia’s blue optical projector P-35 after the lamp cools; case delivery does not fulfil the repair.',
  b1:'Sophia’s blue optical projector P-35 is behind a fire screen; an engineer must permit its removal.',
  b2:'Sophia’s blue optical projector P-35 was connected to diagnostics, but working condition is not confirmed.',
  c0:'I promise to pay for printing Nina’s maps before the exhibition opens.',
  c1:'Printing Nina’s maps is fully paid; the printer confirmed the transfer.',
  c2:'Nina received the map printing receipt; it is not proof of optics delivery.',
  d0:'I promise to escort Ulyana to the tower after the tour ends.',
  d1:'The promise to escort Ulyana to the tower was cancelled at her request; escorting her is not required.',
  d2:'Ulyana chose a different tour; cancellation is not completion of the tower trip.',
  e0:'I promise not to disclose the store password until the exhibition changes; permission to repair the projector does not permit revealing the password.',
 },queries:[
  'Where did Milena promise to deliver the blue optical case M-74, and who opens the control room?',
  'How is shipping that lens package going: does packing it mean delivery is finished?',
  'What did Sophia promise to repair in the blue optical projector P-35, and which restrictions remain?',
  'Compare Milena’s blue optical case delivery and Sophia’s blue optical projector repair.',
  'Is any map printing debt still owed to Nina after the transfer confirmation?',
  'Must Ulyana still be taken to the tower after the promise was cancelled?',
  'May the store password be shared before the exhibition changes because projector repair was allowed?',
  'So what about that promise?', 'So what about that promise?', 'So what about that promise?', 'So what about that promise?',
  'Where did Ulyana promise to deliver the blue optical case M-74?',
  'What about the promise to repair the green astronomical globe?', 'So what about that promise?',
 ],bridge:'Milena said the promise means delivering the blue optical case M-74 after the fastenings are checked.',
 separate:'Milena named the blue optical case M-74. Afterwards Sophia independently named the blue optical projector P-35; these are different jobs.',
 falseBridge:'Somebody allegedly explained that the promise means repairing the green astronomical globe.',
 tail:'Then another unnamed promise by an unknown visitor was mentioned.',
 background:['The constellation chart was switched on overhead.','Folding chairs were counted at the entrance.','The lecture timetable was straightened.','A visitor forgot a scarf.','The keeper wiped the stair rail.','Water was poured into cups in the buffet.']}},
];
const A=['a0','a1','a2','a3'],B=['b0','b1','b2'];
export const mixedAuditFamilies=['delivery','paraphrase-delivery','repair','two-jobs','payment-completed','escort-cancelled','secrecy','proved-reference','no-bridge','false-raw-bridge','independent-mentions','swapped-owner','invented-object','unknown-tail'] as const;
const wanted=[A,A,B,[...A,...B],['c1','c2'],['d1','d2'],['e0'],A];
export function mixedAuditWorld(locale:Locale,plotIndex=0,noiseCount=960,variant=0){
 const plot=plots[plotIndex]!,p=plot[locale],worldId=`rp289-${plot.id}-${locale}`;
 const world:WorldProfile={id:worldId,name:`RP289 ${plot.id}`,description:'Synthetic mixed-obligation accepted-memory audit.',color:'#617a86',contextBudget:16000,relevanceThreshold:6,createdAt:1,updatedAt:1};
 const entities:SceneEntity[]=p.names.map((name,i)=>({id:worldId+'-p'+i,worldId,kind:'character',name,description:'',aliases:[],memberIds:[],createdAt:1,updatedAt:1}));
 const facts:StoryFact[]=[],ids:string[]=[],owners:number[]=[];
 const add=(id:string,text:string,owner:number,extra:Partial<StoryFact>={})=>{ids.push(id);owners.push(owner);facts.push({kind:'event',text,quote:text,...extra});};
 const record=(id:string,owner:number)=>{const body=p.records[id]!,text=locale==='ru'?`${p.names[owner]} сказала: «${body}»`:`${p.names[owner]} said: “${body}”`;
  const task=/^[abcde]0$/u.test(id)||id==='c1'||id==='d1';
  add(id,text,owner,task?{kind:id.endsWith('0')?'promise':'event',task:{key:worldId+'-duty-'+id[0],title:p.records[id[0]+'0']!,status:id==='c1'?'completed':id==='d1'?'cancelled':'open'}}:id==='aOld'||id==='a2'?{claim:{key:worldId+'-destination',value:body,scope:'state',lifetime:'persistent'}}:{});
 };
 const noise=(start:number,end:number)=>{for(let i=start;i<end;i++)add('background-'+i,`${locale==='ru'?'Запись':'Entry'} ${i+1}. ${p.background[(i*5+Math.floor(i/11))%p.background.length]} ${locale==='ru'?'Дежурство':'Watch'} ${Math.floor(i/9)+1}.`,i%4);};
 noise(0,Math.floor(noiseCount*.12));['aOld',...A].forEach(id=>record(id,0));
 noise(Math.floor(noiseCount*.12),Math.floor(noiseCount*.38));B.forEach(id=>record(id,1));
 noise(Math.floor(noiseCount*.38),Math.floor(noiseCount*.63));['c0','c1','c2'].forEach(id=>record(id,2));
 noise(Math.floor(noiseCount*.63),Math.floor(noiseCount*.85));['d0','d1','d2'].forEach(id=>record(id,3));record('e0',2);
 noise(Math.floor(noiseCount*.85),noiseCount);
 add('latest',variant===7||variant===13?p.bridge:variant===10?p.separate:locale==='ru'?'Дежурство закончилось; обсуждают погоду на завтра.':'The watch ended; tomorrow’s weather is being discussed.',0);
 const sources=facts.map((_,i)=>worldId+'-revision-'+i),roleSeeds=facts.map((fact,i)=>{const person=entities[owners[i]!]!;return roleSeed(fact,{version:1,sourceRevisionId:sources[i]!,quote:fact.quote,roles:{speaker:{id:person.id,name:person.name},...(fact.task?{promisor:{id:person.id,name:person.name}}:{})}});});
 const recent=variant===9?p.falseBridge:variant===13?facts.at(-1)!.text+' '+p.tail:facts.at(-1)!.text;
 const input:GameContextInput={draft:p.queries[variant]!,recentMessages:[recent],entries:[],books:[],entities,worlds:[world],activeBookId:null,scene:{worldId,bookId:null,focusIds:[]},settings:{contextBudget:16000,relevanceThreshold:6},story:{world,chat:worldId+'-chat',branch:worldId+'-branch',facts,sheetsEnabled:false,roleSeeds,episodeSources:sources}};
 return {input,ids,sources,locale,noiseCount,plotId:plot.id};
}
export function mixedAuditScenarios(){
 const main=(['ru','en'] as const).flatMap(locale=>plots.flatMap((plot,pi)=>mixedAuditFamilies.map((family,fi)=>({...mixedAuditWorld(locale,pi,960,fi),id:`${locale}:${plot.id}:${family}`,family:family as string,gold:{wanted:[...(wanted[fi]??[])],score:fi<8,uncertainty:fi>=7,control:fi>=8,budget:false}}))));
 const scale=(['ru','en'] as const).flatMap(locale=>[320,1800,6000].map((count,i)=>({...mixedAuditWorld(locale,i,count,3),id:`${locale}:scale:${count}`,family:'scale',gold:{wanted:[...A,...B],score:true,uncertainty:false,control:false,budget:false}})));
 const budget=(['ru','en'] as const).flatMap(locale=>[900,2200,5000].map((limit,i)=>{const c=mixedAuditWorld(locale,i,960,3);c.input.settings.contextBudget=limit;c.input.story!.world.contextBudget=limit;return {...c,id:`${locale}:budget:${limit}`,family:'budget',gold:{wanted:[...A,...B],score:false,uncertainty:false,control:false,budget:true}};}));
 return [...main,...scale,...budget];
}
