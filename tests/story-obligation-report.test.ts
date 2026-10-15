// @vitest-environment node
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sha=(p:string)=>createHash('sha256').update(readFileSync(p,'utf8').replaceAll('\r\n','\n')).digest('hex');
const report=read('docs/benchmarks/rp286d-obligation-seen-results.json'),prior=read('docs/benchmarks/rp285b-forms-seen-results.json'),first=read('docs/benchmarks/rp283-independent-results.json'),seal=read('docs/benchmarks/rp283-first-report-seal.json'),base=read(seal.baseline);
it('keeps independent/previous-seen input/gold/seals beside a separate seen result, not a new holdout',()=>{
 expect(sha(seal.baseline)).toBe(seal.baselineHash);expect(sha(seal.report)).toBe(seal.reportHash);expect(report.historicalBaselineDigest).toBe(digest(base));expect(report.firstReportDigest).toBe(digest(first));expect(report.firstReportSealDigest).toBe(digest(seal));expect(report.previousSeenReportDigest).toBe(digest(prior));
 expect(first.summary.complete).toBe(39);expect(prior.summary.complete).toBe(47);
 expect(report.summary).toEqual({cases:84,scored:54,baselineComplete:47,complete:54,goldFacts:312,baselineMissingFacts:15,missingFacts:0,integrityIssues:0,controlsDrift:0,rejectionControlsDrift:0,budgetOutputChanges:0,lostPriorFacts:0,changedOutputs:12,narrativeComplete:6,narrativeCases:6,narrativeReportedComplete:0});
 expect(report.addedRuntime.sort()).toEqual(['src/core/story-narrative-action.ts','src/core/story-object-forms.ts','src/core/story-obligation-recall.ts']);
});
it('all12 related inquiries are conservative and complete relative to gold, all72 other outputs/coverage remain exact',()=>{
 for(const row of report.results){const before=prior.results.find((r:any)=>r.id===row.id)!;
  expect(row.gold).toEqual(before.gold);expect(row.missing).toEqual(row.gold.filter((id:string)=>!row.selectedIds.includes(id)));expect(row.issues).toEqual([]);expect(row.lostPrior).toEqual([]);expect(row.controlDrift).toBe(false);expect(before.selectedIds.every((id:string)=>row.selectedIds.includes(id))).toBe(true);
  expect(row.report.total<=row.report.limit||row.report.required>row.report.limit).toBe(true);
  if(['paraphrase','reference'].includes(row.family)){expect(row.outputChanged).toBe(true);expect(row.missing).toEqual([]);expect(row.coverage).toEqual({kind:'unverified',reason:'query'});}
  else {expect(row.outputDigest).toBe(before.outputDigest);expect(row.coverage).toEqual(before.coverage);expect(row.outputChanged).toBe(false);}
 }
 expect(report.results.filter((r:any)=>r.score&&r.missing.length&&r.coverage.kind==='complete')).toEqual([]);
});
