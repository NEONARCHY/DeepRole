// @vitest-environment node
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sha=(p:string)=>createHash('sha256').update(readFileSync(p,'utf8').replaceAll('\r\n','\n')).digest('hex');
const current=read('docs/benchmarks/rp288-rp287-reference-seen-results.json'),legacy=read('docs/benchmarks/rp288-rp283-reference-seen-results.json');
it('preserves both independent first reports/seals beside explicitly seen fixes',()=>{
 for(const [report,sealPath,priorPath] of [[current,'docs/benchmarks/rp287-first-report-seal.json','docs/benchmarks/rp287-obligation-holdout-results.json'],[legacy,'docs/benchmarks/rp283-first-report-seal.json','docs/benchmarks/rp286d-obligation-seen-results.json']] as const){
  const seal=read(sealPath),base=read(seal.baseline),first=read(seal.report),prior=read(priorPath);
  expect(sha(seal.baseline)).toBe(seal.baselineHash);expect(sha(seal.report)).toBe(seal.reportHash);
  expect(report.historicalBaselineDigest).toBe(digest(base));expect(report.firstReportDigest).toBe(digest(first));expect(report.firstReportSealDigest).toBe(digest(seal));expect(report.previousSeenReportDigest).toBe(digest(prior));
  expect(report.scope).toContain('SEEN');expect(report.changedRuntime.sort()).toEqual(['src/core/game-context.ts','src/core/story-obligation-recall.ts']);
 }
 expect(read('docs/benchmarks/rp287-obligation-holdout-results.json').summary.complete).toBe(58);expect(read('docs/benchmarks/rp283-independent-results.json').summary.complete).toBe(39);
});
it('closes all four source losses and all48 guard/confidence gaps without changing registered gold',()=>{
 expect(current.summary).toEqual({cases:108,scored:62,baselineComplete:58,complete:62,goldFacts:250,missingFacts:0,casesWithIntegrityIssues:0,uncertaintyExpected:48,confidenceGapCases:0,falseCompleteCases:0,lostPriorFacts:2,changedOutputs:26,changedCoverage:7,rejectionControlsDrift:0,budgetOutputChanges:0});
 const prior=read('docs/benchmarks/rp287-obligation-holdout-results.json');
 for(const row of current.results){const before=prior.results.find((b:any)=>b.id===row.id)!;
  expect(row.gold).toEqual(before.gold);expect(row.issues).toEqual([]);expect(row.confidenceIssues).toEqual([]);if(row.score)expect(row.missing).toEqual([]);
  expect(row.report.total<=row.report.limit||row.report.required>row.report.limit).toBe(true);
  if(row.uncertaintyExpected){expect(row.guard).toBe(true);expect(row.coverage).toEqual({kind:'unverified',reason:'query'});}
  if(!['proved-reference','unproved-reference','false-raw-bridge','unknown-raw-tail'].includes(row.family)){expect(row.outputDigest).toBe(before.outputDigest);expect(row.coverage).toEqual(before.coverage);}
 }
 // Previously the generic "old velvet" bundle also brought unrelated vest
 // receipts. This is a retrieval change, not deletion or rewriting of canon.
 expect(current.results.filter((r:any)=>r.lostPrior.length).map((r:any)=>[r.id,r.lostPrior])).toEqual([['en:theatre:proved-reference',['c1','c2']]]);
});
it('keeps prior RP283 quality, every24 rejection control, and all budget outputs intact',()=>{
 expect(legacy.summary).toEqual({cases:84,scored:54,baselineComplete:54,complete:54,goldFacts:312,missingFacts:0,casesWithIntegrityIssues:0,uncertaintyExpected:6,confidenceGapCases:0,falseCompleteCases:0,lostPriorFacts:0,changedOutputs:1,changedCoverage:0,rejectionControlsDrift:0,budgetOutputChanges:0});
 const prior=read('docs/benchmarks/rp286d-obligation-seen-results.json');
 for(const row of legacy.results){const before=prior.results.find((b:any)=>b.id===row.id)!;expect(row.gold).toEqual(before.gold);expect(row.issues).toEqual([]);expect(row.confidenceIssues).toEqual([]);expect(row.lostPrior).toEqual([]);expect(row.coverage).toEqual(before.coverage);
  if(row.family!=='reference')expect(row.outputDigest).toBe(before.outputDigest);if(row.score)expect(row.missing).toEqual([]);
 }
});
