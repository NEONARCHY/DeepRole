// @vitest-environment node
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const text=(p:string)=>readFileSync(p,'utf8').replaceAll('\r\n','\n');
const read=(p:string)=>JSON.parse(text(p));
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sha=(p:string)=>createHash('sha256').update(text(p)).digest('hex');
it('preserves all RP303 frozen materials and its first measured failures',()=>{
 const base=read('tests/fixtures/story-relay-audit-baseline.json');
 const snapshots:Record<string,string>={'src/core/game-context.ts':'docs/benchmarks/rp302-final-game-context.txt','src/core/story-obligation-recall.ts':'docs/benchmarks/rp302-final-obligation.txt'};
 for(const [p,h] of Object.entries(base.fingerprints))expect(digest(text(snapshots[p]??p)),p).toBe(h);
 const seal=read('docs/benchmarks/rp303-first-report-seal.json'),first=read(seal.report);
 expect(sha(seal.baseline)).toBe(seal.baselineHash);expect(sha(seal.report)).toBe(seal.reportHash);
 expect(first.summary.complete).toBe(25);expect(first.summary.missingFacts).toBe(23);expect(first.summary.confidenceGapCases).toBe(12);
});
for(const stage of ['rp303','rp301','rp299','rp297','rp295','rp292','rp289','rp287','rp283'])it(`${stage}: current seen keeps source fields, original gold, guards and previously selected records`,()=>{
 const r=read(`docs/benchmarks/rp304-${stage}-seen-results.json`),seal=read(`docs/benchmarks/${stage}-first-report-seal.json`),base=read(seal.baseline);
 expect(r.baselineDigest).toBe(digest(base));expect(r.runnerDigest).toBe(digest(text('scripts/story-search-relay-seen.mjs')));
 for(const [p,h] of Object.entries(r.currentDigests))expect(digest(text(p)),p).toBe(h);
 expect(r.summary.complete).toBe(r.summary.scored);expect(r.summary.missing).toBe(0);
 expect(r.summary.integrityCases).toBe(0);expect(r.summary.confidenceGapCases).toBe(0);expect(r.summary.lostPriorFacts).toBe(0);
 for(const result of r.results){
  const row=base.rows.find((row:{id:string})=>row.id===result.id);
  expect(result.gold).toEqual(row.gold.map((g:{id:string})=>g.id));
  expect(result.missing).toEqual(result.gold.filter((id:string)=>!result.selectedIds.includes(id)));
  expect(result.issues).toEqual([]);expect(result.confidenceIssues).toEqual([]);expect(result.lostPrior).toEqual([]);
 }
});
it('keeps control/budget observations separate from scored recall in all nine corpora',()=>{
 const summaries=['rp303','rp301','rp299','rp297','rp295','rp292','rp289','rp287','rp283'].map(stage=>read(`docs/benchmarks/rp304-${stage}-seen-results.json`).summary);
 expect(summaries.reduce((n,s)=>n+s.cases,0)).toBe(650);
 expect(summaries.reduce((n,s)=>n+s.scored,0)).toBe(388);
 expect(summaries.reduce((n,s)=>n+s.gold,0)).toBe(1826);
 const r=read('docs/benchmarks/rp304-rp303-seen-results.json');
 expect(r.results.filter((v:{budget:boolean})=>v.budget)).toHaveLength(8);
 expect(r.results.filter((v:{control:boolean})=>v.control)).toHaveLength(16);
});
