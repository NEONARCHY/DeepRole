// @vitest-environment node
import { it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ensureModel, encodeLocal, verifyModelFile, modelPlan } from '../scripts/story-search-local-model.mjs';
import { prepareEvaluation } from '../scripts/story-search-evaluation.mjs';

it('pins only five required model files; verifies size and SHA256/Git identity', () => {
  expect(modelPlan.files).toHaveLength(5); expect(modelPlan.files.reduce((s, f) => s + f.bytes, 0)).toBe(135392183);
  const data = Buffer.from('synthetic'), sha256 = createHash('sha256').update(data).digest('hex');
  const gitBlob = createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${data.length}\0`), data])).digest('hex');
  for (const checksum of [{ sha256 }, { gitBlob }]) expect(() => verifyModelFile({ name: 'unit', bytes: data.length, ...checksum }, data)).not.toThrow();
  expect(() => verifyModelFile({ name: 'unit', bytes: 1, sha256 }, data)).toThrow('size mismatch');
  expect(() => verifyModelFile({ name: 'unit', bytes: data.length, sha256: 'wrong' }, data)).toThrow('integrity mismatch');
});

it('a missing local model fails without attempting a network request', async () => {
  const fetcher = vi.fn(), root = await mkdtemp(join(tmpdir(), 'deeprole-rp263-'));
  try { await expect(ensureModel(root, { fetcher })).rejects.toThrow('Nothing downloaded'); expect(fetcher).not.toHaveBeenCalled(); }
  finally { if (!resolve(root).startsWith(resolve(tmpdir()) + '\\deeprole-rp263-') && !resolve(root).startsWith(resolve(tmpdir()) + '/deeprole-rp263-')) throw new Error('Unexpected test directory'); await rm(root, { recursive: true, force: true }); }
});

it('rejects an incompatible cached model instead of silently recomputing/downloading', async () => {
  const root = await mkdtemp(join(tmpdir(), 'deeprole-rp263-')), cache = join(root, 'vectors.json');
  const w = prepareEvaluation([{ id: 'unit', query: 'synthetic', split: 'test', family: 'test', intent: 'test', documents: [{ id: 'a', text: 'synthetic', source: 'current' }], lexical: ['a'], baseline: ['a'], gold: ['a'], protected: false }]);
  try {
    await writeFile(cache, JSON.stringify({ version: 1, inputDigest: w.inputDigest, model: { id: 'wrong', revision: 'test', dtype: 'q8', pooling: 'mean', dimensions: 2 }, entries: w.inputs.map(i => ({ key: i.key, vector: [1, 0] })) }));
    await expect(encodeLocal(w, { cache })).rejects.toThrow('Cache model differs');
    await writeFile(cache, JSON.stringify({ version: 1, inputDigest: 'old' }));
    await expect(encodeLocal(w, { cache })).rejects.toThrow('stale embedding');
  } finally { if (!resolve(root).startsWith(resolve(tmpdir()) + '\\deeprole-rp263-') && !resolve(root).startsWith(resolve(tmpdir()) + '/deeprole-rp263-')) throw new Error('Unexpected test directory'); await rm(root, { recursive: true, force: true }); }
});
