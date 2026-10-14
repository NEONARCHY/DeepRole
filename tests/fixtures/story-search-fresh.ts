import { admissionWorld } from './story-topic-admission';
import { roleSeed } from '../../src/core/story-role-binding';
import type { Locale } from '../../src/core/types';
import type { StoryFact } from '../../src/core/story-update';

/** RP264: gold authored before any model run/tuning on these scenes. Genuine
 * near-identical duties/codes coexist with repeated discussions and unrelated
 * played events. Similarity is NOT a source/object identity. */
export function freshSearchWorld(locale: Locale) {
  const f = admissionWorld(locale), s = f.s, [L, M] = f.base.entities;
  L!.name = s('Лея', 'Lea'); L!.aliases = [s('Вега', 'Vega')]; M!.name = s('Максим', 'Maxim'); M!.aliases = [s('Скворец', 'Starling')];
  const texts = [
    s('Лея сказала: «Я подарила Максиму глиняную чашку с зелёной полосой на новоселье; разрешения передавать её другим я не давала».', 'Lea said: “I gave Maxim a clay cup with a green stripe for his housewarming; I did not give permission to pass it to others.”'),
    s('Максим сказал: «Я подарил Лее льняной блокнот на выставке; чашку я ей не дарил».', 'Maxim said: “I gave Lea a linen notebook at the exhibition; I did not give her a cup.”'),
    s('Лея обещала: «Я верну штатив после открытия дороги; раньше нельзя».', 'Lea promised: “I will return the tripod after the road opens; not before.”'),
    s('Максим обещал: «Я полью растения только по просьбе хозяйки; просьбы ещё не было».', 'Maxim promised: “I will water the plants only if the owner asks; she has not asked yet.”'),
    s('Максим сказал: «Лифт застрял между этажами. Лея вызвала мастера и оставалась со мной до освобождения».', 'Maxim said: “The lift stopped between floors. Lea called a repair worker and stayed with me until we got out.”'),
    s('Лея сказала: «Отключилось электричество. Максим зажёг керосиновую лампу, и мы смогли найти выход из подвала».', 'Lea said: “The power went out. Maxim lit a kerosene lamp, and we could find the way out of the cellar.”'),
    s('Лея сказала: «Я уже вернула штатив; поручение выполнено, это не разрешение брать его снова».', 'Lea said: “I have already returned the tripod; the duty is completed, this is not permission to borrow it again.”'),
    s('Максим сказал: «Код кладовой 2244; знание кода не разрешает входить».', 'Maxim said: “The storeroom code is 2244; knowing the code does not permit entry.”'),
    s('Максим сказал: «Код кладовой теперь 2288; прежний 2244 отменён, разрешения на вход всё ещё нет».', 'Maxim said: “The storeroom code is now 2288; the old 2244 is revoked, entry is still not permitted.”'),
    s('Максим сказал: «Хозяйка отменила поручение полить растения; я его не выполнял».', 'Maxim said: “The owner cancelled the duty to water the plants; I did not carry it out.”'),
    s('Лея обещала: «Я отнесу жестяной ящик в северную мастерскую, только если согласится Антон».', 'Lea promised: “I will carry the tin box to the north workshop only if Anton agrees.”'),
    s('Лея обещала: «Я отнесу жестяной ящик в южную мастерскую, только если согласится Виктор».', 'Lea promised: “I will carry the tin box to the south workshop only if Victor agrees.”'),
    s('Максим сказал: «Я купил билет на утренний поезд, но ещё не уехал».', 'Maxim said: “I bought a ticket for the morning train, but have not left yet.”'),
    s('Лея сказала: «Я зашила порванный рукав куртки перед прогулкой».', 'Lea said: “I mended the torn sleeve of the jacket before our walk.”'),
    s('Максим сказал: «Мы забрали посылку из почтового отделения; внутри были кисти».', 'Maxim said: “We collected a parcel from the post office; it contained paintbrushes.”'),
    s('Лея сказала: «Я посадила яблоню за домом; урожая ещё не было».', 'Lea said: “I planted an apple tree behind the house; there has been no harvest yet.”'),
    s('Максим сказал: «Я потерял пуговицу на станции и пока её не нашёл».', 'Maxim said: “I lost a button at the station and have not found it yet.”'),
    s('Лея сказала: «Я почистила объектив камеры; фотографий сегодня не делала».', 'Lea said: “I cleaned the camera lens; I have not taken photographs today.”'),
  ];
  const records: StoryFact[] = texts.map((text, i) => ({ kind: [2, 3, 10, 11].includes(i) ? 'promise' : 'event', text, quote: text,
    ...([2, 3, 6, 9, 10, 11].includes(i) ? { task: { key: [2, 6].includes(i) ? 'rp264-tripod' : [3, 9].includes(i) ? 'rp264-plants' : 'rp264-box-' + i,
      title: [2, 6].includes(i) ? s('Вернуть штатив', 'Return the tripod') : [3, 9].includes(i) ? s('Полить растения', 'Water the plants') : s('Отнести жестяной ящик', 'Carry the tin box'),
      status: i === 6 ? 'completed' as const : i === 9 ? 'cancelled' as const : 'open' as const } } : {}),
    ...([7, 8].includes(i) ? { claim: { key: 'rp264-storeroom-code', value: i === 7 ? '2244' : '2288', scope: 'state' as const, lifetime: 'persistent' as const } } : {}) }));
  const echoes: [string, string][] = [
    ['Лея и Максим обсуждали чашку, блокнот и старые подарки, вспоминая прошлые вручения.', 'Lea and Maxim discussed the cup, notebook and old presents, recalling earlier gifts.'],
    ['Лея и Максим вспоминали лифт, подвал и свет лампы; беседа не была новым спасением.', 'Lea and Maxim recalled the lift, cellar and lamplight; the conversation was not another rescue.'],
    ['Лея и Максим говорили о штативе, растениях и ящиках; нового обязательства они не давали.', 'Lea and Maxim talked about the tripod, plants and boxes; they made no new commitment.'],
    ['Лея и Максим обсуждали мастерские и код кладовой, не меняя код и не разрешая вход.', 'Lea and Maxim discussed the workshops and storeroom code, without changing the code or allowing entry.'],
  ];
  const noise: StoryFact[] = Array.from({ length: 120 }, (_, i) => { const template = echoes[i % echoes.length]!, text = s(template[0], template[1]) + s(` Поздний разговор ${i} у окна.`, ` Later conversation ${i} by the window.`); return { kind: 'event', text, quote: text }; });
  const facts = [...records, ...noise], sources = facts.map((_, i) => 'rp264-source-' + i), seeds = facts.map((fact, i) => {
    const p = [0, 2, 5, 6, 10, 11, 13, 15, 17].includes(i) ? L! : M!, role = [2, 3, 10, 11].includes(i) ? 'promisor' : 'speaker';
    return roleSeed(fact, { version: 1, sourceRevisionId: sources[i]!, quote: fact.quote, roles: i < records.length ? { [role]: { id: p.id, name: p.name } } : {} });
  });
  f.input.story!.facts = facts; f.input.story!.roleSeeds = seeds; f.input.story!.episodeSources = sources; f.input.recentMessages = [noise.at(-1)!.text];
  return { ...f, L: L!, M: M!, records, noise, facts, sources, seeds };
}

export function freshSearchCorpus(locale: Locale) {
  const rows = [
    { id: 'cup', family: 'gift', intent: 'explicit', q: ['Напомни о глиняной чашке с зелёной полосой.', 'Remind me about the clay cup with the green stripe.'], gold: [0] },
    { id: 'notebook', family: 'gift', intent: 'explicit', q: ['Напомни о льняном блокноте.', 'Remind me about the linen notebook.'], gold: [1] },
    { id: 'giver', family: 'gift', intent: 'explicit', q: ['Что Лея подарила Максиму на новоселье?', 'What did Lea give Maxim for his housewarming?'], gold: [0] },
    { id: 'lift', family: 'event', intent: 'explicit', q: ['Напомни о застрявшем лифте.', 'Remind me about the stuck lift.'], gold: [4] },
    { id: 'tripod-closed', family: 'status', intent: 'explicit', q: ['Чем закончилось поручение вернуть штатив?', 'How did the duty to return the tripod end?'], gold: [6] },
    { id: 'code-current', family: 'status', intent: 'explicit', q: ['Какой код кладовой теперь?', 'What is the storeroom code now?'], gold: [8] },
    { id: 'plants-cancelled', family: 'status', intent: 'explicit', q: ['Почему поручение полить растения отменено?', 'Why was the duty to water the plants cancelled?'], gold: [9] },
    { id: 'word', family: 'promise', intent: 'explicit', q: ['Что Лея обещала?', 'What did Lea promise?'], gold: [10, 11] },
    { id: 'new-home', family: 'gift', intent: 'paraphrase', q: ['Напомни о посуде, подаренной после переезда.', 'Remind me about the crockery given after moving home.'], gold: [0] },
    { id: 'writing', family: 'gift', intent: 'paraphrase', q: ['Какой подарок для записей получила Вега?', 'Which present for writing did Vega receive?'], gold: [1] },
    { id: 'trapped', family: 'event', intent: 'paraphrase', q: ['Кто помог Максиму, когда он застрял между этажами?', 'Who helped Maxim when he was trapped between floors?'], gold: [4] },
    { id: 'blackout', family: 'event', intent: 'paraphrase', q: ['Как они выбрались в темноте после отключения?', 'How did they get out in the darkness after the blackout?'], gold: [5] },
    { id: 'two-gifts', family: 'gift', intent: 'ambiguous', q: ['Что они друг другу вручали?', 'What did they give each other?'], gold: [0, 1] },
    { id: 'this-box', family: 'promise', intent: 'ambiguous', q: ['Я достаю этот ящик.', 'I take out this box.'], gold: [10, 11] },
    { id: 'two-boxes', family: 'promise', intent: 'ambiguous', q: ['Какие условия у поручений отнести жестяной ящик?', 'What are the conditions of the duties to carry the tin box?'], gold: [10, 11] },
    { id: 'unknown-necklace', family: 'unknown', intent: 'control', q: ['Напомни о подаренном ожерелье.', 'Remind me about the necklace present.'], gold: [] },
    { id: 'unknown-lake', family: 'unknown', intent: 'control', q: ['Напомни о том, как они тонули в озере.', 'Remind me how they were drowning in the lake.'], gold: [] },
    { id: 'unknown-aircraft', family: 'unknown', intent: 'control', q: ['Напомни о крушении самолёта.', 'Remind me about the aircraft crash.'], gold: [] },
    { id: 'shared-vega', family: 'identity', intent: 'control', q: ['Что Вега обещала?', 'What did Vega promise?'], gold: [] },
    { id: 'reused-name', family: 'identity', intent: 'control', q: ['Что Вега обещала?', 'What did Vega promise?'], gold: [] },
  ];
  return rows.map(c => { const f = freshSearchWorld(locale); if (c.id === 'shared-vega') f.M.aliases.push(f.L.aliases[0]!);
    if (c.id === 'reused-name') f.input.entities = [{ ...f.L, id: 'rp264-new-lea' }, f.M];
    f.input.draft = c.q[locale === 'ru' ? 0 : 1]!;
    return { ...c, ...f, name: locale + ':fresh:' + c.id, wanted: c.gold.map(i => f.records[i]!) };
  });
}
