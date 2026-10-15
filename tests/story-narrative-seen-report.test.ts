// @vitest-environment node
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sha=(p:string)=>createHash('sha256').update(readFileSync(p,'utf8').replaceAll('\r\n','\n')).digest('hex');
const report=read('docs/benchmarks/rp284-narrative-seen-results.json'),prior=read('docs/benchmarks/rp283-independent-results.json'),seal=read('docs/benchmarks/rp283-first-report-seal.json'),base=read(seal.baseline);
it('preserves first independent result and unchanged labels beside the separate seen improvement',()=>{
 expect(sha(seal.baseline)).toBe(seal.baselineHash);expect(sha(seal.report)).toBe(seal.reportHash);
 expect(report.historicalBaselineDigest).toBe(digest(base));expect(report.firstReportDigest).toBe(digest(prior));expect(report.firstReportSealDigest).toBe(digest(seal));
 expect(prior.summary.complete).toBe(39);expect(report.summary).toEqual({cases:84,scored:54,baselineComplete:39,complete:44,goldFacts:312,baselineMissingFacts:47,missingFacts:18,integrityIssues:0,controlsDrift:0,lostPriorFacts:0,narrativeComplete:5,narrativeCases:6,narrativeReportedComplete:0});
 expect(report.changedRuntime.sort()).toEqual(['src/core/game-context.ts','src/core/story-sequence-priority.ts']);expect(report.addedRuntime).toEqual(['src/core/story-narrative-action.ts']);
});
it('retains every prior selected source and all controls; explicitly records residual losses and cautious paragraph status',()=>{
 const scored=report.results.filter((r:any)=>r.score);expect(scored.filter((r:any)=>r.complete)).toHaveLength(44);expect(scored.reduce((n:number,r:any)=>n+r.missing.length,0)).toBe(18);
 for(const row of report.results){const before=prior.results.find((r:any)=>r.id===row.id)!;
  expect(row.gold).toEqual(before.gold);expect(row.missing).toEqual(row.gold.filter((id:string)=>!row.selectedIds.includes(id)));expect(row.complete).toBe(row.score?!row.missing.length:null);
  expect(row.issues).toEqual([]);expect(row.controlDrift).toBe(false);expect(row.lostPrior).toEqual([]);
  expect(before.selectedIds.every((id:string)=>row.selectedIds.includes(id))).toBe(true);
  expect(row.report.total<=row.report.limit||row.report.required>row.report.limit).toBe(true);
  if(row.family==='narrative-sequence')expect(row.coverage).toEqual({kind:'unverified',reason:'query'});
 }
 expect(report.results.find((r:any)=>r.id==='ru:mountain:narrative-sequence').missing).toEqual(['c1']);
});
