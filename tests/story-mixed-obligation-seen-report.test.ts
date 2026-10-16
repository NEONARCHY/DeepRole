// @vitest-environment node
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const text=(p:string)=>readFileSync(p,'utf8').replaceAll('\r\n','\n');
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sha=(p:string)=>createHash('sha256').update(text(p)).digest('hex');
const datasets=[['rp289','docs/benchmarks/rp289-first-report-seal.json','docs/benchmarks/rp289-mixed-obligation-results.json',54,204,12],['rp287','docs/benchmarks/rp287-first-report-seal.json','docs/benchmarks/rp288-rp287-reference-seen-results.json',62,250,0],['rp283','docs/benchmarks/rp283-first-report-seal.json','docs/benchmarks/rp288-rp283-reference-seen-results.json',54,312,0]] as const;
for(const [id,sealPath,previous,complete,facts,gaps] of datasets)it(`${id}: final seen report preserves first seals, all prior candidates and whole source guards`,()=>{
 const report=read(`docs/benchmarks/rp290b-${id}-mixed-seen-results.json`),seal=read(sealPath),base=read(seal.baseline),first=read(seal.report),prior=read(previous);
 expect(sha(seal.baseline)).toBe(seal.baselineHash);expect(sha(seal.report)).toBe(seal.reportHash);expect(report.historicalBaselineDigest).toBe(digest(base));expect(report.firstReportDigest).toBe(digest(first));expect(report.firstReportSealDigest).toBe(digest(seal));expect(report.previousSeenReportDigest).toBe(digest(prior));
 expect(report.scope).toContain('SEEN');expect(report.changedRuntime.sort()).toEqual(['src/core/game-context.ts','src/core/story-obligation-recall.ts']);
 for(const [path,hash] of Object.entries(report.currentDigests)){const snapshot=path==='src/core/game-context.ts'?'docs/benchmarks/rp290-final-game-context.txt':path==='src/core/story-obligation-recall.ts'?'docs/benchmarks/rp290-final-obligation.txt':path;expect(digest(text(snapshot))).toBe(hash);}
 expect(report.runnerDigest).toBe(digest(text('scripts/story-search-mixed-obligation-seen.mjs')));
 expect(report.summary).toMatchObject({complete,goldFacts:facts,missingFacts:0,casesWithIntegrityIssues:0,falseCompleteCases:0,confidenceGapCases:gaps,lostPriorFacts:0,rejectionControlsDrift:0,budgetOutputChanges:0});
 for(const row of report.results){const old=prior.results.find((r:any)=>r.id===row.id)!;
  expect(row.gold).toEqual(old.gold);expect(row.issues).toEqual([]);expect(row.lostPrior).toEqual([]);expect(row.coverage).toEqual(old.coverage);expect(row.confidenceIssues).toEqual(old.confidenceIssues);
  if(row.score)expect(row.missing).toEqual([]);
  expect(row.report.total<=row.report.limit||row.report.required>row.report.limit).toBe(true);
  if(id!=='rp289'||!['paraphrase-delivery','proved-reference'].includes(row.family))expect(row.outputDigest).toBe(old.outputDigest);
 }
 expect(report.summary.changedOutputs).toBe(id==='rp289'?12:0);expect(report.summary.changedCoverage).toBe(0);
});
