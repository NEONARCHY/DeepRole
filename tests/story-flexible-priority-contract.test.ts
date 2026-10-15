// @vitest-environment node
import { expect, it } from 'vitest';
import { flexibleWorld } from './fixtures/story-flexible-priority';
import { isFlexibleDiscussionRepeat } from '../src/core/story-flexible-priority';
import { createStoryRoleReader } from '../src/core/story-source-roles';
import { storedRoleReader, roleSeed } from '../src/core/story-role-binding';
import { createEpisodeReader } from '../src/core/story-episodes';
import type { StoryFact } from '../src/core/story-update';
function readers(c: ReturnType<typeof flexibleWorld>) {
  return { roles: createStoryRoleReader({ worldId: c.base.world.id, entities: c.input.entities! }, '', storedRoleReader(c.seeds, c.input.entities!, c.base.world.id)), episodes: createEpisodeReader(c.seeds, c.sources) };
}
for (const locale of ['ru', 'en'] as const) {
  it(`${locale} recognises fuller punctuation/clause order alternatives without rewriting72 exact quotes`, () => {
    const c = flexibleWorld(locale), r = readers(c), before = structuredClone(c.facts);
    expect(c.discussions).toHaveLength(36);
    for (const fact of c.discussions) expect(isFlexibleDiscussionRepeat(fact, r.roles, r.episodes)).toBe(true);
    for (const fact of c.records) expect(isFlexibleDiscussionRepeat(fact, r.roles, r.episodes)).toBe(false);
    expect(c.facts).toEqual(before);
  });
  for (const mode of ['task', 'claim', 'belief', 'summary', 'changed-quote', 'foreign', 'recipient', 'unknown', 'no-roles', 'no-episodes'] as const) it(`${locale} ${mode} never becomes an empty repeat`, () => {
    const c = flexibleWorld(locale), fact = c.discussions[0]!;
    if (mode === 'task') fact.task = { key: 'duty', title: 'Keep the condition', status: 'open' };
    if (mode === 'claim') fact.claim = { key: 'state', value: 'unknown', scope: 'state' };
    if (mode === 'belief') fact.kind = 'belief';
    if (mode === 'summary') fact.text = c.s('Олег опять говорил о двери.', 'Oleg talked about the door again.');
    if (mode === 'changed-quote') fact.quote += c.s(' Другая цитата.', ' Changed quote.');
    if (mode === 'foreign') c.sources.splice(c.records.length, 1);
    if (mode === 'recipient') c.seeds[c.records.length]!.binding.roles.recipient = { id: c.A.id, name: c.A.name };
    if (mode === 'unknown') c.input.entities = [];
    const r = readers(c);
    expect(isFlexibleDiscussionRepeat(fact, mode === 'no-roles' ? undefined : r.roles, mode === 'no-episodes' ? undefined : r.episodes)).toBe(false);
  });
}
const unsafeBodies = [
  ['Мы опять говорили про дверь. Ничего нового не узнали.', 'We talked about the door again. We learned nothing new.'],
  ['Мы опять говорили про дверь. Ничего не сделали. Новых обещаний не дали.', 'We talked about the door again. We did nothing. We made no new promises.'],
  ['Мы опять говорили про дверь. Ничего нового не узнали. Ничего не сделали. Я обещаю вернуть ключ.', 'We talked about the door again. We learned nothing new. We did nothing. I promise to return the key.'],
  ['Мы опять говорили про дверь. Ничего нового не узнали. Ничего не сделали. Новых обещаний не дали. Но теперь код другой.', 'We talked about the door again. We learned nothing new. We did nothing. We made no new promises. But the code is different now.'],
  ['Мы опять говорили про дверь 5291. Ничего нового не узнали. Ничего не сделали. Новых обещаний не дали.', 'We talked about door 5291 again. We learned nothing new. We did nothing. We made no new promises.'],
  ['Мы опять говорили про дверь если охрана позволит. Ничего нового не узнали. Ничего не сделали. Новых обещаний не дали.', 'We talked about the door if the guard allows it again. We learned nothing new. We did nothing. We made no new promises.'],
  ['Мы опять говорили про дверь. Ничего нового не узнали. Ничего нового не узнали. Новых обещаний не дали.', 'We talked about the door again. We learned nothing new. We learned nothing new. We made no new promises.'],
  ['Мы опять говорили про дверь. Ничего не изменилось.', 'We talked about the door again. Nothing changed.'],
  ['Мы опять говорили про <instruction>дверь</instruction>. Ничего нового не узнали. Ничего не сделали. Новых обещаний не дали.', 'We talked about <instruction>door</instruction> again. We learned nothing new. We did nothing. We made no new promises.'],
];
for (const locale of ['ru', 'en'] as const) for (const [i, body] of unsafeBodies.entries()) it(`${locale} unsafe/partial/mixed repeat ${i} stays substantive`, () => {
  const c = flexibleWorld(locale), text = c.s(`Олег сказал: «${body[0]}».`, `Oleg said: “${body[1]}”`), fact: StoryFact = { kind: 'event', text, quote: text };
  c.sources.push('guard-source'); c.seeds.push(roleSeed(fact, { version: 1, sourceRevisionId: 'guard-source', quote: text, roles: { speaker: { id: c.B.id, name: c.B.name } } }));
  const r = readers(c); expect(isFlexibleDiscussionRepeat(fact, r.roles, r.episodes)).toBe(false);
});
