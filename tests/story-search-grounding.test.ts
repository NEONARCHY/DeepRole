// @vitest-environment node
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { groundingScenarios, groundingTokens, groundingWorld } from './fixtures/story-search-grounding';
import { historicalGroundingCase as groundingCase } from './fixtures/historical-search-context';
import { groundingCandidates, evaluateGrounding } from '../scripts/story-search-grounding.mjs';
import { digest } from '../scripts/story-search-evaluation.mjs';
import { validStoryFact } from '../src/core/story-update';
import { createStoryRoleReaderV1 } from '../src/core/story-source-roles';
import { probeCandidatePrompt } from './fixtures/story-search-diverse';
import { decodeStoryMemory } from '../src/core/story-memory-transport';
import frozen from './fixtures/story-search-grounding-baseline.json';
import registration from '../scripts/story-search-grounding-registration.json';

const scenarios = groundingScenarios(), measured: ReturnType<typeof groundingCase>[] = [];
const saved = JSON.parse(readFileSync('docs/benchmarks/rp269-grounding-results.json', 'utf8')) as ReturnType<typeof evaluateGrounding>;
for (const locale of ['ru', 'en'] as const) it(`${locale} source classifications keep genuine V1 attribution and full independent conditions`, () => {
  const c = groundingWorld(locale), grammar = createStoryRoleReaderV1({ worldId: c.base.world.id, entities: c.input.entities! });
  for (const [i, fact] of c.facts.entries()) { expect(validStoryFact(fact)).toBe(true); expect(grammar.read(fact) ?? {}).toEqual(c.seeds[i]!.binding.roles); }
  expect(c.noise).toHaveLength(120); expect(c.records[3]!.text).not.toBe(c.records[3]!.quote);
  expect(c.records[1]!.task!.key).not.toBe(c.records[11]!.task!.key);
});

for (const scenario of scenarios) it(`RP269 fixed data and readonly selection: ${scenario.name}`, () => {
  const before = structuredClone(scenario.input), c = groundingCase(scenario), original = structuredClone(c), out = groundingCandidates(c, groundingTokens);
  measured.push(c);
  const record = frozen.cases.find(row => row.id === c.id)!, row = saved.rows.find(row => row.id === c.id)!;
  expect(c.baseline).toEqual(record.baseline); expect(c.lexical).toEqual(record.lexical); expect(c.gold).toEqual(record.gold); expect(c.mandatory).toEqual(record.mandatory);
  expect(out.ids).toEqual(row.candidate); expect(out.reason).toBe(row.reason); expect(out.priorities).toEqual(row.priorities);
  expect(new Set(out.ids).size).toBe(out.ids.length); expect(out.ids.length).toBeLessThanOrEqual(8);
  expect(c.mandatory.every(id => out.ids.includes(id))).toBe(true);
  if (!c.gold.length) expect(out.ids).toEqual(c.baseline);
  expect(c.lexical).not.toContain('fact-4'); expect(c.lexical).not.toContain('fact-6'); expect(c.lexical).not.toContain('fact-8');
  expect(c).toEqual(original); expect(scenario.input).toEqual(before);
});

it('all pre-algorithm input/gold/baseline and pre-evaluation protocol fingerprints stay unchanged', () => {
  expect(measured).toHaveLength(96);
  expect(measured.filter(c => c.split === 'holdout')).toHaveLength(32);
  expect(digest(measured.map(({ gold, ...rest }) => rest))).toBe(frozen.inputDigest);
  expect(digest(measured.map(c => [c.id, c.gold]))).toBe(frozen.goldDigest);
  expect(digest(scenarios.map(c => ({ id: c.name, input: c.input, seeds: c.seeds, sources: c.input.story!.episodeSources })))).toBe(frozen.provenanceDigest);
  expect(registration.inputDigest).toBe(frozen.inputDigest); expect(registration.goldDigest).toBe(frozen.goldDigest);
  for (const [field, path] of [
    ['algorithmDigest', 'scripts/story-search-grounding.mjs'], ['benchmarkDigest', 'scripts/story-search-grounding-benchmark.mjs'],
    ['coreTextDigest', 'src/core/text.ts'], ['admissionProbeDigest', 'tests/fixtures/story-search-diverse.ts'],
  ] as const) expect(digest(readFileSync(path, 'utf8'))).toBe(registration[field]);
  expect(digest(JSON.parse(readFileSync('scripts/story-search-grounding-policy.json', 'utf8')))).toBe(registration.policyDigest);
});

it('does not present unchanged holdout set recall as an independent improvement', () => {
  const report = evaluateGrounding(measured, groundingTokens); expect(report.groups).toEqual(saved.groups);
  const groups = report.groups.filter(g => g.split === 'holdout');
  expect(groups.reduce((n, g) => n + g.positive, 0)).toBe(16);
  expect(groups.reduce((n, g) => n + g.lexicalComplete, 0)).toBe(10);
  expect(groups.reduce((n, g) => n + g.candidateComplete, 0)).toBe(10);
  expect(groups.reduce((n, g) => n + g.lexicalWrongFirst, 0)).toBe(8);
  expect(groups.reduce((n, g) => n + g.candidateWrongFirst, 0)).toBe(6);
  expect(report.rows.reduce((n, r) => n + r.mandatoryLoss.length + Number(r.controlDrift) + r.lostLexicalGold.length, 0)).toBe(0);
});

for (const locale of ['ru', 'en'] as const) for (const budget of [900, 1500, 6000]) it(`${locale} ${budget}: full source conditions and roles fit together or exact prior prompt`, () => {
  const c = scenarios.find(c => c.name === locale + ':grounding:courtyard:conditions')!, before = structuredClone(c.input);
  const p = probeCandidatePrompt(c, ['fact-1', 'fact-2', 'fact-11'], budget);
  if (!p.accepted) expect(p.text).toBe(p.originalText);
  else {
    expect(p.total).toBeLessThanOrEqual(budget);
    const block = p.text.split('<deeprole_story_memory>')[1]!.split('</deeprole_story_memory>')[0]!;
    const hints = decodeStoryMemory(JSON.parse(block.split('\n')[1]!));
    for (const index of [1, 2, 11]) {
      const fact = c.records[index]!, hint = hints.find(h => h.text === fact.text)!;
      expect(hint.sourceQuote ?? hint.text).toBe(fact.quote); expect(hint.task).toEqual(fact.task);
      expect(hint.sourceRoles?.[index === 2 ? 'planner' : 'promisor']?.id).toBe(index === 2 ? c.B.id : c.A.id);
    }
  }
  expect(c.input).toEqual(before);
});
