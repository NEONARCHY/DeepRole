import type { Locale } from '../../src/core/types';
import { roleSeed } from '../../src/core/story-role-binding';
import { transportWorld } from './story-memory-transport';

export function prefixTransportWorld(locale: Locale) {
  const fixture = transportWorld(locale);
  const prefix = locale === 'ru'
    ? 'Журнал мастерской хранит эту деталь прежней сцены вместе с именем участника и всеми указанными ограничениями: '
    : 'The workshop log records this earlier scene detail together with the named person and every stated restriction: ';
  const facts = fixture.facts.map(fact => {
    const text = prefix + fact.text;
    return { ...fact, text, ...(fact.claim ? { claim: { ...fact.claim, value: text } } : {}), ...(fact.task ? { task: { ...fact.task, title: text } } : {}) };
  });
  const quote = facts.map(fact => fact.text).join('\n');
  for (const fact of facts) fact.quote = quote;
  const seeds = facts.map((fact, index) => roleSeed(fact, { ...fixture.seeds[index]!.binding, quote }));
  fixture.input.story!.facts = facts;
  fixture.input.story!.roleSeeds = seeds;
  return { ...fixture, facts, quote, seeds, prefix };
}
