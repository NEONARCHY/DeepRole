import type { StoryFact } from "../../src/core/story-update";

export type Bilingual = readonly [ru: string, en: string];
type TaskSeed = [title: Bilingual, status: "open" | "completed" | "cancelled"];
export interface Beat {
  id: string;
  act: number;
  kind: StoryFact["kind"];
  prose: Bilingual;
  task?: TaskSeed;
}
export interface Plot {
  id: string;
  title: Bilingual;
  cast: Bilingual[];
  beats: Beat[];
  shifts: Bilingual[];
}

export const plots: Plot[] = [
  {
    id: "radio", title: ["Ночная частота", "The night frequency"],
    cast: [["Эмма", "Emma"], ["Лукас", "Lucas"], ["Инес", "Ines"]],
    beats: [
      { id: "master", act: 0, kind: "promise", task: [["Передача оригинала в фонотеку", "Master reel for the sound library"], "open"], prose: ["Эмма обещала Инес отдать оригинал колыбельной в фонотеку только после письменного согласия певицы.", "Emma promised Ines the original lullaby reel for the sound library once the singer gave written consent."] },
      { id: "dub", act: 0, kind: "promise", task: [["Копия для утреннего ведущего", "Dub for the breakfast host"], "open"], prose: ["Лукас обещал утреннему ведущему копию той же колыбельной после удаления фамилии певицы из вступления.", "Lucas promised the breakfast host a dub of the same lullaby once the singer’s surname had been cut from the introduction."] },
      { id: "bell", act: 0, kind: "promise", task: [["Запасной звонок для школы", "Spare bell for the school"], "open"], prose: ["Инес обещала вернуть школе запасной звонок, когда привезут мягкую прокладку для футляра.", "Ines promised to return the spare bell to the school when the padding for its case arrived."] },
      { id: "label", act: 1, kind: "event", prose: ["В аппаратной оригинал колыбельной перемотали на белую катушку. На синей катушке лежит копия для ведущего.", "In the control room they wound the original lullaby onto a white reel. The breakfast host’s dub is on the blue reel."] },
      { id: "terms", act: 1, kind: "event", prose: ["Певица разрешила хранить запись в фонотеке. Выход колыбельной в эфир требует отдельного разрешения даже после обработки вступления.", "The singer allowed the recording to be kept in the sound library. Broadcasting the lullaby requires separate permission even after editing the introduction."] },
      { id: "poster", act: 2, kind: "event", task: [["Афиша ночного концерта", "Night concert poster"], "completed"], prose: ["Лукас отнёс афишу ночного концерта в клуб; расписка осталась в его кармане. Доставка афиши завершена.", "Lucas delivered the night concert poster to the club and pocketed the receipt. Poster delivery is complete."] },
      { id: "false-start", act: 2, kind: "event", prose: ["На репетиции звукорежиссёр проверил на синей катушке уровень шума. Это была проверка громкости, вступление никто не редактировал.", "At rehearsal the engineer tested the noise level on the blue reel. It was a level check and nobody edited the introduction."] },
      { id: "signature", act: 3, kind: "event", prose: ["Подписанное певицей согласие на хранение оригинала колыбельной Инес подшила в зелёную папку. Согласия на эфир в папке нет.", "Ines filed the singer’s signed consent for storage of the original lullaby in the green folder. It contains no permission to broadcast."] },
      { id: "blue-place", act: 3, kind: "event", prose: ["Синюю катушку с копией колыбельной оставили у монтажного пульта, в нижнем ящике под наушниками.", "The blue reel holding the lullaby dub was left at the editing desk, in the bottom drawer under the headphones."] },
      { id: "understudy", act: 4, kind: "event", task: [["Дубликат для школьной репетиции", "Duplicate for the school rehearsal"], "cancelled"], prose: ["Школа отменила свой заказ на дубликат колыбельной. Инес зачеркнула только школьную заявку.", "The school cancelled its order for a duplicate of the lullaby. Ines crossed out only the school request."] },
      { id: "edit", act: 5, kind: "event", prose: ["Лукас вырезал фамилию из вступления на синей катушке с копией колыбельной. Ведущий за копией пока не приходил.", "Lucas cut the surname from the introduction on the blue lullaby dub. The host has not collected the dub yet."] },
      { id: "move", act: 5, kind: "event", prose: ["После протечки Эмма перенесла белую катушку с оригиналом колыбельной в сухой сейф. Инес её ещё не получала.", "After a leak Emma moved the white reel with the original lullaby into the dry safe. Ines has not received it yet."] },
      { id: "rumor", act: 6, kind: "belief", prose: ["Инес считает, что слушатели уже слышали колыбельную, потому что кто-то напевал её в очереди. В журнале эфира такой передачи нет.", "Ines thinks the audience has heard the lullaby because someone hummed it in the queue. The transmission log has no such broadcast."] },
      { id: "bell-pad", act: 6, kind: "event", prose: ["В школу пришла посылка только с пустым футляром. Мягкая прокладка для запасного звонка задержалась.", "Only an empty case arrived at the school. The padding for the spare bell has been delayed."] },
      { id: "permit", act: 7, kind: "event", prose: ["Перед ночной сменой певица снова отказала в передаче колыбельной по радио; разрешение хранить оригинал в фонотеке она оставила в силе.", "Before the night shift the singer again refused to let the lullaby go out on the radio; the sound library may still keep the original."] },
      { id: "doors", act: 7, kind: "event", prose: ["Дежурный открыл фонотеку с рассветом. На приёмном столе пока лежит пустой бланк выдачи, без подписи Инес.", "The attendant opened the sound library at dawn. A blank handover form with no signature from Ines is still on the counter."] },
    ],
    shifts: [
      ["в студенческой редакции занесли в журнал заставку для прогноза погоды", "the student newsroom logged an opening jingle for the weather forecast"],
      ["в старой кабине подвесили плотную штору, чтобы заглушить шум трамваев", "a heavy curtain went up in the old booth to damp the sound of trams"],
      ["на выезде записали шум прибоя и вернули дождевик в общую раздевалку", "the outside crew recorded the surf and returned a raincoat to the cloakroom"],
      ["в ночном выпуске поменяли местами объявления о пароме и ярмарке", "the night bulletin swapped the ferry and market announcements"],
      ["на занятии сравнили шум пустой ленты с шумом вентилятора", "the trainees compared blank tape hiss with the sound of a fan"],
      ["на доске дежурств оставили талон на чай для следующей смены", "a tea voucher for the incoming shift was pinned to the rota"],
      ["на экскурсии подписали коробку учебных записей для слушателей", "the tour group labelled a box of practice recordings for visitors"],
      ["после грозы просушили коврик у запасного выхода и проверили свет", "after the storm the crew dried the mat at the emergency exit and checked the light"],
    ],
  },
  {
    id: "orchard", title: ["Письма из грушевого сада", "Letters from the pear orchard"],
    cast: [["Рута", "Ruta"], ["Оскар", "Oscar"], ["Нина", "Nina"]],
    beats: [
      { id: "upper", act: 0, kind: "promise", task: [["Черенки верхнего ряда", "Scions from the upper row"], "open"], prose: ["Рута обещала Нине черенки груши из верхнего ряда для учебного сада. Срезать можно после осмотра почек.", "Ruta promised Nina pear scions from the upper row for the teaching garden. They can be cut after the buds are inspected."] },
      { id: "lower", act: 0, kind: "promise", task: [["Черенки нижнего ряда", "Scions from the lower row"], "open"], prose: ["Оскар обещал Нине черенки той же груши из нижнего ряда для питомника. Ему нужно дождаться, пока уйдёт вода из канавы.", "Oscar promised Nina scions of the same pear from the lower row for the nursery. He has to wait for the ditch to drain."] },
      { id: "map", act: 0, kind: "promise", task: [["Карта посадок для кружка", "Planting map for the gardening club"], "open"], prose: ["Нина обещала передать кружку карту посадок, когда с листа сотрут домашний адрес дарителя сада.", "Nina promised the gardening club the planting map once the donor’s home address was erased from the sheet."] },
      { id: "tags", act: 1, kind: "event", prose: ["Нина пометила деревья верхнего ряда лиловыми лентами, а деревья нижнего — жёлтыми. Сорт груш у обоих рядов один.", "Nina tied lilac ribbons to the upper trees and yellow ribbons to the lower ones. Both rows grow the same pear variety."] },
      { id: "key", act: 1, kind: "event", prose: ["Карту посадок Нина убрала в плоский ящик стола у входа. Ключ от ящика висит на синем шнурке.", "Nina put the planting map in the shallow drawer by the entrance. Its key hangs on a blue cord."] },
      { id: "basket", act: 2, kind: "event", task: [["Корзина прошлогодних груш", "Last season’s basket of pears"], "completed"], prose: ["Оскар доставил в школу корзину прошлогодних груш. Учитель расписался за плоды, веток в корзине не было.", "Oscar delivered last season’s basket of pears to the school. The teacher signed for fruit; there were no branches in the basket."] },
      { id: "water", act: 2, kind: "event", prose: ["Рута увидела сухую кромку у моста. На дне канавы у нижнего ряда вода по-прежнему стоит.", "Ruta saw a dry strip by the bridge. There is still standing water in the ditch by the lower row."] },
      { id: "inspection", act: 3, kind: "event", prose: ["Агроном осмотрел почки груш в верхнем ряду и оставил Руте записку: здоровые побеги можно срезать для учебного сада.", "The grower inspected the buds in the upper pear row and left Ruta a note clearing the healthy shoots for the teaching garden."] },
      { id: "privacy", act: 3, kind: "event", prose: ["Даритель разрешил показать кружку карту посадок после удаления адреса. Копировать исходный лист целиком он запретил.", "The donor allowed the club to see the planting map once the address was removed. He forbade copying the original sheet in full."] },
      { id: "spare", act: 4, kind: "event", task: [["Ветки для гербария", "Twigs for the herbarium"], "cancelled"], prose: ["Нина отменила отдельную просьбу гербария о грушевых ветках; учебный сад и питомник заказы не отзывали.", "Nina cancelled the herbarium’s separate request for pear twigs; neither the teaching garden nor the nursery withdrew its order."] },
      { id: "bundle", act: 5, kind: "event", prose: ["Рута нарезала черенки верхнего ряда и завернула их во влажное полотно. Свёрток для учебного сада лежит в погребе на решётке.", "Ruta cut the upper-row scions and wrapped them in damp linen. The teaching garden’s bundle is on a rack in the cellar."] },
      { id: "overlay", act: 5, kind: "event", prose: ["Нина прикрыла адрес на карте посадок полоской кальки для примерки. Если её поднять, адрес читается целиком.", "Nina laid tracing paper over the address on the planting map as a trial. Lift the strip and the entire address is still legible."] },
      { id: "pump", act: 6, kind: "event", prose: ["Оскар заменил насос у нижнего ряда. Канава ещё заполнена; заготовку черенков для питомника он отложил.", "Oscar replaced the pump by the lower row. The ditch is still full and he put off cutting the nursery scions."] },
      { id: "receipt", act: 6, kind: "event", prose: ["Нина взяла в погребе свёрток для учебного сада и расписалась Руте за верхние черенки.", "Nina collected the teaching garden’s bundle from the cellar and signed Ruta’s receipt for the upper scions."] , task: [["Черенки верхнего ряда", "Scions from the upper row"], "completed"] },
      { id: "gossip", act: 7, kind: "belief", prose: ["Рута считает, что питомник тоже получил черенки: у ворот стояла его тележка. В накладной питомника строка о получении пуста.", "Ruta believes the nursery got its scions too because its cart was at the gate. The receipt line on the nursery docket is blank."] },
      { id: "deadline", act: 7, kind: "event", prose: ["Кружок согласился подождать карту посадок до понедельника. Срок сдвинут, но условие дарителя об адресе осталось прежним.", "The club agreed to wait until Monday for the planting map. The deadline moved, but the donor’s condition about the address still stands."] },
    ],
    shifts: [
      ["у старых ворот промыли ящики для зимних яблок и сложили их под навес", "by the old gate the winter apple crates were rinsed and stacked under cover"],
      ["на уроке рисования сравнили отпечатки листьев на серой и белой бумаге", "the art class compared leaf prints on grey and white paper"],
      ["на обходе измерили тень от водонапорной башни и поправили колышек", "on the rounds the crew measured the water tower’s shadow and straightened a stake"],
      ["после рынка оставили пакет вишнёвых косточек в школьном шкафу", "after market day a packet of cherry stones went into the school cupboard"],
      ["у компостной ямы вывесили новое расписание дежурств на неделю", "a new weekly rota was put up by the compost heap"],
      ["в теплице сменили крючок для лейки и вымели прошлогодние листья", "in the glasshouse a watering-can hook was replaced and old leaves swept up"],
      ["в гостевой книге записали вопрос о цветении яблони у южной стены", "a visitor noted a question about the apple blossom by the south wall"],
      ["к вечеру перепроверили запас бечёвки и отправили тележку в сарай", "towards dusk the twine stock was checked and the handcart wheeled into the shed"],
    ],
  },
];
