// @vitest-environment node
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { budgetScenarios, budgetWorld, budgetHints, priorBudgetContext } from './fixtures/story-budget-priority';
import { compileGameContext, addedContextTokens } from '../src/core/game-context';
import { storyFactIdentity } from '../src/core/story-memory-lifecycle';
import { roleSeed } from '../src/core/story-role-binding';
import { digest } from '../scripts/story-search-evaluation.mjs';
import frozen from './fixtures/story-budget-priority-baseline.json';
import { sequenceScenarios } from './fixtures/story-sequence-priority';
const scenarios = budgetScenarios();
for (const c of sequenceScenarios()) it(`RP272 current default regression, with deliberate cap expansion separated: ${c.id}`, () => {
  const prior = priorBudgetContext(c.input), current = compileGameContext(c.input);
  if (c.family !== 'overflow') expect(current).toEqual(prior);
  else {
    const hints = budgetHints(current.text); expect(hints.length).toBeGreaterThan(8);
    for (const fact of [...c.records.slice(0, 6), ...c.facts.filter(f => !c.records.includes(f) && !c.discussions.includes(f))]) expect(hints.find(h => h.text === fact.text)?.sourceQuote ?? hints.find(h => h.text === fact.text)?.text).toBe(fact.quote);
    expect(current.report.total).toBeLessThanOrEqual(current.report.limit);
  }
});
for (const c of scenarios) it(`RP273 whole fresh sources and exact RP272 baseline: ${c.id}`, () => {
  const input = structuredClone(c.input), untouched = structuredClone(input), prior = priorBudgetContext(input), current = compileGameContext(input), hints = budgetHints(current.text);
  const row = frozen.cases.find(row => row.id === c.id)!;
  expect(digest(input)).toBe(row.inputDigest); expect(digest(prior)).toBe(row.baselineDigest);
  if (!c.positive) expect(current).toEqual(prior);
  else {
    for (const fact of c.wanted) {
      const h = hints.find(h => h.text === fact.text)!; expect(h).toBeDefined();
      expect(h.sourceQuote ?? h.text).toBe(fact.quote); expect(h.task).toEqual(fact.task); expect(h.claim).toEqual(fact.claim); expect(h.episodeSource?.revisionId).toBeTruthy();
    }
    expect(hints.length).toBeGreaterThan(8); expect(hints.some(h => c.discussions.some(f => f.text === h.text))).toBe(false);
  }
  const repeats = new Set(c.discussions.map(f => f.text));
  for (const h of budgetHints(prior.text).filter(h => !repeats.has(h.text))) expect(hints).toContainEqual(h);
  expect(current.report.selected.facts).toBe(hints.length); expect(current.report.total).toBe(addedContextTokens(current.text));
  if (current.report.required <= input.settings.contextBudget) expect(current.report.total).toBeLessThanOrEqual(input.settings.contextBudget);
  expect(input).toEqual(untouched);
});
for (const locale of ['ru', 'en'] as const) for (const family of ['nine-single', 'twelve-dual', 'sixteen-triple', 'info']) for (const budget of [0, 900, 1500, 2300, 4000, 6000]) it(`${locale} ${family}: whole evidence or exact output/counters at${budget}`, () => {
  const c = scenarios.find(c => c.id === `${locale}:rp273:observatory:${family}`)!, input = structuredClone(c.input); input.settings.contextBudget = budget;
  const prior = priorBudgetContext(input), current = compileGameContext(input), hints = budgetHints(current.text);
  if (current.text !== prior.text) {
    expect(current.report.total).toBeLessThanOrEqual(budget);
    for (const fact of c.wanted) { const h = hints.find(h => h.text === fact.text)!; expect(h).toBeDefined(); expect(h.sourceQuote ?? h.text).toBe(fact.quote); }
  } else expect(current).toEqual(prior);
});
for (const mode of ['restart', 'no-roles', 'no-episodes', 'edited-repeat', 'personal', 'deictic', 'ambiguous-name', 'four-actions', 'quoted', 'negative', 'owner', 'reference-only'] as const) it(`adaptive admission leaves source/reference protection intact: ${mode}`, () => {
  const c = budgetWorld('en'); c.input.draft = c.dual;
  if (mode === 'restart') c.input.restart = true;
  if (mode === 'no-roles') c.input.story!.roleSeeds = [];
  if (mode === 'no-episodes') c.input.story!.episodeSources = [];
  // Earlier duplicate source identities are intentionally superseded; edit
  // the CURRENT source, not an irrelevant old copy of the same statement.
  if (mode === 'edited-repeat') c.discussions.at(-1)!.quote += ' Changed source.';
  if (mode === 'personal') c.input.draft = 'open the bronze door and take her key';
  if (mode === 'deictic') c.input.draft = 'open this door and take the azure key';
  if (mode === 'ambiguous-name') { c.input.entities!.forEach(e => e.aliases = ['Alex']); c.input.draft = 'Alex, open the bronze door and take the azure key'; }
  if (mode === 'four-actions') c.input.draft = c.triple + ' and read the diary';
  if (mode === 'quoted') c.input.draft = '"' + c.dual + '"';
  if (mode === 'negative') c.input.draft = 'open the bronze door and do not take the azure key';
  if (mode === 'owner') c.input.draft = 'Remind me what Taisia promised Roman about the bronze door';
  if (mode === 'reference-only') c.input.character = [c.base.world.id, c.base.binding.chatId, c.base.entities, undefined, [], [], '', '', false, true];
  expect(compileGameContext(c.input)).toEqual(priorBudgetContext(c.input));
});
it('internal feature gates preserve exact prior paths, not a partial adaptive bundle', () => {
  const c = budgetWorld('en'); c.input.draft = c.dual;
  for (const flag of ['sequencePriority', 'flexiblePriority', 'discussionPriority', 'topicAdmission', 'contentRelevance', 'actionBalance', 'compoundActionBalance'] as const) expect(compileGameContext(c.input, { [flag]: false })).toEqual(compileGameContext(c.input, { [flag]: false, budgetPriority: false }));
});
it('128-row decoder safety is a request guard, not an unlimited/canon or partial clipping operation', () => {
  const c = budgetWorld('en', 129, 1); c.input.draft = c.single; c.input.settings.contextBudget = 100000;
  expect(compileGameContext(c.input)).toEqual(priorBudgetContext(c.input));
});
it('exactly128 whole sources round-trip without a new eight-row retrieval ceiling', () => {
  const c = budgetWorld('en', 128, 1); c.input.draft = c.single; c.input.settings.contextBudget = 100000;
  const untouched = structuredClone(c.input), out = compileGameContext(c.input), hints = budgetHints(out.text);
  expect(hints).toHaveLength(128); expect(out.report.total).toBeLessThanOrEqual(out.report.limit);
  for (const fact of c.records) { const h = hints.find(h => h.text === fact.text)!; expect(h).toBeDefined(); expect(h.sourceQuote ?? h.text).toBe(fact.quote); expect(h.task).toEqual(fact.task); expect(h.claim).toEqual(fact.claim); expect(h.episodeSource?.revisionId).toBeTruthy(); }
  expect(c.input).toEqual(untouched);
});
it('mandatory author lore is paid for and never trimmed to admit a larger source bundle', () => {
  const c = budgetWorld('en'); c.input.draft = c.dual; c.input.settings.contextBudget = 2000;
  const entry = { ...c.base.entry, activation: 'always' as const, content: 'The author prohibits opening sealed storage without two witnesses. '.repeat(200) };
  c.input.entries = [entry]; const prior = priorBudgetContext(c.input), out = compileGameContext(c.input);
  expect(out).toEqual(prior); expect(out.text).toContain(entry.content); expect(out.report.required).toBeGreaterThan(out.report.limit);
});
it('an unrelated substantive prior anchor survives the full new bundle', () => {
  const c = budgetWorld('en', 12, 1); c.input.draft = 'I ' + c.single;
  c.input.story!.facts = [...c.records, ...c.discussions, c.unrelated]; c.input.recentMessages = [c.unrelated.text];
  const fact = c.records[3]!;
  c.seeds[3] = roleSeed(fact, { version: 1, sourceRevisionId: c.sources[3]!, quote: fact.quote, roles: { promisor: { id: c.A.id, name: c.A.name }, recipient: { id: c.B.id, name: c.B.name } } });
  c.input.scene!.focusIds = [c.A.id, c.B.id];
  const old = budgetHints(priorBudgetContext(c.input).text), now = budgetHints(compileGameContext(c.input).text);
  expect(old.some(h => h.text === c.unrelated.text)).toBe(true);
  for (const h of old.filter(h => !c.discussions.some(f => f.text === h.text))) expect(now).toContainEqual(h);
  expect(c.records.every(f => now.some(h => h.text === f.text))).toBe(true);
});
it('one large whole quote blocks the entire new reservation, with no clipped source or changed counters', () => {
  const c = budgetWorld('en'); c.input.draft = c.dual; const fact = c.records[0]!;
  fact.quote += ' Inspection permission is not access permission.'.repeat(42);
  expect(fact.quote.length).toBeLessThanOrEqual(2400);
  c.seeds[0] = roleSeed(fact, { version: 1, sourceRevisionId: c.sources[0]!, quote: fact.quote, roles: {} });
  // First prove that the exact source is eligible; then budget alone blocks
  // admission. An invalid oversized binding would test a different guard.
  expect(c.records.every(f => budgetHints(compileGameContext(c.input).text).some(h => h.text === f.text))).toBe(true);
  c.input.settings.contextBudget = 2000;
  expect(compileGameContext(c.input)).toEqual(priorBudgetContext(c.input));
  expect(storyFactIdentity(fact)).toBe(c.seeds[0]!.key);
});
it('source/gold/protocol and historical compiler fingerprints are fixed before comparison', () => {
  const r = JSON.parse(readFileSync('scripts/story-search-budget-bound-registration.json', 'utf8'));
  const initial = JSON.parse(readFileSync('scripts/story-search-budget-registration.json', 'utf8'));
  const previous = JSON.parse(readFileSync('scripts/story-search-budget-corrected-registration.json', 'utf8'));
  expect(r.initialProtocolDigest).toBe(digest(initial));
  expect(r.previousProtocolDigest).toBe(digest(previous));
  expect(digest(readFileSync('docs/benchmarks/rp273b-algorithm.txt', 'utf8').replace(/\r\n/g, '\n'))).toBe(previous.algorithmDigest);
  expect(digest(readFileSync('docs/benchmarks/rp273-initial-algorithm.txt', 'utf8').replace(/\r\n/g, '\n'))).toBe(initial.algorithmDigest);
  expect(digest(readFileSync('docs/benchmarks/rp273-initial-compiler.txt', 'utf8').replace(/\r?\n/g, '\r\n'))).toBe(initial.compilerDigest);
  expect(r.inputDigest).toBe(frozen.inputDigest); expect(r.goldDigest).toBe(frozen.goldDigest);
   // RP274 adds only a diagnostic side channel. Preserve the exact RP273
   // registered compiler; its frozen output/baseline assertions above remain.
   for (const [path, key] of [['src/core/story-budget-priority.ts', 'algorithmDigest'], ['docs/benchmarks/rp273-final-compiler.txt', 'compilerDigest'], ['tests/fixtures/story-budget-priority.ts', 'fixtureDigest'], ['scripts/story-search-budget-bound-benchmark.mjs', 'benchmarkDigest']]) expect(digest(readFileSync(path!, 'utf8'))).toBe(r[key!]);
  const report = JSON.parse(readFileSync('docs/benchmarks/rp273c-budget-results.json', 'utf8'));
  expect(report.registration).toEqual(r); expect(report.rows).toHaveLength(64); expect(report.budgets).toHaveLength(320);
  expect(report.rows.every((r:any) => !r.controlDrift && !r.substantiveLoss.length && (!r.positive || r.complete))).toBe(true);
  expect(report.budgets.every((r:any) => r.sourceExact && r.budget && r.atomic)).toBe(true);
});
it('unproved discussion is not declared empty or inflated into a long new block', () => {
  const c = budgetWorld('en'); c.input.draft = c.dual;
  const fact = c.records[0]!; fact.text = fact.quote = 'The bronze door was discussed again; no outcome was recorded.';
  c.seeds[0] = roleSeed(fact, { version: 1, sourceRevisionId: c.sources[0]!, quote: fact.quote, roles: {} });
  expect(compileGameContext(c.input)).toEqual(priorBudgetContext(c.input));
});
