// @vitest-environment node
import { expect, it } from 'vitest';
import { createStoryRoleReaderV1 } from '../src/core/story-source-roles';
import { validStoryFact } from '../src/core/story-update';
import { prepareEvaluation } from '../scripts/story-search-evaluation.mjs';
import { prototypeScenarios, prototypeCase } from './fixtures/story-search-prototype';
import { semanticHoldoutWorld } from './fixtures/story-semantic-holdout';
import frozen from './fixtures/story-search-baseline.json';
import { readFileSync } from 'node:fs';
import type { evaluateCandidates } from '../scripts/story-search-evaluation.mjs';

for (const locale of ['ru', 'en'] as const) it(`holdout ${locale}: genuine source grammar, immutable data and no resurrection of completed camera task`, () => {
  const f = semanticHoldoutWorld(locale), before = structuredClone(f.input), grammar = createStoryRoleReaderV1({ worldId: f.base.world.id, entities: f.input.entities! });
  for (const fact of f.facts) expect(validStoryFact(fact)).toBe(true);
  for (const [i, fact] of f.records.entries()) expect(grammar.read(fact)).toEqual(f.seeds[i]!.binding.roles);
  expect(f.input).toEqual(before);
});

const scenarios = prototypeScenarios(), cases: ReturnType<typeof prototypeCase>[] = [];
const saved = JSON.parse(readFileSync('docs/benchmarks/rp263-search-results.json', 'utf8')) as ReturnType<typeof evaluateCandidates>;
for (const scenario of scenarios) it(`original RP263 source/provenance contract ${scenario.name}`, () => {
  const before = structuredClone(scenario.input), c = prototypeCase(scenario);
  cases.push(c);
  expect(c.documents.length).toBeGreaterThan(50); expect(c.baseline.length).toBeLessThanOrEqual(8);
  expect(c.gold.every(id => c.documents.some(d => d.id === id))).toBe(true);
  if (c.split === 'holdout') { expect(c.lexical).not.toContain('fact-2'); expect(c.lexical).toContain('fact-6'); }
  expect(scenario.input).toEqual(before);
  const result = saved.rows.find(r => r.id === c.id)!;
  expect(result.selected.baseline).toEqual(c.baseline); expect(result.goldCount).toBe(c.gold.length);
  if (c.protected) expect(result.selected.hybrid).toEqual(c.baseline);
});

it('64 frozen scenarios expose only current verified source texts to an encoder', () => {
  const before = structuredClone(cases), w = prepareEvaluation(cases);
  expect(w.inputDigest).toBe(frozen.inputDigest); expect(w.goldDigest).toBe(frozen.goldDigest);
  expect(cases).toHaveLength(64); expect(cases.filter(c => c.split === 'development')).toHaveLength(40); expect(cases.filter(c => c.split === 'holdout')).toHaveLength(24);
  expect(w.inputs.every(i => /^(query|passage): /.test(i.text))).toBe(true);
  expect(w.inputs.some(i => /semantic-source-|semantic-holdout-source-|holdout-camera|atlas-duty/.test(i.text))).toBe(false);
  expect(cases).toEqual(before);
  // This checks the saved measurement's provenance, not a fake model rerun.
  expect(saved.inputDigest).toBe(w.inputDigest); expect(saved.goldDigest).toBe(w.goldDigest);
});
