// @vitest-environment node
import { it, expect } from 'vitest';
import { prepareEvaluation } from '../scripts/story-search-evaluation.mjs';
import { evidenceCandidates } from '../scripts/story-search-evidence.mjs';
import { auditSearchWorld } from './fixtures/story-search-audit';
import { diverseScenarios } from './fixtures/story-search-evidence';
import { historicalEvidenceCase as diverseCase } from './fixtures/historical-search-context';
import { probeCandidatePrompt } from './fixtures/story-search-diverse';
import { validStoryFact } from '../src/core/story-update';
import { createStoryRoleReaderV1 } from '../src/core/story-source-roles';
import frozen from './fixtures/story-search-evidence-baseline.json';
import { digest } from '../scripts/story-search-evaluation.mjs';
import { evidencePolicyDigest } from '../scripts/story-search-evidence.mjs';
import type { evaluateEvidence } from '../scripts/story-search-evidence.mjs';
import { readFileSync } from 'node:fs';

for (const locale of ['ru', 'en'] as const) it(`${locale} second fresh corpus: every original AND every discussion has genuine frozen V1 attribution`, () => {
  const c = auditSearchWorld(locale), grammar = createStoryRoleReaderV1({ worldId: c.base.world.id, entities: c.input.entities! });
  for (const [i, fact] of c.facts.entries()) { expect(validStoryFact(fact)).toBe(true); expect(grammar.read(fact)).toEqual(c.seeds[i]!.binding.roles); }
  expect(c.noise).toHaveLength(90);
});

it('unit vectors: every mandatory source survives irrespective of similarity, identity and gold labels', () => {
  const w = prepareEvaluation([{ id: 'unit', split: 'unit', family: 'unit', intent: 'unit', query: 'q', documents: Array.from({ length: 12 }, (_, i) => ({ id: '' + i, text: 'd' + i, source: 'source-' + i })), lexical: Array.from({ length: 12 }, (_, i) => '' + i), baseline: ['7', '8'], gold: ['8'], protected: false }]);
  const c = { ...w.cases[0]!, evidenceIds: ['7', '8'] }, vectors = new Map(w.inputs.map(i => [i.key, [1, 0]]));
  const out = evidenceCandidates(c, vectors);
  expect(out.ids.slice(0, 3)).toEqual(['0', '7', '8']); expect(out.ids).toHaveLength(8);
  expect(evidenceCandidates({ ...c, intent: 'control', gold: [] }, vectors).ids).toEqual(out.ids);
  expect(() => evidenceCandidates({ ...c, evidenceIds: ['foreign'] }, vectors)).toThrow('Invalid mandatory');
  expect(evidenceCandidates({ ...c, baseline: ['1', '2', '3', '4', '5', '6', '7', '8'], evidenceIds: ['1', '2', '3', '4', '5', '6', '7', '8'] }, vectors)).toEqual({ ids: ['1', '2', '3', '4', '5', '6', '7', '8'], reason: 'mandatory-evidence-fills-cap-fallback' });
});

const scenarios = diverseScenarios();
const measured: ReturnType<typeof diverseCase>[] = [];
const saved = JSON.parse(readFileSync('docs/benchmarks/rp264b-search-results.json', 'utf8')) as ReturnType<typeof evaluateEvidence>;
it('retains the first fresh40 as development and exposes a genuinely different fresh24', () => {
  expect(scenarios).toHaveLength(128); expect(scenarios.filter(c => c.split === 'fresh')).toHaveLength(24); expect(scenarios.filter(c => c.split === 'development')).toHaveLength(40);
});
for (const scenario of scenarios) it(`historical mandatory evidence contract ${scenario.name}`, () => {
  const c = diverseCase(scenario);
  measured.push(c);
  const snapshot = frozen.cases.find(s => s.id === c.id)!, result = saved.rows.find(r => r.id === c.id)!;
  expect(c.baseline).toEqual(snapshot.baseline); expect(c.lexical).toEqual(snapshot.lexical); expect(c.gold).toEqual(snapshot.gold);
  expect(result.selected.baseline).toEqual(c.baseline); expect(result.goldCount).toBe(c.gold.length);
  expect(result.evidenceIds).toEqual(c.evidenceIds); expect(result.allMandatoryRetained).toBe(true);
  expect(c.evidenceIds.every(id => result.selected.diverse.includes(id))).toBe(true);
  if (c.preserve) expect(result.selected.diverse).toEqual(c.baseline);
  expect(c.evidenceIds.every(id => c.baseline.includes(id))).toBe(true);
  if (c.split === 'fresh') { for (const old of ['fact-6', 'fact-8', 'fact-10']) expect(c.lexical).not.toContain(old); for (const current of ['fact-7', 'fact-9', 'fact-11']) expect(c.lexical).toContain(current); }
});
it('registered evidence guard and saved measurement retain their exact pre-inference provenance', () => {
  expect(measured).toHaveLength(128);
  const w = prepareEvaluation(measured); expect(w.inputDigest).toBe(frozen.inputDigest); expect(w.goldDigest).toBe(frozen.goldDigest);
  expect(saved.inputDigest).toBe(w.inputDigest); expect(saved.goldDigest).toBe(w.goldDigest);
  expect(evidencePolicyDigest).toBe(frozen.evidencePolicyDigest); expect(digest(readFileSync('scripts/story-search-evidence.mjs', 'utf8'))).toBe(frozen.algorithmDigest);
  expect(digest(scenarios.map(c => ({ id: c.name, input: c.input, facts: c.facts, seeds: c.seeds, sources: c.sources })))).toBe(frozen.provenanceDigest);
});

for (const budget of [900, 1500, 6000]) it(`second audit keeps complete folder conditions/codes or exact fallback at ${budget}`, () => {
  const c = diverseScenarios().find(s => s.name === 'en:audit:folders')!, before = structuredClone(c.input), p = probeCandidatePrompt(c, ['fact-0', 'fact-1', 'fact-7'], budget);
  if (p.accepted) { expect(p.total).toBeLessThanOrEqual(budget); expect(p.selected).toEqual(['fact-0', 'fact-1', 'fact-7']); }
  else expect(p.text).toBe(p.originalText);
  expect(c.input).toEqual(before);
});
