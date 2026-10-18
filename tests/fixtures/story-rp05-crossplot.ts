import type { GameContextInput } from '../../src/core/game-context';
import type { Locale } from '../../src/core/types';
import type { StoryFact } from '../../src/core/story-update';
import { roleSeed } from '../../src/core/story-role-binding';
import { storyWorld } from './story-worlds';

type Scenario = {
  id: string;
  draft: [string, string];
  wanted: string[];
  control?: boolean;
};

const sourceText = {
  action: [
    'During the blackout, Neri sealed the observatory hatch with blue wax; the lower telescope remained exposed.',
    'Во время отключения Нери запечатала люк обсерватории синим воском; нижний телескоп остался открытым.',
  ],
  promise: [
    'Neri promised to reopen the observatory hatch only after dawn and a pressure check; neither condition has been met.',
    'Нери обещала открыть люк обсерватории только после рассвета и проверки давления; оба условия пока не выполнены.',
  ],
  quote: [
    'Neri said: "The lower telescope stays closed until dawn."',
    'Нери сказала: «Нижний телескоп останется закрытым до рассвета».',
  ],
  recap: [
    'Once, the archivists again discussed the opal chart; no new actions happened.',
    'Однажды архивариусы снова обсуждали опаловую карту; новых действий не было.',
  ],
  rumor: [
    'A dockside rumor says the silver astrolabe belongs to someone in the observatory, but nobody has seen its owner.',
    'Портовый слух гласит, что серебряная астролябия принадлежит кому-то из обсерватории, но владельца никто не видел.',
  ],
  repeated: [
    'Later, the crew again discussed the sealed observatory hatch, dawn, the pressure check, and the lower telescope; no new actions or handovers occurred.',
    'Позже команда снова обсуждала запечатанный люк обсерватории, рассвет, проверку давления и нижний телескоп; новых действий или передач не было.',
  ],
} as const;

const scenarios: Scenario[] = [
  { id: 'hatch-played-action-and-open-conditions', draft: [
    'Can Neri reopen the observatory hatch now, and what happened to it?',
    'Может ли Нери сейчас открыть люк обсерватории и что с ним произошло?',
  ], wanted: ['action', 'promise'] },
  { id: 'discussion-question-still-sees-recap-tail', draft: [
    'What did the crew discuss about the sealed observatory hatch?',
    'Что команда обсуждала о запечатанном люке обсерватории?',
  ], wanted: ['repeated'] },
  { id: 'single-recap-is-not-pruned', draft: [
    'Where is the opal chart mentioned?',
    'Где упоминается опаловая карта?',
  ], wanted: ['recap'] },
  { id: 'direct-quote-remains-retrievable', draft: [
    'What did Neri say about the lower telescope?',
    'Что Нери сказала о нижнем телескопе?',
  ], wanted: ['quote'] },
  { id: 'unknown-owner-stays-belief', draft: [
    'Who owns the silver astrolabe?',
    'Кому принадлежит серебряная астролябия?',
  ], wanted: ['rumor'], control: true },
];

export function rp05CrossplotScenarios(locale: Locale) {
  const language = locale === 'ru' ? 1 : 0;
  const fixture = storyWorld(locale, 4);
  const worldRevision = 'rp05-crossplot-independent';
  fixture.world.storyAutomation = { mode: 'automatic', revision: worldRevision };
  fixture.entities[2]!.name = locale === 'ru' ? 'Нери' : 'Neri';
  fixture.entities[3]!.name = locale === 'ru' ? 'Соль' : 'Sol';

  const facts: StoryFact[] = [
    { kind: 'event', text: sourceText.action[language], quote: sourceText.action[language] },
    { kind: 'promise', text: sourceText.promise[language], quote: sourceText.promise[language], task: {
      key: 'observatory.hatch',
      title: locale === 'ru' ? 'открыть люк обсерватории' : 'reopen observatory hatch',
      status: 'open',
    } },
    { kind: 'event', text: sourceText.quote[language], quote: sourceText.quote[language] },
    { kind: 'event', text: sourceText.recap[language], quote: sourceText.recap[language] },
    { kind: 'belief', text: sourceText.rumor[language], quote: sourceText.rumor[language] },
    ...Array.from({ length: 32 }, (_, index): StoryFact => {
      const suffix = locale === 'ru' ? ` Пересказ ${index + 1}.` : ` Recap ${index + 1}.`;
      const text = sourceText.repeated[language] + suffix;
      return { kind: 'event', text, quote: text };
    }),
  ];
  const sources = facts.map((_, index) => `rp05-crossplot-${locale}-${index}`);
  const roleSeeds = facts.map((fact, index) => roleSeed(fact, {
    version: 1,
    sourceRevisionId: sources[index]!,
    quote: fact.quote,
    roles: index === 0 || index >= 5
      ? { speaker: { id: fixture.entities[2]!.id, name: fixture.entities[2]!.name } }
      : index === 1
        ? { promisor: { id: fixture.entities[2]!.id, name: fixture.entities[2]!.name } }
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
      character: [fixture.world.id, fixture.binding.chatId, fixture.entities, fixture.binding.characterScenes![fixture.world.id], [], [], draft, 'rp05-crossplot-audit', true, false, false],
      story: {
        world: fixture.world,
        chat: fixture.binding.chatId,
        branch: 'branch-crossplot',
        sheetsEnabled: true,
        facts,
        roleSeeds,
        episodeSources: sources,
      },
    };
    return {
      id: scenario.id,
      locale,
      input,
      facts,
      sources,
      wanted: scenario.wanted,
      control: !!scenario.control,
    };
  });
}
