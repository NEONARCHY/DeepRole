import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {embargoScenarios} from './fixtures/story-embargo-audit';
import {validStoryFact} from '../src/core/story-update';
import {validFactRoleSeeds} from '../src/core/story-role-binding';
import {validEpisodeSources} from '../src/core/story-episodes';

const text=(path:string)=>readFileSync(path,'utf8').replaceAll('\r\n','\n');
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sha=(path:string)=>createHash('sha256').update(text(path)).digest('hex');
const baseline=JSON.parse(text('tests/fixtures/story-embargo-audit-baseline.json'));
describe('RP301 preregistered embargo audit',()=>{
 it('preserves inputs, independent manual gold and partitions',()=>{
  const cases=embargoScenarios();
  const rows=cases.map(c=>({id:c.id,family:c.family,locale:c.locale,plot:c.plotId,noise:c.noiseCount,inputDigest:digest(c.input),...c.gold,gold:c.gold.wanted.map(id=>{const i=c.ids.indexOf(id);return {id,fact:c.input.story!.facts[i],source:c.sources[i],roles:c.input.story!.roleSeeds![i]!.binding.roles};})}));
  expect(rows).toEqual(baseline.rows);
  expect(digest(rows.map(({gold: _gold,...r})=>r))).toBe(baseline.inputDigest);
  expect(digest(rows.map(r=>[r.id,r.gold,r.uncertainty]))).toBe(baseline.goldDigest);
  expect(rows).toHaveLength(40);
  expect(rows.filter(r=>r.score)).toHaveLength(24);
  expect(rows.filter(r=>r.control)).toHaveLength(10);
  expect(rows.filter(r=>r.budget)).toHaveLength(6);
  expect(rows.filter(r=>r.score).reduce((n,r)=>n+r.gold.length,0)).toBe(114);
 });
 it('uses valid accepted sources and explicit separate lifecycle identities',()=>{
  for(const c of embargoScenarios()){
   const s=c.input.story!;
   expect(s.facts.every(validStoryFact)).toBe(true);
   expect(validFactRoleSeeds(s.roleSeeds,s.facts)).toBe(true);
   expect(validEpisodeSources(c.sources)).toBe(true);
   expect(c.ids).toHaveLength(c.noiseCount+19);
   expect(new Set(c.ids).size).toBe(c.ids.length);
   const fact=(id:string)=>s.facts[c.ids.indexOf(id)]!;
   expect(fact('a0').task!.key).not.toBe(fact('b2').task!.key);
   expect(fact('b0').task!.key).toBe(fact('b2').task!.key);
   expect(fact('c0').task!.key).toBe(fact('c2').task!.key);
   expect(fact('b2').task!.status).toBe('completed');
   expect(fact('c2').task!.status).toBe('cancelled');
   expect(fact('e0').kind).toBe('belief');
   expect(s.roleSeeds![c.ids.indexOf('e0')]!.binding.roles.believer).toBeDefined();
   expect(fact('d2').claim!.status).toBe('ended');
   expect(fact('d2').claim!.value).toBe(fact('d2').text);
   expect(c.gold.wanted.some(id=>['old','b0','c0','d1'].includes(id))).toBe(false);
  }
 });
 it('pins the preregistration materials independently of future runtime repairs',()=>{
  expect(Object.keys(baseline.fingerprints)).toHaveLength(414);
  for(const [path,hash] of Object.entries(baseline.fingerprints)){
   expect(hash).toMatch(/^[a-f0-9]{64}$/u);
   // Production hashes are historical evidence, not a ban on future repairs.
   if(!path.startsWith('src/'))expect(digest(text(path))).toBe(hash);
  }
 });
 it('seals the first report and derives recall separately from integrity',()=>{
  const seal=JSON.parse(text('docs/benchmarks/rp301-first-report-seal.json'));
  const report=JSON.parse(text(seal.report));
  expect(sha(seal.baseline)).toBe(seal.baselineHash);
  expect(sha(seal.report)).toBe(seal.reportHash);
  expect(report.baselineDigest).toBe(digest(baseline));
  expect(report.inputDigest).toBe(baseline.inputDigest);
  expect(report.goldDigest).toBe(baseline.goldDigest);
  expect(report.fingerprints).toEqual(baseline.fingerprints);
  const scored=report.results.filter((r:{score:boolean})=>r.score);
  expect(report.summary.cases).toBe(40);
  expect(report.summary.scored).toBe(scored.length);
  expect(report.summary.complete).toBe(scored.filter((r:{missing:string[]})=>!r.missing.length).length);
  expect(report.summary.goldFacts).toBe(114);
  expect(report.summary.missingFacts).toBe(scored.reduce((n:number,r:{missing:string[]})=>n+r.missing.length,0));
  // Pin the measured failures as history; do not turn this into an all-green recall test.
  expect(report.summary).toEqual({cases:40,scored:24,complete:14,goldFacts:114,missingFacts:12,integrityCases:0,confidenceGapCases:2,falseCompleteCases:0});
  for(const r of report.results){
   const row=baseline.rows.find((v:{id:string})=>v.id===r.id);
   expect(r.gold).toEqual(row.wanted);
   expect(r.missing).toEqual(r.gold.filter((id:string)=>!r.selectedIds.includes(id)));
  }
 });
});
