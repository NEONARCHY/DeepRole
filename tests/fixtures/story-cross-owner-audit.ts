import type {GameContextInput} from '../../src/core/game-context';
import type {Locale,SceneEntity,WorldProfile} from '../../src/core/types';
import type {StoryFact} from '../../src/core/story-update';
import {roleSeed} from '../../src/core/story-role-binding';

// RP292 authored prose/gold. No old corpus, search, parser, scorer or compiler.
// Same literal label is deliberately NOT a physical object or owner identity.
interface Prose {names:string[];records:Record<string,string>;queries:string[];bridge:string;twoThings:string;raw:string;tail:string;background:string[]}
interface Plot {id:string;ru:Prose;en:Prose}
const plots:Plot[]=[
 {id:'airship',ru:{names:['Дина','Альбина','Люба','Грета'],records:{
  aOld:'Матовый кварцевый диск Дины раньше принимали на капитанском мостике.',
  a0:'Я обещаю передать матовый кварцевый диск Дины навигатору только после подписи вахтенной; снимать защитный обод нельзя.',
  a1:'Матовый кварцевый диск Дины заперт в носовом шкафу; ключ выдаёт вахтенная, не навигатор.',
  a2:'Матовый кварцевый диск Дины теперь принимают в картографической каюте; мостик закрыт из-за испытаний.',
  a3:'Матовый кварцевый диск Дины протёрли и завернули, но навигатор его ещё не получил.',
  b0:'Я обещаю передать матовый кварцевый диск Альбины радистке после смены курса.',
  b1:'Матовый кварцевый диск Альбины хранится у кормового иллюминатора; ключ вахтенной от носового шкафа сюда не подходит.',
  b2:'Передача матового кварцевого диска Альбины радистке отменена по её просьбе; обязательство больше не действует.',
  b3:'Матовый кварцевый диск Альбины остался на борту; отмена передачи не означает получение радисткой.',
  c0:'Я обещаю заменить рифлёную медную муфту Любы только после остановки вентилятора.',
  c1:'Рифлёная медная муфта Любы находится под кожухом; открывает его только бортмеханик при обесточенном приводе.',
  c2:'Рифлёную медную муфту Любы сняли для осмотра, но новую ещё не установили и испытания не проводили.',
  d0:'Я обещаю не разглашать маршрут до посадки; разрешение передавать навигационные детали не разрешает публиковать маршрут.',
  d1:'Грета разрешила перенос деталей между каютами, но не раскрытие маршрута пассажирам.',
 },queries:[
  'Кому Дина обещала передать матовый кварцевый диск, кто выдаёт ключ и передан ли он?',
  'Как продвигается выдача мутного круглого стекла: раз его завернули, навигатор уже может считать договор выполненным?',
  'Что Люба обещала заменить в рифлёной медной муфте и можно ли открывать кожух без механика?',
  'Сверь передачу матового кварцевого диска Дины и замену рифлёной медной муфты Любы: какие ограничения сохраняются?',
  'Нужно ли ещё передавать матовый кварцевый диск Альбины радистке после отмены?',
  'Грета разрешила перенос деталей. Значит ли это, что маршрут уже можно рассказать пассажирам?',
  'Что с тем обещанием?', 'Помнишь нашу договорённость? Какие условия всё ещё действуют?',
  'Куда Грета обещала передать матовый кварцевый диск Дины?',
  'Что с обещанием заменить фиолетовый барометр?', 'Что с тем обещанием?', 'Что с тем обещанием?',
  'Я открываю носовой шкаф и достаю рифлёную медную муфту; вспоминаю условия передачи диска.',
 ],bridge:'Дина сказала: то обещание касается матового кварцевого диска. Альбина уточнила, что её матовый кварцевый диск — другая вещь с отменённой передачей.',
 twoThings:'Дина упомянула матовый кварцевый диск и своё обещание. Люба отдельно заговорила про рифлёную медную муфту и другую договорённость.',
 raw:'Кто-то якобы сказал, что то обещание относится к фиолетовому барометру.',tail:'После этого вспомнили ещё одну неназванную договорённость с неизвестным пассажиром.',
 background:['На палубе пересчитали складные стулья.','Повар закрыл пустой термос.','Стюардесса сменила скатерть.','На карте отметили облачность.','В салоне переставили вазу.']},
 en:{names:['Dina','Albina','Luba','Greta'],records:{
  aOld:'Dina’s frosted quartz disc used to be accepted on the captain’s bridge.',
  a0:'I promise to hand over Dina’s frosted quartz disc to the navigator only after the watch officer signs; its protective rim must stay on.',
  a1:'Dina’s frosted quartz disc is locked in the bow cabinet; the watch officer, not the navigator, issues the key.',
  a2:'Dina’s frosted quartz disc is now accepted in the chart cabin; the bridge is closed for trials.',
  a3:'Dina’s frosted quartz disc was wiped and wrapped, but the navigator has not received it.',
  b0:'I promise to hand over Albina’s frosted quartz disc to the radio operator after the course changes.',
  b1:'Albina’s frosted quartz disc is kept by the stern porthole; the bow cabinet key does not fit here.',
  b2:'Handover of Albina’s frosted quartz disc to the radio operator was cancelled at her request; the duty no longer applies.',
  b3:'Albina’s frosted quartz disc stayed aboard; cancellation does not mean receipt by the radio operator.',
  c0:'I promise to replace Luba’s ribbed copper coupling only after the fan stops.',
  c1:'Luba’s ribbed copper coupling is under a cover; only the flight engineer opens it with the drive isolated.',
  c2:'Luba’s ribbed copper coupling was removed for inspection, but no replacement has been installed or tested.',
  d0:'I promise not to disclose the route until landing; permission to hand over navigation parts is not permission to publish the route.',
  d1:'Greta permitted moving parts between cabins, not disclosing the route to passengers.',
 },queries:[
  'Who was Dina to hand over the frosted quartz disc to, who issues the key, and has it actually changed hands?',
  'How is releasing that cloudy round glass going: does wrapping it let the navigator call the arrangement fulfilled?',
  'What did Luba promise to replace in the ribbed copper coupling, and may the cover be opened without the engineer?',
  'Check Dina’s frosted quartz disc handover against Luba’s ribbed copper coupling replacement; keep the restrictions separate.',
  'Is Albina’s frosted quartz disc still due to the radio operator after cancellation?',
  'Greta allowed parts to move between cabins. Does that also permit telling passengers the route?',
  'What about that promise?', 'Remember our arrangement? Which conditions still apply?',
  'Where did Greta promise to hand over Dina’s frosted quartz disc?',
  'What about the promise to replace the violet barometer?', 'What about that promise?', 'What about that promise?',
  'I open the bow cabinet and take the ribbed copper coupling, recalling the disc handover conditions.',
 ],bridge:'Dina said that promise concerns the frosted quartz disc. Albina explained that her frosted quartz disc is another item whose handover was cancelled.',
 twoThings:'Dina mentioned the frosted quartz disc and her promise. Luba independently discussed the ribbed copper coupling and a different arrangement.',
 raw:'Somebody allegedly said that promise concerns the violet barometer.',tail:'Afterwards another unnamed arrangement with an unknown passenger was mentioned.',
 background:['Folding chairs were counted on deck.','The cook shut an empty flask.','The steward changed the tablecloth.','Cloud cover was marked on a chart.','A vase was moved in the lounge.']}},
 {id:'salt-caravan',ru:{names:['Тая','Лада','Инга','Эльза'],records:{
  aOld:'Гранёный янтарный сосуд Таи раньше ожидали у северного навеса.',
  a0:'Я обещаю передать гранёный янтарный сосуд Таи оценщице после сверки печати; пробку до сверки не вынимать.',
  a1:'Гранёный янтарный сосуд Таи лежит в нижнем дорожном сундуке; замок открывает караванщица с личным ключом.',
  a2:'Гранёный янтарный сосуд Таи теперь принимают в белом шатре; северный навес снесло ветром.',
  a3:'Гранёный янтарный сосуд Таи уложили в солому, но оценщице ещё не передали.',
  b0:'Я обещаю передать гранёный янтарный сосуд Лады купчихе после вечернего привала.',
  b1:'Гранёный янтарный сосуд Лады стоит в верхней корзине; ключ от дорожного сундука к нему отношения не имеет.',
  b2:'Передача гранёного янтарного сосуда Лады купчихе отменена; прежнее обязательство снято.',
  b3:'Гранёный янтарный сосуд Лады оставили у каравана; отмена не равна получению купчихой.',
  c0:'Я обещаю заменить полосатый льняной фильтр Инги после остывания перегонного куба.',
  c1:'Полосатый льняной фильтр Инги под пломбой мастерицы; вскрывать её без мастерицы нельзя.',
  c2:'Полосатый льняной фильтр Инги вынули, но свежий не вставили и воду после замены не проверяли.',
  d0:'Я обещаю хранить расположение колодца в тайне до возвращения; разрешение нести сосуды не раскрывает расположение колодца.',
  d1:'Эльза разрешила перенос сосудов, но не публикацию карты колодца.',
 },queries:[
  'Кому Тая обещала передать гранёный янтарный сосуд, кто открывает сундук и состоялась ли передача?',
  'Ну как с выдачей тёплой на вид посудины: солому проложили — выходит, оценщица уже всё получила?',
  'Что Инга обещала заменить в полосатом льняном фильтре, какие допуски нужны?',
  'Сопоставь передачу гранёного янтарного сосуда Таи и замену полосатого льняного фильтра Инги.',
  'Что осталось от обязательства передать гранёный янтарный сосуд Лады купчихе после отмены?',
  'Раз Эльза разрешила перенос сосудов, можно ли всем показать карту колодца?',
  'Напомни о том обещании.', 'Помнишь, о чём договаривались? Что ещё не разрешено?',
  'Куда Эльза обещала передать гранёный янтарный сосуд Таи?',
  'Как там обещание заменить зеркальный песочный компас?', 'Напомни о том обещании.', 'Напомни о том обещании.',
  'Я открываю нижний дорожный сундук и достаю полосатый льняной фильтр, вспоминая условия передачи сосуда.',
 ],bridge:'Тая сказала: то обещание про гранёный янтарный сосуд. Лада ответила, что её гранёный янтарный сосуд — отдельная вещь, передача которой отменена.',
 twoThings:'Тая вернулась к гранёному янтарному сосуду и обещанию. Инга независимо заговорила про полосатый льняной фильтр и другую договорённость.',
 raw:'Кто-то будто бы уточнил, что то обещание касается зеркального песочного компаса.',tail:'Позже прозвучала ещё одна договорённость неизвестного путника без названия вещи.',
 background:['На привале свернули пустой коврик.','Ветер засыпал старый след.','Погонщица пересчитала колышки.','На верёвке сушили платок.','Вечером погасили лишний фонарь.']},
 en:{names:['Taya','Lada','Inga','Elsa'],records:{
  aOld:'Taya’s faceted amber vessel used to be expected at the north awning.',
  a0:'I promise to hand over Taya’s faceted amber vessel to the appraiser after checking the seal; its stopper must remain in place until then.',
  a1:'Taya’s faceted amber vessel is in the lower travel chest; the caravan keeper opens the lock with her personal key.',
  a2:'Taya’s faceted amber vessel is now accepted in the white tent; the north awning blew away.',
  a3:'Taya’s faceted amber vessel was padded with straw, but has not been handed to the appraiser.',
  b0:'I promise to hand over Lada’s faceted amber vessel to the trader after the evening halt.',
  b1:'Lada’s faceted amber vessel stands in the upper basket; the travel chest key has nothing to do with it.',
  b2:'Handover of Lada’s faceted amber vessel to the trader was cancelled; the old obligation was withdrawn.',
  b3:'Lada’s faceted amber vessel stayed with the caravan; cancellation does not mean receipt by the trader.',
  c0:'I promise to replace Inga’s striped linen filter after the still cools.',
  c1:'Inga’s striped linen filter is under the craftswoman’s seal; opening it without her is not allowed.',
  c2:'Inga’s striped linen filter was removed, but no fresh one was inserted and no post-replacement water test took place.',
  d0:'I promise to keep the well location secret until our return; permission to carry vessels does not disclose the well location.',
  d1:'Elsa permitted carrying vessels, not publishing the well map.',
 },queries:[
  'Who was Taya to hand over the faceted amber vessel to, who opens the chest, and has handover happened?',
  'Any progress releasing that warm-looking pot: does adding straw mean the appraiser already received everything?',
  'What did Inga promise to replace in the striped linen filter, and which permissions are required?',
  'Compare Taya’s faceted amber vessel handover with Inga’s striped linen filter replacement.',
  'What remains of the duty to hand over Lada’s faceted amber vessel to the trader after cancellation?',
  'If Elsa allowed vessels to be carried, may everyone see the well map?',
  'Remind me of that promise.', 'Remember what we agreed? What is still not permitted?',
  'Where did Elsa promise to hand over Taya’s faceted amber vessel?',
  'How is the promise to replace the mirrored sand compass going?', 'Remind me of that promise.', 'Remind me of that promise.',
  'I open the lower travel chest and take the striped linen filter while recalling the vessel handover conditions.',
 ],bridge:'Taya said that promise concerns the faceted amber vessel. Lada replied that her faceted amber vessel is a separate item with a cancelled handover.',
 twoThings:'Taya returned to the faceted amber vessel and her promise. Inga separately discussed the striped linen filter and another arrangement.',
 raw:'Somebody supposedly clarified that promise concerns the mirrored sand compass.',tail:'Later another arrangement by an unknown traveller was mentioned without naming an item.',
 background:['An empty mat was rolled up at the halt.','Wind covered an old footprint.','The driver counted tent pegs.','A scarf dried on a rope.','An unnecessary lantern was extinguished.']}},
 {id:'printshop',ru:{names:['Снежана','Веста','Рада','Юна'],records:{
  aOld:'Резной ореховый футляр Снежаны раньше сдавали у печатного станка.',
  a0:'Я обещаю передать резной ореховый футляр Снежаны переплётчице после подписи приёмщицы; сургуч до подписи не ломать.',
  a1:'Резной ореховый футляр Снежаны хранится в запертом бюро; ключ остаётся у приёмщицы, не у переплётчицы.',
  a2:'Резной ореховый футляр Снежаны теперь принимают на сушильном этаже; печатный зал временно закрыт.',
  a3:'Резной ореховый футляр Снежаны обернули бумагой, но переплётчица его не получала.',
  b0:'Я обещаю передать резной ореховый футляр Весты гравёрше после окончания тиража.',
  b1:'Резной ореховый футляр Весты находится в шкафу образцов; ключ от бюро туда не подходит.',
  b2:'Передача резного орехового футляра Весты гравёрше отменена; требовать её исполнения больше нельзя.',
  b3:'Резной ореховый футляр Весты остался у Весты; отменённая передача не стала выполненной.',
  c0:'Я обещаю заменить мягкий войлочный валик Рады после остановки привода.',
  c1:'Мягкий войлочный валик Рады закрыт щитком; снимать щиток может только наладчица после блокировки питания.',
  c2:'Мягкий войлочный валик Рады вынули для обмера, но другой ещё не поставили и пробный оттиск не сделали.',
  d0:'Я обещаю не раскрывать имя заказчицы до выхода книги; разрешение переносить рукопись не раскрывает имя.',
  d1:'Юна разрешила перенос рукописи, но не разглашение имени заказчицы.',
 },queries:[
  'Кому Снежана обещала передать резной ореховый футляр, кто выдаёт ключ и завершена ли передача?',
  'Что там с выдачей деревянной коробочки с узором: бумага уже на месте, можно считать договор закрытым?',
  'Что Рада обещала заменить в мягком войлочном валике и кто допускает к щитку?',
  'Сравни передачу резного орехового футляра Снежаны и замену мягкого войлочного валика Рады.',
  'Осталось ли обязательство передать резной ореховый футляр Весты гравёрше после отмены?',
  'Юна разрешила перенос рукописи; даёт ли это право назвать заказчицу до выхода книги?',
  'А что с тем обещанием?', 'Как насчёт нашего уговора — что ещё остаётся под запретом?',
  'Куда Юна обещала передать резной ореховый футляр Снежаны?',
  'Что с обещанием заменить серебристый наборный колокол?', 'А что с тем обещанием?', 'А что с тем обещанием?',
  'Я открываю запертое бюро и достаю мягкий войлочный валик, вспоминая условия передачи футляра.',
 ],bridge:'Снежана сказала: то обещание относится к резному ореховому футляру. Веста отметила, что её резной ореховый футляр — отдельный предмет с отменённой передачей.',
 twoThings:'Снежана обсуждала резной ореховый футляр и обещание. Рада отдельно назвала мягкий войлочный валик и другую договорённость.',
 raw:'Кто-то якобы пояснил, что то обещание связано с серебристым наборным колоколом.',tail:'Затем вспомнили ещё одно неназванное обязательство незнакомой посетительницы.',
 background:['На подоконник поставили чашку.','Ученица пересчитала листы обёртки.','Курьер поправил шапку.','В приёмной вытерли поднос.','У двери сменили коврик.']},
 en:{names:['Snezhana','Vesta','Rada','Yuna'],records:{
  aOld:'Snezhana’s carved walnut case used to be surrendered by the printing press.',
  a0:'I promise to hand over Snezhana’s carved walnut case to the binder after the receiving clerk signs; its wax must stay intact until then.',
  a1:'Snezhana’s carved walnut case is kept in the locked bureau; the receiving clerk, not the binder, retains the key.',
  a2:'Snezhana’s carved walnut case is now accepted on the drying floor; the print hall is temporarily closed.',
  a3:'Snezhana’s carved walnut case was wrapped in paper, but the binder has not received it.',
  b0:'I promise to hand over Vesta’s carved walnut case to the engraver after the print run.',
  b1:'Vesta’s carved walnut case is in the sample cupboard; the bureau key does not fit there.',
  b2:'Handover of Vesta’s carved walnut case to the engraver was cancelled; fulfillment can no longer be demanded.',
  b3:'Vesta’s carved walnut case stayed with Vesta; the cancelled handover did not become a completed one.',
  c0:'I promise to replace Rada’s soft felt roller after the drive stops.',
  c1:'Rada’s soft felt roller is behind a shield; only the setter may remove it after power is locked out.',
  c2:'Rada’s soft felt roller was removed for measurement, but another has not been fitted and no proof impression was made.',
  d0:'I promise not to reveal the client’s name before publication; permission to move the manuscript does not reveal the name.',
  d1:'Yuna allowed the manuscript to move, not disclosure of the client’s name.',
 },queries:[
  'Who was Snezhana to hand over the carved walnut case to, who issues the key, and is handover complete?',
  'What became of releasing the patterned wooden box: does paper in place make the arrangement settled?',
  'What did Rada promise to replace in the soft felt roller, and who permits access behind the shield?',
  'Compare Snezhana’s carved walnut case handover with Rada’s soft felt roller replacement.',
  'Does the duty to hand over Vesta’s carved walnut case to the engraver remain after cancellation?',
  'Yuna allowed the manuscript to be moved; does that permit naming the client before publication?',
  'So what about that promise?', 'How about our understanding: which restrictions still stand?',
  'Where did Yuna promise to hand over Snezhana’s carved walnut case?',
  'What about the promise to replace the silvery typesetting bell?', 'So what about that promise?', 'So what about that promise?',
  'I open the locked bureau and take the soft felt roller while recalling the case handover conditions.',
 ],bridge:'Snezhana said that promise concerns the carved walnut case. Vesta explained that her carved walnut case is a separate object whose handover was cancelled.',
 twoThings:'Snezhana discussed the carved walnut case and her promise. Rada independently named the soft felt roller and another arrangement.',
 raw:'Somebody allegedly explained that promise concerns the silvery typesetting bell.',tail:'Then another unnamed obligation of an unfamiliar visitor was mentioned.',
 background:['A cup was placed on the windowsill.','The apprentice counted wrapping sheets.','The courier straightened a hat.','A tray was wiped in reception.','The doormat was changed.']}},
];
const A=['a0','a1','a2','a3'],B=['b1','b2','b3'],C=['c0','c1','c2'],D=['d0','d1'];
export const crossOwnerFamilies=['handover','handover-paraphrase','replacement','two-obligations','cancelled-lookalike','consent-boundary','same-label-reference','rephrased-reference','wrong-promisor','unknown-object','raw-only','independent-things','composite-action','unknown-tail'] as const;
const gold=[A,A,C,[...A,...C],B,D,[...A,...B],[...A,...B],[],[],[],[],[...A,...C],[]];
export function crossOwnerWorld(locale:Locale,plotIndex=0,noiseCount=1100,variant=0){
 const plot=plots[plotIndex]!,p=plot[locale],worldId=`rp292-${plot.id}-${locale}`;
 const world:WorldProfile={id:worldId,name:`RP292 ${plot.id}`,description:'Synthetic cross-owner conditions audit.',color:'#617a86',contextBudget:16000,relevanceThreshold:6,createdAt:1,updatedAt:1};
 const entities:SceneEntity[]=p.names.map((name,i)=>({id:worldId+'-p'+i,worldId,kind:'character',name,description:'',aliases:[],memberIds:[],createdAt:1,updatedAt:1}));
 const facts:StoryFact[]=[],ids:string[]=[],owners:number[]=[];
 const add=(id:string,text:string,owner:number,extra:Partial<StoryFact>={})=>{ids.push(id);owners.push(owner);facts.push({kind:'event',text,quote:text,...extra});};
 const record=(id:string,owner:number)=>{const body=p.records[id]!,text=locale==='ru'?`${p.names[owner]} сказала: «${body}»`:`${p.names[owner]} said: “${body}”`;
  const task=['a0','b0','b2','c0','d0'].includes(id);
  add(id,text,owner,task?{kind:id==='b2'?'event':'promise',task:{key:worldId+'-obligation-'+id[0],title:p.records[id[0]+'0']!,status:id==='b2'?'cancelled':'open'}}:id==='aOld'||id==='a2'?{claim:{key:worldId+'-handover-place',value:body,scope:'state',lifetime:'persistent'}}:{});
 };
 let cursor=0;const noise=(to:number)=>{for(;cursor<to;cursor++)add('background-'+cursor,`${locale==='ru'?'Журнал':'Log'} ${cursor+1}. ${p.background[(cursor*3+Math.floor(cursor/13))%p.background.length]} ${locale==='ru'?'Смена':'Shift'} ${Math.floor(cursor/7)+1}.`,cursor%4);};
 noise(Math.floor(noiseCount*.08));['aOld',...A].forEach(id=>record(id,0));
 noise(Math.floor(noiseCount*.43));['b0',...B].forEach(id=>record(id,1));
 noise(Math.floor(noiseCount*.68));C.forEach(id=>record(id,2));
 noise(Math.floor(noiseCount*.86));record('d0',0);record('d1',3);noise(noiseCount);
 const latest=variant===6||variant===7||variant===13?p.bridge:variant===11?p.twoThings:locale==='ru'?'Вечер закончился; обсуждают завтрашний завтрак.':'The evening ended; tomorrow’s breakfast is being discussed.';
 add('latest',latest,0);
 const sources=facts.map((_,i)=>worldId+'-source-'+i),roleSeeds=facts.map((f,i)=>{const person=entities[owners[i]!]!;return roleSeed(f,{version:1,sourceRevisionId:sources[i]!,quote:f.quote,roles:{speaker:{id:person.id,name:person.name},...(f.task?{promisor:{id:person.id,name:person.name}}:{})}});});
 const recent=variant===10?p.raw:variant===13?latest+' '+p.tail:latest;
 const input:GameContextInput={draft:p.queries[Math.min(variant,12)]!,recentMessages:[recent],entries:[],books:[],entities,worlds:[world],activeBookId:null,scene:{worldId,bookId:null,focusIds:[]},settings:{contextBudget:16000,relevanceThreshold:6},story:{world,chat:worldId+'-chat',branch:worldId+'-branch',facts,sheetsEnabled:false,roleSeeds,episodeSources:sources}};
 if(variant===13)input.draft=p.queries[6]!;
 return {input,ids,sources,locale,noiseCount,plotId:plot.id};
}
export function crossOwnerScenarios(){
 const main=(['ru','en'] as const).flatMap(locale=>plots.flatMap((plot,pi)=>crossOwnerFamilies.map((family,fi)=>({...crossOwnerWorld(locale,pi,1100,fi),id:`${locale}:${plot.id}:${family}`,family:family as string,gold:{wanted:[...gold[fi]!],score:fi<8||fi===12,uncertainty:fi>=6&&fi!==12,control:fi>=8&&fi!==12,budget:false}}))));
 const scale=(['ru','en'] as const).flatMap(locale=>[450,2300,6500].map((n,i)=>({...crossOwnerWorld(locale,i,n,3),id:`${locale}:scale:${n}`,family:'scale',gold:{wanted:[...A,...C],score:true,uncertainty:false,control:false,budget:false}})));
 const budget=(['ru','en'] as const).flatMap(locale=>[900,2400,5200].map((limit,i)=>{const c=crossOwnerWorld(locale,i,1100,3);c.input.settings.contextBudget=limit;c.input.story!.world.contextBudget=limit;return {...c,id:`${locale}:budget:${limit}`,family:'budget',gold:{wanted:[...A,...C],score:false,uncertainty:false,control:false,budget:true}};}));
 return [...main,...scale,...budget];
}
