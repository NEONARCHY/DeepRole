import { admissionWorld } from './story-topic-admission';
import type { Locale } from '../../src/core/types';
import type { StoryFact } from '../../src/core/story-update';
import { roleSeed, storedRoleReader } from '../../src/core/story-role-binding';
import { createStoryRoleReaderV1, createStoryRoleReader } from '../../src/core/story-source-roles';
import { createEpisodeReader } from '../../src/core/story-episodes';
import { rankStoryFacts } from '../../src/core/story-fact-context';
import { compileGameContext } from '../../src/core/game-context';
import { decodeStoryMemory } from '../../src/core/story-memory-transport';
import { storyRetrievalQuery } from '../../src/core/story-retrieval-query';

// New RP270 human-authored sources/labels, BEFORE the priority policy exists.
// Different wording and vocabulary from RP269; no scorer-produced gold.
const worlds = [
  { id: 'guild', split: 'development', ru: ['восковая печать', 'печать', 'печати', 'штандарт'], en: ['wax seal', 'seal', 'banner'] },
  { id: 'hangar', split: 'development', ru: ['магнитное реле', 'реле', 'реле', 'датчик'], en: ['magnetic relay', 'relay', 'sensor'] },
  { id: 'museum', split: 'holdout', ru: ['зелёный пропуск', 'пропуск', 'пропуске', 'планшет'], en: ['green pass', 'pass', 'tablet'] },
] as const;
const places = [
  ['окна', 'the window'], ['входа', 'the entrance'], ['фонаря', 'the lamp'], ['моста', 'the bridge'], ['колонны', 'the column'],
  ['клумбы', 'the flowerbed'], ['шкафа', 'the cupboard'], ['кухни', 'the kitchen'], ['скамьи', 'the bench'], ['фонтана', 'the fountain'],
  ['порога', 'the doorstep'], ['беседки', 'the gazebo'],
] as const;

export function discussionWorld(locale: Locale, world = worlds[0] as typeof worlds[number]) {
  const f = admissionWorld(locale), s = f.s, [A, B] = f.base.entities;
  A!.name = s('Аделина', 'Adeline'); A!.aliases = [s('Лист', 'Leaf')]; B!.name = s('Кирилл', 'Cyril'); B!.aliases = [s('Мост', 'Bridge')];
  const [qualified, noun, form, other] = world.ru, [label, item, second] = world.en;
  const topic = s(noun, item), object = s(qualified, label), otherTopic = s(other, second);
  const texts = [
    s(`Кирилл передал предмет «${qualified}» Аделине у ворот только после согласия владельца; это не разрешение передавать его дальше.`, `Cyril handed the ${label} to Adeline at the gate only after the owner agreed; this is not permission to pass it on.`),
    s(`Аделина обещала: «Я отнесу ${noun} в северное хранилище только после открытия дороги; южное не подходит. Это условия поручения».`, `Adeline promised: “I will take the ${item} to the north store only after the road opens; the south store does not qualify. These are the duty conditions.”`),
    s(`Кирилл обещал: «Я отнесу ${noun} в южное хранилище только после проверки подписи; северное не подходит. Это условия поручения».`, `Cyril promised: “I will take the ${item} to the south store only after the signature is checked; the north store does not qualify. These are the duty conditions.”`),
    s(`Аделина планирует: «Я осмотрю ${noun} после разговора со смотрителем; пока его не было».`, `Adeline plans: “I will examine the ${item} after speaking to the keeper; that conversation has not happened yet.”`),
    s(`Кирилл обещал: «Я верну ${other} после осмотра».`, `Cyril promised: “I will return the ${second} after inspection.”`),
    s(`Кирилл сказал: «Поручение вернуть ${other} выполнено после осмотра; повторно брать его нельзя».`, `Cyril said: “The duty to return the ${second} is completed after inspection; it must not be borrowed again.”`),
    s(`Аделина сказала: «Код для предмета «${noun}» 8123; разрешения пользоваться им нет».`, `Adeline said: “The ${item} code is 8123; there is no permission to use it.”`),
    s(`Аделина сказала: «Код для предмета «${noun}» теперь 8193; прежний 8123 отменён, разрешения пользоваться им всё ещё нет».`, `Adeline said: “The ${item} code is now 8193; the old 8123 is revoked and permission to use it is still absent.”`),
    s(`Кирилл считает: «${noun} подлинный, но экспертизы не было».`, `Cyril believes: “The ${item} is genuine, but there has been no examination.”`),
    s(`Аделина сказала: «Мы снова обсуждали ${noun}, но узнали новое: владелец запретил передачу до осмотра».`, `Adeline said: “We discussed the ${item} again, but learned something new: the owner forbids transfer before inspection.”`),
    s(`Аделина обещала: «Я принесу пустой ящик после уборки; это не связано с предметом «${other}»».`, `Adeline promised: “I will bring the empty box after cleaning; this is not related to the ${second}.”`),
    s(`Кирилл держит ${noun}.`, `Cyril holds the ${item}.`),
  ];
  const records: StoryFact[] = texts.map((text, i) => ({
    kind: [1, 2, 4, 10].includes(i) ? 'promise' : i === 3 ? 'plan' : i === 8 ? 'belief' : 'event', text,
    quote: i === 11 ? s(`Аделина сказала: «Кажется, Кирилл держит ${noun}, но я не проверяла».`, `Adeline said: “Maybe Cyril holds the ${item}, but I have not checked.”`) : text,
    ...([1, 2, 4, 5, 10].includes(i) ? { task: { key: [4, 5].includes(i) ? world.id + '-return' : world.id + '-duty-' + i,
      title: [4, 5].includes(i) ? s(`Вернуть ${other}`, `Return the ${second}`) : i === 10 ? s('Принести пустой ящик', 'Bring the empty box') : s(`Отнести ${noun}`, `Take the ${item}`),
      status: i === 5 ? 'completed' as const : 'open' as const } } : {}),
    ...([6, 7].includes(i) ? { claim: { key: world.id + '-code', value: i === 6 ? '8123' : '8193', scope: 'state' as const, lifetime: 'persistent' as const } } : {}),
  }));
  const discussions: StoryFact[] = Array.from({ length: 120 }, (_, i) => {
    const location = places[i % places.length]!, round = ['утром', 'днём', 'вечером', 'ночью', 'перед завтраком', 'после обеда', 'на рассвете', 'на закате', 'в полдень', 'перед сном'][Math.floor(i / places.length)]!;
    const time = ['in the morning', 'at noon', 'in the evening', 'at night', 'before breakfast', 'after lunch', 'at dawn', 'at sunset', 'in the afternoon', 'before sleep'][Math.floor(i / places.length)]!;
    const text = i % 2 ? s(`Кирилл сказал: «Мы снова обсуждали ${noun} у ${location[0]} ${round}; новых сведений, действий и обязательств не появилось».`, `Cyril said: “We discussed the ${item} again by ${location[1]} ${time}; no new information, actions or commitments were added.”`)
      : s(`Аделина сказала: «Мы лишь вспоминали ${noun} у ${location[0]} ${round}; новых сведений, действий и обязательств не появилось».`, `Adeline said: “We only recalled the ${item} by ${location[1]} ${time}; no new information, actions or commitments were added.”`);
    return { kind: 'event', text, quote: text };
  });
  const facts = [...records, ...discussions], sources = facts.map((_, i) => 'rp270-' + world.id + '-source-' + i);
  const grammar = createStoryRoleReaderV1({ worldId: f.base.world.id, entities: f.input.entities! });
  const seeds = facts.map((fact, i) => roleSeed(fact, { version: 1, sourceRevisionId: sources[i]!, quote: fact.quote, roles: grammar.read(fact) ?? {} }));
  Object.assign(f.input.story!, { facts, roleSeeds: seeds, episodeSources: sources }); f.input.recentMessages = [discussions.at(-1)!.text];
  return { ...f, A: A!, B: B!, world, topic, object, otherTopic, form, records, discussions, facts, sources, seeds };
}
export function discussionScenarios() {
  return (['ru', 'en'] as const).flatMap(locale => worlds.flatMap(world => {
    const f = discussionWorld(locale, world), s = f.s;
    const q = s(`Что известно о ${f.form}?`, `What do we know about the ${f.topic}?`);
    const rows = [
      { id: 'specific', family: 'event', q: s(`Напомни о предмете «${f.object}».`, `Remind me about the ${f.object}.`), gold: [0] },
      { id: 'known', family: 'bundle', q, gold: [0, 1, 2, 7, 9, 11] },
      { id: 'conditions', family: 'conditions', q: s(`Какие условия поручения связаны с предметом «${f.topic}»?`, `What duty conditions concern the ${f.topic}?`), gold: [1, 2] },
      { id: 'retell', family: 'bundle', q: s(`Расскажи про предмет «${f.topic}».`, `Tell me about the ${f.topic}.`), gold: [0, 1, 2, 7, 9, 11] },
      { id: 'code', family: 'state', q: s(`Какой код для предмета «${f.topic}» теперь?`, `What is the ${f.topic} code now?`), gold: [7] },
      { id: 'completed', family: 'status', q: s(`Что известно о поручении вернуть ${f.otherTopic}?`, `What do we know about the duty to return the ${f.otherTopic}?`), gold: [5] },
      { id: 'ordinary', family: 'action', q: s(`Беру предмет «${f.topic}» и рассматриваю его.`, `I take the ${f.topic} and examine it.`), gold: [0, 1, 2, 7, 9, 11] },
      { id: 'informal', family: 'free', q: s(`А помнишь, как обстояло дело с предметом «${f.topic}»?`, `Remember how things stood with the ${f.topic}?`), gold: [0, 1, 2, 7, 9, 11] },
      { id: 'unknown', family: 'unknown', q: s('Напомни о космическом лифте.', 'Remind me about the space elevator.'), gold: [] },
      { id: 'speaker', family: 'discussion', q: s('Что Кирилл сказал у окна вечером?', 'What did Cyril say by the window in the evening?'), gold: [] },
      { id: 'continuation', family: 'continuation', q: s('Продолжай.', 'Continue.'), gold: [] },
      { id: 'ambiguous', family: 'identity', q: s('Что Лист обещал?', 'What did Leaf promise?'), gold: [] },
      { id: 'replacement', family: 'identity', q, gold: [] },
      { id: 'foreign', family: 'lineage', q, gold: [] },
      { id: 'quote-edit', family: 'evidence', q, gold: [] },
      { id: 'reported-only', family: 'evidence', q, gold: [] },
    ];
    return rows.map(row => {
      const c = discussionWorld(locale, world); c.input.draft = row.q;
      if (row.id === 'ambiguous') c.B.aliases.push(c.A.aliases[0]!);
      if (row.id === 'replacement') c.input.entities = c.input.entities!.map(e => ({ ...e, id: 'new-' + e.id }));
      if (row.id === 'foreign') c.input.story!.episodeSources = c.sources.filter(id => !id.endsWith('source-0'));
      if (row.id === 'quote-edit') c.discussions.at(-1)!.quote += s(' Другая цитата.', ' A different quote.');
      if (row.id === 'reported-only') for (const fact of c.discussions) fact.text = s('Сокращённый пересказ разговора о предмете: ', 'Short summary of a discussion about the item: ') + c.topic + ' ' + fact.text.length + ' ' + c.facts.indexOf(fact);
      return { ...c, name: `${locale}:priority:${world.id}:${row.id}`, family: row.family, intent: row.gold.length ? 'positive' : 'control', split: world.split, wanted: row.gold.map(i => c.records[i]!) };
    });
  }));
}
export type DiscussionScenario = ReturnType<typeof discussionScenarios>[number];
/** A private prior-compiler option is added only after this old baseline exists.
 * Older compileGameContext simply ignores the additional comparator option. */
export const priorDiscussionContext = (input: DiscussionScenario['input']) => compileGameContext(input, { discussionPriority: false } as {});
export function discussionCase(c: DiscussionScenario) {
  const scope = { worldId: c.base.world.id, entities: c.input.entities! }, roles = createStoryRoleReader(scope, c.input.draft, storedRoleReader(c.seeds, scope.entities, scope.worldId));
  const episodes = createEpisodeReader(c.seeds, c.input.story!.episodeSources), ranks = rankStoryFacts(c.input.story!.facts, c.input.draft, scope, roles), original = new Map(c.facts.map((f, i) => [f.text, 'fact-' + i]));
  if (original.size !== c.facts.length) throw new Error('Duplicate RP270 source text');
  const baseline = priorDiscussionContext(c.input), block = baseline.text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];
  const retrieval = storyRetrievalQuery(c.input.draft, scope);
  return { id: c.name, split: c.split, family: c.family, intent: c.intent, query: c.input.draft,
    documents: ranks.map(r => ({ id: original.get(r.fact.text)!, fact: r.fact, source: episodes.read(r.fact)?.revisionId ?? 'unknown', roles: roles.read(r.fact) ?? {} })),
    lexical: ranks.map(r => original.get(r.fact.text)!), baseline: block ? decodeStoryMemory(JSON.parse(block.split('\n')[1]!)).map(h => original.get(h.text)!) : [],
    gold: c.wanted.map(f => original.get(f.text)!), protected: !!roles.question || retrieval.ambiguousName || retrieval.unresolvedReference,
  };
}
