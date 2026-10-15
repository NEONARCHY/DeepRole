// @vitest-environment node
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { sequenceScenarios, sequenceWorld, sequenceHints, priorSequenceContext } from './fixtures/story-sequence-priority';
import { compileGameContext, addedContextTokens } from '../src/core/game-context';
import { digest } from '../scripts/story-search-evaluation.mjs';
import frozen from './fixtures/story-sequence-priority-baseline.json';
const scenarios = sequenceScenarios();
for (const c of scenarios) it(`RP272 whole compiler and frozen baseline: ${c.id}`, () => {
  // Historical cap8 comparison. RP273's intentionally expanded overflow cases
  // have a separate fresh corpus; never rewrite this frozen gold/baseline.
  const input = structuredClone(c.input), untouched = structuredClone(input), prior = priorSequenceContext(input), current = compileGameContext(input, { budgetPriority: false }), hints = sequenceHints(current.text);
  const row = frozen.cases.find(row => row.id === c.id)!;
  expect(digest(input)).toBe(row.inputDigest); expect(digest(prior)).toBe(row.baselineDigest);
  if (!c.positive) expect(current).toEqual(prior);
  else {
    for (const fact of c.wanted) {
      const h = hints.find(h => h.text === fact.text)!; expect(h).toBeDefined();
      expect(h.sourceQuote ?? h.text).toBe(fact.quote); expect(h.task).toEqual(fact.task); expect(h.claim).toEqual(fact.claim); expect(h.episodeSource?.revisionId).toBeTruthy();
    }
    expect(hints.some(h => c.discussions.some(f => f.text === h.text && (c.wanted.length === 7 || f.text.includes(c.first) || c.wanted.length === 6 && f.text.includes(c.second))))).toBe(false);
  }
  const repeats = new Set(c.discussions.map(f => f.text));
  for (const h of sequenceHints(prior.text).filter(h => !repeats.has(h.text))) expect(hints).toContainEqual(h);
  expect(hints.length).toBeLessThanOrEqual(8); expect(current.report.total).toBe(addedContextTokens(current.text));
  if (current.report.required <= input.settings.contextBudget) expect(current.report.total).toBeLessThanOrEqual(input.settings.contextBudget);
  expect(input).toEqual(untouched);
});
for (const locale of ['ru', 'en'] as const) for (const family of ['short', 'dual', 'triple']) for (const budget of [900, 1200, 1500, 2300, 6000]) it(`${locale} ${family}: whole conditions or exact prior counters at${budget}`, () => {
  const c = scenarios.find(c => c.id === `${locale}:rp272:tower:${family}`)!, input = structuredClone(c.input); input.settings.contextBudget = budget;
  const prior = priorSequenceContext(input), current = compileGameContext(input);
  if (current.text !== prior.text) {
    for (const fact of c.wanted) expect(sequenceHints(current.text).some(h => h.text === fact.text)).toBe(true);
    expect(current.report.total).toBeLessThanOrEqual(budget);
  } else expect(current).toEqual(prior);
});
for (const mode of ['edited-quote', 'replacement', 'unknown-roles', 'restart', 'deictic', 'duplicate-object', 'no-second-substantive'] as const) it(`scope/source protection: ${mode}`, () => {
  const c = sequenceWorld('en'); c.input.draft = c.dual;
  if (mode === 'edited-quote') c.records[3]!.quote += ' Changed quotation.';
  if (mode === 'replacement') c.input.entities = c.input.entities!.map(e => ({ ...e, id: 'replacement-' + e.id }));
  if (mode === 'unknown-roles') c.input.story!.roleSeeds = [];
  if (mode === 'restart') c.input.restart = true;
  if (mode === 'deictic') c.input.draft = 'open this door and take the copper key';
  if (mode === 'duplicate-object') c.input.draft = c.a + ' and close the iron door';
  if (mode === 'no-second-substantive') c.input.story!.facts = c.facts.filter(f => !c.records.slice(3, 6).includes(f));
  expect(compileGameContext(c.input)).toEqual(priorSequenceContext(c.input));
});
it('internal comparison gates do not activate a partial new sequence lane', () => {
  const c = sequenceWorld('en'); c.input.draft = c.dual;
  for (const flag of ['flexiblePriority', 'discussionPriority', 'actionBalance', 'compoundActionBalance', 'topicAdmission', 'contentRelevance'] as const) expect(compileGameContext(c.input, { [flag]: false })).toEqual(compileGameContext(c.input, { [flag]: false, sequencePriority: false }));
});
for (const locale of ['ru', 'en'] as const) it(`${locale} unqualified door/key user example retains BOTH complete object sets`, () => {
  const c = sequenceWorld(locale); c.input.draft = c.s('открываю дверь и достаю ключ', 'open the door and take the key');
  const hints = sequenceHints(compileGameContext(c.input).text);
  for (const fact of c.records.slice(0, 6)) { const h = hints.find(h => h.text === fact.text)!; expect(h).toBeDefined(); expect(h.sourceQuote ?? h.text).toBe(fact.quote); expect(h.task).toEqual(fact.task); }
});
it('new pre-comparison protocol, desired sets and original baseline remain fixed', () => {
  const registration = JSON.parse(readFileSync('scripts/story-search-sequence-corrected-registration.json', 'utf8'));
  const initial = JSON.parse(readFileSync('scripts/story-search-sequence-registration.json', 'utf8'));
  expect(registration.initialProtocolDigest).toBe(digest(initial));
  expect(registration.algorithmDigest).toBe(initial.algorithmDigest); expect(registration.compilerDigest).toBe(initial.compilerDigest);
  expect(digest(readFileSync('docs/benchmarks/rp272-initial-fixture.txt', 'utf8').replace(/\r\n/g, '\n'))).toBe(initial.fixtureDigest);
  expect(registration.inputDigest).toBe(frozen.inputDigest); expect(registration.goldDigest).toBe(frozen.goldDigest);
  expect(digest(readFileSync('docs/benchmarks/rp272-final-compiler.txt', 'utf8').replace(/\r?\n/g, '\r\n'))).toBe(registration.compilerDigest);
  for (const [path, key] of [['src/core/story-sequence-priority.ts', 'algorithmDigest'], ['tests/fixtures/story-sequence-priority.ts', 'fixtureDigest'], ['scripts/story-search-sequence-corrected-benchmark.mjs', 'benchmarkDigest']]) expect(digest(readFileSync(path!, 'utf8'))).toBe(registration[key!]);
  const report = JSON.parse(readFileSync('docs/benchmarks/rp272b-sequence-results.json', 'utf8'));
  expect(report.registration).toEqual(registration); expect(report.rows).toHaveLength(64); expect(report.budgets).toHaveLength(192);
  expect(report.rows.every((r:any) => !r.controlDrift && !r.substantiveLoss.length && (!r.positive || r.complete))).toBe(true);
  expect(report.budgets.every((r:any) => r.sourceExact && r.budget)).toBe(true);
});
