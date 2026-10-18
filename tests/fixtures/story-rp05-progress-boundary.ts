import type { GameContextInput } from '../../src/core/game-context';
import type { Locale } from '../../src/core/types';
import type { StoryFact } from '../../src/core/story-update';
import { roleSeed } from '../../src/core/story-role-binding';
import { storyWorld } from './story-worlds';

type Scenario = { id: string; draft: [string, string]; wanted: string[]; control?: boolean };

const text = {
  action: [
    'During the blackout, Ivo shut down the old pump after the chlorine alarm; he did not touch the copper valve.',
    'Во время отключения Иво остановил старый насос после сигнала хлора; медный клапан он не трогал.',
  ],
  repair: [
    'At the dawn inspection, Ivo replaced the cracked copper valve; it was the first repair since the blackout.',
    'На рассветном осмотре Иво заменил треснувший медный клапан; это был первый ремонт после отключения.',
  ],
  promise: [
    'Ivo promised to restart the pump only after a clean water test and Jo’s authorization; neither condition is complete.',
    'Иво обещал перезапустить насос только после чистого анализа воды и разрешения Джо; ни одно условие пока не выполнено.',
  ],
  disclosure: [
    'At the second inspection, Rhea again discussed the pump and newly revealed that the chlorine alarm code is 7314; nobody knew this detail before.',
    'На втором осмотре Рея снова заговорила о насосе и впервые раскрыла код сигнала хлора — 7314; раньше эту деталь никто не знал.',
  ],
  quote: [
    'Ivo said: “The pump stays off until the second water test.”',
    'Иво сказал: «Насос останется выключенным до второго анализа воды».',
  ],
  recap: [
    'Once, the engineers again discussed the jade ledger; no new actions occurred.',
    'Однажды инженеры снова обсуждали нефритовый журнал; новых действий не было.',
  ],
  rumor: [
    'An unverified note says the blue wrench belongs to someone on the crew, but no witness identifies the owner.',
    'Непроверенная записка утверждает, что синий ключ принадлежит кому-то из команды, но ни один свидетель не назвал владельца.',
  ],
  repeated: [
    'Later the crew again discussed the old pump, chlorine alarm, copper valve, water test and Jo’s authorization; no new actions or information were added.',
    'Позже команда снова обсуждала старый насос, сигнал хлора, медный клапан, анализ воды и разрешение Джо; новых действий или сведений не добавилось.',
  ],
} as const;

const scenarios: Scenario[] = [
  { id: 'blackout-action-is-not-overwritten-by-repairs', draft: [
    'What did Ivo do during the blackout after the chlorine alarm?',
    'Что Иво сделал во время отключения после сигнала хлора?',
  ], wanted: ['action'] },
  { id: 'real-progress-with-shared-keywords-survives', draft: [
    'Who repaired the copper valve at dawn?',
    'Кто на рассвете починил медный клапан?',
  ], wanted: ['repair'] },
  { id: 'open-conditions-survive-the-repeat-tail', draft: [
    'Can Ivo restart the pump now, or are the water test and Jo’s authorization still required?',
    'Может ли Иво перезапустить насос или всё ещё нужны анализ воды и разрешение Джо?',
  ], wanted: ['promise'] },
  { id: 'discussion-question-retains-repeated-discussions', draft: [
    'What did the crew repeatedly discuss about the old pump?',
    'Что команда снова и снова обсуждала насчёт старого насоса?',
  ], wanted: ['repeated'] },
  { id: 'genuinely-new-information-is-not-pruned', draft: [
    'What code was newly revealed for the chlorine alarm?',
    'Какой код сигнала хлора раскрыли впервые?',
  ], wanted: ['disclosure'] },
  { id: 'single-recap-remains-available', draft: [
    'Where is the jade ledger mentioned?',
    'Где упоминается нефритовый журнал?',
  ], wanted: ['recap'] },
  { id: 'direct-quote-remains-available', draft: [
    'What did Ivo say about when the pump can restart?',
    'Что Иво сказал о том, когда насос можно перезапустить?',
  ], wanted: ['quote'] },
  { id: 'unknown-owner-does-not-leak-repeated-events', draft: [
    'Who owns the blue wrench?',
    'Кому принадлежит синий ключ?',
  ], wanted: ['rumor'], control: true },
];

export function rp05ProgressBoundaryScenarios(locale: Locale) {
  const language = locale === 'ru' ? 1 : 0;
  const fixture = storyWorld(locale, 4);
  fixture.world.storyAutomation = { mode: 'automatic', revision: 'rp05-progress-boundary' };
  fixture.entities[2]!.name = locale === 'ru' ? 'Иво' : 'Ivo';
  fixture.entities[3]!.name = locale === 'ru' ? 'Рея' : 'Rhea';

  const baseFacts: StoryFact[] = [
    { kind: 'event', text: text.action[language], quote: text.action[language] },
    { kind: 'event', text: text.repair[language], quote: text.repair[language] },
    { kind: 'promise', text: text.promise[language], quote: text.promise[language], task: {
      key: 'pump.restart',
      title: locale === 'ru' ? 'перезапустить насос' : 'restart pump',
      status: 'open',
    } },
    { kind: 'event', text: text.disclosure[language], quote: text.disclosure[language] },
    { kind: 'event', text: text.quote[language], quote: text.quote[language] },
    { kind: 'event', text: text.recap[language], quote: text.recap[language] },
    { kind: 'belief', text: text.rumor[language], quote: text.rumor[language] },
  ];
  const repeatedFacts = Array.from({ length: 36 }, (_, index): StoryFact => {
    const suffix = locale === 'ru' ? ` Повторный пересказ ${index + 1}.` : ` Repeat recap ${index + 1}.`;
    const repeatedText = text.repeated[language] + suffix;
    return { kind: 'event', text: repeatedText, quote: repeatedText };
  });
  const facts = [...baseFacts, ...repeatedFacts];
  const sources = facts.map((_, index) => `rp05-progress-${locale}-${index}`);
  const roleSeeds = facts.map((fact, index) => roleSeed(fact, {
    version: 1,
    sourceRevisionId: sources[index]!,
    quote: fact.quote,
    roles: index === 0 || index === 1 || index >= baseFacts.length
      ? { speaker: { id: fixture.entities[2]!.id, name: fixture.entities[2]!.name } }
      : index === 2
        ? { promisor: { id: fixture.entities[2]!.id, name: fixture.entities[2]!.name } }
        : index === 3
          ? { speaker: { id: fixture.entities[3]!.id, name: fixture.entities[3]!.name } }
          : {},
  }));

  return scenarios.map((scenario) => {
    const draft = scenario.draft[language];
    const input: GameContextInput = {
      draft,
      recentMessages: facts.slice(-2).map((fact) => fact.text),
      entries: [fixture.entry],
      books: [],
      entities: fixture.entities,
      worlds: [fixture.world],
      scene: { worldId: fixture.world.id, bookId: null, focusIds: [] },
      activeBookId: null,
      settings: { contextBudget: 6000, relevanceThreshold: 6 },
      character: [fixture.world.id, fixture.binding.chatId, fixture.entities, fixture.binding.characterScenes![fixture.world.id], [], [], draft, 'rp05-progress-audit', true, false, false],
      story: {
        world: fixture.world,
        chat: fixture.binding.chatId,
        branch: 'branch-progress-boundary',
        sheetsEnabled: true,
        facts,
        roleSeeds,
        episodeSources: sources,
      },
    };
    return { id: scenario.id, locale, input, facts, sources, wanted: scenario.wanted, control: !!scenario.control };
  });
}
