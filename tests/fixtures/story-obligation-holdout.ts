import type {GameContextInput} from '../../src/core/game-context';
import type {Locale,SceneEntity,WorldProfile} from '../../src/core/types';
import type {StoryFact} from '../../src/core/story-update';
import {roleSeed} from '../../src/core/story-role-binding';

// RP287: authored before running the compiler. No earlier corpus, gold, matcher
// or evaluation output is imported. Similar labels do NOT imply object identity.
interface Prose {
 names:[string,string,string,string];
 records:Record<string,string>;
 queries:string[];
 bridge:string;
 falseBridge:string;
 tail:string;
 scenery:string[];
}
interface Setting {id:string;ru:Prose;en:Prose}
const settings:Setting[]=[
 {id:'theatre',ru:{names:['Нелли','Римма','Эмма','Грета'],records:{
  aOld:'Старый бархатный плащ Нелли следует отдавать на проходной.',
  a0:'Я обещаю вернуть старый бархатный плащ Нелли с биркой Н-17 после последнего спектакля; до этого выносить его нельзя.',
  a1:'Старый бархатный плащ Нелли с биркой Н-17 висит в запертой гримёрной. Ключ только у костюмера.',
  a2:'Старый бархатный плащ Нелли с биркой Н-17 теперь принимают в швейной комнате; проходная закрыта.',
  a3:'Старый бархатный плащ Нелли с биркой Н-17 почистили, но хозяйке его ещё не вернули.',
  b0:'Я обещаю вернуть старый бархатный плащ Риммы с биркой Р-42 после фотосъёмки; спектакль Нелли к этому долгу отношения не имеет.',
  b1:'Старый бархатный плащ Риммы с биркой Р-42 лежит в дорожном чехле у фотографа.',
  b2:'Старый бархатный плащ Риммы с биркой Р-42 ждут в понедельник у служебного входа; он пока не возвращён.',
  c0:'Я обещаю вернуть старый бархатный жилет Эммы после примерки.',
  c1:'Старый бархатный жилет Эммы уже возвращён лично в руки; возврат завершён.',
  c2:'Эмма подписала расписку за старый бархатный жилет; это не расписка за чей-либо плащ.',
  d0:'Я обещаю вернуть синий театральный сундук Грете после гастролей.',
  d1:'Обещание вернуть синий театральный сундук отменено по просьбе Греты; долг больше не действует.',
  d2:'Синий театральный сундук остаётся в театре как подарок Греты, отвозить его не нужно.',
  e0:'Я обещаю отремонтировать старый бархатный занавес после приезда мастера; это не возврат костюма.',
 },queries:[
  'Куда вернуть старый бархатный плащ Нелли с биркой Н-17, кто даст ключ и выполнен ли её долг?',
  'Куда теперь отдавать ту тёмную накидку со сцены после чистки, разве подготовка уже закрыла обещанный возврат?',
  'Что Римма обещала вернуть и какое условие относится именно к её плащу?',
  'Сравни обещания Нелли и Риммы вернуть старый бархатный плащ. У кого какая бирка и срок?',
  'Вернула ли Эмма старый бархатный жилет, или её обещание ещё открыто?',
  'Нужно ли ещё возвращать синий театральный сундук Грете, если долг отменён?',
  'Напомни о том долге.',
  'Напомни о том долге.',
  'Напомни о том долге.',
  'Куда вернуть плащ Греты с биркой Н-17 по её обещанию?',
  'Куда вернуть серебряный сценический шлем по обещанному долгу?',
  'Напомни о том долге.',
 ],bridge:'Нелли пояснила: тот долг означает её обещание вернуть старый бархатный плащ с биркой Н-17 после спектакля.',
 falseBridge:'Нелли якобы пояснила, что тот долг — обещание вернуть серебряный сценический шлем.',
 tail:'Позже кто-то заговорил о совершенно другом обещании, но не назвал ни вещь, ни владельца.',
 scenery:['Суфлёр проверил лампу под пюпитром.','На афише исправили время открытия дверей.','В фойе расставили стулья для зрителей.','Гримёр принесла запасные кисти.','Рабочие закрепили лестницу на чердаке.','Оркестр репетировал вступление без солистов.','У билетной кассы нашли перчатку.','В буфете заказали воду для всей труппы.']},
 en:{names:['Nell','Rima','Emma','Greta'],records:{
  aOld:'Nell’s old velvet cloak must be handed in at the gatehouse.',
  a0:'I promise to return the old velvet cloak belonging to Nell, tag N-17, after the final performance; taking it away earlier is forbidden.',
  a1:'The old velvet cloak belonging to Nell, tag N-17, hangs in a locked dressing room. Only the dresser has the key.',
  a2:'The old velvet cloak belonging to Nell, tag N-17, is now accepted in the sewing room; the gatehouse has closed.',
  a3:'The old velvet cloak belonging to Nell, tag N-17, has been cleaned, but has not been returned to her.',
  b0:'I promise to return the old velvet cloak belonging to Rima, tag R-42, after the photo session; Nell’s performance has nothing to do with this debt.',
  b1:'The old velvet cloak belonging to Rima, tag R-42, is in a travel cover at the photographer’s studio.',
  b2:'The old velvet cloak belonging to Rima, tag R-42, is expected at the stage door on Monday; it has not been returned.',
  c0:'I promise to return the old velvet waistcoat to Emma after the fitting.',
  c1:'The old velvet waistcoat has already been returned directly to Emma; the return is complete.',
  c2:'Emma signed a receipt for the old velvet waistcoat; this is not a receipt for anyone’s cloak.',
  d0:'I promise to return the blue theatre trunk to Greta after the tour.',
  d1:'The promise to return the blue theatre trunk was cancelled at Greta’s request; the debt no longer applies.',
  d2:'The blue theatre trunk stays at the theatre as Greta’s gift and does not need delivery.',
  e0:'I promise to repair the old velvet curtain after the specialist arrives; this is not a costume return.',
 },queries:[
  'Where should Nell’s old velvet cloak tagged N-17 be returned, who has the key and is her debt fulfilled?',
  'Where should that dark stage garment go after cleaning, and did preparation really fulfil the promised return?',
  'What did Rima promise to return, and which condition applies to her cloak?',
  'Compare Nell’s and Rima’s promises to return the old velvet cloak. Which tag and deadline belong to each?',
  'Has Emma received the old velvet waistcoat, or is her promise still open?',
  'Is returning the blue theatre trunk to Greta still required after cancellation?',
  'Remind me about that debt.','Remind me about that debt.','Remind me about that debt.',
  'Where should Greta’s cloak tagged N-17 be returned under her promise?',
  'Where should the silver stage helmet go under the promised debt?',
  'Remind me about that debt.',
 ],bridge:'Nell explained that the debt means her promise to return the old velvet cloak tagged N-17 after the performance.',
 falseBridge:'Nell supposedly explained that the debt means a promise to return the silver stage helmet.',
 tail:'Later somebody mentioned a completely different promise without naming its object or owner.',
 scenery:['The prompter checked the lamp beneath the stand.','The opening time was corrected on the poster.','Chairs were arranged in the foyer.','The makeup artist brought spare brushes.','Workers secured the attic ladder.','The orchestra rehearsed without the soloists.','A glove was found beside the ticket office.','The buffet ordered water for the company.']}},
 {id:'garden',ru:{names:['Лада','Ия','Ася','Фаина'],records:{
  aOld:'Белый керамический горшок Лады принимают у старой теплицы.',
  a0:'Я обещаю вернуть белый керамический горшок Ладе с номером Л-8 после выставки; орхидею сначала должна пересадить сама хозяйка.',
  a1:'Белый керамический горшок Лады с номером Л-8 стоит в карантинном павильоне. Вход разрешает агроном.',
  a2:'Белый керамический горшок Лады с номером Л-8 теперь сдают в лаборатории; старая теплица разобрана.',
  a3:'Белый керамический горшок Лады с номером Л-8 отмыт, но пересадка и возврат ещё не выполнены.',
  b0:'Я обещаю вернуть белый керамический горшок Ие с номером И-3 после съёмки каталога; пересадка Лады здесь ничего не меняет.',
  b1:'Белый керамический горшок Ии с номером И-3 находится у художницы за ширмой.',
  b2:'Белый керамический горшок Ии с номером И-3 ждут у боковой калитки до пятницы; возврата пока не было.',
  c0:'Я обещаю вернуть белый керамический поддон Асе после полива.',
  c1:'Белый керамический поддон Аси уже возвращён, она забрала его в кладовую.',
  c2:'Ася подтвердила получение белого керамического поддона, но не горшков других участниц.',
  d0:'Я обещаю вернуть латунный садовый распылитель Фаине после обработки роз.',
  d1:'Возврат латунного садового распылителя отменён: Фаина подарила его саду.',
  d2:'Латунный садовый распылитель останется в хозяйственном блоке; обязательства вернуть его нет.',
  e0:'Я обещаю починить белый керамический фонтан после доставки насоса; это отдельная работа.',
 },queries:[
  'Куда вернуть белый керамический горшок Лады Л-8, кто разрешает вход и исполнен ли долг?',
  'Куда теперь вернуть тот светлый сосуд с орхидеей после выставки, разве мойка означает выполненный возврат?',
  'Что Ия обещала вернуть после каталога и какое условие относится к её вещи?',
  'Сопоставь обещания Лады и Ии про белый керамический горшок, их номера и разные сроки.',
  'Получила ли Ася белый керамический поддон, или его ещё должны вернуть?',
  'Остался ли долг вернуть латунный садовый распылитель Фаине после отмены?',
  'Что там с её обещанием?','Что там с её обещанием?','Что там с её обещанием?',
  'Куда вернуть горшок Фаины Л-8 по её обещанию?',
  'Куда вернуть стеклянный колпак для кактуса по обещанному долгу?',
  'Что там с её обещанием?',
 ],bridge:'Лада напомнила: её обещание — вернуть белый керамический горшок Л-8 после выставки.',
 falseBridge:'Лада будто бы говорила, что её обещание — вернуть стеклянный колпак для кактуса.',
 tail:'За дверью обсуждали ещё чьё-то обещание и не объяснили, к кому оно относится.',
 scenery:['Пчеловод осмотрел пустые рамки.','Для гостей напечатали схему аллей.','На пруду распустились кувшинки.','Студенты пересчитали таблички коллекции.','Дорожку посыпали щебнем после дождя.','Куратор согласовал часы экскурсий.','В беседке сменили скатерть.','Сторож закрыл восточные ворота.']},
 en:{names:['Leda','Ina','Asa','Faye'],records:{
  aOld:'Leda’s white ceramic pot is accepted by the old greenhouse.',
  a0:'I promise to return the white ceramic pot to Leda, number L-8, after the exhibition; its owner must transplant the orchid first.',
  a1:'The white ceramic pot belonging to Leda, number L-8, is in the quarantine pavilion. The agronomist controls access.',
  a2:'The white ceramic pot belonging to Leda, number L-8, must now go to the laboratory; the old greenhouse was dismantled.',
  a3:'The white ceramic pot belonging to Leda, number L-8, was washed, but neither transplanting nor return has happened.',
  b0:'I promise to return the white ceramic pot to Ina, number I-3, after the catalogue photographs; Leda’s transplant has no effect on this obligation.',
  b1:'The white ceramic pot belonging to Ina, number I-3, is behind a screen at the artist’s studio.',
  b2:'The white ceramic pot belonging to Ina, number I-3, is due at the side gate before Friday; it has not been returned.',
  c0:'I promise to return the white ceramic saucer to Asa after watering.',
  c1:'The white ceramic saucer has already been returned to Asa and taken to her storeroom.',
  c2:'Asa confirmed receiving the white ceramic saucer, not the other participants’ pots.',
  d0:'I promise to return the brass garden sprayer to Faye after treating the roses.',
  d1:'Returning the brass garden sprayer was cancelled because Faye gave it to the garden.',
  d2:'The brass garden sprayer remains in the utility block; there is no obligation to return it.',
  e0:'I promise to repair the white ceramic fountain after the pump arrives; this is a separate job.',
 },queries:[
  'Where should Leda’s white ceramic pot L-8 be returned, who grants access and is the debt fulfilled?',
  'Where should that pale orchid container go after the exhibition, and did washing fulfil the promised return?',
  'What did Ina promise to return after the catalogue, and which condition applies to her item?',
  'Compare Leda’s and Ina’s promises about the white ceramic pot, their numbers and separate deadlines.',
  'Has Asa received the white ceramic saucer, or is its return still owed?',
  'Is the debt to return the brass garden sprayer to Faye still active after cancellation?',
  'What about her promise?','What about her promise?','What about her promise?',
  'Where should Faye’s pot L-8 be returned under her promise?',
  'Where should the glass cactus cover be returned under the promised debt?',
  'What about her promise?',
 ],bridge:'Leda reminded us that her promise means returning the white ceramic pot L-8 after the exhibition.',
 falseBridge:'Leda allegedly said her promise means returning the glass cactus cover.',
 tail:'Behind the door they discussed somebody else’s promise without explaining whose it was.',
 scenery:['The beekeeper examined empty frames.','Visitors received a printed avenue map.','Water lilies opened on the pond.','Students counted collection labels.','Gravel was spread after the rain.','The curator agreed on tour times.','The gazebo tablecloth was replaced.','The watchkeeper closed the eastern gates.']}},
 {id:'radio',ru:{names:['Веста','Дина','Соня','Роза'],records:{
  aOld:'Красный полевой диктофон Весты сдаётся на ресепшене.',
  a0:'Я обещаю вернуть красный полевой диктофон Весте с кодом В-21 после расшифровки интервью; исходную запись стирать нельзя.',
  a1:'Красный полевой диктофон Весты с кодом В-21 лежит в звуконепроницаемом шкафу. Доступ выдаёт редактор.',
  a2:'Красный полевой диктофон Весты с кодом В-21 теперь принимает архивист на третьем этаже; ресепшен съехал.',
  a3:'Красный полевой диктофон Весты с кодом В-21 зарядили и скопировали, но возврата ещё не было.',
  b0:'Я обещаю вернуть красный полевой диктофон Дине с кодом Д-90 после монтажа рекламы; интервью Весты к нему не относится.',
  b1:'Красный полевой диктофон Дины с кодом Д-90 заперт в машине звукорежиссёра.',
  b2:'Красный полевой диктофон Дины с кодом Д-90 ждут в гараже в субботу; Дина его ещё не получила.',
  c0:'Я обещаю вернуть красный полевой микрофон Соне после эфира.',
  c1:'Красный полевой микрофон Сони возвращён, она лично проверила комплект.',
  c2:'Соня расписалась за красный полевой микрофон, за диктофон она не расписывалась.',
  d0:'Я обещаю вернуть складной студийный штатив Розе после записи хора.',
  d1:'Возврат складного студийного штатива отменён по решению Розы; она оставила его станции.',
  d2:'Складной студийный штатив теперь принадлежит станции, долг перед Розой снят.',
  e0:'Я обещаю настроить красный полевой передатчик после получения частоты; это не обещание вернуть технику.',
 },queries:[
  'Куда вернуть красный полевой диктофон Весты В-21, кто даст доступ и закрыт ли долг?',
  'Куда отнести тот карманный аппарат с интервью, разве копирование уже исполнило обещанный возврат?',
  'Что Дина обещала вернуть после рекламы, и что ещё ждёт её диктофон?',
  'Раздели обещания Весты и Дины вернуть красный полевой диктофон: коды, места и условия.',
  'Вернули ли Соне красный полевой микрофон, или долг ещё висит?',
  'Нужно ли возвращать складной студийный штатив Розе, когда она отменила долг?',
  'Напомни об этом обещании.','Напомни об этом обещании.','Напомни об этом обещании.',
  'Куда вернуть диктофон Розы В-21 по её обещанию?',
  'Куда вернуть зелёный спутниковый телефон по обещанному долгу?',
  'Напомни об этом обещании.',
 ],bridge:'Веста уточнила: это обещание вернуть красный полевой диктофон В-21 после расшифровки.',
 falseBridge:'Веста якобы уточнила, что это обещание вернуть зелёный спутниковый телефон.',
 tail:'После этого собеседник сослался на новое неизвестное обещание другой женщины.',
 scenery:['Ведущая согласовала прогноз погоды.','Редактор убрал пустой стакан со стола.','В коридоре повесили расписание эфиров.','Для гостей приготовили пропуска.','Слушатель прислал открытку станции.','В аппаратной заменили лампу.','Музыкальный отдел обсуждал заставку.','Дежурная записала номер такси.']},
 en:{names:['Vesta','Dina','Sonia','Rose'],records:{
  aOld:'Vesta’s red field recorder is returned at reception.',
  a0:'I promise to return the red field recorder to Vesta, code V-21, after transcribing the interview; the original recording must not be erased.',
  a1:'The red field recorder belonging to Vesta, code V-21, is in a soundproof cabinet. The editor grants access.',
  a2:'The red field recorder belonging to Vesta, code V-21, is now accepted by the third-floor archivist; reception has moved.',
  a3:'The red field recorder belonging to Vesta, code V-21, was charged and copied, but has not been returned.',
  b0:'I promise to return the red field recorder to Dina, code D-90, after editing the advert; Vesta’s interview is unrelated.',
  b1:'The red field recorder belonging to Dina, code D-90, is locked in the sound engineer’s car.',
  b2:'The red field recorder belonging to Dina, code D-90, is expected in the garage on Saturday; Dina has not received it.',
  c0:'I promise to return the red field microphone to Sonia after the broadcast.',
  c1:'The red field microphone was returned to Sonia, who checked the complete kit herself.',
  c2:'Sonia signed for the red field microphone, not for any recorder.',
  d0:'I promise to return the folding studio tripod to Rose after recording the choir.',
  d1:'Returning the folding studio tripod was cancelled by Rose, who left it with the station.',
  d2:'The folding studio tripod now belongs to the station; the debt to Rose was discharged.',
  e0:'I promise to tune the red field transmitter once its frequency is assigned; this is not a promise to return equipment.',
 },queries:[
  'Where should Vesta’s red field recorder V-21 be returned, who grants access and is the debt settled?',
  'Where should that pocket interview machine go, and did copying it really fulfil the promised return?',
  'What did Dina promise to return after the advert, and what is her recorder waiting for?',
  'Separate Vesta’s and Dina’s promises to return the red field recorder: codes, destinations and conditions.',
  'Has Sonia received the red field microphone, or is the debt still outstanding?',
  'Does the folding studio tripod still need returning to Rose after she cancelled the debt?',
  'Remind me of this promise.','Remind me of this promise.','Remind me of this promise.',
  'Where should Rose’s recorder V-21 be returned under her promise?',
  'Where should the green satellite phone be returned under the promised debt?',
  'Remind me of this promise.',
 ],bridge:'Vesta clarified that this promise means returning the red field recorder V-21 after transcription.',
 falseBridge:'Vesta supposedly clarified that this promise means returning the green satellite phone.',
 tail:'Afterwards a speaker referred to a new unknown promise made by another woman.',
 scenery:['The presenter agreed on the weather bulletin.','The editor removed an empty cup.','A broadcast schedule was hung in the corridor.','Visitor passes were prepared.','A listener sent the station a postcard.','A lamp was replaced in the control room.','The music team discussed a jingle.','The duty officer wrote down a taxi number.']}},
 {id:'regatta',ru:{names:['Яна','Алла','Инга','Марта'],records:{
  aOld:'Полосатый спасательный жилет Яны принимают у лодочного спуска.',
  a0:'Я обещаю вернуть полосатый спасательный жилет Яне с меткой Я-6 после осмотра швов; до подписи инспектора в гонку выходить нельзя.',
  a1:'Полосатый спасательный жилет Яны с меткой Я-6 находится в сухом рундуке. Открыть его может только капитан.',
  a2:'Полосатый спасательный жилет Яны с меткой Я-6 теперь возвращают на судейском понтоне; лодочный спуск затоплен.',
  a3:'Полосатый спасательный жилет Яны с меткой Я-6 высушен, но подписи инспектора и возврата пока нет.',
  b0:'Я обещаю вернуть полосатый спасательный жилет Алле с меткой А-5 после тренировки детей; осмотр Яны не закрывает мой долг.',
  b1:'Полосатый спасательный жилет Аллы с меткой А-5 лежит в автобусе тренера.',
  b2:'Полосатый спасательный жилет Аллы с меткой А-5 ждут в клубе вечером, Алла его ещё не получила.',
  c0:'Я обещаю вернуть полосатый спасательный круг Инге после учений.',
  c1:'Полосатый спасательный круг Инги уже возвращён и принят под расписку.',
  c2:'Инга приняла полосатый спасательный круг; жилет Яны в эту расписку не входит.',
  d0:'Я обещаю вернуть складной навигационный стол Марте после регаты.',
  d1:'Долг вернуть складной навигационный стол отменён: Марта передала его клубу навсегда.',
  d2:'Складной навигационный стол останется в клубе, возвращать его Марте не требуется.',
  e0:'Я обещаю зашить полосатый спасательный тент после доставки ниток; это ремонт, а не возврат.',
 },queries:[
  'Куда вернуть полосатый спасательный жилет Яны Я-6, кто откроет рундук и исполнен ли долг?',
  'Куда вернуть ту вещь для плавучести с осмотренными швами, разве сушка уже закрыла обещанный возврат?',
  'Что Алла обещала вернуть после детской тренировки и какое у неё условие?',
  'Сравни обещания Яны и Аллы вернуть полосатый спасательный жилет, не смешивай метки и сроки.',
  'Вернули ли Инге полосатый спасательный круг, или обещание ещё действует?',
  'Остался ли долг вернуть складной навигационный стол Марте после её отмены?',
  'А что с тем долгом?','А что с тем долгом?','А что с тем долгом?',
  'Куда вернуть жилет Марты Я-6 по её обещанию?',
  'Куда вернуть оранжевый аварийный радиобуй по обещанному долгу?',
  'А что с тем долгом?',
 ],bridge:'Яна сказала: тот долг — её обещание вернуть полосатый спасательный жилет Я-6 после осмотра.',
 falseBridge:'Яна будто бы сказала: тот долг — обещание вернуть оранжевый аварийный радиобуй.',
 tail:'Потом возникло другое непонятное обязательство неизвестного участника.',
 scenery:['Судьи сверили порядок стартов.','У пирса покрасили скамью.','Ветер перевернул пустое ведро.','Дети рисовали флаги на бумаге.','В клубной кухне закипел чайник.','На горизонте прошёл грузовой корабль.','Секретарь пересчитал значки участников.','Команда выбрала песню для награждения.']},
 en:{names:['Yana','Alla','Inga','Martha'],records:{
  aOld:'Yana’s striped rescue vest is accepted at the slipway.',
  a0:'I promise to return the striped rescue vest to Yana, mark Y-6, after the seam inspection; no racing is allowed before the inspector signs.',
  a1:'The striped rescue vest belonging to Yana, mark Y-6, is in a dry locker. Only the captain can open it.',
  a2:'The striped rescue vest belonging to Yana, mark Y-6, is now returned at the judges’ pontoon; the slipway is flooded.',
  a3:'The striped rescue vest belonging to Yana, mark Y-6, has dried, but neither the inspector’s signature nor the return has happened.',
  b0:'I promise to return the striped rescue vest to Alla, mark A-5, after the children’s training; Yana’s inspection does not discharge my debt.',
  b1:'The striped rescue vest belonging to Alla, mark A-5, is in the coach’s bus.',
  b2:'The striped rescue vest belonging to Alla, mark A-5, is expected at the club this evening; Alla has not received it.',
  c0:'I promise to return the striped rescue ring to Inga after the drill.',
  c1:'The striped rescue ring was already returned to Inga and accepted with a receipt.',
  c2:'Inga accepted the striped rescue ring; Yana’s vest is not covered by that receipt.',
  d0:'I promise to return the folding navigation table to Martha after the regatta.',
  d1:'The debt to return the folding navigation table was cancelled when Martha gave it to the club permanently.',
  d2:'The folding navigation table stays at the club; returning it to Martha is not required.',
  e0:'I promise to sew the striped rescue awning after the thread arrives; this is a repair, not a return.',
 },queries:[
  'Where should Yana’s striped rescue vest Y-6 be returned, who opens the locker and is the debt fulfilled?',
  'Where should that buoyancy garment with inspected seams go, and did drying fulfil the promised return?',
  'What did Alla promise to return after the children’s training, and what is her condition?',
  'Compare Yana’s and Alla’s promises to return the striped rescue vest, keeping marks and deadlines separate.',
  'Has Inga received the striped rescue ring, or is the promise still active?',
  'Is the debt to return the folding navigation table to Martha still active after her cancellation?',
  'So what about that debt?','So what about that debt?','So what about that debt?',
  'Where should Martha’s vest Y-6 be returned under her promise?',
  'Where should the orange emergency beacon be returned under the promised debt?',
  'So what about that debt?',
 ],bridge:'Yana said that the debt means her promise to return the striped rescue vest Y-6 after inspection.',
 falseBridge:'Yana allegedly said that the debt means a promise to return the orange emergency beacon.',
 tail:'Then a different unexplained obligation involving an unknown participant came up.',
 scenery:['The judges checked the starting order.','A bench was painted by the pier.','The wind overturned an empty bucket.','Children drew flags on paper.','The club kitchen kettle boiled.','A cargo ship passed on the horizon.','The secretary counted participant badges.','The crew chose an awards song.']}},
];

export const obligationHoldoutFamilies=['named-a','paraphrase-a','named-b','two-owners','completed','cancelled','proved-reference','unproved-reference','false-raw-bridge','swapped-owner','invented-object','unknown-raw-tail'] as const;
const A=['a0','a1','a2','a3'],B=['b0','b1','b2'];
const wanted=[A,A,B,[...A,...B],['c1','c2'],['d1','d2'],A];
export function obligationHoldoutWorld(locale:Locale,settingIndex=0,noiseCount=720,variant=0){
 const setting=settings[settingIndex]!,p=setting[locale],worldId=`rp287-${setting.id}-${locale}`;
 const world:WorldProfile={id:worldId,name:`RP287 ${setting.id}`,description:'Synthetic accepted-memory audit.',color:'#607a82',contextBudget:16000,relevanceThreshold:6,createdAt:1,updatedAt:1};
 const entities:SceneEntity[]=p.names.map((name,i)=>({id:`${worldId}-p${i}`,worldId,kind:'character',name,description:'',aliases:[],memberIds:[],createdAt:1,updatedAt:1}));
 const facts:StoryFact[]=[],ids:string[]=[],speakers:number[]=[];
 const add=(id:string,text:string,owner:number,extra:Partial<StoryFact>={})=>{ids.push(id);speakers.push(owner);facts.push({kind:'event',text,quote:text,...extra});};
 const record=(id:string,owner:number)=>{
  const body=p.records[id]!,text=locale==='ru'?`${p.names[owner]} сказала: «${body}»`:`${p.names[owner]} said: “${body}”`;
  const group=id[0]!,task=/^[abcde]0$/u.test(id)||id==='c1'||id==='d1';
  add(id,text,owner,task?{kind:id.endsWith('0')?'promise':'event',task:{key:`${worldId}-duty-${group}`,title:p.records[group+'0']!,status:id==='c1'?'completed':id==='d1'?'cancelled':'open'}}:
   id==='aOld'||id==='a2'?{claim:{key:worldId+'-destination',value:body,scope:'state',lifetime:'persistent'}}:{});
 };
 const noise=(from:number,to:number)=>{for(let i=from;i<to;i++)add('scene-'+i,`${locale==='ru'?'Журнал':'Log'} ${i+1}. ${p.scenery[(i*3+Math.floor(i/17))%p.scenery.length]} ${locale==='ru'?'Смена':'Shift'} ${Math.floor(i/8)+1}.`,i%4);};
 noise(0,Math.floor(noiseCount*.08));['aOld',...A].forEach(id=>record(id,0));
 noise(Math.floor(noiseCount*.08),Math.floor(noiseCount*.36));B.forEach(id=>record(id,1));
 noise(Math.floor(noiseCount*.36),Math.floor(noiseCount*.61));['c0','c1','c2'].forEach(id=>record(id,2));
 noise(Math.floor(noiseCount*.61),Math.floor(noiseCount*.83));['d0','d1','d2'].forEach(id=>record(id,3));record('e0',2);
 noise(Math.floor(noiseCount*.83),noiseCount);
 const proved=variant===6||variant===11;
 add('latest',proved?p.bridge:locale==='ru'?'Рабочий день закончился. В комнате обсуждают завтрашнюю погоду.':'The working day ended. People in the room discuss tomorrow’s weather.',0);
 const sources=facts.map((_,i)=>`${worldId}-revision-${i}`);
 const roleSeeds=facts.map((f,i)=>{const owner=entities[speakers[i]!]!;return roleSeed(f,{version:1,sourceRevisionId:sources[i]!,quote:f.quote,roles:{speaker:{id:owner.id,name:owner.name},...(f.task?{promisor:{id:owner.id,name:owner.name}}:{})}});});
 const recent=variant===8?p.falseBridge:variant===11?facts.at(-1)!.text+' '+p.tail:facts.at(-1)!.text;
 const input:GameContextInput={draft:p.queries[variant]!,recentMessages:[recent],entries:[],books:[],entities,worlds:[world],activeBookId:null,scene:{worldId,bookId:null,focusIds:[]},settings:{contextBudget:16000,relevanceThreshold:6},story:{world,chat:worldId+'-chat',branch:worldId+'-branch',facts,sheetsEnabled:false,roleSeeds,episodeSources:sources}};
 return {input,ids,sources,speakers,locale,noiseCount,plotId:setting.id};
}
export function obligationHoldoutScenarios(){
 const main=(['ru','en'] as const).flatMap(locale=>settings.flatMap((_,si)=>obligationHoldoutFamilies.map((family,fi)=>({
  ...obligationHoldoutWorld(locale,si,720,fi),id:`${locale}:${settings[si]!.id}:${family}`,family:family as string,
  gold:{wanted:[...(wanted[fi]??[])],score:fi<7,uncertainty:fi>=6,control:fi>=7,budget:false},
 }))));
 const scale=(['ru','en'] as const).flatMap(locale=>[250,1500,5000].map((size,i)=>({
  ...obligationHoldoutWorld(locale,i,size,3),id:`${locale}:scale:${size}`,family:'scale',
  gold:{wanted:[...A,...B],score:true,uncertainty:false,control:false,budget:false},
 })));
 const budget=(['ru','en'] as const).flatMap(locale=>[900,2200,5000].map((limit,i)=>{
  const c=obligationHoldoutWorld(locale,i,720,3);c.input.settings.contextBudget=limit;c.input.story!.world.contextBudget=limit;
  return {...c,id:`${locale}:budget:${limit}`,family:'budget',gold:{wanted:[...A,...B],score:false,uncertainty:false,control:false,budget:true}};
 }));
 return [...main,...scale,...budget];
}
