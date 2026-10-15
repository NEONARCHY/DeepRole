// @vitest-environment node
import { expect, it } from 'vitest';
import { storyActionSequence, sequencePriorityFacts } from '../src/core/story-sequence-priority';
import { sequenceWorld } from './fixtures/story-sequence-priority';
import { storedRoleReader } from '../src/core/story-role-binding';
import { createStoryRoleReader } from '../src/core/story-source-roles';
import { createEpisodeReader } from '../src/core/story-episodes';
import type { StoryFact } from '../src/core/story-update';
it.each([
  ['открываю дверь', 1], ['*открываю дверь*', 1], ['осторожно открываю дверь', 1],
  ['открываю дверь и достаю ключ', 2], ['Я открываю дверь и достаю ключ', 2], ['открываю дверь и затем достаю ключ', 2],
  ['**открываю дверь и я достаю ключ**', 2], ['открываю дверь и достаю ключ и осматриваю набор', 3],
  ['open the door', 1], ['carefully open the door', 1], ['open the door and take the key', 2],
  ['I open the door and take the key', 2], ['open the door then take the key', 2], ['*open the door and I take the key*', 2],
  ['I am opening the door and taking the key', 2], ['open the door and take the key and inspect the kit', 3],
] as const)('whole finite sequence: %s', (query, count) => expect(storyActionSequence(query)?.matches).toHaveLength(count));
it.each([
  '', 'Продолжай.', 'Я открываю дверь.', 'I open the door.', 'Она открывает дверь и берёт ключ', 'She opens the door and takes the key',
  'открываю дверь и не беру ключ', 'open the door and do not take the key',
  'открываю дверь и беру ключ, если разрешат', 'open the door and take the key if allowed',
  'хочу открыть дверь и взять ключ', 'I want to open the door and take the key',
  'открываю дверь и беру её ключ', 'open the door and take her key', 'открываю эту дверь', 'open this door',
  'открываю дверь и созерцаю ключ', 'open the door and contemplate the key',
  '"открываю дверь и достаю ключ"', 'I say “open the door and take the key”',
  'открываю дверь\nи достаю ключ', 'open the door; take the key', 'open door and take key and inspect kit and close window',
  'открываю дверь и закрываю дверь', 'open the door and close the door', 'Моя цель — открыть дверь и вернуть ключ', 'My goal is to open the door and return the key',
  'open the door?', 'open <door> and take key',
])('unsupported/conditional/referential query keeps the old path: %s', query => expect(storyActionSequence(query)).toBeUndefined());
it('name masking cannot manufacture conjunctions, action verbs or targets', () => {
  expect(storyActionSequence('open the door and then take the key', ['And Then'])).toBeUndefined();
  expect(storyActionSequence('open the door', ['Open'])).toBeUndefined();
  expect(storyActionSequence('открываю дверь и беру ключ Веры', ['Вера', 'Веры'])).toBeUndefined();
});
it('literal coverage cannot combine disjoint fields or read quotes/keys/values', () => {
  const q = storyActionSequence('open the red door and take the blue key')!;
  const fact: StoryFact = { kind: 'event', text: 'The red key is on the table.', quote: 'The blue key is in the red door.', task: { key: 'red-door', title: 'The blue door', status: 'completed' }, claim: { key: 'blue-key', value: 'red door', scope: 'state' } };
  expect(q.matches.every(matches => !matches(fact))).toBe(true);
});
for (const locale of ['ru', 'en'] as const) it(`${locale} protects all object clauses, sources and meaningful discussion before36 repeats`, () => {
  const c = sequenceWorld(locale), scope = { worldId: c.base.world.id, entities: c.input.entities! }, roles = createStoryRoleReader(scope, '', storedRoleReader(c.seeds, scope.entities, scope.worldId)), episodes = createEpisodeReader(c.seeds, c.sources), before = structuredClone(c.facts);
  const plan = storyActionSequence(c.dual)!, group = sequencePriorityFacts(c.facts, plan, roles, episodes)!;
  expect(group.primary).toEqual(c.records.slice(0, 6)); expect(group.covers(group.primary)).toBe(true);
  const missing = storyActionSequence(c.s(`${c.a} и осматриваю неизвестный трон`, `${c.a} and inspect the unknown throne`))!;
  expect(sequencePriorityFacts(c.facts, missing, roles, episodes)).toBeUndefined();
  expect(c.facts).toEqual(before);
});
