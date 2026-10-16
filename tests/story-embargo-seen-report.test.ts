// @vitest-environment node
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const text=(p:string)=>readFileSync(p,'utf8').replaceAll('\r\n','\n');
const read=(p:string)=>JSON.parse(text(p));
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sha=(p:string)=>createHash('sha256').update(text(p)).digest('hex');
it('preserves all RP301 fingerprints against pre-repair snapshots and its first sealed failures',()=>{
 const b=read('tests/fixtures/story-embargo-audit-baseline.json');
 const snapshots:Record<string,string>={'src/core/game-context.ts':'docs/benchmarks/rp300-final-game-context.txt','src/core/story-obligation-recall.ts':'docs/benchmarks/rp300-final-obligation.txt'};
 for(const [path,hash] of Object.entries(b.fingerprints))expect(digest(text(snapshots[path]??path)),path).toBe(hash);
 const seal=read('docs/benchmarks/rp301-first-report-seal.json'),first=read(seal.report);
 expect(sha(seal.baseline)).toBe(seal.baselineHash);expect(sha(seal.report)).toBe(seal.reportHash);
 expect(first.summary.complete).toBe(14);expect(first.summary.missingFacts).toBe(12);expect(first.summary.confidenceGapCases).toBe(2);
});
for(const stage of ['rp301','rp299','rp297','rp295','rp292','rp289','rp287','rp283'])it(`${stage}: seen report preserves gold, roles, guards, budget and all previously selected sources`,()=>{
 const r=read(`docs/benchmarks/rp302-${stage}-seen-results.json`),seal=read(`docs/benchmarks/${stage}-first-report-seal.json`),base=read(seal.baseline);
 expect(r.baselineDigest).toBe(digest(base));expect(r.runnerDigest).toBe(digest(text('scripts/story-search-embargo-seen.mjs')));
  // RP302 reports are historical after RP304; verify their original runtime,
  // while the new relay seen-report tests pin the current implementation.
  const snapshots:Record<string,string>={'src/core/game-context.ts':'docs/benchmarks/rp302-final-game-context.txt','src/core/story-obligation-recall.ts':'docs/benchmarks/rp302-final-obligation.txt'};
  for(const [path,hash] of Object.entries(r.currentDigests))expect(digest(text(snapshots[path]??path)),path).toBe(hash);
 expect(r.summary.complete).toBe(r.summary.scored);expect(r.summary.missing).toBe(0);
 expect(r.summary.integrityCases).toBe(0);expect(r.summary.confidenceGapCases).toBe(0);expect(r.summary.lostPriorFacts).toBe(0);
 for(const result of r.results){
  const row=base.rows.find((v:{id:string})=>v.id===result.id);
  expect(result.gold).toEqual(row.gold.map((g:{id:string})=>g.id));
  expect(result.missing).toEqual(result.gold.filter((id:string)=>!result.selectedIds.includes(id)));
  expect(result.issues).toEqual([]);expect(result.confidenceIssues).toEqual([]);expect(result.lostPrior).toEqual([]);
 }
});
it('counts budget/control inputs separately and records all eight seen datasets',()=>{
 const summaries=['rp301','rp299','rp297','rp295','rp292','rp289','rp287','rp283'].map(stage=>read(`docs/benchmarks/rp302-${stage}-seen-results.json`).summary);
 expect(summaries.reduce((n,s)=>n+s.cases,0)).toBe(586);
 expect(summaries.reduce((n,s)=>n+s.scored,0)).toBe(348);
 expect(summaries.reduce((n,s)=>n+s.gold,0)).toBe(1622);
 const r=read('docs/benchmarks/rp302-rp301-seen-results.json');
 expect(r.results.filter((v:{budget:boolean})=>v.budget)).toHaveLength(6);
 expect(r.results.filter((v:{control:boolean})=>v.control)).toHaveLength(10);
});
