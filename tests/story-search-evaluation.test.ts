// @vitest-environment node
import { expect, it } from 'vitest';
import { digest, prepareEvaluation, validateVectors, fuseRanks, evaluateCandidates } from '../scripts/story-search-evaluation.mjs';
import type { EvaluationCase, VectorArtifact } from '../scripts/story-search-evaluation.mjs';

const row = (patch: Partial<EvaluationCase> = {}): EvaluationCase => ({ id: 'unit', split: 'synthetic', family: 'math', intent: 'explicit', query: 'camera',
  documents: [{ id: 'a', text: 'camera', source: 'current-a' }, { id: 'b', text: 'cloud', source: 'current-b' }], lexical: ['b', 'a'], baseline: ['b'], gold: ['a'], protected: false, ...patch });
const vectors = (w: ReturnType<typeof prepareEvaluation>): VectorArtifact => ({ version: 1, inputDigest: w.inputDigest,
  model: { id: 'unit-only-NOT-a-model', revision: 'test', dtype: 'float32', pooling: 'mean', dimensions: 2 },
  entries: w.inputs.map(i => ({ key: i.key, vector: i.text.endsWith('cloud') ? [0, 2] : [4, 0] })) });

it('deduplicates exact prefixed inputs; labels and source identifiers never enter encoder text', () => {
  const w = prepareEvaluation([row(), row({ id: 'second', gold: ['b'] })]);
  expect(w.inputs.map(i => i.text)).toEqual(['query: camera', 'passage: camera', 'passage: cloud']);
  expect(w.inputs.every(i => i.key === digest(i.text))).toBe(true);
  expect(w.inputs.some(i => /current-|gold|unit|second/.test(i.text))).toBe(false);
});

it('separates input identity from gold; catches changed current sources, requests and baseline', () => {
  const base = prepareEvaluation([row()]), gold = prepareEvaluation([row({ gold: ['b'] })]);
  expect(gold.inputDigest).toBe(base.inputDigest); expect(gold.goldDigest).not.toBe(base.goldDigest);
  for (const patch of [{ query: 'cloud' }, { baseline: ['a'] }, { documents: [{ id: 'a', text: 'camera', source: 'new-source' }, { id: 'b', text: 'cloud', source: 'current-b' }] }]) {
    expect(prepareEvaluation([row(patch)]).inputDigest).not.toBe(base.inputDigest);
  }
});

it.each(['query', 'source', 'lexical', 'baseline', 'gold', 'duplicate-case'] as const)('rejects malformed %s before encoding', field => {
  const c = row();
  if (field === 'query') c.query = ' ';
  if (field === 'source') c.documents[0]!.source = '';
  if (field === 'lexical') c.lexical = ['a'];
  if (field === 'baseline') c.baseline = ['foreign'];
  if (field === 'gold') c.gold = ['a', 'a'];
  expect(() => prepareEvaluation(field === 'duplicate-case' ? [c, c] : [c])).toThrow('story-search-prototype');
});

it.each(['stale', 'missing', 'duplicate', 'foreign', 'nan', 'infinity', 'zero', 'dimension', 'pooling', 'revision'] as const)('rejects %s vector artifact', failure => {
  const w = prepareEvaluation([row()]), a = vectors(w);
  if (failure === 'stale') a.inputDigest = 'old';
  if (failure === 'missing') a.entries.pop();
  if (failure === 'duplicate') a.entries[1]!.key = a.entries[0]!.key;
  if (failure === 'foreign') a.entries[0]!.key = 'foreign';
  if (failure === 'nan') a.entries[0]!.vector[0] = NaN;
  if (failure === 'infinity') a.entries[0]!.vector[0] = Infinity;
  if (failure === 'zero') a.entries[0]!.vector = [0, 0];
  if (failure === 'dimension') a.model.dimensions = 3;
  if (failure === 'pooling') a.model.pooling = 'cls';
  if (failure === 'revision') a.model.revision = '';
  expect(() => validateVectors(w, a)).toThrow('story-search-prototype');
});

it('normalizes vectors and uses fixed cosine/RRF, without claiming real-model quality', () => {
  const w = prepareEvaluation([row()]), a = vectors(w), before = structuredClone(a), out = evaluateCandidates(w, a);
  expect(validateVectors(w, a).get(w.cases[0]!.queryKey)).toEqual([1, 0]);
  expect(out.rows[0]!.selected).toEqual({ baseline: ['b'], dense: ['a', 'b'], hybrid: ['b', 'a'] });
  expect(out.rows[0]!.denseScores).toEqual([{ id: 'a', score: 1 }, { id: 'b', score: 0 }]);
  expect(out.rows[0]!.baseline.complete).toBe(false); expect(out.rows[0]!.hybrid.complete).toBe(true);
  expect(out.rows[0]!.hybrid.correctFirst).toBe(false); expect(out.scope).toContain('do NOT measure'); expect(a).toEqual(before);
});

it('keeps protected identity/owner selections exactly and records unknown-query drift', () => {
  const w = prepareEvaluation([row({ id: 'owner', protected: true }), row({ id: 'unknown', intent: 'control', gold: [] })]), out = evaluateCandidates(w, vectors(w));
  expect(out.rows[0]!.selected.hybrid).toEqual(['b']); expect(out.rows[1]!.controlDrift).toBe(true);
  expect(out.rows[1]!.hybrid.complete).toBe(false); expect(out.groups[1]!.controlDrift).toBe(1);
});

it('RRF breaks equal scores by original lexical rank and rejects incompatible membership/caps', () => {
  expect(fuseRanks(['b', 'a'], ['a', 'b'])).toEqual(['b', 'a']);
  expect(fuseRanks(['b', 'a'], ['a', 'b'], 1)).toEqual(['b']);
  for (const args of [[['a'], ['x']], [['a', 'a'], ['a', 'a']], [['a'], ['a'], 9]] as const) expect(() => fuseRanks([...args[0]], [...args[1]], args[2])).toThrow();
});
