import { expect, it } from 'vitest';
import { addedContextTokens, compileGameContext } from '../src/core/game-context';
import { decodeStoryMemory } from '../src/core/story-memory-transport';
import { longHorizonScenarios } from './fixtures/story-rp05-long-horizon';

// Reuse the registered RP323 inputs/gold unchanged. Compare only the new wire
// encoding with the prior encoding, NOT with a weakened retrieval baseline.
// content.tsx supplies memoryTransport:'columns' for actual chat requests.
const runtimeOptions = { memoryTransport: 'columns' } as const;
const decode = (text: string) => {
  const block = text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];
  return block ? decodeStoryMemory(JSON.parse(block.split('\n')[1]!)) : [];
};
const results: Array<{ id: string; oldChars: number; chars: number; oldTokens: number; tokens: number; rows: number; combined: boolean }> = [];
for (const locale of ['ru', 'en'] as const) for (const repeats of [0, 80, 400]) for (const budget of [6000, 10000]) for (const s of longHorizonScenarios(locale, repeats, budget)) it(`exact repeat packing ${s.id}`, () => {
  const before = structuredClone(s.input);
  const old = compileGameContext(s.input, { ...runtimeOptions, memoryPrefixTables: false }), next = compileGameContext(s.input, runtimeOptions);
  const oldHints = decode(old.text), hints = decode(next.text);
  expect(hints).toEqual(oldHints);
  expect(next.report.selected).toEqual(old.report.selected);
  expect(next.report.omitted).toEqual(old.report.omitted);
  expect(next.report.explanation).toEqual(old.report.explanation);
  expect(next.report.total).toBe(addedContextTokens(next.text));
  expect(next.report.total).toBeLessThanOrEqual(old.report.total);
  expect(next.text.length).toBeLessThanOrEqual(old.text.length);
  expect(next.report.total).toBeLessThanOrEqual(budget);
  const labels = hints.map(hint => s.labels[s.facts.findIndex(fact => fact.text === hint.text)]);
  for (const wanted of s.wanted) expect(labels).toContain(wanted);
  expect(s.input).toEqual(before);
  results.push({ id: s.id, oldChars: old.text.length, chars: next.text.length, oldTokens: old.report.total, tokens: next.report.total, rows: hints.length, combined: next.text.includes('deeprole-memory-prefix-table-v1') });
});

for (const locale of ['ru', 'en'] as const) for (const budget of [1200, 1800, 2400]) for (const s of longHorizonScenarios(locale, 400, budget).filter(s => s.id.endsWith('open-with-partial-progress'))) it(`tight budget preserves complete prior selection ${s.id}`, () => {
  const old = compileGameContext(s.input, { ...runtimeOptions, memoryPrefixTables: false }), next = compileGameContext(s.input, runtimeOptions);
  expect(decode(next.text)).toEqual(decode(old.text));
  expect(next.report.selected).toEqual(old.report.selected);
  expect(next.report.total).toBeLessThanOrEqual(old.report.total);
  expect(next.report.total <= budget || next.report.required > budget).toBe(true);
});

for (const locale of ['ru', 'en'] as const) it(`discussion/quotes and OOC retain every previously selected source ${locale}`, () => {
  const s = longHorizonScenarios(locale, 400, 6000)[0]!;
  for (const draft of [s.input.draft, locale === 'ru' ? 'Какие разговоры повторялись? Приведи точные цитаты.' : 'Which conversations were repeated? Give the exact quotes.']) for (const readOnly of [false, true]) {
    const input = { ...s.input, draft, readOnly };
    const old = compileGameContext(input, { ...runtimeOptions, memoryPrefixTables: false }), next = compileGameContext(input, runtimeOptions);
    expect(decode(next.text)).toEqual(decode(old.text));
    expect(next.report.total).toBeLessThanOrEqual(old.report.total);
  }
});

it('reports complete prompt savings without claiming semantic deduplication or model recall', () => {
  expect(results).toHaveLength(144);
  const totals = results.reduce((a, r) => ({ oldChars: a.oldChars + r.oldChars, chars: a.chars + r.chars, oldTokens: a.oldTokens + r.oldTokens, tokens: a.tokens + r.tokens }), { oldChars: 0, chars: 0, oldTokens: 0, tokens: 0 });
  const improved = results.filter(r => r.combined);
  console.info('RP324-repeat-packing', JSON.stringify({ cases: results.length, improved: improved.length, ...totals, savings: totals.oldTokens - totals.tokens, examples: improved.filter(r => r.id.includes('/400/6000/')).slice(0, 3) }));
  expect(improved.length).toBeGreaterThan(0);
  expect(totals.tokens).toBeLessThan(totals.oldTokens);
});
