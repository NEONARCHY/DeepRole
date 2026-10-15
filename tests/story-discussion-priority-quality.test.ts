// @vitest-environment node
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { discussionScenarios, discussionCase, priorDiscussionContext } from './fixtures/story-discussion-priority';
import { compileGameContext } from '../src/core/game-context';
import { decodeStoryMemory } from '../src/core/story-memory-transport';
import { digest } from '../scripts/story-search-evaluation.mjs';
import frozen from './fixtures/story-discussion-priority-baseline.json';
import registration from '../scripts/story-search-priority-corrected-registration.json';
import initial from '../scripts/story-search-priority-registration.json';
const scenarios = discussionScenarios(), cases: ReturnType<typeof discussionCase>[] = [];
const report = JSON.parse(readFileSync('docs/benchmarks/rp270b-priority-results.json', 'utf8'));
const selected = (text: string) => { const block = text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0]; return block ? decodeStoryMemory(JSON.parse(block.split('\n')[1]!)) : []; };
for (const c of scenarios) it(`RP270 registered data/prior selection and actual runtime: ${c.name}`, () => {
  const before = structuredClone(c.input), data = discussionCase(c), snapshot = frozen.cases.find(r => r.id === c.name)!;
  cases.push(data); expect(data).toEqual(snapshot);
  const old = priorDiscussionContext(c.input), now = compileGameContext(c.input, { budgetPriority: false }), hints = selected(now.text), row = report.rows.find((r: any) => r.id === c.name)!;
  if (!data.gold.length) expect(now).toEqual(old);
  if (row.reason !== 'exact-prior-selection') for (const fact of c.wanted) {
    const hint = hints.find(h => h.text === fact.text)!; expect(hint).toBeDefined(); expect(hint.sourceQuote ?? hint.text).toBe(fact.quote); expect(hint.task).toEqual(fact.task); expect(hint.claim).toEqual(fact.claim);
  }
  expect(hints.length).toBeLessThanOrEqual(8); expect(now.report.total).toBeLessThanOrEqual(c.input.settings.contextBudget);
  expect(c.input).toEqual(before);
});
it('initial labels/baseline remain exact; mechanical punctuation amendment has its own pre-comparison registration', () => {
  expect(cases).toHaveLength(96); expect(digest(cases.map(({ gold, ...rest }) => rest))).toBe(frozen.inputDigest); expect(digest(cases.map(c => [c.id, c.gold]))).toBe(frozen.goldDigest);
  expect(registration.inputDigest).toBe(initial.inputDigest); expect(registration.goldDigest).toBe(initial.goldDigest);
  expect(digest(readFileSync('docs/benchmarks/rp270-initial-algorithm.txt', 'utf8'))).toBe(initial.algorithmDigest);
  expect(digest(readFileSync('src/core/story-discussion-priority.ts', 'utf8'))).toBe(registration.algorithmDigest);
  expect(digest(readFileSync('tests/fixtures/story-discussion-priority.ts', 'utf8'))).toBe(registration.fixtureDigest);
  expect(digest(readFileSync('tests/fixtures/story-discussion-priority-evaluation.ts', 'utf8'))).toBe(registration.evaluationDigest);
  expect(digest(readFileSync('scripts/story-search-priority-corrected-benchmark.mjs', 'utf8'))).toBe(registration.benchmarkDigest);
  expect(digest(initial)).toBe(registration.initialProtocolDigest); expect(report.registration).toEqual(registration);
  expect(report.groups.map((g: any) => [g.baselineComplete, g.candidateComplete])).toEqual([[16, 22], [8, 11]]);
  expect(report.rows.every((r: any) => !r.controlDrift && !r.substantiveLoss.length && !r.lostLexicalGold.length)).toBe(true);
});
