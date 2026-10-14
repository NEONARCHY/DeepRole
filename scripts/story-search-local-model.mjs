import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { validateVectors } from './story-search-evaluation.mjs';

export const modelPlan = JSON.parse(await readFile(new URL('./story-search-model.json', import.meta.url), 'utf8'));
const identity = () => Object.fromEntries(['id', 'revision', 'dtype', 'pooling', 'dimensions'].map(k => [k, modelPlan[k]]));
const hash = (algorithm, data) => createHash(algorithm).update(data).digest('hex');
export function verifyModelFile(file, data) {
  if (data.length !== file.bytes) throw new Error('Model file size mismatch: ' + file.name);
  const actual = file.sha256 ? hash('sha256', data) : hash('sha1', Buffer.concat([Buffer.from(`blob ${data.length}\0`), data]));
  if (actual !== (file.sha256 ?? file.gitBlob)) throw new Error('Model file integrity mismatch: ' + file.name);
}

/** Only an explicit downloadModel flag permits these five pinned public files.
 * Inference itself always runs with remote loading disabled. Never reads lore. */
export async function ensureModel(directory, { downloadModel = false, fetcher = fetch } = {}) {
  const root = resolve(directory, modelPlan.id);
  for (const f of modelPlan.files) {
    const target = resolve(root, f.name);
    try { const data = await readFile(target); verifyModelFile(f, data); continue; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!downloadModel) throw new Error('Local model missing: ' + f.name + '. Nothing downloaded; use the documented explicit download step.');
    const response = await fetcher(`https://huggingface.co/${modelPlan.id}/resolve/${modelPlan.revision}/${f.name}`);
    if (!response.ok) throw new Error(`Model download HTTP ${response.status}: ${f.name}`);
    const data = Buffer.from(await response.arrayBuffer()); verifyModelFile(f, data);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target + '.part', data); await rename(target + '.part', target);
  }
  return root;
}

export async function encodeLocal(workload, { runtime, modelDirectory, cache, downloadModel = false, log = () => {} }) {
  if (cache) {
    try {
      const start = performance.now(), artifact = JSON.parse(await readFile(cache, 'utf8'));
      validateVectors(workload, artifact);
      if (JSON.stringify(artifact.model) !== JSON.stringify(identity())) throw new Error('Cache model differs from pinned manifest');
      return { artifact, timing: { cacheHit: true, cacheReadMs: performance.now() - start, encoded: 0 } };
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  if (!runtime || !modelDirectory) throw new Error('An explicit optional Node runtime path and local model directory are required.');
  await ensureModel(modelDirectory, { downloadModel });
  const loadStart = performance.now(), { env, pipeline } = await import(pathToFileURL(resolve(runtime)).href);
  env.allowRemoteModels = false; env.allowLocalModels = true; env.useBrowserCache = false; env.useFSCache = false;
  env.localModelPath = resolve(modelDirectory).replaceAll('\\', '/') + '/';
  const extractor = await pipeline('feature-extraction', modelPlan.id, { device: 'cpu', dtype: modelPlan.dtype, local_files_only: true,
    session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 } });
  const loadMs = performance.now() - loadStart, entries = [], durations = [];
  let maxTokens = 0;
  try {
    for (const [index, input] of workload.inputs.entries()) {
      // Fail explicitly instead of quietly chopping off a source condition.
      const tokens = extractor.tokenizer(input.text, { truncation: false }).input_ids.dims.at(-1);
      maxTokens = Math.max(maxTokens, tokens);
      if (tokens > modelPlan.maxTokens) throw new Error('Benchmark input exceeds model token limit: ' + input.key);
      const start = performance.now(), output = await extractor(input.text, { pooling: modelPlan.pooling, normalize: true });
      durations.push(performance.now() - start);
      entries.push({ key: input.key, vector: Array.from(output.data) });
      if ((index + 1) % 32 === 0) log(`Encoded ${index + 1}/${workload.inputs.length}`);
    }
  } finally { await extractor.dispose(); }
  const artifact = { version: 1, inputDigest: workload.inputDigest, model: identity(), entries };
  validateVectors(workload, artifact);
  if (cache) { await mkdir(dirname(resolve(cache)), { recursive: true }); await writeFile(cache, JSON.stringify(artifact)); }
  const sorted = [...durations].sort((a, b) => a - b);
  return { artifact, timing: { cacheHit: false, loadMs, encoded: entries.length, encodeTotalMs: durations.reduce((s, n) => s + n, 0),
    medianInputMs: sorted[Math.floor(sorted.length / 2)], p95InputMs: sorted[Math.ceil(sorted.length * .95) - 1], maxTokens,
    modelBytes: modelPlan.files.reduce((sum, f) => sum + f.bytes, 0), node: process.version, platform: process.platform, arch: process.arch } };
}
