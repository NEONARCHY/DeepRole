import type { GameContextInput } from '../../src/core/game-context';
import type { Locale } from '../../src/core/types';
import type { StoryFact } from '../../src/core/story-update';
import { roleSeed } from '../../src/core/story-role-binding';
import { storyWorld } from './story-worlds';

type Scenario = { id: string; draft: [string, string]; wanted: string[]; control?: boolean };

// This plot is intentionally separate from the earlier RP-05 fixtures: an
// observatory, airship dock, chart tube, wind readings, and a blue astrolabe.
const text = {
  initial: [
    'During the squall, Mira left the indigo chart tube on the western dome console, apart from the lens case.',
    'Во время шквала Мира оставила индиговый тубус с картами на консоли западного купола, отдельно от футляра линзы.',
  ],
  moved: [
    'Before sunrise Mira moved the indigo chart tube into the locked drawer in the archive; she did not hand it to Lina.',
    'До рассвета Мира переложила индиговый тубус с картами в запертый ящик архива; Лине она его не передавала.',
  ],
  promise: [
    'Soren promised to reopen the upper airship dock only after the wind stayed below the amber mark for two readings and the mooring cable passed inspection; at first only one low reading was recorded and the cable was unchecked.',
    'Сорен обещал открыть верхний причал для дирижаблей только после двух показаний ветра ниже янтарной отметки и проверки швартовочного троса; сначала зафиксировали лишь одно низкое показание, а трос ещё не проверяли.',
  ],
  completed: [
    'Soren delivered the silver emergency blanket to Lina after inspection; that handover is complete.',
    'Сорен передал Лине серебряное аварийное одеяло после осмотра; передача завершена.',
  ],
  disclosure: [
    'At the dawn briefing Mira revealed for the first time that the beacon code is 4-1-9; nobody had recorded that detail earlier.',
    'На рассветном совещании Мира впервые раскрыла код маяка — 4-1-9; раньше эту деталь никто не записывал.',
  ],
  quote: [
    'Soren said: “The upper dock stays closed until the mooring cable passes inspection.”',
    'Сорен сказал: «Верхний причал останется закрыт, пока не проверят швартовочный трос».',
  ],
  recap: [
    'Once during a maintenance break, the technicians discussed the orange wax seal; no action followed.',
    'Однажды во время перерыва техники обсуждали оранжевую восковую печать; никаких действий после этого не было.',
  ],
  rumor: [
    'An unverified log says the blue astrolabe may belong to one of the surveyors; its writer did not see who handled it and named no owner.',
    'Непроверенный журнал сообщает, что синий астролябий мог принадлежать кому-то из геодезистов; автор не видел, кто его брал, и не назвал владельца.',
  ],
  repeated: [
    'Later the observatory crew again discussed the indigo chart tube, archive drawer, upper dock, amber wind readings, mooring cable, silver blanket, beacon code, orange seal, and blue astrolabe; no new actions or facts were added.',
    'Позже команда обсерватории снова обсуждала индиговый тубус с картами, архивный ящик, верхний причал, показания янтарного ветра, швартовочный трос, серебряное одеяло, код маяка, оранжевую печать и синий астролябий; новых действий или фактов не появилось.',
  ],
  progress: [
    'At the next dawn the second wind reading also fell below the amber mark; the mooring cable still has not been inspected and Soren has not reopened the upper dock.',
    'На следующее утро второе показание ветра тоже оказалось ниже янтарной отметки; швартовочный трос всё ещё не проверен, и Сорен не открыл верхний причал.',
  ],
} as const;

const scenarios: Scenario[] = [
  { id: 'storm-location-before-move', draft: [
    'Where did Mira leave the indigo chart tube during the squall?',
    'Где Мира оставила индиговый тубус с картами во время шквала?',
  ], wanted: ['initial'] },
  { id: 'later-location-does-not-erase-first', draft: [
    'Where did Mira put the tube before sunrise?',
    'Куда Мира переложила тубус до рассвета?',
  ], wanted: ['moved'] },
  { id: 'compound-first-and-later-location', draft: [
    'Where was the tube first, and where did Mira move it afterward?',
    'Где тубус лежал сначала и куда Мира перенесла его потом?',
  ], wanted: ['initial', 'moved'] },
  { id: 'two-conditions-and-later-progress', draft: [
    'With two low wind readings now recorded, can the upper dock reopen, or is anything still pending?',
    'Теперь есть два низких показания ветра: можно открыть верхний причал или ещё что-то не выполнено?',
  ], wanted: ['promise', 'progress'] },
  { id: 'completed-neighbour-is-not-open-dock', draft: [
    'Soren already delivered Lina the silver blanket. Does that mean the upper dock is ready, and what remains?',
    'Сорен уже передал Лине серебряное одеяло. Значит ли это, что причал готов, и что ещё осталось?',
  ], wanted: ['completed', 'promise', 'progress'] },
  { id: 'new-progress-survives-repetition-tail', draft: [
    'What changed in the wind readings, and what is still stopping the upper dock from reopening?',
    'Что изменилось в показаниях ветра и что всё ещё мешает открыть верхний причал?',
  ], wanted: ['promise', 'progress'] },
  { id: 'first-time-disclosure-is-not-pruned', draft: [
    'What beacon code did Mira reveal at the dawn briefing?',
    'Какой код маяка Мира раскрыла на рассветном совещании?',
  ], wanted: ['disclosure'] },
  { id: 'natural-repeat-discussion-recall', draft: [
    'Which subjects did the observatory crew keep coming back to in their conversations?',
    'К каким темам команда обсерватории снова возвращалась в разговорах?',
  ], wanted: ['repeated'] },
  { id: 'single-recap-remains-retrievable', draft: [
    'When did the orange wax seal come up?',
    'Когда всплывала тема оранжевой восковой печати?',
  ], wanted: ['recap'] },
  { id: 'quote-remains-distinct-from-task-state', draft: [
    'What exactly did Soren say must happen before the upper dock opens?',
    'Что именно, по словам Сорена, должно произойти до открытия верхнего причала?',
  ], wanted: ['quote', 'promise'] },
  { id: 'unknown-owner-is-not-inferred', draft: [
    'Do we know whose blue astrolabe was mentioned in the log, or is that still unconfirmed?',
    'Известно, чей синий астролябий упоминался в журнале, или это всё ещё не подтверждено?',
  ], wanted: ['rumor'], control: true },
  { id: 'named-owner-suggestion-stays-a-rumour', draft: [
    'Is there evidence the blue astrolabe belongs to Soren, or does the log only repeat a rumour?',
    'Есть подтверждение, что синий астролябий принадлежит Сорену, или в журнале только слух?',
  ], wanted: ['rumor'], control: true },
];

export const RP05_INDEPENDENT_REPEAT_COUNT = 40;

export function rp05IndependentPlotScenarios(locale: Locale) {
  const language = locale === 'ru' ? 1 : 0;
  const fixture = storyWorld(locale, 4);
  fixture.world.storyAutomation = { mode: 'automatic', revision: 'rp05-independent-plot' };
  fixture.entities[1]!.name = locale === 'ru' ? 'Лина' : 'Lina';
  fixture.entities[2]!.name = locale === 'ru' ? 'Мира' : 'Mira';
  fixture.entities[3]!.name = locale === 'ru' ? 'Сорен' : 'Soren';

  const baseFacts: StoryFact[] = [
    { kind: 'event', text: text.initial[language], quote: text.initial[language] },
    { kind: 'event', text: text.moved[language], quote: text.moved[language] },
    { kind: 'promise', text: text.promise[language], quote: text.promise[language], task: {
      key: 'upper-dock.reopen',
      title: locale === 'ru' ? 'открыть верхний причал' : 'reopen the upper airship dock',
      status: 'open',
    } },
    { kind: 'event', text: text.completed[language], quote: text.completed[language], task: {
      key: 'silver-blanket.delivery',
      title: locale === 'ru' ? 'передать серебряное одеяло Лине' : 'deliver silver blanket to Lina',
      status: 'completed',
    } },
    { kind: 'event', text: text.disclosure[language], quote: text.disclosure[language] },
    { kind: 'event', text: text.quote[language], quote: text.quote[language] },
    { kind: 'event', text: text.recap[language], quote: text.recap[language] },
    { kind: 'belief', text: text.rumor[language], quote: text.rumor[language] },
  ];
  const repeatedFacts = Array.from({ length: RP05_INDEPENDENT_REPEAT_COUNT }, (_, index): StoryFact => {
    const suffix = locale === 'ru' ? ` Пересказ ${index + 1}.` : ` Recap ${index + 1}.`;
    const repeatedText = text.repeated[language] + suffix;
    return { kind: 'event', text: repeatedText, quote: repeatedText };
  });
  const progressFact: StoryFact = { kind: 'event', text: text.progress[language], quote: text.progress[language] };
  const facts = [...baseFacts, ...repeatedFacts, progressFact];
  const sources = facts.map((_, index) => `rp05-independent-${locale}-${index}`);
  const roleSeeds = facts.map((fact, index) => roleSeed(fact, {
    version: 1,
    sourceRevisionId: sources[index]!,
    quote: fact.quote,
    roles: index === 0 || index === 1 || index === 4
      ? { speaker: { id: fixture.entities[2]!.id, name: fixture.entities[2]!.name } }
      : index === 2 || index === 5 || index === facts.length - 1
        ? { speaker: { id: fixture.entities[3]!.id, name: fixture.entities[3]!.name } }
        : index === 3
          ? { speaker: { id: fixture.entities[3]!.id, name: fixture.entities[3]!.name }, recipient: { id: fixture.entities[1]!.id, name: fixture.entities[1]!.name } }
          : index >= baseFacts.length
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
      character: [fixture.world.id, fixture.binding.chatId, fixture.entities, fixture.binding.characterScenes![fixture.world.id], [], [], draft, 'rp05-independent-plot-audit', true, false, false],
      story: {
        world: fixture.world,
        chat: fixture.binding.chatId,
        branch: 'branch-independent-plot',
        sheetsEnabled: true,
        facts,
        roleSeeds,
        episodeSources: sources,
      },
    };
    return { id: scenario.id, locale, input, facts, sources, wanted: scenario.wanted, control: !!scenario.control };
  });
}
