import { semanticWorld } from './story-semantic-quality';
import { roleSeed } from '../../src/core/story-role-binding';
import type { Locale } from '../../src/core/types';
import type { StoryFact } from '../../src/core/story-update';

/** RP263 independent, authored before encoding/model evaluation. Different
 * objects/events; the fulfilled camera supersedes its prior open task. */
export function semanticHoldoutWorld(locale: Locale) {
  const f = semanticWorld(locale), s = f.s; f.N.name = s('Алина', 'Alina'); f.N.aliases = [s('Искра', 'Spark')]; f.M.name = s('Борис', 'Boris'); f.M.aliases = [s('Север', 'North')];
  const text = [
    s('Алина подарила Борису синий шерстяной шарф перед отъездом; продавать его они не договаривались.', 'Alina gave Boris a blue woollen scarf before leaving; they did not agree that he could sell it.'),
    s('Борис подарил Алине деревянную резную птицу на выпускной; шарфом они не обменивались.', 'Boris gave Alina a carved wooden bird for graduation; they did not exchange scarves.'),
    s('Алина обещала: «Я верну фотоаппарат, когда закончится дождь».', 'Alina promised: “I will return the camera when the rain ends.”'),
    s('Борис обещал: «Я проверю карту, если получу разрешение; его пока нет».', 'Boris promised: “I will check the map if I get permission; it has not yet been given.”'),
    s('Алина сказала: «В снежную бурю мы укрылись в горной хижине и переждали там ночь».', 'Alina said: “During the snowstorm we sheltered in a mountain hut and spent the night there.”'),
    s('Борис сказал: «Алина подвернула ногу в поле. Я перевязал её лодыжку и помог ей дойти до дома».', 'Boris said: “Alina twisted her ankle in the field. I bandaged it and helped her get home.”'),
    s('Алина сказала: «Я уже вернула фотоаппарат; поручение выполнено, это не разрешение брать его снова».', 'Alina said: “I have already returned the camera; the duty is complete, this is not permission to borrow it again.”'),
  ];
  const records: StoryFact[] = text.map((t, i) => ({ kind: i === 2 || i === 3 ? 'promise' : 'event', text: t, quote: i < 2 ? s(`${i === 0 ? 'Алина' : 'Борис'} сказала: «${t}».`, `${i === 0 ? 'Alina' : 'Boris'} said: “${t}.”`) : t,
    ...(i === 2 || i === 3 || i === 6 ? { task: { key: i === 3 ? 'holdout-map' : 'holdout-camera', title: i === 3 ? s('Проверить карту', 'Check the map') : s('Вернуть фотоаппарат', 'Return the camera'), status: i === 6 ? 'completed' as const : 'open' as const } } : {}) }));
  const noise: StoryFact[] = Array.from({ length: 72 }, (_, i) => { const t = s(`Алина и Борис обсуждали дорогу, погоду и старые вещи. Беседа ${i}; нового события не произошло.`, `Alina and Boris discussed the road, weather and old belongings. Conversation ${i}; no new event occurred.`); return { kind: 'event', text: t, quote: t }; });
  const facts = [...records, ...noise], sources = facts.map((_, i) => 'semantic-holdout-source-' + i), seeds = facts.map((fact, i) => roleSeed(fact, { version: 1, sourceRevisionId: sources[i]!, quote: fact.quote, roles: i === 2 || i === 3 ? { promisor: { id: i === 2 ? f.N.id : f.M.id, name: i === 2 ? f.N.name : f.M.name } } : i < records.length ? { speaker: { id: [0, 4, 6].includes(i) ? f.N.id : f.M.id, name: [0, 4, 6].includes(i) ? f.N.name : f.M.name } } : {} }));
  f.input.story!.facts = facts; f.input.story!.roleSeeds = seeds; f.input.story!.episodeSources = sources; f.input.recentMessages = [noise.at(-1)!.text];
  return { ...f, records, noise, facts, sources, seeds };
}

export function semanticHoldoutCorpus(locale: Locale) {
  const rows = [
    { id: 'warm-keepsake', family: 'gift', intent: 'paraphrase', query: ['Напомни о тёплом знаке внимания перед расставанием.', 'Remind me about the warm token of affection before parting.'], gold: [0] },
    { id: 'souvenirs', family: 'gift', intent: 'ambiguous', query: ['Какие сувениры они друг другу вручали?', 'Which souvenirs did they give each other?'], gold: [0, 1] },
    { id: 'unknown-phone', family: 'gift', intent: 'control', query: ['Напомни о подаренном смартфоне.', 'Remind me about the smartphone present.'], gold: [] },
    { id: 'camera-complete', family: 'promise', intent: 'explicit', query: ['Чем закончилось поручение вернуть фотоаппарат?', 'How did the duty to return the camera end?'], gold: [6] },
    { id: 'boris-duty', family: 'promise', intent: 'paraphrase', query: ['Напомни о невыполненном обязательстве Бориса.', 'Remind me about the commitment Boris still owes.'], gold: [3] },
    { id: 'conditional-duty', family: 'promise', intent: 'paraphrase', query: ['Какую договорённость ещё надо выполнить после получения разрешения?', 'Which agreement is still to be fulfilled once permission is given?'], gold: [3] },
    { id: 'north-clothing', family: 'alias', intent: 'paraphrase', query: ['Откуда у Севера тёплая одежда?', 'Where did North get his warm clothing?'], gold: [0] },
    { id: 'spark-bird', family: 'alias', intent: 'explicit', query: ['Напомни, какую птицу подарили Искре.', 'Remind me which bird was given to Spark.'], gold: [1] },
    { id: 'shared-spark', family: 'alias', intent: 'control', query: ['Что Искра обещала?', 'What did Spark promise?'], gold: [] },
    { id: 'whiteout', family: 'event', intent: 'paraphrase', query: ['Где они переждали белую мглу?', 'Where did they wait out the whiteout?'], gold: [4] },
    { id: 'injury', family: 'event', intent: 'paraphrase', query: ['Напомни, кто помог Алине после травмы.', 'Remind me who helped Alina after the injury.'], gold: [5] },
    { id: 'unknown-mine', family: 'event', intent: 'control', query: ['Напомни об обвале шахты.', 'Remind me about the mine collapse.'], gold: [] },
  ];
  return rows.map(c => { const f = semanticHoldoutWorld(locale); if (c.id === 'shared-spark') f.M.aliases.push(f.N.aliases[0]!); f.input.draft = c.query[locale === 'ru' ? 0 : 1]!;
    return { ...c, ...f, name: locale + ':holdout:' + c.id, wanted: c.gold.map(i => f.records[i]!) }; });
}
