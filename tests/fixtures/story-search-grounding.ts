import { admissionWorld } from './story-topic-admission';
import type { Locale } from '../../src/core/types';
import type { StoryFact } from '../../src/core/story-update';
import { roleSeed, storedRoleReader } from '../../src/core/story-role-binding';
import { createStoryRoleReader, createStoryRoleReaderV1 } from '../../src/core/story-source-roles';
import { createEpisodeReader } from '../../src/core/story-episodes';
import { rankStoryFacts } from '../../src/core/story-fact-context';
import { storyRetrievalQuery } from '../../src/core/story-retrieval-query';
import { compileGameContext } from '../../src/core/game-context';
import { decodeStoryMemory } from '../../src/core/story-memory-transport';
import { uniqueTokens } from '../../src/core/text';
import type { GroundingCase } from '../../scripts/story-search-grounding.mjs';

// RP269: all labels below are authored before the new candidate algorithm.
// No fixture or label is generated from a scorer. New worlds, not RP263/264 data.
const settings = [
  { id: 'courtyard', split: 'development', ru: ['фонарь', 'фонарём', 'фонаря', 'арбалет', 'починили'], en: ['lantern', 'crossbow', 'repaired'] },
  { id: 'depot', split: 'development', ru: ['фургон', 'фургоном', 'фургона', 'диктофон', 'перевезли'], en: ['wagon', 'recorder', 'moved'] },
  { id: 'orbital', split: 'holdout', ru: ['передатчик', 'передатчиком', 'передатчика', 'сканер', 'установили'], en: ['transmitter', 'scanner', 'installed'] },
] as const;

export function groundingWorld(locale: Locale, setting = settings[0] as typeof settings[number]) {
  const f = admissionWorld(locale), s = f.s, [A, B] = f.base.entities;
  A!.name = s('Селина', 'Selina'); A!.aliases = [s('Искра', 'Spark')];
  B!.name = s('Орест', 'Orest'); B!.aliases = [s('Шелест', 'Rustle')];
  const [object, instrumental, genitive, other, played] = setting.ru;
  const [item, second, done] = setting.en;
  const topic = s(object, item), secondTopic = s(other, second);
  const prose = [
    s(`${object[0]!.toUpperCase() + object.slice(1)} ${played} у ворот после разрешения смотрителя.`, `The ${item} was ${done} at the gate after the keeper gave permission.`),
    s(`Селина обещала: «Я займусь ${object} только после открытия дороги; пока дорога закрыта».`, `Selina promised: “I will work on the ${item} only after the road opens; the road is still closed.”`),
    s(`Орест планирует: «Я займусь ${object} после доставки деталей; детали пока не доставлены».`, `Orest plans: “I will work on the ${item} after the parts arrive; the parts have not arrived yet.”`),
    s(`${object[0]!.toUpperCase() + object.slice(1)} ${played}.`, `The ${item} was ${done}.`),
    s(`Селина обещала: «Я верну ${other} после проверки, это не разрешение брать его снова».`, `Selina promised: “I will return the ${second} after inspection; this is not permission to borrow it again.”`),
    s(`Орест сказал: «Поручение вернуть ${other} выполнено после проверки; повторно брать его нельзя».`, `Orest said: “The duty to return the ${second} is completed after inspection; it must not be borrowed again.”`),
    s(`Орест обещал: «Я верну другой ${other} только после согласия владельца; согласия пока нет».`, `Orest promised: “I will return another ${second} only after the owner agrees; the owner has not agreed.”`),
    s(`Орест сказал: «Поручение вернуть другой ${other} отменено; я его не выполнял».`, `Orest said: “The duty to return another ${second} is cancelled; I did not carry it out.”`),
    s(`Селина сказала: «Код ${genitive} 7314; знание кода не разрешает пользоваться им».`, `Selina said: “The ${item} code is 7314; knowing it does not permit its use.”`),
    s(`Селина сказала: «Код ${genitive} теперь 7394; прежний 7314 отменён, разрешения пользоваться им нет».`, `Selina said: “The ${item} code is now 7394; the old 7314 is revoked and its use is not permitted.”`),
    s(`Орест считает: «${object} готов к работе, но я его не проверял».`, `Orest believes: “The ${item} is ready for use, but I have not checked it.”`),
    s(`Селина обещала: «Я займусь ${object} только после разрешения северного поста; южный пост не подходит».`, `Selina promised: “I will work on the ${item} only after the north post gives permission; the south post does not qualify.”`),
    s(`Пустой ${other} оставили на стойке; это другой предмет.`, `An empty ${second} was left on the counter; it is a different object.`),
    s(`${object[0]!.toUpperCase() + object.slice(1)} не ${played}; они только обсуждали такую возможность.`, `The ${item} was not ${done}; they only discussed that possibility.`),
    s(`${object[0]!.toUpperCase() + object.slice(1)} ${played}? Это был вопрос, не сообщение о завершении.`, `Was the ${item} ${done}? That was a question, not a completion report.`),
  ];
  const records: StoryFact[] = prose.map((text, i) => ({
    kind: [1, 4, 6, 11].includes(i) ? 'promise' : i === 2 ? 'plan' : i === 10 ? 'belief' : 'event', text,
    quote: i === 3 ? s(`Селина сказала: «Кажется, ${object} ${played}, но я не проверяла».`, `Selina said: “Perhaps the ${item} was ${done}, but I have not checked.”`) : text,
    ...([1, 2, 4, 5, 6, 7, 11].includes(i) ? { task: {
      key: [4, 5].includes(i) ? setting.id + '-returned' : [6, 7].includes(i) ? setting.id + '-cancelled' : setting.id + '-work-' + i,
      title: [4, 5, 6, 7].includes(i) ? s(`Вернуть ${other}`, `Return the ${second}`) : s(`Заняться ${object}`, `Work on the ${item}`),
      status: i === 5 ? 'completed' as const : i === 7 ? 'cancelled' as const : 'open' as const,
    } } : {}),
    ...([8, 9].includes(i) ? { claim: { key: setting.id + '-code', value: i === 8 ? '7314' : '7394', scope: 'state' as const, lifetime: 'persistent' as const } } : {}),
  }));
  const noise: StoryFact[] = Array.from({ length: 120 }, (_, i) => {
    const person = i % 2 ? B!.name : A!.name;
    const text = i % 3 ? s(`${person} ${i % 2 ? 'сказал' : 'сказала'}: «Мы обсуждали ${object}, ${other} и старые поручения; новых действий и разрешений не было». Беседа ${i}.`, `${person} said: “We discussed the ${item}, the ${second} and earlier duties; there were no new actions or permissions.” Conversation ${i}.`)
      : s(`О ${object} и ${other} говорили у окна; ничего не выполняли. Поздний разговор ${i}.`, `They talked about the ${item} and the ${second} by the window; nothing was carried out. Later conversation ${i}.`);
    return { kind: 'event', text, quote: text };
  });
  const facts = [...records, ...noise], sources = facts.map((_, i) => 'rp269-' + setting.id + '-source-' + i);
  const grammar = createStoryRoleReaderV1({ worldId: f.base.world.id, entities: f.input.entities! });
  const seeds = facts.map((fact, i) => roleSeed(fact, { version: 1, sourceRevisionId: sources[i]!, quote: fact.quote, roles: grammar.read(fact) ?? {} }));
  Object.assign(f.input.story!, { facts, roleSeeds: seeds, episodeSources: sources });
  f.input.recentMessages = [noise.at(-1)!.text];
  return { ...f, A: A!, B: B!, records, noise, facts, seeds, sources, setting, topic, secondTopic, instrumental, genitive };
}

export function groundingScenarios() {
  return (['ru', 'en'] as const).flatMap(locale => settings.flatMap(setting => {
    const f = groundingWorld(locale, setting), s = f.s, object = f.topic, other = f.secondTopic;
    const occurrence = s(`Что действительно произошло с ${f.instrumental}?`, `What actually happened with the ${object}?`);
    const rows = [
      { id: 'played', family: 'occurrence', q: occurrence, gold: [0] },
      { id: 'promises', family: 'promise', q: s(`Какие обещания касались ${f.genitive}?`, `What promises concerned the ${object}?`), gold: [1, 11] },
      { id: 'plans', family: 'plan', q: s(`Какие планы касались ${f.genitive}?`, `What plans concerned the ${object}?`), gold: [2] },
      { id: 'completed', family: 'completed', q: s(`Напомни выполненное поручение про ${other}.`, `Remind me about the completed duty concerning the ${other}.`), gold: [5] },
      { id: 'cancelled', family: 'cancelled', q: s(`Напомни отменённое поручение про ${other}.`, `Remind me about the cancelled duty concerning the ${other}.`), gold: [7] },
      { id: 'conditions', family: 'conditions', q: s(`Какие условия у поручений про ${object}?`, `What are the conditions of the duties concerning the ${object}?`), gold: [1, 2, 11] },
      { id: 'current-code', family: 'state', q: s(`Какой код ${f.genitive} теперь?`, `What is the ${object} code now?`), gold: [9] },
      { id: 'reported', family: 'report', q: s(`Что Селина сказала о непроверенном сообщении про ${object}?`, `What did Selina say about the unverified report concerning the ${object}?`), gold: [3] },
      { id: 'unknown-topic', family: 'unknown', q: s('Что действительно произошло с вертолётом?', 'What actually happened with the helicopter?'), gold: [] },
      { id: 'not-played', family: 'absence', q: occurrence, gold: [] },
      { id: 'missing-source', family: 'lineage', q: occurrence, gold: [] },
      { id: 'foreign-source', family: 'lineage', q: occurrence, gold: [] },
      { id: 'edited-quote', family: 'evidence', q: occurrence, gold: [] },
      { id: 'reused-name', family: 'identity', q: s(`Какие обещания касались ${f.genitive}?`, `What promises concerned the ${object}?`), gold: [] },
      { id: 'shared-name', family: 'identity', q: s('Что Искра обещала?', 'What did Spark promise?'), gold: [] },
      { id: 'quoted-question', family: 'syntax', q: s(`«${occurrence}»`, `“${occurrence}”`), gold: [] },
    ];
    return rows.map(row => {
      const c = groundingWorld(locale, setting);
      if (row.id === 'not-played') c.input.story!.facts = c.facts.filter(fact => fact !== c.records[0]);
      if (row.id === 'missing-source') c.input.story!.episodeSources = c.sources.filter(id => id !== c.sources[0]);
      if (row.id === 'foreign-source') c.seeds[0]!.binding.sourceRevisionId = 'foreign-branch-source';
      if (row.id === 'edited-quote') c.records[0]!.quote += s(' Исправленная цитата без исходной привязки.', ' Edited quote without the original binding.');
      if (row.id === 'reused-name') c.input.entities = c.input.entities!.map(e => ({ ...e, id: 'new-' + e.id }));
      if (row.id === 'shared-name') c.B.aliases.push(c.A.aliases[0]!);
      c.input.draft = row.q;
      return { ...c, name: `${locale}:grounding:${setting.id}:${row.id}`, family: row.family, intent: row.gold.length ? 'positive' : 'control',
        split: setting.split, wanted: row.gold.map(i => c.records[i]!) };
    });
  }));
}
export type GroundingScenario = ReturnType<typeof groundingScenarios>[number];

export function groundingCase(c: GroundingScenario): GroundingCase {
  const scope = { worldId: c.base.world.id, entities: c.input.entities! };
  const roles = createStoryRoleReader(scope, c.input.draft, storedRoleReader(c.seeds, scope.entities, scope.worldId));
  const episodes = createEpisodeReader(c.seeds, c.input.story!.episodeSources);
  const ranked = rankStoryFacts(c.input.story!.facts, c.input.draft, scope, roles);
  const ids = new Map(c.facts.map((fact, i) => [fact.text, 'fact-' + i]));
  if (ids.size !== c.facts.length) throw new Error('Grounding fixture repeats exact fact text');
  const documents = ranked.map(r => ({ id: ids.get(r.fact.text)!, text: [r.fact.text, r.fact.task?.title ?? ''].filter(Boolean).join('\n'),
    source: episodes.read(r.fact)?.revisionId ?? 'unknown', fact: r.fact,
    sourceVerified: !!episodes.read(r.fact), roles: roles.read(r.fact) ?? {}, identityStatus: roles.status?.(r.fact) ?? 'legacy',
  }));
  const block = compileGameContext(c.input).text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];
  const baseline = block ? decodeStoryMemory(JSON.parse(block.split('\n')[1]!)).map(h => ids.get(h.text)!) : [];
  const retrieval = storyRetrievalQuery(c.input.draft, scope);
  const byId = new Map(documents.map(d => [d.id, d]));
  const mandatory = baseline.filter(id => { const d = byId.get(id)!; return !!d.fact.task || !!d.fact.claim || !!Object.keys(d.roles).length; });
  return { id: c.name, split: c.split, family: c.family, intent: c.intent, query: c.input.draft, documents,
    lexical: documents.map(d => d.id), baseline, gold: c.wanted.map(f => ids.get(f.text)!), protected: !!roles.question || retrieval.ambiguousName,
    mandatory, names: [...retrieval.relevanceNames], currentSourceIds: [...c.input.story!.episodeSources!],
  };
}

export const groundingTokens = (text: string) => [...uniqueTokens(text)];
