import { expect, it } from 'vitest';
import { addedContextTokens, compileGameContext } from '../src/core/game-context';
import { rankStoryFacts } from '../src/core/story-fact-context';
import { createStoryRoleReader, createStoryRoleReaderV1 } from '../src/core/story-source-roles';
import { storedRoleReader } from '../src/core/story-role-binding';
import { decodeStoryMemory } from '../src/core/story-memory-transport';
import { validStoryFact } from '../src/core/story-update';
import { semanticQualityCorpus } from './fixtures/story-semantic-quality';
import baseline from './fixtures/story-semantic-baseline.json';

const hints = (text: string) => {
  const block = text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];
  return block ? decodeStoryMemory(JSON.parse(block.split('\n')[1]!)) : [];
};
const measured: { name: string; family: string; intent: string; complete: boolean; top: boolean; wanted: number; selected: number[]; ranked: number[] }[] = [];
for (const locale of ['ru', 'en'] as const) for (const c of semanticQualityCorpus(locale)) it(`independent meaning comparison ${c.name}`, () => {
  const before = structuredClone(c.input), scope = { worldId: c.base.world.id, entities: c.input.entities! };
  const roles = createStoryRoleReader(scope, c.input.draft, storedRoleReader(c.seeds, c.input.entities!, c.base.world.id));
  const ranked = rankStoryFacts(c.facts, c.input.draft, scope, roles), out = compileGameContext(c.input), selected = hints(out.text);
  const complete = c.wanted.every(f => selected.some(h => h.text === f.text));
  const top = !!c.wanted.length && c.wanted.some(f => ranked[0]!.fact.text === f.text);
  measured.push({ name: c.name, family: c.family, intent: c.intent, complete, top, wanted: c.wanted.length,
    selected: selected.map(h => c.facts.findIndex(f => h.text === f.text)), ranked: ranked.slice(0, 3).map(r => c.facts.findIndex(f => r.fact.text === f.text)) });
  const prior = baseline.cases.find(b => b.name === c.name)!;
  if (c.wanted.length && prior.complete) expect(complete, 'do not lose previously retrieved evidence').toBe(true);
  if (prior.top) expect(top, 'do not demote the correct highest candidate').toBe(true);
  if (c.intent === 'control') {
    expect(measured.at(-1)!.selected).toEqual(prior.selected);
    expect(measured.at(-1)!.ranked).toEqual(prior.ranked);
  }
  if (c.id === 'word') { expect(complete).toBe(true); expect(top).toBe(true); }
  for (const h of selected) {
    const fact = c.facts.find(f => f.text === h.text); expect(fact).toBeDefined();
    expect(h.sourceQuote ?? h.text).toBe(fact!.quote); expect(h.task).toEqual(fact!.task);
    const seed = c.seeds.find(s => s.binding.quote === fact!.quote)!;
    expect(h.episodeSource).toBeDefined();
    for (const [role, person] of Object.entries(h.sourceRoles ?? {})) {
      expect(person.id).toBe(seed.binding.roles[role as keyof typeof seed.binding.roles]!.id);
      if (c.id === 'reused-name' && person.id === c.N.id) expect(person.unavailable).toBe(true);
    }
  }
  if (c.guard === 'personal') expect(out.text).toContain('Personal reference in the current request is NOT resolved');
  if (c.guard === 'ambiguous') expect(out.text).toContain('multiple possible owners');
  const grammar = createStoryRoleReaderV1({ worldId: c.base.world.id, entities: c.base.entities });
  if (c.id !== 'stable-id-rename') for (const fact of c.records) {
    const seed = c.seeds.find(s => s.binding.quote === fact.quote)!;
    expect(grammar.read(fact)).toEqual(seed.binding.roles);
  }
  for (const f of c.facts) expect(validStoryFact(f)).toBe(true);
  expect(c.input).toEqual(before); expect(out.report.total).toBe(addedContextTokens(out.text));
  expect(out.report.total <= out.report.limit || out.report.required > out.report.limit).toBe(true);
  expect(selected.length).toBeLessThanOrEqual(8);
});

it('reports a fixed baseline separately for direct wording, paraphrases and ambiguity', () => {
  const groups = ['explicit', 'paraphrase', 'ambiguous'].map(intent => {
    const cases = measured.filter(c => c.intent === intent);
    return { intent, cases: cases.length, complete: cases.filter(c => c.complete).length,
      missing: cases.filter(c => !c.complete).length, wrongTop: cases.filter(c => !c.top).length };
  });
  console.info('Semantic40', JSON.stringify({ before: baseline.groups, after: groups, unresolved: measured.filter(c => c.wanted && !c.complete).map(c => c.name) }));
  expect(measured).toHaveLength(40);
  expect(measured.filter(c => c.intent === 'control')).toHaveLength(8);
  expect(groups).toEqual([
    { intent: 'explicit', cases: 16, complete: 16, missing: 0, wrongTop: 0 },
    { intent: 'paraphrase', cases: 8, complete: 6, missing: 2, wrongTop: 2 },
    { intent: 'ambiguous', cases: 8, complete: 3, missing: 5, wrongTop: 4 },
  ]);
});
