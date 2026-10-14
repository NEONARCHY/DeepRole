import { createHash } from 'node:crypto';

export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = message => { throw new Error('story-search-prototype: ' + message); };
const unique = values => new Set(values).size === values.length;

/** Experimental, read-only candidate comparison. No gameplay/compiler writes. */
export function prepareEvaluation(cases) {
  if (!Array.isArray(cases) || !cases.length || !unique(cases.map(c => c.id))) fail('invalid cases');
  const inputs = new Map();
  const add = text => { const key = digest(text); inputs.set(key, { key, text }); return key; };
  const prepared = cases.map(c => {
    if (!c.id || typeof c.query !== 'string' || !c.query.trim() || !Array.isArray(c.documents) || !c.documents.length) fail('invalid query/documents');
    const ids = c.documents.map(d => d.id);
    if (!unique(ids) || c.documents.some(d => !d.id || typeof d.text !== 'string' || !d.text.trim() || !d.source)) fail('invalid document source');
    for (const field of ['lexical', 'baseline', 'gold']) if (!Array.isArray(c[field]) || !unique(c[field]) || c[field].some(id => !ids.includes(id))) fail('foreign or duplicate ' + field);
    if (c.lexical.length !== ids.length || c.baseline.length > 8) fail('incomplete lexical ranking');
    return { ...structuredClone(c), queryKey: add('query: ' + c.query), documents: c.documents.map(d => ({ ...structuredClone(d), vectorKey: add('passage: ' + d.text) })) };
  });
  // Gold is never sent to an encoder. Cache identity covers the actual current
  // request/sources/lexical baseline, separately from the human-labelled gold.
  const publicCases = prepared.map(({ gold: _gold, ...rest }) => rest);
  return { version: 1, inputDigest: digest(publicCases), goldDigest: digest(prepared.map(c => [c.id, c.gold])), cases: prepared, inputs: [...inputs.values()] };
}

export function validateVectors(workload, artifact) {
  if (artifact?.version !== 1 || artifact.inputDigest !== workload.inputDigest) fail('stale embedding snapshot');
  const m = artifact.model;
  if (!m?.id || !m.revision || !m.dtype || m.pooling !== 'mean' || !Number.isInteger(m.dimensions) || m.dimensions < 1 || m.dimensions > 4096) fail('invalid model manifest');
  if (!Array.isArray(artifact.entries) || artifact.entries.length !== workload.inputs.length || !unique(artifact.entries.map(e => e.key))) fail('missing/duplicate vectors');
  const keys = new Set(workload.inputs.map(e => e.key)), vectors = new Map();
  for (const e of artifact.entries) {
    if (!keys.has(e.key) || !Array.isArray(e.vector) || e.vector.length !== m.dimensions || e.vector.some(v => typeof v !== 'number' || !Number.isFinite(v))) fail('invalid vector');
    const norm = Math.hypot(...e.vector); if (!norm || !Number.isFinite(norm)) fail('zero/invalid vector norm');
    vectors.set(e.key, e.vector.map(v => v / norm));
  }
  return vectors;
}

export function fuseRanks(lexical, dense, limit = 8) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 8 || !unique(lexical) || !unique(dense) || lexical.length !== dense.length || dense.some(id => !lexical.includes(id))) fail('incompatible rankings');
  const scores = new Map(lexical.map((id, rank) => [id, 1 / (60 + rank + 1)]));
  dense.forEach((id, rank) => scores.set(id, scores.get(id) + 1 / (60 + rank + 1)));
  const order = new Map(lexical.map((id, i) => [id, i]));
  return [...lexical].sort((a, b) => scores.get(b) - scores.get(a) || order.get(a) - order.get(b)).slice(0, limit);
}

export function evaluateCandidates(workload, artifact) {
  const vectors = validateVectors(workload, artifact);
  const rows = workload.cases.map(c => {
    const query = vectors.get(c.queryKey), order = new Map(c.lexical.map((id, i) => [id, i]));
    const dense = c.documents.map(d => ({ id: d.id, score: vectors.get(d.vectorKey).reduce((sum, v, i) => sum + v * query[i], 0) }))
      .sort((a, b) => b.score - a.score || order.get(a.id) - order.get(b.id));
    const denseIds = dense.map(d => d.id);
    // Current explicit owner requests and ambiguous identities keep the whole
    // existing compiled selection. Similarity never chooses an owner for them.
    const hybrid = c.protected ? [...c.baseline] : fuseRanks(c.lexical, denseIds);
    const measure = ids => ({ complete: !!c.gold.length && c.gold.every(id => ids.includes(id)), correctFirst: !!c.gold.length && c.gold.includes(ids[0]), missingGold: c.gold.filter(id => !ids.includes(id)).length });
    return { id: c.id, split: c.split, family: c.family, intent: c.intent, goldCount: c.gold.length, protected: !!c.protected,
      baseline: measure(c.baseline), lexical: measure(c.lexical.slice(0, 8)), dense: measure(denseIds.slice(0, 8)), hybrid: measure(hybrid),
      controlDrift: !c.gold.length && JSON.stringify(hybrid) !== JSON.stringify(c.baseline),
      selected: { baseline: c.baseline, dense: denseIds.slice(0, 8), hybrid }, denseScores: dense.slice(0, 8) };
  });
  const groups = [];
  for (const split of [...new Set(rows.map(r => r.split))]) for (const intent of [...new Set(rows.filter(r => r.split === split).map(r => r.intent))]) {
    const group = rows.filter(r => r.split === split && r.intent === intent);
    groups.push({ split, intent, cases: group.length, protected: group.filter(r => r.protected).length,
      baselineComplete: group.filter(r => r.baseline.complete).length, lexicalComplete: group.filter(r => r.lexical.complete).length, denseComplete: group.filter(r => r.dense.complete).length, hybridComplete: group.filter(r => r.hybrid.complete).length,
      baselineWrongFirst: group.filter(r => r.goldCount && !r.baseline.correctFirst).length, lexicalWrongFirst: group.filter(r => r.goldCount && !r.lexical.correctFirst).length, denseWrongFirst: group.filter(r => r.goldCount && !r.dense.correctFirst).length, hybridWrongFirst: group.filter(r => r.goldCount && !r.hybrid.correctFirst).length,
      baselineMissingGold: group.reduce((s, r) => s + r.baseline.missingGold, 0), lexicalMissingGold: group.reduce((s, r) => s + r.lexical.missingGold, 0), denseMissingGold: group.reduce((s, r) => s + r.dense.missingGold, 0), hybridMissingGold: group.reduce((s, r) => s + r.hybrid.missingGold, 0),
      controlDrift: group.filter(r => r.controlDrift).length });
  }
  return { version: 1, inputDigest: workload.inputDigest, goldDigest: workload.goldDigest, model: structuredClone(artifact.model),
    scope: 'Offline candidates only: dense/hybrid top8 do NOT measure complete compiled-prompt admission or live model quality.',
    groups, rows };
}
