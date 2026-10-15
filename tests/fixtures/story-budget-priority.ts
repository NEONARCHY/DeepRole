import { admissionWorld } from './story-topic-admission';
import type { Locale } from '../../src/core/types';
import type { StoryFact } from '../../src/core/story-update';
import { roleSeed } from '../../src/core/story-role-binding';
import { createStoryRoleReaderV1 } from '../../src/core/story-source-roles';
import { compileGameContext } from '../../src/core/game-context';
export { flexibleHints as budgetHints } from './story-flexible-priority';

// Exact fresh prose, desired whole sets and controls fixed BEFORE RP273 code.
const settings = [
  { id: 'observatory', split: 'development', ru: ['бронзовая дверь', 'бронзовую дверь', 'лазурный ключ', 'запасной набор'], en: ['bronze door', 'azure key', 'spare kit'] },
  { id: 'expedition', split: 'evaluation', ru: ['служебный люк', 'служебный люк', 'зелёный жетон', 'полевой комплект'], en: ['service hatch', 'green token', 'field kit'] },
] as const;
export function budgetWorld(locale: Locale, count = 12, objects = 2, setting = settings[0] as typeof settings[number]) {
  const f = admissionWorld(locale), s = f.s, [A, B] = f.base.entities;
  A!.name = s('Таисия', 'Taisia'); A!.aliases = []; B!.name = s('Роман', 'Roman'); B!.aliases = [];
  const topics = locale === 'ru' ? [setting.ru[0], setting.ru[2], setting.ru[3]] : [...setting.en];
  const details = [
    s('Осмотр разрешён только при свидетеле; пользоваться предметом пока нельзя.', 'Inspection is allowed only with a witness; using the object is not allowed yet.'),
    s('Старая пломба снята, но новая проверка ещё не проведена.', 'The old seal was removed, but the new check has not been carried out.'),
    s('Отмечен след краски; это не подтверждает, кто касался предмета.', 'A paint mark was recorded; this does not confirm who touched the object.'),
    s('Таисия обещала Роману сверить журнал только после разрешения хранителя.', 'Taisia promised Roman to check the register only after the custodian gives permission.'),
    s('Роман считает, что доставка задержится; это его мнение, не доказанная задержка.', 'Roman believes delivery will be delayed; this is his belief, not a proven delay.'),
    s('Таисия сказала: «Новая метка — соловей; старую метку отменили, право доступа не изменилось».', 'Taisia said: “The new label is nightingale; the old label is revoked, access permission has not changed.”'),
    s('Роман отказался передавать предмет без письменного разрешения владельца.', 'Roman refused to hand over the object without the owner’s written permission.'),
    s('Поручение сверить вес отменено; проверка упаковки не отменена.', 'The duty to check the weight is cancelled; checking the packaging is not cancelled.'),
  ];
  const records: StoryFact[] = Array.from({ length: count }, (_, i) => {
    const text = s(`Предмет ${topics[i % objects]}. Участок ${i + 1}: `, `The ${topics[i % objects]}. Section ${i + 1}: `) + details[i % details.length];
    return { kind: i % 8 === 3 ? 'promise' : i % 8 === 4 ? 'belief' : 'event', text,
      quote: i % 8 === 2 ? s(`Роман сказал: «${text} Личность посетителя не установлена; это не обвинение Таисии».`, `Roman said: “${text} The visitor’s identity is unknown; this is not an accusation against Taisia.”`) : text,
      ...(i % 8 === 3 || i % 8 === 7 ? { task: { key: setting.id + '-independent-duty-' + i, title: s(`Сверить предмет ${topics[i % objects]} на участке ${i + 1}`, `Check the ${topics[i % objects]} at section ${i + 1}`), status: i % 8 === 7 ? 'cancelled' as const : 'open' as const } } : {}),
      ...(i % 8 === 5 ? { claim: { key: setting.id + '-label-' + i, value: 'nightingale', scope: 'state' as const, lifetime: 'persistent' as const } } : {}),
    };
  });
  const discussions: StoryFact[] = topics.slice(0, objects).flatMap(topic => Array.from({ length: 12 }, (_, i) => {
    const place = s(['у часов', 'на галерее', 'у лестницы'][i % 3]!, ['by the clock', 'on the gallery', 'by the stairs'][i % 3]!);
    const text = s(`Роман сказал: «Мы вернулись к разговору о предмете ${topic} ${place}. Ничего нового не узнали; ничего не сделали; новых обещаний не дали».`, `Roman said: “We returned to our discussion of the ${topic} ${place}. We learned nothing new; we did nothing; we made no new promises.”`);
    return { kind: 'event' as const, text, quote: text };
  }));
  const text = s('Таисия сказала: «Поручение полить цветы отменено».', 'Taisia said: “The duty to water the flowers is cancelled.”');
  const unrelated: StoryFact = { kind: 'event', text, quote: text, task: { key: setting.id + '-flowers', title: s('Полить цветы', 'Water the flowers'), status: 'cancelled' } };
  const facts = [...records, unrelated, ...discussions], sources = facts.map((_, i) => setting.id + '-budget-source-' + i);
  const grammar = createStoryRoleReaderV1({ worldId: f.base.world.id, entities: f.input.entities! });
  const seeds = facts.map((fact, i) => roleSeed(fact, { version: 1, sourceRevisionId: sources[i]!, quote: fact.quote, roles: grammar.read(fact) ?? {} }));
  Object.assign(f.input.story!, { facts, roleSeeds: seeds, episodeSources: sources }); f.input.recentMessages = [discussions.at(-1)!.text];
  const actions = [s(`открываю ${setting.ru[1]}`, `open the ${setting.en[0]}`), s(`достаю ${setting.ru[2]}`, `take the ${setting.en[1]}`), s(`осматриваю ${setting.ru[3]}`, `inspect the ${setting.en[2]}`)];
  return { ...f, A: A!, B: B!, setting, records, discussions, unrelated, facts, sources, seeds, topics, actions,
    single: actions[0]!, dual: actions.slice(0, 2).join(s(' и ', ' and ')), triple: actions.join(s(' и ', ' and ')) };
}
export function budgetScenarios() {
  return (['ru', 'en'] as const).flatMap(locale => settings.flatMap(setting => {
    const rows = [
      ['nine-single', 9, 1], ['twelve-single', 12, 1], ['nine-dual', 9, 2], ['twelve-dual', 12, 2],
      ['sixteen-triple', 16, 3], ['info', 12, 1], ['wrapped', 12, 2], ['no-repeats', 12, 2],
      ['edited', 12, 2], ['missing-source', 12, 2], ['replacement', 12, 2], ['unavailable', 12, 2],
      ['unknown-tail', 12, 2], ['conditional', 12, 2], ['required', 12, 2], ['speaker', 12, 2],
    ] as const;
    return rows.map(([id, count, objects], index) => {
      const c = budgetWorld(locale, count, objects, setting), s = c.s;
      c.input.draft = objects === 1 ? c.single : objects === 3 ? c.triple : c.dual;
      if (id === 'info') c.input.draft = s(`Что известно о предмете ${c.topics[0]}?`, `What do we know about the ${c.topics[0]}?`);
      if (id === 'wrapped') c.input.draft = '**' + c.dual + '**';
      if (id === 'no-repeats') { c.input.story!.facts = [...c.records, c.unrelated]; c.input.recentMessages = [c.records.at(-1)!.text]; }
      if (id === 'edited') c.records[0]!.quote += s(' Источник изменён.', ' The source changed.');
      if (id === 'missing-source') c.input.story!.episodeSources = c.sources.slice(1);
      if (id === 'replacement') c.input.entities = c.input.entities!.map(e => ({ ...e, id: 'new-person-' + e.id }));
      if (id === 'unavailable') c.input.entities = c.input.entities!.filter(e => e.id !== c.B.id);
      if (id === 'unknown-tail') c.input.draft = c.dual + s(' и проверяю неизвестный алтарь', ' and check the unknown altar');
      if (id === 'conditional') c.input.draft = c.dual + s(', если разрешат', ' if they allow it');
      if (id === 'required') { c.input.settings.contextBudget = 900; c.input.requiredContext = 'Whole required recovered scene. '.repeat(900); }
      if (id === 'speaker') c.input.draft = s('Что Роман сказал у часов?', 'What did Roman say by the clock?');
      return { ...c, id: `${locale}:rp273:${setting.id}:${id}`, family: id, positive: index < 8, wanted: index < 8 ? c.records : [], split: setting.split };
    });
  }));
}
export type BudgetScenario = ReturnType<typeof budgetScenarios>[number];
export const priorBudgetContext = (input: BudgetScenario['input']) => compileGameContext(input, { budgetPriority: false } as {});
