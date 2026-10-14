import { readFile } from 'node:fs/promises';
import { digest, validateVectors } from './story-search-evaluation.mjs';
import { searchPolicy, evaluateDiversification } from './story-search-diversify.mjs';
export const evidencePolicy = JSON.parse(await readFile(new URL('./story-search-evidence-policy.json', import.meta.url), 'utf8'));
export const evidencePolicyDigest = digest(evidencePolicy);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

export function evidenceCandidates(c, vectors) {
  if (!Array.isArray(c.evidenceIds) || new Set(c.evidenceIds).size !== c.evidenceIds.length || c.evidenceIds.some(id => !c.baseline.includes(id))) throw new Error('Invalid mandatory baseline evidence');
  if (c.preserve || c.protected) return { ids: [...c.baseline], reason: 'preserved-current-selection' };
  if (c.evidenceIds.length >= searchPolicy.limit) return { ids: [...c.baseline], reason: 'mandatory-evidence-fills-cap-fallback' };
  const selected = [...new Set([...c.lexical.slice(0, searchPolicy.lexicalAnchors), ...c.evidenceIds])];
  if (selected.length > searchPolicy.limit) return { ids: [...c.baseline], reason: 'mandatory-union-overflow-fallback' };
  const byId = new Map(c.documents.map(d => [d.id, vectors.get(d.vectorKey)])), query = vectors.get(c.queryKey), order = new Map(c.lexical.map((id, i) => [id, i]));
  while (selected.length < Math.min(searchPolicy.limit, c.documents.length)) {
    const scores = c.lexical.filter(id => !selected.includes(id)).map(id => ({ id,
      score: searchPolicy.lambda * dot(query, byId.get(id)) - (1 - searchPolicy.lambda) * Math.max(...selected.map(s => dot(byId.get(s), byId.get(id)))) }))
      .sort((a, b) => b.score - a.score || order.get(a.id) - order.get(b.id));
    selected.push(scores[0].id);
  }
  if (!c.evidenceIds.every(id => selected.includes(id))) throw new Error('Mandatory evidence lost');
  return { ids: selected, reason: 'baseline-evidence-then-diverse' };
}

export function evaluateEvidence(workload, artifact) {
  const vectors = validateVectors(workload, artifact), original = evaluateDiversification(workload, artifact);
  const measure = (ids, gold) => ({ complete: !!gold.length && gold.every(id => ids.includes(id)), correctFirst: !!gold.length && gold.includes(ids[0]), missingGold: gold.filter(id => !ids.includes(id)).length });
  const rows = original.rows.map((r, i) => { const c = workload.cases[i], result = evidenceCandidates(c, vectors); return { ...r, unguarded: r.diverse, unguardedSelected: r.selected.diverse,
    diverse: measure(result.ids, c.gold), selected: { ...r.selected, diverse: result.ids }, reason: result.reason, evidenceIds: c.evidenceIds,
    allMandatoryRetained: c.evidenceIds.every(id => result.ids.includes(id)),
    controlDrift: !c.gold.length && JSON.stringify(result.ids) !== JSON.stringify(c.baseline),
    lostLexicalGold: c.gold.filter(id => r.selected.lexical.includes(id) && !result.ids.includes(id)), addedGold: c.gold.filter(id => !r.selected.lexical.includes(id) && result.ids.includes(id)) }; });
  const groups = original.groups.map(g => { const group = rows.filter(r => r.split === g.split && r.intent === g.intent); return { ...g,
    diverseComplete: group.filter(r => r.diverse.complete).length, unguardedComplete: group.filter(r => r.unguarded.complete).length,
    diverseWrongFirst: group.filter(r => r.goldCount && !r.diverse.correctFirst).length,
    lostLexicalGold: group.reduce((s, r) => s + r.lostLexicalGold.length, 0), addedGold: group.reduce((s, r) => s + r.addedGold.length, 0), controlDrift: group.filter(r => r.controlDrift).length,
    lostMandatoryEvidence: group.filter(r => !r.allMandatoryRetained).length }; });
  return { ...original, experiment: 'RP264B', evidencePolicy, evidencePolicyDigest, groups, rows,
    scope: 'Read-only baseline-evidence guard plus fixed anchored MMR. RP264 fresh40 is now development; second fresh24 is independent. Whole-prompt probes are separate.' };
}
