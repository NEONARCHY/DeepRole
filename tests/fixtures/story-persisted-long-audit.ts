import { storyWorld } from './story-worlds';
import { roleSeed } from '../../src/core/story-role-binding';
import type { StoryFact } from '../../src/core/story-update';
import type { Locale } from '../../src/core/types';

// RP335: independent prose and required sources, frozen before the first run.
// Counts represent separately stored facts/source bindings, not chat repetitions.
export function persistedLongWorld(locale: Locale, plot: 'observatory' | 'theatre', count: number) {
  const base = storyWorld(locale, 3), s = (ru: string, en: string) => locale === 'ru' ? ru : en;
  base.entities.forEach((person, i) => { person.name = s(['Ада', 'Борис', 'Вера'][i]!, ['Ada', 'Boris', 'Vera'][i]!); });
  const objects = plot === 'observatory'
    ? [s('янтарная линза', 'amber lens'), s('синий пропуск', 'blue pass'), s('медный футляр', 'copper case')]
    : [s('сценический фонарь', 'stage lantern'), s('зелёный конверт', 'green envelope'), s('серебряный компас', 'silver compass')];
  const [a, b, c] = objects as [string, string, string];
  const rows: Array<{ text: string; kind: StoryFact['kind']; person: number; role: 'promisor' | 'planner' | 'speaker' | 'believer'; task?: StoryFact['task']; claim?: StoryFact['claim'] }> = [
    { text: s(`Ада обещала проверить предмет ${a} только после письменного разрешения хранителя и подписи Бориса.`, `Ada promised to inspect the ${a} only after written permission from the keeper and Boris's signature.`), kind: 'promise', person: 0, role: 'promisor', task: { key: 'ada-inspect', title: a, status: 'open' } },
    { text: s(`Борис обещал проверить предмет ${a} только после звонка Веры; разрешение хранителя звонок не заменяет.`, `Boris promised to inspect the ${a} only after Vera calls; the keeper's permission does not replace that call.`), kind: 'promise', person: 1, role: 'promisor', task: { key: 'boris-inspect', title: a, status: 'open' } },
    { text: s(`Предмет ${a}: питание восстановлено; проверка не начата, подписи Бориса и звонка Веры ещё нет.`, `The ${a}: power was restored; inspection has not started, Boris has not signed and Vera has not called.`), kind: 'event', person: 1, role: 'speaker' },
    { text: s(`Предмет ${b}: прежний допуск отозван; новый не выдан.`, `The ${b}: the previous authorization was revoked; no new authorization was issued.`), kind: 'event', person: 2, role: 'speaker', claim: { key: 'authorization', value: 'revoked', scope: 'state', lifetime: 'persistent' } },
    { text: s(`Вера планирует вернуть предмет ${b} только после согласия Ады; согласие не получено.`, `Vera plans to return the ${b} only after Ada agrees; agreement has not been obtained.`), kind: 'plan', person: 2, role: 'planner', task: { key: 'vera-return', title: b, status: 'open' } },
    { text: s(`Предмет ${c} уже доставлен Борису. Доставка выполнена, осмотр не проводили.`, `The ${c} was delivered to Boris. Delivery is complete; no inspection was performed.`), kind: 'event', person: 1, role: 'speaker', task: { key: 'case-delivery', title: c, status: 'completed' } },
    { text: s(`Ада обещала осмотреть предмет ${c} только после открытия дороги; дорога закрыта.`, `Ada promised to inspect the ${c} only after the road opens; the road is closed.`), kind: 'promise', person: 0, role: 'promisor', task: { key: 'ada-case', title: c, status: 'open' } },
    { text: s(`Ада сказала: «Мы снова говорили о предмете ${a}; узнали о дополнительной проверке крепления; ничего не предприняли; ничего не обещали».`, `Ada said: “We discussed the ${a} again; we learned about an additional mounting check; no actions were taken; no promises were made.”`), kind: 'event', person: 0, role: 'speaker' },
    { text: s(`Борис считает, что предмет ${a} принадлежит хранителю; владелец пока не установлен.`, `Boris believes the ${a} belongs to the keeper; the owner has not been established.`), kind: 'belief', person: 1, role: 'believer' },
  ];
  const important: StoryFact[] = rows.map(({ text, kind, task, claim }) => ({ text, quote: text, kind, ...(task ? { task } : {}), ...(claim ? { claim } : {}) }));
  const repeats: StoryFact[] = Array.from({ length: count }, (_, i) => {
    const place = String.fromCharCode(97 + Math.floor(i / 26) % 26, 97 + i % 26);
    const text = s(`Ада сказала: «Мы снова говорили о предмете ${objects[i % 3]} у сектора ${place}; новых сведений не появилось; ничего не предприняли; ничего не обещали».`, `Ada said: “We discussed the ${objects[i % 3]} again by sector ${place}; no new information emerged; no actions were taken; no promises were made.”`);
    return { kind: 'event', text, quote: text };
  });
  const facts = [...important, ...repeats], sources = facts.map((_, i) => `persisted-${i}`);
  const seeds = facts.map((fact, i) => {
    const row = rows[i], person = base.entities[row?.person ?? 0]!;
    return roleSeed(fact, { version: 1, sourceRevisionId: sources[i]!, quote: fact.quote, roles: { [row?.role ?? 'speaker']: { id: person.id, name: person.name } } });
  });
  base.world.sharedGame = { version: 1, id: 'persisted-game', revision: 'persisted-revision', activationId: 'persisted-activation', activeChatId: base.binding.chatId, activeBindingId: base.binding.id, managed: true, memoryOverrides: { includedIds: [], excludedIds: [] }, profileSeeds: {}, identitySeeds: {}, mergeSeeds: {}, facts, factRoleSeeds: seeds, episodeSources: sources, updatedAt: 20 };
  const first = [0, 1, 2, 7, 8], two = [...first, 3, 4];
  const questions = [
    { id: 'question', draft: s(`Что известно о предмете ${a}?`, `What do we know about the ${a}?`), wanted: first },
    { id: 'single', draft: s(`Я проверяю предмет ${a}.`, `I inspect the ${a}.`), wanted: first },
    { id: 'two', draft: s(`Я проверяю предмет ${a} и беру предмет ${b}.`, `I inspect the ${a} and take the ${b}.`), wanted: two },
    { id: 'three', draft: s(`Я проверяю предмет ${a}, беру предмет ${b} и осматриваю предмет ${c}.`, `I inspect the ${a}, take the ${b} and inspect the ${c}.`), wanted: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
    { id: 'reverse', draft: s(`Я осматриваю предмет ${c} и беру предмет ${b}.`, `I inspect the ${c} and take the ${b}.`), wanted: [3, 4, 5, 6] },
    // Unsupported/ambiguous clauses must never be certified complete.
    { id: 'unknown', draft: s(`Я проверяю предмет ${a} и беру белый жетон.`, `I inspect the ${a} and take the white token.`), wanted: [], incomplete: true },
    { id: 'pronoun', draft: s(`Я проверяю предмет ${a} и беру её пропуск.`, `I inspect the ${a} and take her pass.`), wanted: [], incomplete: true },
  ];
  return { base, important, facts, sources, seeds, questions, s };
}
