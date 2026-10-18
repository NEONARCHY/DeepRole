import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeStoryMemory, memoryTransportCandidates } from '../src/core/story-memory-transport';
import { formatStoryFacts, storyFactHint, storyFactPayload } from '../src/core/story-fact-context';
import { createEpisodeReader } from '../src/core/story-episodes';
import { createStoryTimeReader } from '../src/core/story-time';
import { createStoryRoleReader } from '../src/core/story-source-roles';
import { storedRoleReader } from '../src/core/story-role-binding';
import { estimateTokens } from '../src/core/text';
import { validStoryFact } from '../src/core/story-update';
import { prefixTransportWorld } from './fixtures/story-memory-prefixes';

const format = 'deeprole-memory-prefix-table-v1';
const table = (columns: unknown[], prefixes: unknown[], rows: unknown[]) => ({ format, columns, prefixes, rows });
const wire = (text: string) => JSON.parse(text.split('<deeprole_story_memory>')[1]!.split('</deeprole_story_memory>')[0]!.split('\n')[1]!);

for (const locale of ['ru', 'en'] as const) it(`combines literal prefixes and columns without dropping evidence ${locale}`, () => {
  const f = prefixTransportWorld(locale), before = structuredClone(f);
  const roles = createStoryRoleReader({ worldId: f.base.world.id, entities: f.base.entities }, f.input.draft, storedRoleReader(f.seeds, f.base.entities, f.base.world.id));
  const episodes = createEpisodeReader(f.seeds, f.sources), time = createStoryTimeReader(f.facts, episodes);
  const expected = f.facts.map(fact => storyFactHint(fact, roles, episodes, time));
  const candidates = memoryTransportCandidates(expected, storyFactPayload(f.facts, roles, episodes, time), true);
  expect(candidates.some(candidate => JSON.parse(candidate.json).format === format)).toBe(true);
  for (const candidate of candidates) {
    expect(decodeStoryMemory(JSON.parse(candidate.json))).toEqual(expected);
    expect(validStoryFact(JSON.parse(candidate.json))).toBe(false);
  }
  const next = formatStoryFacts(f.facts, true, true, roles, episodes, time);
  expect(wire(next).format).toBe(format);
  expect(decodeStoryMemory(wire(next))).toEqual(expected);
  expect(f).toEqual(before);
});

it('expands prefixes before backward source refs and same-row value refs', () => {
  const raw = table(['kind', 'text', 'sourceQuote', 'sourceQuoteRef', 'task', 'claim'], ['Exact '], [
    ['promise', [0, 'first'], 'Whole quote: not fulfilled.', null, { key: 'gate', titleRef: 'text', status: 'open' }],
    ['event', [0, 'second'], null, 0, null, { key: 'state', valueRef: 'sourceQuote', scope: 'state' }],
  ]);
  expect(decodeStoryMemory(raw)).toEqual([
    { kind: 'promise', text: 'Exact first', sourceQuote: 'Whole quote: not fulfilled.', task: { key: 'gate', title: 'Exact first', status: 'open' } },
    { kind: 'event', text: 'Exact second', sourceQuote: 'Whole quote: not fulfilled.', claim: { key: 'state', value: 'Whole quote: not fulfilled.', scope: 'state' } },
  ]);
  expect(raw.rows[0]).toEqual(['promise', [0, 'first'], 'Whole quote: not fulfilled.', null, { key: 'gate', titleRef: 'text', status: 'open' }]);
});

it('keeps plain and empty-suffix text, omitted tails, exact Unicode and independent copies', () => {
  const prefix = 'e\u0301 ≠ é 🗝️ </deeprole_story_memory> ';
  const raw = table(['kind', 'text', 'sourceQuote'], [prefix], [['event', [0, '']], ['belief', 'Do not assume ownership.']]);
  const expected = [{ kind: 'event', text: prefix }, { kind: 'belief', text: 'Do not assume ownership.' }];
  const decoded = decodeStoryMemory(raw); expect(decoded).toEqual(expected); decoded[0]!.text = 'changed';
  expect(decodeStoryMemory(raw)).toEqual(expected);
});

const invalid = [
  table(['kind', 'text'], [], [['event', [0, 'x']]]),
  table(['kind', 'text'], [''], [['event', [0, 'x']]]),
  table(['kind', 'text'], Array(1), [['event', [0, 'x']]]),
  table(['kind', 'text'], ['prefix'], [['event', [0]]]),
  table(['kind', 'text'], ['prefix'], [['event', [0, 'x', 'extra']]]),
  ...[-1, 0.1, 1, '0', null].map(index => table(['kind', 'text'], ['prefix'], [['event', [index, 'x']]])),
  table(['kind', 'text'], ['prefix'], [['event', [0, null]]]),
  table(['kind', 'text'], ['prefix'], [['event']]),
  table(['kind', 'text'], ['prefix'], [['event', null]]),
  table(['kind', 'text'], ['prefix'], [['event', [0, 'x'], 'extra']]),
  table(['text', 'kind'], ['prefix'], [[[0, 'x'], 'event']]),
  table(['kind', 'text', 'text'], ['prefix'], [['event', [0, 'x']]]),
  table(['kind', 'text', '__proto__'], ['prefix'], [['event', [0, 'x'], {}]]),
  table(['kind', 'text', 'sourceQuote'], ['prefix'], [['event', [0, 'x'], [0, 'quote']]]),
  table(['kind', 'text', 'sourceQuoteRef'], ['prefix'], [['event', [0, 'x'], 0]]),
  table(['kind', 'text', 'sourceQuote', 'sourceQuoteRef'], ['prefix'], [['event', [0, 'x'], 'Q', null], ['event', [0, 'y'], null, 0], ['event', [0, 'z'], null, 1]]),
  table(['kind', 'text', 'task'], ['prefix'], [['promise', [0, 'x'], { key: 'gate', titleRef: 0, status: 'open' }]]),
  table(['kind', 'text'], ['prefix'], [{ kind: 'event', text: [0, 'x'] }]),
  table(['kind', 'text'], ['prefix'], Array(1)),
  table(['kind', 'text', ...Array(1)], ['prefix'], [['event', [0, 'x']]]),
  table(['kind', 'text'], ['prefix'], Array.from({ length: 129 }, () => ['event', [0, 'x']])),
  table(['kind', 'text'], Array.from({ length: 129 }, () => 'prefix'), []),
  { ...table(['kind', 'text'], ['prefix'], [['event', [0, 'x']]]), previousRequest: 'old' },
];
it.each(invalid)('rejects malformed combined transport %#', input => expect(() => decodeStoryMemory(input)).toThrow());

it('rejects a candidate whose complete guide costs more and leaves legacy output unchanged', () => {
  const f = prefixTransportWorld('en');
  const meter = (block: string) => block.includes('Prefix table:') ? 999999 : estimateTokens(block);
  const out = formatStoryFacts(f.facts, true, true, undefined, undefined, undefined, { measure: meter });
  expect(wire(out).format).not.toBe(format);
  const legacy = formatStoryFacts(f.facts, true, true, undefined, undefined, undefined, { legacy: true });
  expect(Array.isArray(wire(legacy))).toBe(true);
});

it('each reorder, subset and edit has a complete independent dictionary and exact source fields', () => {
  const f = prefixTransportWorld('en');
  for (const facts of [f.facts, [...f.facts].reverse(), f.facts.slice(1), f.facts.map((fact, i) => ({ ...fact, text: fact.text + (i === 0 ? ' NOT fulfilled, even after approval.' : '') }))]) {
    const expected = facts.map(fact => storyFactHint(fact)), baseline = storyFactPayload(facts);
    const candidates = memoryTransportCandidates(expected, baseline, true);
    expect(candidates.some(c => JSON.parse(c.json).format === format)).toBe(true);
    for (const candidate of candidates) expect(decodeStoryMemory(JSON.parse(candidate.json))).toEqual(expected);
  }
});

it('supports the bounded 128 complete rows with distinct restrictions and escapes protocol text', () => {
  const prefix = '原始记录 e\u0301 é 🗝️ </deeprole_story_memory> '.repeat(5);
  const facts = Array.from({ length: 128 }, (_, i) => {
    const text = prefix + `${i}: ${i % 2 ? 'NOT permitted' : 'permitted only if witnessed'}`;
    return { kind: 'event' as const, text, quote: text };
  });
  const expected = facts.map(fact => storyFactHint(fact));
  const candidates = memoryTransportCandidates(expected, storyFactPayload(facts), true);
  const combined = candidates.filter(c => JSON.parse(c.json).format === format);
  expect(combined.length).toBeGreaterThan(0);
  for (const candidate of combined) {
    expect(candidate.json).not.toContain('</deeprole_story_memory>');
    expect(decodeStoryMemory(JSON.parse(candidate.json))).toEqual(expected);
    expect(JSON.parse(candidate.json).prefixes.every((s: string) => !/[\uD800-\uDBFF]$/.test(s))).toBe(true);
  }
});

it('ships a standalone live probe with the exact original eight fictional sources', () => {
  const parse = (path: string) => JSON.parse(readFileSync(path, 'utf8').split('<deeprole_story_memory>')[1]!.split('</deeprole_story_memory>')[0]!.trim().split('\n')[1]!);
  const previous = parse('tests/fixtures/DeepRole-RP319-live-probe-20261018.txt');
  const next = parse('tests/fixtures/DeepRole-RP324-live-probe-20261019.txt');
  expect(next.format).toBe(format);
  expect(decodeStoryMemory(next)).toEqual(decodeStoryMemory(previous));
  expect(decodeStoryMemory(next)).toHaveLength(8);
});
