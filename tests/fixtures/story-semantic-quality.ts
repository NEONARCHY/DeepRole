import type { Locale, SceneEntity } from '../../src/core/types';
import type { GameContextInput } from '../../src/core/game-context';
import type { StoryFact } from '../../src/core/story-update';
import { roleSeed } from '../../src/core/story-role-binding';
import { admissionWorld } from './story-topic-admission';

export type SemanticFamily = 'gift' | 'promise' | 'alias' | 'event';
export type SemanticIntent = 'explicit' | 'paraphrase' | 'ambiguous' | 'control';

/** RP262 gold is authored from the scenes, never from query/scorer extraction.
 * A wanted record is evidence to retrieve, not a resolved pronoun or permission.
 * Late discussion is deliberately NOT another gift, promise or played rescue. */
export function semanticWorld(locale: Locale, laterScenes = 96) {
  const f = admissionWorld(locale), [N, M] = f.base.entities as [SceneEntity, SceneEntity];
  N.aliases = [f.s('Сова', 'Owl')]; M.aliases = [f.s('Ласточка', 'Swallow')];
  const texts = [
    f.s('Нора подарила Мире серебряный медальон на день рождения; продать его без обсуждения они не договаривались.', 'Nora gave Mira a silver medallion for her birthday; they did not agree that it could be sold without discussion.'),
    f.s('Мира подарила Норе янтарную брошь на зимний праздник; это другой предмет.', 'Mira gave Nora an amber brooch for the winter festival; this is a different object.'),
    f.s('Нора обещала Мире: «Я верну атлас после разрешения хранителя, раньше нельзя».', 'Nora promised Mira: “I will return the atlas after the curator gives permission, not before.”'),
    f.s('Мира обещала Норе: «Я доставлю фонарь, если откроется переправа; согласия ещё нет».', 'Mira promised Nora: “I will deliver the lantern if the crossing opens; permission has not yet been given.”'),
    f.s('Мира сказала: «В старом театре начался пожар. Нора вывела меня через служебный выход; нам едва удалось выбраться».', 'Mira said: “A fire broke out in the old theatre. Nora led me through the service exit; we barely escaped.”'),
    f.s('Нора сказала: «При паводке на речной переправе Мира вытащила меня из воды. Театр здесь ни при чём».', 'Nora said: “During flooding at the river crossing, Mira pulled me out of the water. This had nothing to do with the theatre.”'),
    f.s('Мира сказала: «Я уже вернула Норе компас; поручение выполнено, это не разрешение брать его снова».', 'Mira said: “I have already returned the compass to Nora; the duty is complete, this is not permission to take it again.”'),
  ];
  const records: StoryFact[] = texts.map((text, i) => ({
    kind: i === 2 || i === 3 ? 'promise' : 'event', text,
    quote: i < 2 ? f.s(`${i === 0 ? 'Нора' : 'Мира'} сказала: «${text}».`, `${i === 0 ? 'Nora' : 'Mira'} said: “${text}.”`) : text,
    ...(i === 2 || i === 3 || i === 6 ? { task: {
      key: ['atlas-duty', 'lantern-duty', 'compass-duty'][i === 2 ? 0 : i === 3 ? 1 : 2]!,
      title: i === 2 ? f.s('Вернуть атлас', 'Return the atlas') : i === 3 ? f.s('Доставить фонарь', 'Deliver the lantern') : f.s('Вернуть компас', 'Return the compass'),
      status: i === 6 ? 'completed' as const : 'open' as const,
    } } : {}),
  }));
  const noise: StoryFact[] = Array.from({ length: laterScenes }, (_, i) => {
    const text = f.s(`Нора и Мира обсуждали подарки, данное слово, старый театр и речную переправу. Это беседа ${i}, без нового вручения, обязательства или происшествия.`, `Nora and Mira discussed gifts, keeping one's word, the old theatre and the river crossing. This is conversation ${i}, without a new handover, commitment or incident.`);
    return { kind: 'event', text, quote: text };
  });
  const facts = [...records, ...noise], sources = facts.map((_, i) => `semantic-source-${i}`);
  const seeds = facts.map((fact, i) => roleSeed(fact, {
    version: 1, sourceRevisionId: sources[i]!, quote: fact.quote,
    // V1 English grammar binds a recipient only in an explicit "to NAME"
    // header. The original natural quote stays intact; do not invent that role.
    roles: i === 2 ? { promisor: { id: N.id, name: N.name }, ...(locale === 'ru' ? { recipient: { id: M.id, name: M.name } } : {}) }
      : i === 3 ? { promisor: { id: M.id, name: M.name }, ...(locale === 'ru' ? { recipient: { id: N.id, name: N.name } } : {}) }
      : i < records.length ? { speaker: { id: [0, 5].includes(i) ? N.id : M.id, name: [0, 5].includes(i) ? N.name : M.name } } : {},
  }));
  const input: GameContextInput = { ...f.input, recentMessages: [noise.at(-1)!.text],
    story: { ...f.input.story!, facts, roleSeeds: seeds, episodeSources: sources } };
  return { ...f, input, N, M, records, noise, facts, sources, seeds };
}

export function semanticQualityCorpus(locale: Locale) {
  const definitions: { id: string; family: SemanticFamily; intent: SemanticIntent; query: [string, string]; wanted: number[]; guard?: 'personal' | 'ambiguous'; mutate?: (f: ReturnType<typeof semanticWorld>) => void }[] = [
    { id: 'medallion', family: 'gift', intent: 'explicit', query: ['Напомни о серебряном медальоне.', 'Remind me about the silver medallion.'], wanted: [0] },
    { id: 'birthday', family: 'gift', intent: 'explicit', query: ['Что Нора подарила Мире на день рождения?', 'What did Nora give Mira for her birthday?'], wanted: [0] },
    { id: 'keepsake', family: 'gift', intent: 'paraphrase', query: ['Расскажи о памятном украшении именинницы.', 'Tell me about the birthday girl’s keepsake jewellery.'], wanted: [0] },
    { id: 'her-gift', family: 'gift', intent: 'ambiguous', query: ['Я достаю её подарок.', 'I take out her present.'], wanted: [0, 1], guard: 'personal' },
    { id: 'gifts', family: 'gift', intent: 'ambiguous', query: ['Напомни, какие подарки они друг другу вручали.', 'Remind me which presents they exchanged.'], wanted: [0, 1] },
    { id: 'unknown-bracelet', family: 'gift', intent: 'control', query: ['Напомни о рубиновом браслете.', 'Remind me about the ruby bracelet.'], wanted: [] },
    { id: 'direct-duty', family: 'promise', intent: 'explicit', query: ['Что Нора обещала Мире?', 'What did Nora promise Mira?'], wanted: [2] },
    { id: 'word', family: 'promise', intent: 'paraphrase', query: ['Напомни про данное Норой Мире слово.', 'Remind me about Nora’s word to Mira.'], wanted: [2] },
    { id: 'unspecified-duty', family: 'promise', intent: 'ambiguous', query: ['Пора выполнить обещанное.', 'It is time to do what was pledged.'], wanted: [2, 3] },
    { id: 'completed-duty', family: 'promise', intent: 'explicit', query: ['Напомни, чем закончилось поручение вернуть компас.', 'Remind me how the duty to return the compass ended.'], wanted: [6] },
    { id: 'known-alias', family: 'alias', intent: 'explicit', query: ['Что Сова обещала Мире?', 'What did Owl promise Mira?'], wanted: [2] },
    { id: 'alias-and-recipient', family: 'alias', intent: 'explicit', query: ['Что Ласточка обещала Сове?', 'What did Swallow promise Owl?'], wanted: [3] },
    { id: 'stable-id-rename', family: 'alias', intent: 'explicit', query: ['Что Сова обещала Мире?', 'What did Owl promise Mira?'], wanted: [2], mutate: f => { f.N.name = f.s('Элеонора', 'Eleanor'); } },
    { id: 'shared-alias', family: 'alias', intent: 'control', query: ['Что Сова обещала?', 'What did Owl promise?'], wanted: [], guard: 'ambiguous', mutate: f => { f.M.aliases.push(f.N.aliases[0]!); } },
    { id: 'reused-name', family: 'alias', intent: 'control', query: ['Что Сова обещала Мире?', 'What did Owl promise Mira?'], wanted: [], mutate: f => { f.input.entities = [ { ...f.N, id: 'replacement-person' }, f.M ]; } },
    { id: 'theatre', family: 'event', intent: 'explicit', query: ['Напомни о пожаре в старом театре.', 'Remind me about the fire in the old theatre.'], wanted: [4] },
    { id: 'flames', family: 'event', intent: 'paraphrase', query: ['Расскажи о вечере, когда мы едва выбрались из огня.', 'Tell me about the evening when we barely escaped the flames.'], wanted: [4] },
    { id: 'near-drowning', family: 'event', intent: 'paraphrase', query: ['Напомни, когда Нора чуть не утонула.', 'Remind me when Nora almost drowned.'], wanted: [5] },
    { id: 'two-rescues', family: 'event', intent: 'ambiguous', query: ['Напомни, когда они друг друга спасали.', 'Remind me when they saved each other.'], wanted: [4, 5] },
    { id: 'unknown-avalanche', family: 'event', intent: 'control', query: ['Напомни о сходе лавины.', 'Remind me about the avalanche.'], wanted: [] },
  ];
  return definitions.map(c => {
    const f = semanticWorld(locale); c.mutate?.(f); f.input.draft = c.query[locale === 'ru' ? 0 : 1];
    return { ...c, name: `${locale}:${c.id}`, ...f, wanted: c.wanted.map(i => f.records[i]!) };
  });
}
