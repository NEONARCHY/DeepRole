import type {GameContextInput} from '../../src/core/game-context';
import type {Locale,SceneEntity,WorldProfile} from '../../src/core/types';
import type {StoryFact} from '../../src/core/story-update';
import {roleSeed} from '../../src/core/story-role-binding';

// Fresh RP299 prose; common schema/scaffolding only, no old fixture imports.
interface Prose {names:string[];alias:string;records:Record<string,string>;queries:string[];bridge:string;raw:string;tail:string;background:string[]}
const plots:{id:string;ru:Prose;en:Prose}[]=[{id:'flooded-theatre',ru:{
 names:['Лея Берег','Лея Холм','Даня','Оскар'],alias:'Лея',records:{
 old:'Серебряный сценический плащ Леи Берег раньше оставляли в нижней гримёрке.',
 a0:'Пока вода не уйдёт и завхоз не выдаст пропуск, серебряный сценический плащ Леи Берег не понесу; пломбу на кофре нельзя трогать.',
 a1:'Серебряный сценический плащ Леи Берег лежит в опечатанном кофре; пропуск выдаёт завхоз, а не билетёр.',
 a2:'Серебряный сценический плащ Леи Берег теперь передают в сухом репетиционном зале; нижняя гримёрка затоплена.',
 a3:'Серебряный сценический плащ Леи Берег упакован, но кофр ещё не выносили и актриса его не получила.',
 b0:'После сверки костюмной ведомости беру на себя передачу серебряного сценического плаща Леи Холм.',
 b1:'Серебряный сценический плащ Леи Холм находился на верхней вешалке; кофр Берег относится к другому плащу.',
 b2:'Серебряный сценический плащ Леи Холм передан ей лично; передачу отметили как завершённую.',
 b3:'Передача серебряного сценического плаща Леи Холм закончена, но это не открывает кофр Леи Берег.',
 c0:'Без разрешения костюмера запасной серебряный сценический плащ Дани не чиню; подкладку не отпарывать.',
 c1:'Запасной серебряный сценический плащ Дани хранится в тканевом чехле; ключ от кофра Берег к нему не подходит.',
 c2:'Запасной серебряный сценический плащ Дани теперь чинят в швейной мастерской; прежний стол убрали.',
 c3:'Запасной серебряный сценический плащ Дани просушили, но разрешения костюмера ещё нет и ремонт не начат.',
 d0:'Я обещаю не оглашать имена спонсоров до решения совета; передача костюмов не отменяет запрет.',
 d1:'Оскар временно разрешил фотографировать закрытый конверт со списком.',
 d2:'Оскар отозвал разрешение фотографировать конверт; временное разрешение больше не действует.',
 d3:'Имена спонсоров остаются закрытыми; отменённое разрешение на фото не даёт права вскрыть конверт.'
 },queries:[
 'Какие условия нужны для передачи серебряного сценического плаща Леи Берег, где она состоится и завершена ли?',
 'Раз кофр собран, с той серебристой одеждой для спектакля мы уже разобрались или ещё рано?',
 'Открываю кофр с серебряным сценическим плащом и достаю запасной; что нужно соблюсти перед обеими работами?',
 'Что с той договорённостью?','На чём мы остановились с этим делом и что пока мешает?',
 'Где теперь запасной серебряный сценический плащ Дани, есть ли разрешение и можно ли отпарывать подкладку?',
 'Другой плащ уже передали. Можно теперь огласить имена спонсоров?',
 'Конверт раньше разрешали фотографировать. Разрешение действует и можно ли вскрыть его?',
 'Что Даня обещал сделать с серебряным сценическим плащом Леи Берег?',
 'Что с обещанием передать бронзовый театральный жезл?',
 'Что с той договорённостью?','Что с той договорённостью?','Что Лея обещала передать?'
 ],bridge:'Лея Берег уточнила: та договорённость касается серебряного сценического плаща. Лея Холм сказала, что её серебряный сценический плащ — отдельная вещь, которую она уже получила.',
 raw:'Непроверенный рассказчик связал ту договорённость с бронзовым театральным жезлом.',
 tail:'Затем заговорили о другой неназванной договорённости незнакомого рабочего.',
 background:['Билетёр пересчитал программки.','На лестнице переставили ведро.','В фойе сложили стулья.','Пианист закрыл рояль.']
 },en:{
 names:['Lea Shore','Lea Hill','Danny','Oscar'],alias:'Lea',records:{
 old:'Lea Shore’s silver stage cloak used to be left in the downstairs dressing room.',
 a0:'Unless the water recedes and the caretaker issues a pass, I will not carry Lea Shore’s silver stage cloak; leave the case seal intact.',
 a1:'Lea Shore’s silver stage cloak is in a sealed case; the caretaker, not the usher, issues the pass.',
 a2:'Lea Shore’s silver stage cloak must now be handed over in the dry rehearsal room; the downstairs dressing room is flooded.',
 a3:'Lea Shore’s silver stage cloak is packed, but its case has not left and the actress has not received it.',
 b0:'After checking the costume register, I undertake handover of Lea Hill’s silver stage cloak.',
 b1:'Lea Hill’s silver stage cloak was on the upper rail; Shore’s case belongs to a different cloak.',
 b2:'Lea Hill’s silver stage cloak was handed to her personally; the handover was marked complete.',
 b3:'Handover of Lea Hill’s silver stage cloak is finished, but this does not open Lea Shore’s case.',
 c0:'Without the costume keeper’s permission I will not repair Danny’s spare silver stage cloak; do not unpick its lining.',
 c1:'Danny’s spare silver stage cloak is in a cloth cover; Shore’s case key does not fit it.',
 c2:'Danny’s spare silver stage cloak must now be repaired in the sewing workshop; the former table is gone.',
 c3:'Danny’s spare silver stage cloak was dried, but the costume keeper has not permitted repairs and work has not begun.',
 d0:'I promise not to announce sponsor names until the council decides; handing over costumes does not lift the restriction.',
 d1:'Oscar temporarily permitted photographs of the closed envelope containing the list.',
 d2:'Oscar withdrew permission to photograph the envelope; temporary permission is no longer in force.',
 d3:'Sponsor names remain confidential; withdrawn photo permission grants no right to open the envelope.'
 },queries:[
 'What conditions apply to handing over Lea Shore’s silver stage cloak, where will it happen, and is it complete?',
 'The case is packed, so are we all done with that silvery theatre outfit, or is it too soon?',
 'I open the silver stage cloak case and take the spare; what must be respected before both jobs?',
 'What about that arrangement?','Where did we leave that business and what is still in the way?',
 'Where is Danny’s spare silver stage cloak now, is permission granted, and may its lining be unpicked?',
 'The other cloak has been handed over. May we announce the sponsor names now?',
 'We used to be allowed to photograph the envelope. Is that permission valid and may we open it?',
 'What did Danny promise to do with Lea Shore’s silver stage cloak?',
 'What about the promise to hand over the bronze theatre sceptre?',
 'What about that arrangement?','What about that arrangement?','What did Lea promise to hand over?'
 ],bridge:'Lea Shore clarified that arrangement concerns the silver stage cloak. Lea Hill said her silver stage cloak is a separate item she has already received.',
 raw:'An unverified narrator linked that arrangement to the bronze theatre sceptre.',
 tail:'Then another unnamed arrangement of an unfamiliar worker was mentioned.',
 background:['The usher counted programmes.','A bucket was moved on the stairs.','Chairs were stacked in the foyer.','The pianist closed the piano.']
 }}];
const A=['a0','a1','a2','a3'],B=['b1','b2','b3'],C=['c0','c1','c2','c3'];
export const exceptionFamilies=['explicit-exception','work-paraphrase','compound','same-label-reference','free-reference','qualified-neighbour','negative-duty','revoked-permission','wrong-promisor','unknown-object','raw-only','unknown-tail','ambiguous-first-name'] as const;
const gold=[A,A,[...A,...C],[...A,...B],[...A,...B],C,['d0','d3'],['d2','d3'],[],[],[],[],[]];
export function exceptionWorld(locale:Locale,plotIndex=0,noiseCount=1500,variant=0){
 const plot=plots[plotIndex]!,p=plot[locale],worldId=`rp299-${plot.id}-${locale}`;
 const world:WorldProfile={id:worldId,name:plot.id,description:'Synthetic exception commitment audit.',color:'#647b8c',contextBudget:16000,relevanceThreshold:6,createdAt:1,updatedAt:1};
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
export function exceptionScenarios(){
 const main=(['ru','en'] as const).flatMap(locale=>plots.flatMap((_,pi)=>exceptionFamilies.map((family,i)=>({...exceptionWorld(locale,pi,1500,i),id:`${locale}:${pi}:${family}`,family:family as string,gold:{wanted:[...gold[i]!],score:i<8,uncertainty:i===3||i===4||i>=8,control:i>=8,budget:false}}))));
 const scale=(['ru','en'] as const).flatMap(locale=>[600,2800,7500].map((n,_i)=>({...exceptionWorld(locale,0,n,0),id:`${locale}:scale:${n}`,family:'scale',gold:{wanted:[...A],score:true,uncertainty:false,control:false,budget:false}})));
 const budget=(['ru','en'] as const).flatMap(locale=>[900,2800,5600].map((limit,_i)=>{const c=exceptionWorld(locale,0,1500,2);c.input.settings.contextBudget=limit;c.input.story!.world.contextBudget=limit;return {...c,id:`${locale}:budget:${limit}`,family:'budget',gold:{wanted:[...A,...C],score:false,uncertainty:false,control:false,budget:true}};}));
 return [...main,...scale,...budget];
}


