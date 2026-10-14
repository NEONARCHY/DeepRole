import { expect, it } from 'vitest';
import { storyOwnerQuestion } from '../src/core/story-owner-query';
import { createStoryRoleReader } from '../src/core/story-source-roles';
import { storedRoleReader } from '../src/core/story-role-binding';
import { compileGameContext, addedContextTokens } from '../src/core/game-context';
import { semanticWorld } from './fixtures/story-semantic-quality';

for (const locale of ['ru', 'en'] as const) {
  const rows = locale === 'ru' ? [
    'Напомни про данное Норой Мире слово.', 'Расскажи о данном Совою Мире слове.',
    'Покажи данное слово Норы.', 'Напомни данное Мирой Норе слово.',
    'Перечисли данное Ласточкой слово.',
  ] : [
    'Remind me about Nora’s word to Mira.', 'Tell me about Owl’s given word to Swallow.',
    'Show me Nora’s word.', 'Remind me of Mira’s given word to Nora.',
    'List Swallow’s given word.',
  ];
  it.each(rows)(`retrieves only the explicit commitment owner ${locale}: %s`, query => {
    const f = semanticWorld(locale), scope = { worldId: f.base.world.id, entities: f.input.entities! };
    const owner = rows.indexOf(query) >= 3 ? f.M : f.N;
    const expected = { role: 'promisor', personId: owner.id };
    expect(storyOwnerQuestion(query, scope)).toEqual(expected);
    const reader = createStoryRoleReader(scope, query, storedRoleReader(f.seeds, f.input.entities!, f.base.world.id));
    expect(reader.question).toEqual(expected);
    expect(reader.score(f.records[owner === f.N ? 2 : 3]!)).toBe(40);
    expect(reader.score(f.records[owner === f.N ? 3 : 2]!)).toBe(-12);
    f.input.draft = query; const before = structuredClone(f.input), out = compileGameContext(f.input);
    expect(out.text).toContain(owner === f.N ? f.records[2]!.text : f.records[3]!.text);
    expect(f.input).toEqual(before);
  });

  const negatives = locale === 'ru' ? [
    'Нора произнесла данное слово.', 'Расскажи о слове Норы.',
    'Напомни про данное ею слово.', 'Напомни про данное Норой ей слово.',
    'Напомни про данное Норой соседке слово.', 'Напомни про данное Норой Мире слово и намерения Миры.',
    'Если Нора дала слово.', 'Нора не давала слова.', 'Нора и Мира дали слово.',
    'Напомни про данное Норой Мире слово из письма.', '«Напомни про данное Норой Мире слово».',
    'Напомни про данное @person0@ Мире слово.', 'Напомни про данное слово Боре.',
  ] : [
    'Nora said a word.', 'Tell me about Nora’s word choice.', 'Remind me about her word.',
    'Remind me about Nora’s word to her.', 'Remind me about Nora’s word to a neighbour.',
    'Remind me about Nora’s word and Mira’s plans.', 'If Nora gave her word.',
    'Nora did not give her word.', 'Nora and Mira gave their word.',
    'Remind me about Nora’s word from the letter.', '“Remind me about Nora’s word to Mira.”',
    'Remind me about @person0@ s word to Mira.', 'Remind me about Boris’s word.',
  ];
  it.each(negatives)(`abstains from unsupported speech, recipients and syntax ${locale}: %s`, query => {
    const f = semanticWorld(locale);
    expect(storyOwnerQuestion(query, { worldId: f.base.world.id, entities: f.input.entities! })).toBeUndefined();
  });

  it(`retains source proof, historical identity and name collisions ${locale}`, () => {
    const f = semanticWorld(locale), query = rows[1]!, scope = { worldId: f.base.world.id, entities: f.input.entities! };
    f.M.aliases.push(f.N.aliases[0]!);
    expect(storyOwnerQuestion(query, scope)).toBeUndefined();
    f.M.aliases.pop(); f.N.aliases.push(locale === 'ru' ? f.M.name : f.M.aliases[0]!);
    // Recipient ambiguity also rejects the request instead of dropping its name.
    expect(storyOwnerQuestion(rows[1]!, scope)).toBeUndefined(); f.N.aliases.pop();
    const replaced = [{ ...f.N, id: 'new-owner' }, f.M];
    const reader = createStoryRoleReader({ ...scope, entities: replaced }, rows[0]!, storedRoleReader(f.seeds, replaced, f.base.world.id));
    expect(reader.read(f.records[2]!)?.promisor?.id).toBe(f.N.id);
    expect(reader.read(f.records[2]!)?.promisor?.unavailable).toBe(true);
    expect(reader.score(f.records[2]!)).toBe(-12);
    const changed = structuredClone(f.records[2]!); changed.quote += ' Edited.';
    expect(createStoryRoleReader(scope, rows[0]!, storedRoleReader(f.seeds, scope.entities, f.base.world.id, {}, true)).score(changed)).toBe(0);
    expect(storyOwnerQuestion(rows[0]!, { ...scope, worldId: 'foreign-world' })).toBeUndefined();
    if (locale === 'ru') {
      const short = { ...f.N, name: 'Ева', aliases: [] }, shortScope = { ...scope, entities: [short, f.M] };
      expect(storyOwnerQuestion('Напомни про данное Евой Мире слово.', shortScope)).toEqual({ role: 'promisor', personId: short.id });
      expect(storyOwnerQuestion('Что Ева обещала Мире?', shortScope)).toEqual({ role: 'promisor', personId: short.id });
      expect(storyOwnerQuestion('Напомни про данное Еве слово.', shortScope)).toBeUndefined();
      expect(storyOwnerQuestion('Напомни про данное Мире слово.', scope)).toBeUndefined();
    }
  });
  for (const budget of [500, 1500, 2500, 4000, 6000]) it('keeps a whole nominal commitment budget ' + locale + ' ' + budget, () => {
    const f = semanticWorld(locale); f.input.draft = rows[0]!; f.input.settings.contextBudget = budget;
    const before = structuredClone(f.input), out = compileGameContext(f.input);
    expect(out.report.total).toBe(addedContextTokens(out.text));
    expect(out.report.total <= budget || out.report.required > budget).toBe(true);
    expect(f.input).toEqual(before);
  });
}
