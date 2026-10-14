// @vitest-environment node
import { expect, it } from 'vitest';
import { prepareEvaluation } from '../scripts/story-search-evaluation.mjs';
import { diversifiedCandidates, evaluateDiversification } from '../scripts/story-search-diversify.mjs';
import { freshSearchWorld } from './fixtures/story-search-fresh';
import { diverseCase, diverseScenarios, probeCandidatePrompt } from './fixtures/story-search-diverse';
import { validStoryFact } from '../src/core/story-update';
import { createStoryRoleReaderV1 } from '../src/core/story-source-roles';
import { decodeStoryMemory } from '../src/core/story-memory-transport';
import frozen from './fixtures/story-search-diverse-baseline.json';
import { digest } from '../scripts/story-search-evaluation.mjs';
import { policyDigest } from '../scripts/story-search-diversify.mjs';
import { readFileSync } from 'node:fs';

for (const locale of ['ru', 'en'] as const) it(`${locale} independent fresh sources obey frozen V1 grammar and preserve literal conditions`, () => {
  const f = freshSearchWorld(locale), before = structuredClone(f.input), grammar = createStoryRoleReaderV1({ worldId: f.base.world.id, entities: f.base.entities });
  for (const fact of f.facts) expect(validStoryFact(fact)).toBe(true);
  for (const [i, fact] of f.records.entries()) expect(grammar.read(fact)).toEqual(f.seeds[i]!.binding.roles);
  expect(f.input).toEqual(before);
});

const scenarios = diverseScenarios();
const measured: ReturnType<typeof diverseCase>[] = [];
it('keeps the independent corpus cardinality without recompiling every request in one test', () => {
  expect(scenarios).toHaveLength(104); expect(scenarios.filter(c => c.split === 'fresh')).toHaveLength(40);
});
for (const scenario of scenarios) it(`candidate/source contract ${scenario.name}`, () => {
  const c = diverseCase(scenario), w = prepareEvaluation([c]);
  measured.push(c);
  const snapshot = frozen.cases.find(s => s.id === c.id)!;
  expect(c.baseline).toEqual(snapshot.baseline); expect(c.lexical).toEqual(snapshot.lexical); expect(c.gold).toEqual(snapshot.gold);
  if (c.split === 'fresh') {
    for (const old of ['fact-2', 'fact-3', 'fact-7']) expect(c.lexical).not.toContain(old);
    for (const current of ['fact-6', 'fact-8', 'fact-9', 'fact-10', 'fact-11']) expect(c.lexical).toContain(current);
    expect(c.gold.every(id => c.lexical.includes(id))).toBe(true);
  }
  expect(w.inputs.some(i => /rp264-source-|rp264-tripod|rp264-plants/.test(i.text))).toBe(false);
});
it('registered MMR input/gold/policy/algorithm stays frozen using the already compiled per-case results', () => {
  expect(measured).toHaveLength(104);
  const w = prepareEvaluation(measured); expect(w.inputDigest).toBe(frozen.inputDigest); expect(w.goldDigest).toBe(frozen.goldDigest);
  expect(policyDigest).toBe(frozen.policyDigest); expect(digest(readFileSync('scripts/story-search-diversify.mjs', 'utf8'))).toBe(frozen.algorithmDigest);
});

it('unit vectors: anchors and protected selections never depend on gold or labels; full identities stay distinct', () => {
  const c = { id: 'unit', split: 'unit', family: 'unit', intent: 'test', query: 'q', documents: Array.from({ length: 10 }, (_, i) => ({ id: '' + i, text: 'd' + i, source: 's' + i })), lexical: Array.from({ length: 10 }, (_, i) => '' + i), baseline: ['0', '1'], gold: ['8'], protected: false };
  const w = prepareEvaluation([c]), vectors = new Map(w.inputs.map(i => [i.key, i.text === 'query: q' ? [.9, Math.sqrt(.19)] : i.text === 'passage: d8' ? [.85, Math.sqrt(1 - .85 ** 2)] : [1, 0]]));
  const out = diversifiedCandidates(w.cases[0]!, vectors);
  expect(out.ids[0]).toBe('0'); expect(out.ids[1]).toBe('8'); expect(out.ids).toHaveLength(8); expect(new Set(out.ids).size).toBe(8);
  expect(diversifiedCandidates({ ...w.cases[0]!, gold: ['9'], intent: 'control', split: 'different' }, vectors).ids).toEqual(out.ids);
  expect(diversifiedCandidates({ ...w.cases[0]!, preserve: true }, vectors).ids).toEqual(c.baseline);
  const artifact = { version: 1, inputDigest: w.inputDigest, model: { id: 'unit-NOT-model-quality', revision: 'test', dtype: 'test', pooling: 'mean', dimensions: 2 }, entries: [...vectors].map(([key, vector]) => ({ key, vector })) };
  const report = evaluateDiversification(w, artifact); expect(report.rows[0]!.selected.diverse).toEqual(out.ids); expect(report.rows[0]!.diverse.correctFirst).toBe(false);
});

for (const budget of [6000, 2300, 1500, 900]) it(`whole actual prompt admission ${budget}: unchanged fallback or every exact source/condition survives`, () => {
  const c = diverseScenarios().find(s => s.name === 'ru:fresh:two-boxes')!, before = structuredClone(c.input), chosen = ['fact-10', 'fact-11', 'fact-8'];
  const out = probeCandidatePrompt(c, chosen, budget);
  if (!out.accepted) expect(out.text).toBe(out.originalText);
  else {
    expect(out.total).toBeLessThanOrEqual(budget); expect(out.selected).toEqual(chosen);
    const block = out.text.split('<deeprole_story_memory>')[1]!.split('</deeprole_story_memory>')[0]!, hints = decodeStoryMemory(JSON.parse(block.split('\n')[1]!));
    for (const [i, id] of chosen.entries()) { const fact = c.facts[Number(id.slice(5))]!; expect(hints[i]!.text).toBe(fact.text); expect(hints[i]!.sourceQuote ?? hints[i]!.text).toBe(fact.quote); expect(hints[i]!.task).toEqual(fact.task); expect(hints[i]!.claim).toEqual(fact.claim); expect(hints[i]!.episodeSource?.revisionId).toBe(c.sources[Number(id.slice(5))]); }
  }
  expect(c.input).toEqual(before);
});

it('unproved/stale/duplicate sources and mandatory overflow keep the exact original prompt', () => {
  const c = diverseScenarios().find(s => s.name === 'en:fresh:cup')!;
  for (const ids of [['fact-2'], ['fact-7'], ['fact-0', 'fact-0'], ['foreign'], []]) { const out = probeCandidatePrompt(c, ids); expect(out.accepted).toBe(false); expect(out.text).toBe(out.originalText); }
  c.input.requiredContext = 'Required intact. '.repeat(2000); const out = probeCandidatePrompt(c, ['fact-0'], 1000);
  expect(out.accepted).toBe(false); expect(out.reason).toBe('required-overflow'); expect(out.text).toBe(out.originalText);
});
