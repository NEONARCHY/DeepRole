import type { Locale } from '../../src/core/types';
import { RP05_INDEPENDENT_REPEAT_COUNT, rp05IndependentPlotScenarios } from './story-rp05-independent-plot';

type Exchange = readonly [string, string];
type Window = { scene: readonly [Exchange, Exchange]; other: readonly [Exchange, Exchange]; support: string[] };

// A controlled variation of RP316, not an independent plot: facts, questions,
// roles, source order, scene settings and budgets stay fixed. Only the recent
// prose changes. Gold support is semantic annotation, not output-derived data.
const windows: Record<string, Window> = {
  'storm-location-before-move': {
    scene: [
      ['I walk back into the western dome.', 'The squall has passed; water drips beside the console.'],
      ['Я возвращаюсь в западный купол.', 'Шквал уже прошёл; рядом с консолью капает вода.'],
    ],
    other: [
      ['I sit down for breakfast.', 'A steaming bowl of porridge waits beside a wooden spoon.'],
      ['Я сажусь завтракать.', 'Рядом с деревянной ложкой дымится миска каши.'],
    ], support: ['moved'],
  },
  'later-location-does-not-erase-first': {
    scene: [
      ['I join Mira in the archive.', 'She waits beside the drawers while I look around.'],
      ['Я подхожу к Мире в архиве.', 'Она ждёт у ящиков, пока я осматриваюсь.'],
    ],
    other: [
      ['I stop to warm my hands.', 'The stove crackles, and a kettle begins to whistle.'],
      ['Я останавливаюсь погреть руки.', 'В печи потрескивают дрова, чайник начинает свистеть.'],
    ], support: ['initial'],
  },
  'compound-first-and-later-location': {
    scene: [
      ['I retrace the route from the dome to the archive.', 'The corridor is quiet after the storm.'],
      ['Я прохожу от купола к архиву.', 'После бури в коридоре тихо.'],
    ],
    other: [
      ['I check the greenhouse seedlings.', 'The gardener lifts a watering can from the bench.'],
      ['Я заглядываю к рассаде в теплице.', 'Садовник поднимает со скамейки лейку.'],
    ], support: [],
  },
  'two-conditions-and-later-progress': {
    scene: [
      ['I approach the closed upper dock.', 'Soren stands nearby, waiting before anyone boards.'],
      ['Я подхожу к закрытому верхнему причалу.', 'Сорен стоит рядом и ждёт, прежде чем кого-либо пускать.'],
    ],
    other: [
      ['I take a seat in the dining room.', 'Someone sets a cup of tea beside a plate of biscuits.'],
      ['Я сажусь в столовой.', 'Кто-то ставит чашку чая рядом с тарелкой печенья.'],
    ], support: ['quote'],
  },
  'completed-neighbour-is-not-open-dock': {
    scene: [
      ['I walk with Lina toward Soren.', 'They pause beside the barrier at the upper dock.'],
      ['Я иду с Линой к Сорену.', 'Они останавливаются у ограждения верхнего причала.'],
    ],
    other: [
      ['I watch rain from the stairwell.', 'A damp umbrella leans against the wall.'],
      ['Я смотрю на дождь с лестницы.', 'У стены стоит мокрый зонт.'],
    ], support: ['quote'],
  },
  'new-progress-survives-repetition-tail': {
    scene: [
      ['I return for the next wind reading.', 'Soren is still by the upper dock; we have not boarded.'],
      ['Я возвращаюсь к следующему показанию ветра.', 'Сорен по-прежнему у верхнего причала; мы ещё не поднимались на борт.'],
    ],
    other: [
      ['I follow the smell of fresh bread.', 'The baker puts a loaf on a clean cloth.'],
      ['Я иду на запах свежего хлеба.', 'Пекарь кладёт буханку на чистую ткань.'],
    ], support: ['quote'],
  },
  'first-time-disclosure-is-not-pruned': {
    scene: [
      ['I stay after the dawn briefing.', 'Mira is still beside the table where everyone gathered.'],
      ['Я остаюсь после рассветного совещания.', 'Мира всё ещё у стола, за которым все собирались.'],
    ],
    other: [
      ['I step into the courtyard.', 'A cat sleeps on a sunlit stone step.'],
      ['Я выхожу во двор.', 'На освещённой солнцем каменной ступеньке спит кот.'],
    ], support: [],
  },
  'natural-repeat-discussion-recall': {
    scene: [
      ['I listen to the observatory crew during their break.', 'The same conversations keep returning without any new developments.'],
      ['Я слушаю команду обсерватории во время перерыва.', 'Разговоры снова идут по кругу, никаких новых событий нет.'],
    ],
    other: [
      ['I arrange cushions in the lounge.', 'The room smells faintly of furniture polish.'],
      ['Я поправляю подушки в гостиной.', 'В комнате слегка пахнет средством для мебели.'],
    ], support: [],
  },
  'single-recap-remains-retrievable': {
    scene: [
      ['I sit beside the technicians during a break.', 'Their work clothes are dusty, and they are in no hurry to leave.'],
      ['Я сажусь рядом с техниками во время перерыва.', 'Их рабочая одежда в пыли, уходить они не торопятся.'],
    ],
    other: [
      ['I help fold clean towels.', 'The laundry basket is almost empty.'],
      ['Я помогаю складывать чистые полотенца.', 'Корзина для белья почти пуста.'],
    ], support: ['repeated'],
  },
  'quote-remains-distinct-from-task-state': {
    scene: [
      ['I wait for Soren to finish speaking at the upper dock.', 'He turns toward me as the conversation pauses.'],
      ['Я жду, пока Сорен закончит говорить у верхнего причала.', 'Когда разговор затихает, он поворачивается ко мне.'],
    ],
    other: [
      ['I clear dishes from a small table.', 'The kitchen is quiet except for dripping tap water.'],
      ['Я убираю посуду с маленького стола.', 'На кухне тихо, только из крана капает вода.'],
    ], support: ['progress'],
  },
  'unknown-owner-is-not-inferred': {
    scene: [
      ['I open the old log at the surveyors desk.', 'The page has no signed statement identifying an owner.'],
      ['Я открываю старый журнал на столе геодезистов.', 'На странице нет подписанного свидетельства, которое называло бы владельца.'],
    ],
    other: [
      ['I straighten a crooked picture in the corridor.', 'The frame settles against the plaster.'],
      ['Я поправляю криво висящую картину в коридоре.', 'Рама ровно ложится на штукатурку.'],
    ], support: [],
  },
  'named-owner-suggestion-stays-a-rumour': {
    scene: [
      ['I compare the surveyors log with what we actually know.', 'No witness on that page names Soren as an owner.'],
      ['Я сравниваю журнал геодезистов с тем, что нам действительно известно.', 'Ни один свидетель на этой странице не называет Сорена владельцем.'],
    ],
    other: [
      ['I pause to tie a loose shoelace.', 'Footsteps pass along the landing.'],
      ['Я останавливаюсь завязать шнурок.', 'По лестничной площадке проходят люди.'],
    ], support: [],
  },
};

export const RECENT_CONTEXT_VARIANTS = ['scene', 'mixed-recap', 'other-scene', 'new-chat'] as const;
export type RecentContextVariant = typeof RECENT_CONTEXT_VARIANTS[number];

export const recentPlotFactLabel = (index: number): string =>
  ['initial', 'moved', 'promise', 'completed', 'disclosure', 'quote', 'recap', 'rumor'][index]
    ?? (index === 8 + RP05_INDEPENDENT_REPEAT_COUNT ? 'progress' : 'repeated');

export function rp05RecentContextScenarios(locale: Locale) {
  return rp05IndependentPlotScenarios(locale).flatMap(original => {
    const config = windows[original.id];
    if (!config) throw new Error(`Missing predeclared recent window: ${original.id}`);
    const language = locale === 'ru' ? 1 : 0;
    return RECENT_CONTEXT_VARIANTS.map(variant => {
      const input = structuredClone(original.input);
      input.recentMessages = variant === 'scene' ? [...config.scene[language]]
        : variant === 'mixed-recap' ? [original.input.recentMessages[0]!, config.scene[language][1]]
          : variant === 'other-scene' ? [...config.other[language]] : [];
      return { ...original, input, variant, support: config.support };
    });
  });
}
