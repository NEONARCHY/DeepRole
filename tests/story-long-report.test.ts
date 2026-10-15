import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const report=read('docs/benchmarks/rp280-long-results.json'),baseline=read('tests/fixtures/story-long-holdout-baseline.json');
it('preserves the first independent audit, including missing gold instead of relabelling it',()=>{
 expect(report.baselineDigest).toBe(createHash('sha256').update(JSON.stringify(baseline)).digest('hex'));
 expect(report.inputDigest).toBe(baseline.inputDigest);expect(report.goldDigest).toBe(baseline.goldDigest);
 expect(report.fingerprints).toEqual(baseline.fingerprints);
 expect(report.results).toHaveLength(78);
 const scored=report.results.filter((r:any)=>r.gold.length);
 expect(report.summary).toEqual({cases:report.results.length,scored:scored.length,complete:scored.filter((r:any)=>r.missing.length===0).length,goldFacts:scored.reduce((s:number,r:any)=>s+r.gold.length,0),missingFacts:scored.reduce((s:number,r:any)=>s+r.missing.length,0),casesWithIntegrityIssues:report.results.filter((r:any)=>r.issues.length).length});
 for(const row of report.results){
  expect(row.missing).toEqual(row.gold.filter((id:string)=>!row.selectedIds.includes(id)));
  expect(row.complete).toBe(row.gold.length?row.missing.length===0:null);
  expect(row.issues,row.id).toEqual([]);
  expect(row.report.total,row.id).toBeLessThanOrEqual(row.report.limit);
  expect(row.selectedIds).not.toContain('old-location');
 }
});
