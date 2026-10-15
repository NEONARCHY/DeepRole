// @vitest-environment node
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { flexibleScenarios, flexibleWorld, flexibleHints, priorFlexibleContext } from './fixtures/story-flexible-priority';
import { compileGameContext, addedContextTokens } from '../src/core/game-context';
import { digest } from '../scripts/story-search-evaluation.mjs';
import frozen from './fixtures/story-flexible-priority-baseline.json';
const scenarios = flexibleScenarios();
for (const c of scenarios) it(`RP271 frozen actual compiler: ${c.id}`, () => {
  const input = structuredClone(c.input), untouched = structuredClone(input), baseline = priorFlexibleContext(input), now = compileGameContext(input, { budgetPriority: false }), selected = flexibleHints(now.text);
  const snapshot = frozen.cases.find(r => r.id === c.id)!;
  expect(digest(input)).toBe(snapshot.inputDigest); expect(digest(baseline)).toBe(snapshot.baselineDigest);
  if (!c.positive) expect(now).toEqual(baseline);
  else {
    for (const fact of c.wanted) {
      const hint = selected.find(h => h.text === fact.text)!; expect(hint).toBeDefined();
      expect(hint.sourceQuote ?? hint.text).toBe(fact.quote); expect(hint.task).toEqual(fact.task); expect(hint.claim).toEqual(fact.claim);
      expect(hint.episodeSource?.revisionId).toBeTruthy();
    }
    expect(selected.some(h => c.discussions.some(f => f.text === h.text))).toBe(false);
  }
  expect(selected.length).toBeLessThanOrEqual(8);
  expect(now.report.total).toBe(addedContextTokens(now.text));
  if (now.report.required <= input.settings.contextBudget) expect(now.report.total).toBeLessThanOrEqual(input.settings.contextBudget);
  expect(input).toEqual(untouched);
});
for (const locale of ['ru', 'en'] as const) for (const kind of ['question', 'action', 'bare-action']) for (const limit of [900, 1200, 1500, 2300, 6000]) it(`${locale} ${kind}: whole-bundle or exact RP270 rollback at${limit}`, () => {
  const c = scenarios.find(c => c.id === `${locale}:rp271:fort:${kind}`)!, input = structuredClone(c.input); input.settings.contextBudget = limit;
  const old = priorFlexibleContext(input), now = compileGameContext(input), selected = flexibleHints(now.text);
  if (now.text === old.text) expect(now).toEqual(old);
  else {
    for (const fact of c.wanted) expect(selected.some(h => h.text === fact.text)).toBe(true);
    expect(now.report.total).toBeLessThanOrEqual(limit);
  }
});
it('new exact quote/code/condition/source cannot silently replace missing frozen bindings', () => {
  const c = flexibleWorld('en'); c.input.draft = c.action;
  c.discussions[0]!.text = c.discussions[0]!.quote += ' A different statement.';
  expect(compileGameContext(c.input)).toEqual(priorFlexibleContext(c.input));
});
it('preserves unrelated substantive selection rather than use its slot for the new object', () => {
  const c = flexibleWorld('en'); c.input.draft = c.action;
  const prior = flexibleHints(priorFlexibleContext(c.input).text), now = flexibleHints(compileGameContext(c.input).text), repeats = new Set(c.discussions.map(f => f.text));
  for (const h of prior.filter(h => !repeats.has(h.text))) expect(now).toContainEqual(h);
});
it('each supported slow action uses the old parser, while restart and internal feature gates keep exact old behavior', () => {
  const c = flexibleWorld('en'); c.input.draft = '*I carefully open the north door.*';
  expect(c.records.slice(0, 7).every(f => flexibleHints(compileGameContext(c.input).text).some(h => h.text === f.text))).toBe(true);
  c.input.restart = true; expect(compileGameContext(c.input)).toEqual(priorFlexibleContext(c.input));
  c.input.restart = false;
  for (const flag of ['discussionPriority', 'topicAdmission', 'contentRelevance', 'actionBalance'] as const) expect(compileGameContext(c.input, { [flag]: false })).toEqual(compileGameContext(c.input, { [flag]: false, flexiblePriority: false }));
});
it('registered fresh source/labels/baseline stay fixed; old RP270 grammar is not rewritten', () => {
  const registration = JSON.parse(readFileSync('scripts/story-search-flexible-corrected-registration.json', 'utf8'));
  const initial = JSON.parse(readFileSync('scripts/story-search-flexible-registration.json', 'utf8'));
  expect(registration.initialProtocolDigest).toBe(digest(initial));
  const oldAlgorithm = readFileSync('docs/benchmarks/rp271-initial-algorithm.txt', 'utf8').replace(/\r\n/g, '\n');
  const oldCompiler = readFileSync('docs/benchmarks/rp271-initial-compiler.txt', 'utf8').replace(/\r?\n/g, '\r\n');
  expect(digest(oldAlgorithm)).toBe(initial.algorithmDigest); expect(digest(oldCompiler)).toBe(initial.compilerDigest);
  const oldReport = JSON.parse(readFileSync('docs/benchmarks/rp271-flexible-results.json', 'utf8'));
  expect(oldReport.registration).toEqual(initial);
  expect(oldReport.groups.map((g:any)=>g.complete)).toEqual([10,5]);
  expect(registration.inputDigest).toBe(frozen.inputDigest); expect(registration.goldDigest).toBe(frozen.goldDigest);
  expect(digest(readFileSync('src/core/story-flexible-priority.ts', 'utf8'))).toBe(registration.algorithmDigest);
  // RP272 extends the compiler; preserve the exact historical RP271 proof.
  expect(digest(readFileSync('docs/benchmarks/rp271-final-compiler.txt', 'utf8').replace(/\r?\n/g, '\r\n'))).toBe(registration.compilerDigest);
  expect(digest(readFileSync('tests/fixtures/story-flexible-priority.ts', 'utf8'))).toBe(registration.fixtureDigest);
  expect(digest(readFileSync('scripts/story-search-flexible-corrected-benchmark.mjs', 'utf8'))).toBe(registration.benchmarkDigest);
  const report = JSON.parse(readFileSync('docs/benchmarks/rp271b-flexible-results.json', 'utf8'));
  expect(report.registration).toEqual(registration);
  expect(report.rows).toHaveLength(90); expect(report.budgets).toHaveLength(270);
  expect(report.rows.every((r: any) => !r.controlDrift && !r.substantiveLoss.length && (!r.positive || r.complete))).toBe(true);
  expect(report.budgets.every((b: any) => b.sourceExact && b.budget)).toBe(true);
});
it('qualified same-label actions retain ambiguity, separate owners, conditions and unfulfilled tasks', () => {
  const c = flexibleWorld('en'); c.input.draft = c.action;
  const output = compileGameContext(c.input), hints = flexibleHints(output.text);
  expect(output.text).toContain('<deeprole_reference_guard>Independent current tasks share the exact object label');
  for (const fact of c.records.slice(1, 3)) {
    const h = hints.find(h => h.text === fact.text)!; expect(h).toBeDefined(); expect(h.task).toEqual(fact.task); expect(h.sourceQuote ?? h.text).toBe(fact.quote);
    expect(h.task?.status).toBe('open');
  }
  expect(new Set(hints.filter(h => h.task?.status === 'open').map(h => h.task!.key)).size).toBe(2);
});
