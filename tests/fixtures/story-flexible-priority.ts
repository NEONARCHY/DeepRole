import { admissionWorld } from './story-topic-admission';
import type { Locale } from '../../src/core/types';
import type { StoryFact } from '../../src/core/story-update';
import { roleSeed } from '../../src/core/story-role-binding';
import { createStoryRoleReaderV1 } from '../../src/core/story-source-roles';
import { compileGameContext } from '../../src/core/game-context';
import { decodeStoryMemory } from '../../src/core/story-memory-transport';

// New sources, queries and expected complete sets, authored before RP271 exists.
// Settings/source IDs are provenance only, never features of the algorithm.
const settings = [
  { id: 'fort', split: 'development', ru: ['северная дверь', 'северную дверь', 'северной двери', 'дверь', 'Я открываю'], en: ['north door', 'door', 'I open'] },
  { id: 'clinic', split: 'development', ru: ['аварийный клапан', 'аварийный клапан', 'аварийном клапане', 'клапан', 'Я проверяю'], en: ['emergency valve', 'valve', 'I check'] },
  { id: 'island', split: 'evaluation', ru: ['походный дневник', 'походный дневник', 'походном дневнике', 'дневник', 'Я читаю'], en: ['travel diary', 'diary', 'I read'] },
] as const;
const places = [['у окна', 'by the window'], ['в саду', 'in the garden'], ['на кухне', 'in the kitchen'], ['у моста', 'by the bridge'], ['у ворот', 'at the gate'], ['на веранде', 'on the veranda']] as const;

export function flexibleWorld(locale: Locale, setting = settings[0] as typeof settings[number]) {
  const f = admissionWorld(locale), s = f.s, [A, B] = f.base.entities;
  A!.name = s('Лидия', 'Lydia'); A!.aliases = []; B!.name = s('Олег', 'Oleg'); B!.aliases = [];
  const topic = s(setting.ru[0], setting.en[0]), noun = s(setting.ru[3], setting.en[1]);
  const texts = [
    s(`Северный архив: предмет ${topic} использовали только после осмотра; это не разрешает использовать его повторно.`, `North archive: the ${topic} was used only after inspection; this does not authorize another use.`),
    s(`Лидия обещала: «Я проверю предмет ${topic} только после разрешения смотрителя; согласие охраны не подходит».`, `Lydia promised: “I will check the ${topic} only after the keeper gives permission; the guard's permission does not qualify.”`),
    s(`Олег обещал: «Я проверю предмет ${topic} только после подписи охраны; разрешение смотрителя не подходит».`, `Oleg promised: “I will check the ${topic} only after the guard signs; the keeper's permission does not qualify.”`),
    s(`Лидия сказала: «Предмет ${topic} теперь заблокирован; прежнее разрешение отменено».`, `Lydia said: “The ${topic} is now locked; the previous permission has been revoked.”`),
    s(`Олег сказал: «Мы опять говорили про предмет ${topic}. Узнали, что пользоваться им до проверки нельзя».`, `Oleg said: “We talked about the ${topic} again. We learned that it cannot be used before inspection.”`),
    s(`Лидия сказала: «Мы вернулись к разговору о предмете ${topic}. Я обещаю отнести его смотрителю после осмотра».`, `Lydia said: “We returned to our discussion of the ${topic}. I promise to take it to the keeper after inspection.”`),
    s(`Предмет ${topic} у охраны.`, `The ${topic} is with the guard.`),
    s('Олег сказал: «Поручение вернуть ведро отменено, его больше не нужно выполнять».', 'Oleg said: “The duty to return the bucket is cancelled; it no longer needs to be done.”'),
  ];
  const records: StoryFact[] = texts.map((text, i) => ({ kind: i === 1 || i === 2 ? 'promise' : 'event', text,
    quote: i === 6 ? s(`Лидия сказала: «Может быть, предмет ${topic} у охраны; я не проверяла».`, `Lydia said: “Maybe the ${topic} is with the guard; I have not checked.”`) : text,
    ...(i === 1 || i === 2 || i === 7 ? { task: { key: setting.id + '-duty-' + i, title: i === 7 ? s('Вернуть ведро', 'Return the bucket') : s(`Проверить предмет ${topic}`, `Check the ${topic}`), status: i === 7 ? 'cancelled' as const : 'open' as const } } : {}),
    ...(i === 3 ? { claim: { key: setting.id + '-permission', value: 'revoked', scope: 'state' as const, lifetime: 'persistent' as const } } : {}),
  }));
  // Freer clause order / separators, with explicit absence of all three kinds
  // of change. A mere "we chatted again" is intentionally NOT labelled empty.
  const bodies = (place: string) => [
    s(`Мы опять говорили про предмет ${topic} ${place}. Ничего нового не узнали. Ничего не сделали. Новых обещаний не дали.`, `We talked about the ${topic} again ${place}. We learned nothing new. We did nothing. We made no new promises.`),
    s(`Мы ещё раз обсудили предмет ${topic} ${place}; новых фактов не появилось; новых действий не было; новых обязательств не возникло.`, `We went over the ${topic} once more ${place}; no new facts emerged; no new actions occurred; no new commitments arose.`),
    s(`Мы вернулись к разговору о предмете ${topic} ${place}. Новых обещаний не дали. Ничего не сделали. Ничего нового не узнали.`, `We returned to our discussion of the ${topic} ${place}. We made no new promises. We did nothing. We learned nothing new.`),
    s(`Мы вновь вспоминали предмет ${topic} ${place} — новых сведений, действий и обязательств не появилось.`, `We revisited our discussion of the ${topic} ${place} — no new information, actions or commitments were added.`),
    s(`Мы опять говорили про предмет ${topic} ${place}; новых обязательств не возникло; новых фактов не появилось; новых действий не было.`, `We talked about the ${topic} again ${place}; no new commitments arose; no new facts emerged; no new actions occurred.`),
    s(`Мы ещё раз обсудили предмет ${topic} ${place}. Ничего не сделали. Новых обещаний не дали. Ничего нового не узнали.`, `We went over the ${topic} once more ${place}. We did nothing. We made no new promises. We learned nothing new.`),
  ];
  const discussions: StoryFact[] = places.flatMap(place => bodies(s(place[0], place[1])).map(body => {
    const text = s(`Олег сказал: «${body}».`, `Oleg said: “${body}”`); return { kind: 'event' as const, text, quote: text };
  }));
  const facts = [...records, ...discussions], sources = facts.map((_, i) => setting.id + '-rp271-source-' + i);
  const grammar = createStoryRoleReaderV1({ worldId: f.base.world.id, entities: f.input.entities! });
  const seeds = facts.map((fact, i) => roleSeed(fact, { version: 1, sourceRevisionId: sources[i]!, quote: fact.quote, roles: grammar.read(fact) ?? {} }));
  Object.assign(f.input.story!, { facts, roleSeeds: seeds, episodeSources: sources }); f.input.recentMessages = [discussions.at(-1)!.text];
  return { ...f, A: A!, B: B!, setting, topic, noun, records, discussions, facts, sources, seeds,
    action: s(`${setting.ru[4]} ${setting.ru[1]}.`, `${setting.en[2]} the ${setting.en[0]}.`) };
}
export function flexibleScenarios() {
  return (['ru', 'en'] as const).flatMap(locale => settings.flatMap(setting => {
    const f = flexibleWorld(locale, setting), s = f.s;
    const q = s(`Что известно о предмете ${setting.ru[2]}?`, `What do we know about the ${setting.en[0]}?`);
    const rows = [
      ['question', q, true], ['action', f.action, true],
      ['slow-action', s(`*${setting.ru[4]} осторожно ${setting.ru[1]}*`, `*${setting.en[2]} carefully the ${setting.en[0]}*`), false],
      ['bare-action', s(`${setting.ru[4]} ${setting.ru[3]}.`, `${setting.en[2]} the ${setting.en[1]}.`), true],
      ['negative', s(`${setting.ru[4].replace('Я ', 'Я не ')} ${setting.ru[1]}.`, `${setting.en[2].replace('I ', 'I do not ')} the ${setting.en[0]}.`), false],
      ['conditional', s(`Если охрана разрешит, ${f.action.toLocaleLowerCase()}`, `If the guard allows it, ${f.action.toLocaleLowerCase()}`), false],
      ['dialogue', s('Что Олег сказал у окна?', 'What did Oleg say by the window?'), false],
      ['continue', s('Продолжай.', 'Continue.'), false],
      ['unknown', s('Я открываю космическую капсулу.', 'I open the space capsule.'), false],
      ['lineage', f.action, false], ['roles', q, false], ['summary', f.action, false],
      ['overflow', f.action, false], ['required', q, false], ['pronoun', s('Я открываю её.', 'I open it.'), false],
    ] as const;
    return rows.map(([id, draft, positive]) => {
      const c = flexibleWorld(locale, setting); c.input.draft = draft;
      if (id === 'lineage') c.input.story!.episodeSources = c.sources.slice(1);
      if (id === 'roles') c.input.entities = c.input.entities!.map(e => ({ ...e, id: 'replacement-' + e.id }));
      if (id === 'summary') for (const fact of c.discussions) fact.text = s(`Сокращённый рассказ о предмете ${c.topic}.`, `A shortened account of the ${c.topic}.`) + c.facts.indexOf(fact);
      if (id === 'overflow') for (const suffix of [s('Есть отдельное ограничение.', 'There is a separate restriction.'), s('Нужна отдельная проверка.', 'A separate check is required.')]) {
        const text = s(`Предмет ${c.topic}. `, `The ${c.topic}. `) + suffix, fact: StoryFact = { kind: 'event', text, quote: text }, source = 'extra-' + c.facts.length;
        c.facts.push(fact); c.seeds.push(roleSeed(fact, { version: 1, sourceRevisionId: source, quote: text, roles: {} })); c.sources.push(source);
      }
      if (id === 'required') { c.input.settings.contextBudget = 1000; c.input.requiredContext = 'Uncut required lore. '.repeat(1000); }
      return { ...c, id: `${locale}:rp271:${setting.id}:${id}`, family: id, positive, split: setting.split, wanted: positive ? c.records.slice(0, 7) : [] };
    });
  }));
}
export type FlexibleScenario = ReturnType<typeof flexibleScenarios>[number];
export const priorFlexibleContext = (input: FlexibleScenario['input']) => compileGameContext(input, { flexiblePriority: false } as {});
export function flexibleHints(text: string) {
  const block = text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];
  return block ? decodeStoryMemory(JSON.parse(block.split('\n')[1]!)) : [];
}
