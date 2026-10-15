// @vitest-environment node
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sha=(p:string)=>createHash('sha256').update(readFileSync(p,'utf8').replaceAll('\r\n','\n')).digest('hex');
const baseline=read('tests/fixtures/story-independent-sequences-v2-baseline.json'),report=read('docs/benchmarks/rp283-independent-results.json'),seal=read('docs/benchmarks/rp283-first-report-seal.json');
const summary=(rows:any[])=>{const scored=rows.filter(r=>r.score);return {cases:rows.length,scored:scored.length,complete:scored.filter(r=>r.complete).length,goldFacts:scored.reduce((n,r)=>n+r.gold.length,0),missingFacts:scored.reduce((n,r)=>n+r.missing.length,0),casesWithIntegrityIssues:rows.filter(r=>r.issues.length).length};};
it('preserves the first completed RP283 result and pre-evaluation provenance, including every loss',()=>{
 expect(report.baselineDigest).toBe(digest(baseline));expect(report.inputDigest).toBe(baseline.inputDigest);expect(report.goldDigest).toBe(baseline.goldDigest);expect(report.fingerprints).toEqual(baseline.fingerprints);
 expect(sha(seal.report)).toBe(seal.reportHash);expect(sha(seal.baseline)).toBe(seal.baselineHash);
 expect(report.summary).toEqual({cases:84,scored:54,complete:39,goldFacts:312,missingFacts:47,casesWithIntegrityIssues:0});
});
it('recomputes completeness from every original expected source without excluding hard requests',()=>{
 expect(report.summary).toEqual(summary(report.results));
 for(const row of report.results){
  const original=baseline.rows.find((r:any)=>r.id===row.id)!;expect(original).toBeDefined();
  expect(row.gold).toEqual(original.gold.map((g:any)=>g.id));expect(row.score).toBe(original.score);
  expect(row.missing).toEqual(row.gold.filter((id:string)=>!row.selectedIds.includes(id)));
  expect(row.complete).toBe(row.score?row.missing.length===0:null);
 }
 for(const group of report.groups)expect(group).toEqual({family:group.family,locale:group.locale,...summary(report.results.filter((r:any)=>r.family===group.family&&r.locale===group.locale))});
 expect(report.results.filter((r:any)=>r.family==='narrative-sequence'&&r.score)).toHaveLength(6);
 expect(report.results.filter((r:any)=>r.family==='paraphrase'&&r.score)).toHaveLength(6);
});
it('separates the 24 rejection controls and six budget probes from positive recall',()=>{
 const controls=report.results.filter((r:any)=>r.rejectCompound),budget=report.results.filter((r:any)=>r.family==='budget');
 expect(controls).toHaveLength(24);expect(budget).toHaveLength(6);
 for(const row of controls){expect(row.compoundRecognized).toBe(false);expect(row.score).toBe(false);expect(row.complete).toBe(null);}
 for(const row of budget){expect(row.score).toBe(false);expect(row.complete).toBe(null);}
 for(const row of report.results){
  expect(row.issues,row.id).toEqual([]);expect(new Set(row.selectedIds).size).toBe(row.selectedIds.length);
  expect(row.report.selected.facts).toBe(row.selectedIds.length);expect(row.selectedIds).not.toContain('a-old');expect(row.selectedIds).not.toContain('b-old');
  expect(row.report.total<=row.report.limit||row.report.required>row.report.limit,row.id).toBe(true);
 }
});
