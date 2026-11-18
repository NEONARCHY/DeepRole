import type { Bilingual, Plot } from './story-rp404-corpus';

interface Probe {draft:Bilingual; wanted:string[]; exclude:string[]; warning:boolean}
interface Case {plot:Plot; probes:Probe[]}

export const hearsayCases:Case[]=[
  {plot:{id:'ferry',title:['Расписание переправы','Ferry timetable'],cast:[['Лара','Lara'],['Марк','Mark'],['Эда','Eda']],
    shifts:[['На складе пересчитали ящики','The warehouse crew counted boxes'],['Паромщик отметил уровень воды','The ferryman noted the water level']],
    beats:[
      {id:'blue-belief',act:0,kind:'belief',prose:['Лара считает, что синий паром уже переправил хор на остров.','Lara believes the blue ferry already carried the choir to the island.']},
      {id:'red-belief',act:1,kind:'belief',prose:['Лара считает, что красный паром доставил музыкантов на остров.','Lara believes the red ferry delivered the musicians to the island.']},
      {id:'blue-prep',act:2,kind:'event',prose:['Хор собрался у причала синего парома и приготовил билеты.','The choir gathered beside the blue ferry and got its tickets ready.']},
      {id:'red-report',act:3,kind:'event',prose:['В судовом журнале капитан подтвердил, что красный паром доставил музыкантов на остров.','In the ship log the captain confirmed that the red ferry delivered the musicians to the island.']},
      {id:'bell',act:4,kind:'event',prose:['Лара вернула якорный колокол мастеру.','Lara returned the anchor bell to the craftsman.']},
      {id:'blue-report',act:5,kind:'event',prose:['В судовом журнале записано, что синий паром весь день оставался у причала из-за течения.','The ship log records that the blue ferry remained at the pier all day because of the current.']},
      {id:'bridge-belief',act:6,kind:'belief',prose:['Марк считает, что каменный мост уже открыли для повозок.','Mark thinks the stone bridge has already opened for carts.']},
      {id:'bridge-prep',act:7,kind:'event',prose:['У каменного моста поставили табличку о предстоящем открытии для повозок.','A sign beside the stone bridge announced the upcoming opening for carts.']},
    ]},probes:[
      {draft:['Лара думает, что синий паром уже переправил хор. Сверяю её слова с судовым журналом.','Lara thinks the blue ferry already carried the choir. I check her claim against the ship log.'],wanted:['blue-belief','blue-report'],exclude:['red-belief','red-report','bell'],warning:false},
      {draft:['По словам Лары, красный паром доставил музыкантов. Проверяю это по судовому журналу.','According to Lara the red ferry delivered the musicians. I verify it against the ship log.'],wanted:['red-belief','red-report'],exclude:['blue-belief','blue-report','bell'],warning:false},
      {draft:['Марк уверен, что каменный мост уже открыт. Проверяю слух по журналу.','Mark is sure the stone bridge is open. I check the rumour against the log.'],wanted:['bridge-belief'],exclude:['blue-report','red-report'],warning:true},
    ]},
  {plot:{id:'loom',title:['Выставка ткачей','Weavers exhibition'],cast:[['Нина','Nina'],['Юна','Yuna'],['Феликс','Felix']],
    shifts:[['В коридоре заменили светильник','The corridor lamp was replaced'],['Вахтёр записал число посетителей','The attendant counted visitors']],
    beats:[
      {id:'silk-belief',act:0,kind:'belief',prose:['Нина считает, что шёлковое панно продали утром.','Nina thinks the silk panel was sold this morning.']},
      {id:'linen-belief',act:1,kind:'belief',prose:['Юна считает, что льняное панно уже передали школе.','Yuna thinks the linen panel has been handed over to the school.']},
      {id:'silk-prep',act:2,kind:'event',prose:['Для шёлкового панно напечатали ценник.','They printed a price tag for the silk panel.']},
      {id:'linen-report',act:3,kind:'event',prose:['В ведомости указано, что льняное панно передали школе под расписку.','The register states that the linen panel was handed over to the school against a receipt.']},
      {id:'chair',act:4,kind:'event',prose:['Нина покрасила складной стул к открытию выставки.','Nina painted a folding chair for the exhibition opening.']},
      {id:'silk-report',act:5,kind:'event',prose:['В ведомости указано, что шёлковое панно сняли с продажи до реставрации.','The register states that the silk panel was withdrawn from sale pending restoration.']},
      {id:'brooch-belief',act:6,kind:'belief',prose:['Феликс думает, что стеклянная брошь уже у покупателя.','Felix thinks the glass brooch is already with the buyer.']},
      {id:'brooch-prep',act:7,kind:'event',prose:['Стеклянную брошь завернули в бумагу для будущей выдачи покупателю.','The glass brooch was wrapped in paper for a future handover to the buyer.']},
    ]},probes:[
      {draft:['Нина уверена, что шёлковое панно продали. Проверяю её слова по ведомости.','Nina is sure the silk panel was sold. I check her account against the register.'],wanted:['silk-belief','silk-report'],exclude:['linen-belief','linen-report','chair'],warning:false},
      {draft:['Говорят, льняное панно досталось школе. Сверяю этот слух с ведомостью.','I heard the school got the linen panel. I check this rumour against the register.'],wanted:['linen-belief','linen-report'],exclude:['silk-belief','silk-report','chair'],warning:false},
      {draft:['По словам Феликса, покупатель забрал стеклянную брошь. Проверяю это по ведомости.','According to Felix the buyer collected the glass brooch. I check this against the register.'],wanted:['brooch-belief'],exclude:['linen-report','silk-report'],warning:true},
    ]},
];
