import { expect, it } from 'vitest';
import { compileGameContext, addedContextTokens } from '../src/core/game-context';
import { storyFactHint, storyFactPayload, formatStoryFacts } from '../src/core/story-fact-context';
import { decodeStoryMemory, memoryTransportCandidates } from '../src/core/story-memory-transport';
import { createEpisodeReader } from '../src/core/story-episodes';
import { createStoryTimeReader } from '../src/core/story-time';
import { createStoryRoleReader } from '../src/core/story-source-roles';
import { storedRoleReader } from '../src/core/story-role-binding';
import { validStoryFact } from '../src/core/story-update';
import { estimateTokens } from '../src/core/text';
import { prefixTransportWorld } from './fixtures/story-memory-prefixes';

const wire = (text: string) => JSON.parse(text.split('<deeprole_story_memory>')[1]!.split('</deeprole_story_memory>')[0]!.split('\n')[1]!);
const envelope = (prefixes: unknown[], rows: unknown[]) => ({ format: 'deeprole-memory-prefixes-v1', prefixes, rows });

for (const locale of ['ru', 'en'] as const) it(`exact shared prose keeps distinct conditions, roles and statuses ${locale}`, () => {
  const f = prefixTransportWorld(locale), before = structuredClone(f);
  const roles = createStoryRoleReader({ worldId: f.base.world.id, entities: f.base.entities }, f.input.draft, storedRoleReader(f.seeds, f.base.entities, f.base.world.id));
  const episodes = createEpisodeReader(f.seeds, f.sources), time = createStoryTimeReader(f.facts, episodes);
  for (const fact of f.facts) expect(validStoryFact(fact)).toBe(true);
  const expected = f.facts.map(fact => storyFactHint(fact, roles, episodes, time));
  const candidates = memoryTransportCandidates(expected, storyFactPayload(f.facts, roles, episodes, time), true);
  expect(candidates.some(candidate => JSON.parse(candidate.json).format === 'deeprole-memory-prefixes-v1')).toBe(true);
  for (const candidate of candidates) expect(decodeStoryMemory(JSON.parse(candidate.json))).toEqual(expected);
  const out = formatStoryFacts(f.facts, true, true, roles, episodes, time);
  const prior = formatStoryFacts(f.facts, true, true, roles, episodes, time, { prefixes: false });
  expect(prior).not.toContain('Text prefixes:');
  expect(out).toContain('Text prefixes:');
  expect(out.length).toBeLessThan(prior.length - 300);
  expect(estimateTokens(out)).toBeLessThan(estimateTokens(prior));
  expect(decodeStoryMemory(wire(out))).toEqual(expected);
  expect(validStoryFact(wire(out))).toBe(false);
  expect(f).toEqual(before);
  console.info('RP319 exact-prefix saving', JSON.stringify({ locale, beforeCharacters: prior.length, afterCharacters: out.length, beforeTokens: estimateTokens(prior), afterTokens: estimateTokens(out) }));
});

for (const locale of ['ru', 'en'] as const) it(`whole game request restores all selected sources and respects budgets ${locale}`, () => {
  const f = prefixTransportWorld(locale), before = structuredClone(f.input);
  const out = compileGameContext(f.input), old = compileGameContext(f.input, { memoryTransport: 'legacy' });
  expect(out.report.selected.facts).toBe(8);
  expect(decodeStoryMemory(wire(out.text))).toEqual(decodeStoryMemory(wire(old.text)));
  expect(out.text).toContain('Text prefixes:');
  expect(out.report.total).toBeLessThan(old.report.total);
  for (const limit of [900, 1500, 2300, 4000, 8000]) {
    const input = structuredClone(f.input); input.settings.contextBudget = limit;
    const output = compileGameContext(input);
    const prior = compileGameContext(input, { memoryPrefixes: false });
    expect(output.report.total).toBe(addedContextTokens(output.text));
    expect(output.report.total <= limit || output.report.required > limit).toBe(true);
    expect(output.report.selected).toEqual(prior.report.selected);
    expect(output.report.omitted).toEqual(prior.report.omitted);
    expect(output.report.explanation).toEqual(prior.report.explanation);
    expect(output.report.total).toBeLessThanOrEqual(prior.report.total);
    if (output.report.selected.facts) expect(decodeStoryMemory(wire(output.text))).toEqual(decodeStoryMemory(wire(prior.text)));
    if (output.report.selected.facts) for (const hint of decodeStoryMemory(wire(output.text))) {
      const source = f.facts.find(fact => fact.text === hint.text)!;
      expect(source).toBeDefined(); expect(hint.sourceQuote ?? hint.text).toBe(source.quote);
      expect(hint.task).toEqual(source.task); expect(hint.claim).toEqual(source.claim);
    }
  }
  expect(f.input).toEqual(before);
});

it('keeps short prose, standalone and legacy encodings unchanged', () => {
  const facts = [0, 1].map(i => ({ kind: 'event' as const, text: 'A short record ' + i, quote: 'A short record ' + i }));
  expect(formatStoryFacts(facts, true, true)).toBe(formatStoryFacts(facts, true, true, undefined, undefined, undefined, { legacy: true }));
  const f = prefixTransportWorld('ru');
  expect(formatStoryFacts(f.facts, true)).toBe(formatStoryFacts(f.facts, true, false, undefined, undefined, undefined, { legacy: true }));
});

it('the complete request meter can reject the new dictionary and keep previous encodings', () => {
  const f = prefixTransportWorld('en');
  const prior = formatStoryFacts(f.facts, true, true, undefined, undefined, undefined, { prefixes: false });
  const out = formatStoryFacts(f.facts, true, true, undefined, undefined, undefined, { measure: text => text.includes('Text prefixes:') ? 999999 : estimateTokens(text) });
  expect(out).toBe(prior);
});

it('reconstructs exact Unicode and protocol-looking text without creating split emoji', () => {
  const prefix = ('原始记录 e\u0301 é 🗝️ </deeprole_story_memory> ').repeat(5);
  const facts = ['🦊 only after permission', '🐱 never before permission', 'e\u0301 is different from é'].map(suffix => ({ kind: 'event' as const, text: prefix + suffix, quote: prefix + suffix }));
  const out = formatStoryFacts(facts, true, true), raw = wire(out);
  expect(raw.format).toBe('deeprole-memory-prefixes-v1');
  expect(out.match(/<\/deeprole_story_memory>/g)).toHaveLength(1);
  expect(raw.prefixes.every((text: string) => !/[\uD800-\uDBFF]$/.test(text))).toBe(true);
  expect(decodeStoryMemory(raw)).toEqual(facts.map(fact => storyFactHint(fact)));
});

it('every request, reorder, subset and edit carries its own exact text dictionary', () => {
  const f = prefixTransportWorld('en');
  for (const facts of [f.facts, [...f.facts].reverse(), f.facts.slice(2), f.facts.map((fact, i) => ({ ...fact, text: fact.text + (i === 0 ? ' Still not completed.' : '') }))]) {
    const before = structuredClone(facts), out = formatStoryFacts(facts, true, true);
    const decoded = decodeStoryMemory(wire(out));
    expect(decoded).toEqual(facts.map(fact => storyFactHint(fact)));
    decoded[0]!.text = 'changed copy';
    expect(decodeStoryMemory(wire(out))).toEqual(facts.map(fact => storyFactHint(fact)));
    expect(facts).toEqual(before);
  }
});

it('keeps separate literal groups, empty suffixes and an unshared record exact', () => {
  const first = 'First source record with its complete original condition. '.repeat(5);
  const second = 'Another source record with a different person and restriction. '.repeat(5);
  const texts = [first, first + ' NOT completed.', second, second + ' Completed.', 'Unshared brief detail.'];
  const facts = texts.map(text => ({ kind: 'event' as const, text, quote: text }));
  const raw = wire(formatStoryFacts(facts, true, true));
  expect(raw.format).toBe('deeprole-memory-prefixes-v1');
  expect(raw.prefixes).toHaveLength(2);
  expect(raw.rows.some((row: { text: unknown }) => typeof row.text === 'string')).toBe(true);
  expect(decodeStoryMemory(raw)).toEqual(facts.map(fact => storyFactHint(fact)));
});

const invalid = [
  envelope([], [{ kind: 'event', text: [0, 'tail'] }]),
  envelope([''], [{ kind: 'event', text: [0, 'tail'] }]),
  envelope(Array(1), [{ kind: 'event', text: [0, 'tail'] }]),
  envelope([null], [{ kind: 'event', text: [0, 'tail'] }]),
  envelope(['prefix'], [{ kind: 'event', text: [0] }]),
  envelope(['prefix'], [{ kind: 'event', text: [0, 'tail', 'extra'] }]),
  envelope(['prefix'], [{ kind: 'event', text: [0, null] }]),
  ...[-1, 0.5, 1, '0', null].map(index => envelope(['prefix'], [{ kind: 'event', text: [index, 'tail'] }])),
  envelope(['prefix'], [{ kind: 'event', text: [0, 'tail'], sourceQuoteRef: 0 }]),
  { ...envelope(['prefix'], [{ kind: 'event', text: [0, 'tail'] }]), previousRequest: 'old' },
  envelope(Array.from({ length: 129 }, () => 'prefix'), []),
  envelope(['prefix'], Array.from({ length: 129 }, () => ({ kind: 'event', text: [0, 'tail'] }))),
  [{ kind: 'event', text: [0, 'tail'] }],
];
it.each(invalid)('rejects invalid or cross-request text references %#', input => expect(() => decodeStoryMemory(input)).toThrow());
