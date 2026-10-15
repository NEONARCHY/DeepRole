// @vitest-environment node
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sha=(p:string)=>createHash('sha256').update(readFileSync(p,'utf8').replaceAll('\r\n','\n')).digest('hex');
const report=read('docs/benchmarks/rp285b-forms-seen-results.json'),prior=read('docs/benchmarks/rp284-narrative-seen-results.json'),first=read('docs/benchmarks/rp283-independent-results.json'),seal=read('docs/benchmarks/rp283-first-report-seal.json'),base=read(seal.baseline);
it('preserves first independent and prior paragraph reports/gold beside the separate seen forms result',()=>{
 expect(sha(seal.baseline)).toBe(seal.baselineHash);expect(sha(seal.report)).toBe(seal.reportHash);
 expect(report.historicalBaselineDigest).toBe(digest(base));expect(report.firstReportDigest).toBe(digest(first));expect(report.firstReportSealDigest).toBe(digest(seal));expect(report.previousSeenReportDigest).toBe(digest(prior));
 expect(first.summary.complete).toBe(39);expect(prior.summary.complete).toBe(44);
 expect(report.summary).toEqual({cases:84,scored:54,baselineComplete:44,complete:47,goldFacts:312,baselineMissingFacts:18,missingFacts:15,integrityIssues:0,controlsDrift:1,rejectionControlsDrift:0,budgetOutputChanges:1,lostPriorFacts:0,changedOutputs:4,narrativeComplete:6,narrativeCases:6,narrativeReportedComplete:0});
 expect(report.changedRuntime.sort()).toEqual(['src/core/game-context.ts','src/core/story-sequence-priority.ts','src/core/story-action-balance.ts','src/core/story-compound-action.ts'].sort());expect(report.addedRuntime.sort()).toEqual(['src/core/story-narrative-action.ts','src/core/story-object-forms.ts']);
});
it('changes only the four known c1 omissions, with all24 rejections and the other80 outputs unchanged',()=>{
 const ids=['ru:mountain:three-actions','ru:mountain:narrative-sequence','ru:scale:1000','ru:budget:1800'];
 expect(report.results.filter((r:any)=>r.outputChanged).map((r:any)=>r.id).sort()).toEqual(ids.sort());
 expect(report.results.filter((r:any)=>!r.score&&r.family!=='budget')).toHaveLength(24);
 for(const row of report.results){const before=prior.results.find((r:any)=>r.id===row.id)!;
  expect(row.gold).toEqual(before.gold);expect(row.missing).toEqual(row.gold.filter((id:string)=>!row.selectedIds.includes(id)));expect(row.complete).toBe(row.score?!row.missing.length:null);
  expect(row.issues).toEqual([]);expect(row.lostPrior).toEqual([]);expect(row.rejectionControlDrift).toBe(false);expect(before.selectedIds.every((id:string)=>row.selectedIds.includes(id))).toBe(true);
  expect(row.report.total<=row.report.limit||row.report.required>row.report.limit).toBe(true);
  if(ids.includes(row.id)){expect(row.selectedIds.filter((id:string)=>!before.selectedIds.includes(id))).toEqual(['c1']);expect(row.missing).toEqual([]);}
  else {expect(row.outputDigest).toBe(before.outputDigest);expect(row.coverage).toEqual(before.coverage);}
  if(row.family==='narrative-sequence')expect(row.coverage).toEqual({kind:'unverified',reason:'query'});
 }
 const budget=report.results.find((r:any)=>r.id==='ru:budget:1800');expect(budget.report.total).toBe(1631);expect(budget.report.limit).toBe(1800);expect(budget.controlDrift).toBe(true);
 // The English short-reference false-complete remains visible, not greenwashed.
 expect(report.results.filter((r:any)=>r.score&&r.missing.length&&r.coverage.kind==='complete').map((r:any)=>r.id)).toEqual(['en:mountain:reference']);
});
