import type { GameContextInput } from '../../src/core/game-context';
import type { Locale } from '../../src/core/types';
import type { StoryFact } from '../../src/core/story-update';
import { roleSeed } from '../../src/core/story-role-binding';
import { storyWorld } from './story-worlds';

type Scenario = { id: string; draft: [string, string]; wanted: string[]; control?: boolean };

const text = {
  left: [
    'During the flood, Asha left the red medicine case under the north stair, away from the clinic fridge.',
    'Во время паводка Аша оставила красный медицинский кейс под северной лестницей, отдельно от холодильника клиники.',
  ],
  moved: [
    'At dawn Asha moved the red medicine case into the clinic fridge; she did not hand it to Len.',
    'На рассвете Аша переложила красный медицинский кейс в холодильник клиники; Лене она его не передавала.',
  ],
  promise: [
    'Asha promised to give Len the red medicine case only after the nurse checks its seal and confirms it stayed below four degrees; neither check is complete.',
    'Аша обещала отдать Лене красный медицинский кейс только после проверки пломбы медсестрой и подтверждения температуры ниже четырёх градусов; обе проверки ещё не пройдены.',
  ],
  blanket: [
    'Asha delivered the blue blanket to Len after a nurse checked it; that delivery is complete.',
    'Аша передала Лене синее одеяло после проверки медсестрой; передача завершена.',
  ],
  quote: [
    'Asha said: “Len can have the red case after the nurse checks it.”',
    'Аша сказала: «Лена получит красный кейс после проверки медсестрой».',
  ],
  recap: [
    'Once, the volunteers again discussed the amber tag; no new actions occurred.',
    'Однажды волонтёры снова обсуждали янтарную бирку; новых действий не было.',
  ],
  rumor: [
    'An unverified shelter note says the silver key was found near the clinic, but nobody identified its owner.',
    'Непроверенная записка из убежища сообщает, что серебряный ключ нашли у клиники, но владелец неизвестен.',
  ],
  repeated: [
    'Later the shelter volunteers again discussed the red medicine case, north stair, clinic fridge, seal, and temperature; no new actions or handovers occurred.',
    'Позже волонтёры убежища снова обсуждали красный медицинский кейс, северную лестницу, холодильник клиники, пломбу и температуру; новых действий или передач не было.',
  ],
} as const;

const scenarios: Scenario[] = [
  { id: 'colloquial-status-question-keeps-open-promise', draft: [
    'Wait, Len still hasn’t got the red medicine case, right?',
    'Погоди, Лена ведь так и не получила красный медицинский кейс?',
  ], wanted: ['promise'] },
  { id: 'compound-before-and-after-location', draft: [
    'Where did Asha leave the red case at first, and where did it end up later?',
    'Куда Аша сначала положила красный кейс и где он оказался потом?',
  ], wanted: ['left', 'moved'] },
  { id: 'freeform-discussion-recall', draft: [
    'What did the shelter crew keep circling back to about the red case?',
    'Что сотрудники убежища снова и снова возвращались обсуждать насчёт красного кейса?',
  ], wanted: ['repeated'] },
  { id: 'condition-paraphrase-as-a-question', draft: [
    'Has the nurse cleared the seal and temperature, or is Len still waiting?',
    'Медсестра уже одобрила пломбу и температуру, или Лена всё ещё ждёт?',
  ], wanted: ['promise'] },
  { id: 'completed-neighbour-does-not-complete-case', draft: [
    'The blue blanket is already with Len—what is still holding up the red case?',
    'Синее одеяло Лена уже получила — что всё ещё мешает передать красный кейс?',
  ], wanted: ['blanket', 'promise'] },
  { id: 'single-recap-with-natural-reminder', draft: [
    'When did anyone bring up the amber tag?',
    'Когда кто-нибудь упоминал янтарную бирку?',
  ], wanted: ['recap'] },
  { id: 'quote-recall-in-conversational-form', draft: [
    'What was Asha’s line about Len getting the case?',
    'Что именно Аша сказала о том, когда Лена получит кейс?',
  ], wanted: ['quote'] },
  { id: 'indirect-unknown-owner-question', draft: [
    'Do we know whose silver key was found by the clinic?',
    'Мы знаем, чей серебряный ключ нашли у клиники?',
  ], wanted: ['rumor'], control: true },
];

export function rp05NaturalDialogueScenarios(locale: Locale) {
  const language = locale === 'ru' ? 1 : 0;
  const fixture = storyWorld(locale, 4);
  fixture.world.storyAutomation = { mode: 'automatic', revision: 'rp05-natural-dialogue' };
  fixture.entities[2]!.name = locale === 'ru' ? 'Аша' : 'Asha';
  fixture.entities[3]!.name = locale === 'ru' ? 'Лена' : 'Len';
  const facts: StoryFact[] = [
    { kind: 'event', text: text.left[language], quote: text.left[language] },
    { kind: 'event', text: text.moved[language], quote: text.moved[language] },
    { kind: 'promise', text: text.promise[language], quote: text.promise[language], task: {
      key: 'medicine-case.delivery',
      title: locale === 'ru' ? 'передать красный медицинский кейс Лене' : 'give red medicine case to Len',
      status: 'open',
    } },
    { kind: 'event', text: text.blanket[language], quote: text.blanket[language], task: {
      key: 'blue-blanket.delivery',
      title: locale === 'ru' ? 'передать синее одеяло Лене' : 'deliver blue blanket to Len',
      status: 'completed',
    } },
    { kind: 'event', text: text.quote[language], quote: text.quote[language] },
    { kind: 'event', text: text.recap[language], quote: text.recap[language] },
    { kind: 'belief', text: text.rumor[language], quote: text.rumor[language] },
    ...Array.from({ length: 40 }, (_, index): StoryFact => {
      const suffix = locale === 'ru' ? ` Пересказ ${index + 1}.` : ` Recap ${index + 1}.`;
      const repeatedText = text.repeated[language] + suffix;
      return { kind: 'event', text: repeatedText, quote: repeatedText };
    }),
  ];
  const sources = facts.map((_, index) => `rp05-natural-${locale}-${index}`);
  const roleSeeds = facts.map((fact, index) => roleSeed(fact, {
    version: 1,
    sourceRevisionId: sources[index]!,
    quote: fact.quote,
    roles: index === 0 || index === 1 || index >= 7
      ? { speaker: { id: fixture.entities[2]!.id, name: fixture.entities[2]!.name } }
      : index === 2 || index === 3 || index === 4
        ? { speaker: { id: fixture.entities[2]!.id, name: fixture.entities[2]!.name }, recipient: { id: fixture.entities[3]!.id, name: fixture.entities[3]!.name } }
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
      character: [fixture.world.id, fixture.binding.chatId, fixture.entities, fixture.binding.characterScenes![fixture.world.id], [], [], draft, 'rp05-natural-audit', true, false, false],
      story: {
        world: fixture.world,
        chat: fixture.binding.chatId,
        branch: 'branch-natural-dialogue',
        sheetsEnabled: true,
        facts,
        roleSeeds,
        episodeSources: sources,
      },
    };
    return { id: scenario.id, locale, input, facts, sources, wanted: scenario.wanted, control: !!scenario.control };
  });
}
