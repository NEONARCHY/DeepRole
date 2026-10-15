// @vitest-environment node
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {obligationHoldoutScenarios} from './fixtures/story-obligation-holdout';
import {validStoryFact} from '../src/core/story-update';
import {validFactRoleSeeds} from '../src/core/story-role-binding';
import {validEpisodeSources} from '../src/core/story-episodes';

const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sha=(p:string)=>createHash('sha256').update(readFileSync(p,'utf8').replaceAll('\r\n','\n')).digest('hex');
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const frozen=read('tests/fixtures/story-obligation-holdout-baseline.json');
const cases=obligationHoldoutScenarios();
const rows=cases.map(c=>({id:c.id,family:c.family,locale:c.locale,plot:c.plotId,noiseScenes:c.noiseCount,inputDigest:digest(c.input),...c.gold,gold:c.gold.wanted.map(id=>{const i=c.ids.indexOf(id);return {id,fact:c.input.story!.facts[i],source:c.sources[i],roles:c.input.story!.roleSeeds![i]!.binding.roles};})}));
it('keeps all RP287 pre-compiler requests/gold/protocol exact without pinning future production code',()=>{
 expect(cases).toHaveLength(108);expect(new Set(cases.map(c=>c.id)).size).toBe(108);
 expect(rows).toEqual(frozen.rows);expect(digest(rows.map(({gold,...r})=>r))).toBe(frozen.inputDigest);expect(digest(rows.map(r=>[r.id,r.gold,r.uncertainty]))).toBe(frozen.goldDigest);
 for(const [path,hash] of Object.entries(frozen.fingerprints)){
  expect(hash).toMatch(/^[a-f0-9]{64}$/u);
  if(!path.startsWith('src/'))expect(digest(readFileSync(path,'utf8').replaceAll('\r\n','\n')),path).toBe(hash);
 }
 expect(cases.filter(c=>c.gold.score)).toHaveLength(62);expect(cases.filter(c=>c.gold.control)).toHaveLength(40);expect(cases.filter(c=>c.gold.budget)).toHaveLength(6);expect(cases.filter(c=>c.gold.uncertainty)).toHaveLength(48);
 expect(cases.filter(c=>c.family==='scale').map(c=>c.noiseCount)).toEqual([250,1500,5000,250,1500,5000]);
});
for(const c of cases)it(`RP287 valid distinct accepted sources: ${c.id}`,()=>{
 const facts=c.input.story!.facts;
 expect(facts).toHaveLength(c.noiseCount+16);expect(facts.every(validStoryFact)).toBe(true);
 expect(validFactRoleSeeds(c.input.story!.roleSeeds,facts)).toBe(true);expect(validEpisodeSources(c.sources)).toBe(true);
 expect(new Set(c.ids).size).toBe(facts.length);expect(new Set(c.sources).size).toBe(facts.length);
 expect(c.gold.wanted.every(id=>c.ids.includes(id)&&!['aOld','c0','d0'].includes(id))).toBe(true);
 const at=(id:string)=>facts[c.ids.indexOf(id)]!;
 expect(new Set(['a0','b0','c1','d1','e0'].map(id=>at(id).task!.key)).size).toBe(5);
 expect(at('a0').task!.status).toBe('open');expect(at('b0').task!.status).toBe('open');expect(at('c1').task!.status).toBe('completed');expect(at('d1').task!.status).toBe('cancelled');
 if(c.family==='proved-reference')expect(c.input.recentMessages![0]).toBe(facts.at(-1)!.quote);
 if(c.family==='false-raw-bridge'||c.family==='unknown-raw-tail')expect(c.input.recentMessages![0]).not.toBe(facts.at(-1)!.quote);
});
it('seals first report and reproduces its partitions without requiring a green recall score',()=>{
 const seal=read('docs/benchmarks/rp287-first-report-seal.json'),report=read(seal.report);
 expect(sha(seal.baseline)).toBe(seal.baselineHash);expect(sha(seal.report)).toBe(seal.reportHash);
 expect(report.baselineDigest).toBe(digest(frozen));expect(report.inputDigest).toBe(frozen.inputDigest);expect(report.goldDigest).toBe(frozen.goldDigest);expect(report.fingerprints).toEqual(frozen.fingerprints);
 expect(report.results).toHaveLength(108);
 for(const row of report.results){const c=cases.find(c=>c.id===row.id)!;
  expect(row.gold).toEqual(c.gold.wanted);expect(row.missing).toEqual(row.gold.filter((id:string)=>!row.selectedIds.includes(id)));
  expect(row.complete).toBe(row.score?row.missing.length===0:null);expect(row.issues).toEqual([]);
  expect(row.report.total<=row.report.limit||row.report.required>row.report.limit).toBe(true);
  expect(row.confidenceIssues.includes('uncertainty-not-signalled')).toBe(c.gold.uncertainty&&row.coverage.kind!=='unverified');
  expect(row.confidenceIssues.includes('unresolved-guard-missing')).toBe(c.gold.uncertainty&&!row.guard);
  expect(row.confidenceIssues.includes('false-complete-relative-to-gold')).toBe(row.score&&row.missing.length>0&&row.coverage.kind==='complete');
 }
 const rs=report.results,scored=rs.filter((r:any)=>r.score);
 expect(report.summary).toEqual({cases:108,scored:62,complete:scored.filter((r:any)=>r.complete).length,goldFacts:scored.reduce((n:number,r:any)=>n+r.gold.length,0),missingFacts:scored.reduce((n:number,r:any)=>n+r.missing.length,0),casesWithIntegrityIssues:rs.filter((r:any)=>r.issues.length).length,uncertaintyExpected:48,confidenceGapCases:rs.filter((r:any)=>r.confidenceIssues.length).length,falseCompleteCases:rs.filter((r:any)=>r.confidenceIssues.includes('false-complete-relative-to-gold')).length});
});
it('preserves first observed RP287 losses and confidence gaps as history, not a future passing target',()=>{
 const r=read('docs/benchmarks/rp287-obligation-holdout-results.json');
 expect(r.summary).toEqual({cases:108,scored:62,complete:58,goldFacts:250,missingFacts:6,casesWithIntegrityIssues:0,uncertaintyExpected:48,confidenceGapCases:23,falseCompleteCases:1});
 expect(r.results.filter((x:any)=>x.score&&!x.complete).map((x:any)=>[x.id,x.missing])).toEqual([
  ['ru:garden:proved-reference',['a1']],['en:garden:proved-reference',['a1']],['en:radio:proved-reference',['a1','a2','a3']],['en:regatta:proved-reference',['a1']],
 ]);
 expect(r.results.filter((x:any)=>x.uncertaintyExpected&&x.coverage.kind==='complete')).toHaveLength(7);
 expect(r.results.filter((x:any)=>x.uncertaintyExpected&&!x.guard)).toHaveLength(23);
});
