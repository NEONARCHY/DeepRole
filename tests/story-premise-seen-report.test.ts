// @vitest-environment node
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const text=(p:string)=>readFileSync(p,'utf8').replaceAll('\r\n','\n');
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sha=(p:string)=>createHash('sha256').update(text(p)).digest('hex');
for(const [id,count,complete,gold]of [['rp289',96,54,204],['rp287',108,62,250],['rp283',84,54,312]] as const)it(`${id}: premise warnings preserve previous whole selections and immutable first reports`,()=>{
 const current=read(`docs/benchmarks/rp291-${id}-premise-seen-results.json`),prior=read(`docs/benchmarks/rp290b-${id}-mixed-seen-results.json`),seal=read(`docs/benchmarks/${id}-first-report-seal.json`),base=read(seal.baseline),first=read(seal.report);
 expect(current.scope).toContain('SEEN');expect(sha(seal.baseline)).toBe(seal.baselineHash);expect(sha(seal.report)).toBe(seal.reportHash);
 expect(current.historicalBaselineDigest).toBe(digest(base));expect(current.firstReportDigest).toBe(digest(first));expect(current.firstReportSealDigest).toBe(digest(seal));expect(current.previousSeenReportDigest).toBe(digest(prior));
 expect(current.runnerDigest).toBe(digest(text('scripts/story-search-premise-seen.mjs')));
 for(const [path,hash]of Object.entries(current.currentDigests)){const snapshot=path==='src/core/game-context.ts'?'docs/benchmarks/rp291-final-game-context.txt':path==='src/core/story-obligation-recall.ts'?'docs/benchmarks/rp291-final-obligation.txt':path;expect(digest(text(snapshot))).toBe(hash);}
 expect(current.summary).toMatchObject({cases:count,complete,goldFacts:gold,missingFacts:0,casesWithIntegrityIssues:0,confidenceGapCases:0,falseCompleteCases:0,lostPriorFacts:0,changedCoverage:0,rejectionControlsDrift:0,budgetOutputChanges:0});
 for(const row of current.results){const before=prior.results.find((r:any)=>r.id===row.id)!;
  expect(row.gold).toEqual(before.gold);expect(row.selectedIds).toEqual(before.selectedIds);expect(row.lostPrior).toEqual([]);expect(row.issues).toEqual([]);expect(row.confidenceIssues).toEqual([]);expect(row.coverage).toEqual(before.coverage);
  if(row.score)expect(row.missing).toEqual([]);
  if(row.uncertaintyExpected){expect(row.guard).toBe(true);expect(row.coverage.kind).toBe('unverified');}
  expect(row.report.total<=row.report.limit||row.report.required>row.report.limit).toBe(true);
  if(id==='rp289'&&['swapped-owner','invented-object'].includes(row.family))expect(row.outputChanged).toBe(true);
 }
});
