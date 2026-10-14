import { readFile } from 'node:fs/promises';
import { digest, validateVectors } from './story-search-evaluation.mjs';

export const searchPolicy = JSON.parse(await readFile(new URL('./story-search-policy.json', import.meta.url), 'utf8'));
export const policyDigest = digest(searchPolicy);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

/** Fixed read-only experiment. Gold/intent/split never participate in selection.
 * One unchanged lexical leader, then relevance minus similarity to prior picks.
 * Novelty only changes candidate order: no grouping/deletion/source identity. */
export function diversifiedCandidates(c, vectors) {
  if (c.preserve || c.protected) return { ids: [...c.baseline], reason: 'preserved-current-selection', similarities: [] };
  const byId = new Map(c.documents.map(d => [d.id, vectors.get(d.vectorKey)])), query = vectors.get(c.queryKey);
  const order = new Map(c.lexical.map((id, i) => [id, i])), selected = c.lexical.slice(0, searchPolicy.lexicalAnchors), similarities = [];
  while (selected.length < Math.min(searchPolicy.limit, c.documents.length)) {
    const rows = c.lexical.filter(id => !selected.includes(id)).map(id => {
      const relevance = dot(query, byId.get(id)), redundancy = Math.max(...selected.map(s => dot(byId.get(s), byId.get(id))));
      return { id, relevance, redundancy, score: searchPolicy.lambda * relevance - (1 - searchPolicy.lambda) * redundancy };
    }).sort((a, b) => b.score - a.score || order.get(a.id) - order.get(b.id));
    selected.push(rows[0].id); similarities.push(rows[0]);
  }
  return { ids: selected, reason: 'lexical-anchor-then-diverse', similarities };
}

export function evaluateDiversification(workload, artifact) {
  const vectors = validateVectors(workload, artifact);
  const measure = (ids, gold) => ({ complete: !!gold.length && gold.every(id => ids.includes(id)), correctFirst: !!gold.length && gold.includes(ids[0]), missingGold: gold.filter(id => !ids.includes(id)).length });
  const rows = workload.cases.map(c => {
    const selected = diversifiedCandidates(c, vectors), old = c.lexical.slice(0, searchPolicy.limit);
    return { id: c.id, split: c.split, family: c.family, intent: c.intent, goldCount: c.gold.length, preserve: !!(c.preserve || c.protected), protectionReason: c.protectionReason ?? [], reason: selected.reason,
      baseline: measure(c.baseline, c.gold), lexical: measure(old, c.gold), diverse: measure(selected.ids, c.gold), selected: { baseline: c.baseline, lexical: old, diverse: selected.ids },
      controlDrift: !c.gold.length && JSON.stringify(selected.ids) !== JSON.stringify(c.baseline),
      lostLexicalGold: c.gold.filter(id => old.includes(id) && !selected.ids.includes(id)), addedGold: c.gold.filter(id => !old.includes(id) && selected.ids.includes(id)) };
  });
  const groups = [];
  for (const split of [...new Set(rows.map(r => r.split))]) for (const intent of [...new Set(rows.filter(r => r.split === split).map(r => r.intent))]) {
    const g = rows.filter(r => r.split === split && r.intent === intent);
    groups.push({ split, intent, cases: g.length, preserved: g.filter(r => r.preserve).length,
      baselineComplete: g.filter(r => r.baseline.complete).length, lexicalComplete: g.filter(r => r.lexical.complete).length, diverseComplete: g.filter(r => r.diverse.complete).length,
      lexicalWrongFirst: g.filter(r => r.goldCount && !r.lexical.correctFirst).length, diverseWrongFirst: g.filter(r => r.goldCount && !r.diverse.correctFirst).length,
      lostLexicalGold: g.reduce((s, r) => s + r.lostLexicalGold.length, 0), addedGold: g.reduce((s, r) => s + r.addedGold.length, 0), controlDrift: g.filter(r => r.controlDrift).length });
  }
  return { version: 1, experiment: 'RP264', inputDigest: workload.inputDigest, goldDigest: workload.goldDigest, policyDigest, policy: searchPolicy, model: artifact.model,
    scope: 'Candidate-only anchored MMR. Whole-prompt probes are reported separately; no production integration or live-model quality claim.', groups, rows };
}
