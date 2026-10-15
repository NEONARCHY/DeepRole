// @vitest-environment node
import { expect, it } from 'vitest';
import { groundingCandidates, type GroundingCase } from '../scripts/story-search-grounding.mjs';
import { uniqueTokens } from '../src/core/text';
const tokens = (value: string) => [...uniqueTokens(value)];
const source = 'original-selected-revision';
const played = (text: string): GroundingCase['documents'][number] => ({ id: 'played', text, source, fact: { kind: 'event', text, quote: text }, sourceVerified: true, roles: {}, identityStatus: 'unknown' });
function sample(query = 'What actually happened with the lantern?'): GroundingCase {
  const noise = Array.from({ length: 10 }, (_, i) => {
    const text = `They discussed the lantern, but performed no repairs. Conversation ${i}.`;
    return { ...played(text), id: 'noise-' + i };
  });
  const documents = [...noise, played('The lantern was repaired after the keeper gave permission.')];
  return { id: 'unit', split: 'unit', family: 'unit', intent: 'unit', query, documents, lexical: documents.map(d => d.id),
    baseline: noise.slice(0, 8).map(d => d.id), gold: ['played'], protected: false, mandatory: [], names: ['Selina', 'Orest'], currentSourceIds: [source] };
}
it('prioritizes literal whole direct source without converting a discussion into a repair or rewriting data', () => {
  const c = sample(), before = structuredClone(c), out = groundingCandidates(c, tokens);
  expect(out.priorities).toEqual(['played']); expect(out.ids[0]).toBe('played'); expect(out.ids).toHaveLength(8); expect(c).toEqual(before);
});
for (const text of [
  'The lantern was not repaired.', 'Was the lantern repaired?', 'The lantern would be repaired.',
  'The lantern was repaired if the keeper agreed.', 'The lantern was repaired in a dream.',
  'Selina said: “The lantern was repaired.”', 'They discussed how the lantern was repaired.',
  'Фонарь не починили.', 'Фонарь починили бы после согласия.', 'Фонарь починили? Это вопрос.',
  'Фонарь починили, если верить рассказу.', 'Селина сказала: «Фонарь починили».',
]) it(`does not promote this negative/question/reported/conditional source: ${text}`, () => {
  const c = sample(text.includes('Фонарь') ? 'Что действительно произошло с фонарём?' : undefined);
  c.documents[c.documents.length - 1] = played(text);
  const out = groundingCandidates(c, tokens); expect(out.ids).toEqual(c.baseline); expect(out.priorities).toEqual([]);
});
for (const field of ['kind', 'quote', 'source', 'sourceVerified'] as const) it(`summary/type or unproved ${field} cannot manufacture occurrence`, () => {
  const c = sample(), d = c.documents.at(-1)!;
  if (field === 'kind') d.fact.kind = 'plan';
  else if (field === 'quote') d.fact.quote = 'Selina said: “Maybe someone repaired the lantern.”';
  else if (field === 'source') d.source = 'foreign-branch';
  else d.sourceVerified = false;
  expect(groundingCandidates(c, tokens).ids).toEqual(c.baseline);
});
for (const query of [
  'What actually happened with the helicopter?', '“What actually happened with the lantern?”',
  'What actually happened with Selina?', 'What actually happened with the lantern and the scanner?',
  'What actually happened with her lantern?', 'Continue.',
]) it(`unsupported or unknown request retains exact order/membership: ${query}`, () => {
  const c = sample(query); expect(groundingCandidates(c, tokens).ids).toEqual(c.baseline);
});
it('gold/family/intent/opaque IDs are not candidate signals', () => {
  const c = sample(), old = groundingCandidates(c, tokens);
  expect(groundingCandidates({ ...c, gold: [], intent: 'control', family: 'unknown', id: 'different' }, tokens)).toEqual(old);
});
it('does not lose any previously compiled attributed proof just to free a place for an older event', () => {
  const c = sample(); c.mandatory = [...c.baseline];
  const out = groundingCandidates(c, tokens); expect(out.ids).toEqual(c.baseline); expect(out.reason).toBe('mandatory-union-overflow');
});
it('retains protected explicit ownership and ambiguous-identity selections exactly', () => {
  const c = sample(); c.protected = true; expect(groundingCandidates(c, tokens).ids).toEqual(c.baseline);
});
it('unproved original selection is not repaired by a matching later source', () => {
  const c = sample(); c.documents[0]!.sourceVerified = false; expect(groundingCandidates(c, tokens).ids).toEqual(c.baseline);
});
for (const status of ['open', 'completed', 'cancelled'] as const) it(`terminal-task priority preserves the actual status ${status}, not an inferred completion`, () => {
  const c = sample('Remind me about the completed duty concerning the lantern.'), d = c.documents.at(-1)!;
  d.fact.task = { key: 'literal-duty', title: 'Return the lantern', status };
  d.roles = { speaker: { id: 'person-original', name: 'Orest' } }; d.identityStatus = 'bound';
  const before = structuredClone(d);
  expect(groundingCandidates(c, tokens).priorities).toEqual(status === 'completed' ? ['played'] : []); expect(d).toEqual(before);
});
it('a replacement with the same name never inherits a task owner', () => {
  const c = sample('What promises concerned the lantern?'), d = c.documents.at(-1)!;
  d.fact.kind = 'promise'; d.fact.task = { key: 'literal-duty', title: 'Work on the lantern', status: 'open' };
  d.roles = { promisor: { id: 'old-person', name: 'Selina', unavailable: true } }; d.identityStatus = 'bound';
  expect(groundingCandidates(c, tokens).ids).toEqual(c.baseline);
});
it('foreign/duplicate mandatory and duplicate/missing candidates fail explicitly', () => {
  const c = sample();
  expect(() => groundingCandidates({ ...c, mandatory: ['foreign'] }, tokens)).toThrow('contract');
  expect(() => groundingCandidates({ ...c, mandatory: [c.baseline[0]!, c.baseline[0]!] }, tokens)).toThrow('contract');
  expect(() => groundingCandidates({ ...c, lexical: c.lexical.slice(1) }, tokens)).toThrow('contract');
  expect(() => groundingCandidates({ ...c, documents: [...c.documents, c.documents[0]!] }, tokens)).toThrow('contract');
});
