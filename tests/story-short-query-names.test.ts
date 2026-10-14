import { expect, it } from 'vitest';
import { retrievalNames, retrievalQueryNames, storyRetrievalQuery } from '../src/core/story-retrieval-query';
import { storyOwnerQuestion } from '../src/core/story-owner-query';
import { createStoryRoleReader, createStoryRoleReaderV1 } from '../src/core/story-source-roles';
import { storedRoleReader } from '../src/core/story-role-binding';
import { compileGameContext } from '../src/core/game-context';
import { semanticWorld } from './fixtures/story-semantic-quality';

const rows = [
  ['Ева', 'Евой', 'Еве', 'Евы'], ['Аня', 'Аней', 'Ане', 'Ани'],
  ['Ира', 'Ирой', 'Ире', 'Иры'], ['Оля', 'Олей', 'Оле', 'Оли'],
  ['Ася', 'Асей', 'Асе', 'Аси'], ['Ада', 'Адой', 'Аде', 'Ады'],
  ['Юля', 'Юлей', 'Юле', 'Юли'], ['Яна', 'Яной', 'Яне', 'Яны'],
];
it.each(rows)('short current query %s: whole promise and frozen source owner', (name, instrumental, dative, genitive) => {
  const f = semanticWorld('ru'); f.N.name = name!; f.N.aliases = [];
  const scope = { worldId: f.base.world.id, entities: f.input.entities! }, before = structuredClone(f.input);
  const query = `Напомни про данное ${instrumental} Мире слово.`;
  expect(retrievalQueryNames(f.N)).toEqual(expect.arrayContaining([instrumental!, dative!, genitive!].map(s => s.toLowerCase())));
  expect(retrievalNames(f.N)).not.toContain(instrumental!.toLowerCase());
  expect(storyOwnerQuestion(query, scope)).toEqual({ role: 'promisor', personId: f.N.id });
  expect(storyOwnerQuestion(`Напомни про данное ${dative} слово.`, scope)).toBeUndefined();
  expect(storyOwnerQuestion(`Напомни про данное слово ${genitive}.`, scope)).toEqual({ role: 'promisor', personId: f.N.id });
  expect(storyRetrievalQuery(`Напомни о ${dative}.`, scope).mentionedIds).toContain(f.N.id);
  const reader = createStoryRoleReader(scope, query, storedRoleReader(f.seeds, scope.entities, scope.worldId));
  expect(reader.score(f.records[2]!)).toBe(40);
  expect(reader.read(f.records[2]!)?.promisor).toEqual({ id: f.N.id, name, sourceName: 'Нора' });
  expect(compileGameContext({ ...f.input, draft: query }).text).toContain(f.records[2]!.text);
  expect(f.input).toEqual(before);
});

for (const shape of ['alias', 'conventional-first-name']) it(`short query name from ${shape}`, () => {
  const f = semanticWorld('ru'); f.N.name = shape === 'alias' ? 'Элеонора' : 'Ева Соколова'; f.N.aliases = shape === 'alias' ? ['Ева'] : [];
  expect(storyOwnerQuestion('Напомни про данное Евой Мире слово.', { worldId: f.base.world.id, entities: f.input.entities! })).toEqual({ role: 'promisor', personId: f.N.id });
});

for (const alias of ['Евой', 'Ева', 'Евою']) it(`short query collisions abstain for ${alias}`, () => {
  const f = semanticWorld('ru'); f.N.name = 'Ева'; f.N.aliases = []; f.M.aliases = [alias];
  const scope = { worldId: f.base.world.id, entities: f.input.entities! }, form = alias === 'Евою' ? 'Евою' : 'Евой', query = `Напомни про данное ${form} слово.`;
  expect(storyOwnerQuestion(query, scope)).toBeUndefined();
  expect(storyRetrievalQuery(query, scope).ambiguousName).toBe(true);
  expect(compileGameContext({ ...f.input, draft: query }).text).toContain('multiple possible owners');
});

it('does not assign a historical promise to a replacement with a short current name', () => {
  const f = semanticWorld('ru'), people = [{ ...f.N, id: 'replacement-eva', name: 'Ева', aliases: [] }, f.M];
  const scope = { worldId: f.base.world.id, entities: people }, query = 'Напомни про данное Евой Мире слово.';
  expect(storyOwnerQuestion(query, scope)).toEqual({ role: 'promisor', personId: 'replacement-eva' });
  const r = createStoryRoleReader(scope, query, storedRoleReader(f.seeds, people, scope.worldId));
  expect(r.read(f.records[2]!)?.promisor).toMatchObject({ id: f.N.id, unavailable: true });
  expect(r.score(f.records[2]!)).toBe(-12);
});

it('leaves V1 source actors and recipient grammar unchanged', () => {
  const f = semanticWorld('ru'); f.N.name = 'Ева'; f.N.aliases = [];
  const scope = { worldId: f.base.world.id, entities: f.input.entities! }, reader = createStoryRoleReaderV1(scope);
  const fact = { kind: 'promise' as const, text: 'Ждать.', quote: 'Мира сказала Еве: «Я обещаю ждать».' };
  expect(reader.read(fact)).toEqual({ speaker: { id: f.M.id, name: 'Мира' }, promisor: { id: f.M.id, name: 'Мира' } });
  expect(reader.read({ ...fact, quote: 'Евой обещала Мире ждать.' })).toBeUndefined();
  expect(retrievalQueryNames(f.N)).toContain('евой');
  expect(createStoryRoleReaderV1(scope).read(fact)).toEqual(reader.read(fact));
});

it('rejects pronoun aliases, foreign-world identities and substring matches', () => {
  const f = semanticWorld('ru'); f.N.name = 'Ева'; f.N.aliases = ['Она'];
  const scope = { worldId: f.base.world.id, entities: f.input.entities! };
  expect(retrievalQueryNames(f.N)).not.toContain('оной');
  expect(storyOwnerQuestion('Напомни про данное ею слово.', scope)).toBeUndefined();
  expect(storyOwnerQuestion('Напомни про данное Евой Мире слово.', { ...scope, worldId: 'foreign' })).toBeUndefined();
  expect(storyRetrievalQuery('Северева огляделась.', scope).mentionedIds).not.toContain(f.N.id);
});
