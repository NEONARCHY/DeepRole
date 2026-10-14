import { freshSearchWorld } from './story-search-fresh';
import { roleSeed } from '../../src/core/story-role-binding';
import type { Locale } from '../../src/core/types';
import type { StoryFact } from '../../src/core/story-update';

/** Second independent RP264 corpus, authored before evaluating evidence guards.
 * Every later discussion now has a frozen speaker too: attribution alone does
 * not make a discussion more relevant than the earlier played event. */
export function auditSearchWorld(locale: Locale) {
  const f = freshSearchWorld(locale), s = f.s, L = f.L, M = f.M;
  L.name = s('Ирина', 'Iris'); L.aliases = [s('Сирень', 'Lilac')]; M.name = s('Давид', 'David'); M.aliases = [s('Эхо', 'Echo')];
  const texts = [
    s('Ирина обещала: «Я отнесу красную папку в архив только после разрешения директора».', 'Iris promised: “I will take the red folder to the archive only after the director gives permission.”'),
    s('Ирина обещала: «Я отнесу красную папку в типографию только после одобрения бюджета».', 'Iris promised: “I will take the red folder to the printer only after the budget is approved.”'),
    s('Давид сказал: «Я подарил Ирине жёлтый зонт на вокзале; это не разрешение передаривать его».', 'David said: “I gave Iris a yellow umbrella at the railway station; this is not permission to give it away.”'),
    s('Ирина сказала: «Я подарила Давиду плетёный ремень ко дню рождения; зонт я ему не дарила».', 'Iris said: “I gave David a woven belt for his birthday; I did not give him an umbrella.”'),
    s('Ирина сказала: «В грозу Давид удержал сорванный навес, пока я выходила из дома».', 'Iris said: “During the thunderstorm David held the broken canopy while I was leaving the house.”'),
    s('Давид сказал: «Ирина починила рацию, и мы смогли вызвать спасательный катер».', 'David said: “Iris repaired the radio, and we could call a rescue boat.”'),
    s('Давид сказал: «Код сейфа 5472; знание кода не разрешает открывать сейф».', 'David said: “The safe code is 5472; knowing the code does not permit opening the safe.”'),
    s('Давид сказал: «Код сейфа теперь 5492; прежний 5472 отменён, разрешения открывать сейф нет».', 'David said: “The safe code is now 5492; the old 5472 is revoked, opening the safe is not permitted.”'),
    s('Ирина обещала: «Я верну телескоп после наблюдения; раньше не могу».', 'Iris promised: “I will return the telescope after the observation; I cannot do it before then.”'),
    s('Ирина сказала: «Я уже вернула телескоп; поручение выполнено, это не новая аренда».', 'Iris said: “I have already returned the telescope; the duty is completed, this is not a new loan.”'),
    s('Давид обещал: «Я позвоню врачу только с согласия Ирины; согласия пока нет».', 'David promised: “I will call the doctor only with Iris’s consent; consent has not been given.”'),
    s('Давид сказал: «Поручение позвонить врачу отменено; я не звонил».', 'David said: “The duty to call the doctor is cancelled; I did not call.”'),
    s('Ирина считает: «Сосед уехал, но я этого не проверяла».', 'Iris believes: “The neighbour has left, but I have not checked it.”'),
    s('Давид сказал: «Я спрятал письмо в ящике стола, Ирине об этом не говорил».', 'David said: “I hid the letter in the desk drawer; I have not told Iris about it.”'),
    s('Ирина сказала: «Я заменила шнурки на ботинках перед выходом».', 'Iris said: “I replaced the bootlaces before leaving.”'),
    s('Давид сказал: «Я оставил пустую корзину у ворот».', 'David said: “I left an empty basket at the gate.”'),
  ];
  const records: StoryFact[] = texts.map((text, i) => ({ kind: [0, 1, 8, 10].includes(i) ? 'promise' : i === 12 ? 'belief' : i === 13 ? 'secret' : 'event', text, quote: text,
    ...([0, 1, 8, 9, 10, 11].includes(i) ? { task: { key: i < 2 ? 'rp264b-folder-' + i : [8, 9].includes(i) ? 'rp264b-telescope' : 'rp264b-doctor',
      title: i < 2 ? s('Отнести красную папку', 'Take the red folder') : [8, 9].includes(i) ? s('Вернуть телескоп', 'Return the telescope') : s('Позвонить врачу', 'Call the doctor'),
      status: i === 9 ? 'completed' as const : i === 11 ? 'cancelled' as const : 'open' as const } } : {}),
    ...([6, 7].includes(i) ? { claim: { key: 'rp264b-safe-code', value: i === 6 ? '5472' : '5492', scope: 'state' as const, lifetime: 'persistent' as const } } : {}) }));
  const themes = [s('зонт, ремень и давние подарки', 'the umbrella, belt and earlier presents'), s('грозу, навес и спасение', 'the thunderstorm, canopy and rescue'), s('рацию, катер и старые происшествия', 'the radio, boat and old incidents'), s('папки, архив и согласования', 'folders, the archive and approvals'), s('сейф, телескоп и отменённый звонок', 'the safe, telescope and cancelled call')];
  const noise: StoryFact[] = Array.from({ length: 90 }, (_, i) => { const p = i % 2 ? M : L, text = s(`${p.name} ${p === M ? 'сказал' : 'сказала'}: «Мы только обсуждали ${themes[i % themes.length]}, новых событий или разрешений не было». Беседа ${i}.`, `${p.name} said: “We only discussed ${themes[i % themes.length]}; there were no new events or permissions.” Conversation ${i}.`); return { kind: 'event', text, quote: text }; });
  const facts = [...records, ...noise], sources = facts.map((_, i) => 'rp264b-source-' + i), seeds = facts.map((fact, i) => {
    const p = i >= records.length ? (i - records.length) % 2 ? M : L : [0, 1, 3, 4, 8, 9, 12, 14].includes(i) ? L : M;
    const role = [0, 1, 8, 10].includes(i) ? 'promisor' : i === 12 ? 'believer' : 'speaker';
    return roleSeed(fact, { version: 1, sourceRevisionId: sources[i]!, quote: fact.quote, roles: { [role]: { id: p.id, name: p.name } } });
  });
  f.input.story!.facts = facts; f.input.story!.roleSeeds = seeds; f.input.story!.episodeSources = sources; f.input.recentMessages = [noise.at(-1)!.text];
  return { ...f, records, noise, facts, sources, seeds };
}

export function auditSearchCorpus(locale: Locale) {
  const rows = [
    { id: 'folders', family: 'promise', intent: 'ambiguous', q: ['Какие условия у поручений отнести красную папку?', 'What are the conditions of the duties to take the red folder?'], gold: [0, 1] },
    { id: 'destinations', family: 'promise', intent: 'ambiguous', q: ['Куда Ирина обещала отнести красную папку?', 'Where did Iris promise to take the red folder?'], gold: [0, 1] },
    { id: 'umbrella', family: 'gift', intent: 'explicit', q: ['Напомни о жёлтом зонте.', 'Remind me about the yellow umbrella.'], gold: [2] },
    { id: 'rain', family: 'gift', intent: 'paraphrase', q: ['Напомни о подарке, который защищает от дождя.', 'Remind me about the present that shelters from the rain.'], gold: [2] },
    { id: 'gifts', family: 'gift', intent: 'ambiguous', q: ['Что они друг другу дарили?', 'What presents did they give each other?'], gold: [2, 3] },
    { id: 'storm', family: 'event', intent: 'paraphrase', q: ['Как Давид помог Ирине во время непогоды?', 'How did David help Iris during the bad weather?'], gold: [4] },
    { id: 'radio', family: 'event', intent: 'paraphrase', q: ['Как они связались с помощью после поломки связи?', 'How did they contact help after communications broke down?'], gold: [5] },
    { id: 'safe', family: 'status', intent: 'explicit', q: ['Какой код сейфа теперь?', 'What is the safe code now?'], gold: [7] },
    { id: 'telescope', family: 'status', intent: 'explicit', q: ['Чем закончилось поручение вернуть телескоп?', 'How did the duty to return the telescope end?'], gold: [9] },
    { id: 'doctor', family: 'status', intent: 'explicit', q: ['Почему поручение позвонить врачу отменено?', 'Why was the duty to call the doctor cancelled?'], gold: [11] },
    { id: 'unknown-ring', family: 'unknown', intent: 'control', q: ['Напомни о подаренном бриллиантовом кольце.', 'Remind me about the diamond ring present.'], gold: [] },
    { id: 'shared-lilac', family: 'identity', intent: 'control', q: ['Что Сирень обещала?', 'What did Lilac promise?'], gold: [] },
  ];
  return rows.map(c => { const f = auditSearchWorld(locale); if (c.id === 'shared-lilac') f.M.aliases.push(f.L.aliases[0]!); f.input.draft = c.q[locale === 'ru' ? 0 : 1]!;
    return { ...c, ...f, name: locale + ':audit:' + c.id, wanted: c.gold.map(i => f.records[i]!) };
  });
}
