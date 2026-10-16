// @vitest-environment node
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {it,expect} from 'vitest';
import {relayScenarios} from './fixtures/story-relay-audit';
import {validStoryFact} from '../src/core/story-update';
import {validFactRoleSeeds} from '../src/core/story-role-binding';
import {validEpisodeSources} from '../src/core/story-episodes';
const text=(p:string)=>readFileSync(p,'utf8').replaceAll('\r\n','\n');
const read=(p:string)=>JSON.parse(text(p));
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sha=(p:string)=>createHash('sha256').update(text(p)).digest('hex');
const base=read('tests/fixtures/story-relay-audit-baseline.json');
it('pins all source hashes and preregistration materials including original mutable runtime snapshots',()=>{
 const snapshots:Record<string,string>={'src/core/game-context.ts':'docs/benchmarks/rp302-final-game-context.txt','src/core/story-obligation-recall.ts':'docs/benchmarks/rp302-final-obligation.txt'};
 expect(Object.keys(base.fingerprints)).toHaveLength(414);
 for(const [p,h] of Object.entries(base.fingerprints))expect(digest(text(snapshots[p]??p)),p).toBe(h);
});
it('preserves exact inputs, manual gold and preregistered independent partitions',()=>{
 const cases=relayScenarios(),rows=cases.map(c=>({id:c.id,family:c.family,locale:c.locale,plot:c.plotId,noise:c.noiseCount,inputDigest:digest(c.input),...c.gold,gold:c.gold.wanted.map(id=>{const i=c.ids.indexOf(id);return {id,fact:c.input.story!.facts[i],source:c.sources[i],roles:c.input.story!.roleSeeds![i]!.binding.roles};})}));
 expect(rows).toEqual(base.rows);expect(digest(rows.map(({gold:_gold,...r})=>r))).toBe(base.inputDigest);expect(digest(rows.map(r=>[r.id,r.gold,r.uncertainty]))).toBe(base.goldDigest);
 expect(rows).toHaveLength(64);expect(new Set(rows.map(r=>r.id)).size).toBe(64);
 expect(new Set(rows.map(r=>r.plot)).size).toBe(2);
 expect(rows.filter(r=>r.score)).toHaveLength(40);expect(rows.filter(r=>r.control)).toHaveLength(16);expect(rows.filter(r=>r.budget)).toHaveLength(8);expect(rows.filter(r=>r.uncertainty)).toHaveLength(24);
 expect(rows.filter(r=>r.score).reduce((n,r)=>n+r.gold.length,0)).toBe(204);
});
for(const locale of ['ru','en'] as const)for(const plot of ['winter-refuge','regatta-drill'])it(`${locale} ${plot}: valid accepted sources, distinct cancelled and replacement ownership`,()=>{
 for(const c of relayScenarios().filter(c=>c.locale===locale&&c.plotId===plot)){
  const s=c.input.story!,at=(id:string)=>c.ids.indexOf(id),fact=(id:string)=>s.facts[at(id)]!;
  expect(s.facts.every(validStoryFact)).toBe(true);expect(validFactRoleSeeds(s.roleSeeds,s.facts)).toBe(true);expect(validEpisodeSources(c.sources)).toBe(true);
  expect(s.facts).toHaveLength(c.noiseCount+19);expect(new Set(c.sources).size).toBe(c.ids.length);
  expect(fact('c0').task!.key).toBe(fact('c2').task!.key);expect(fact('c2').task!.status).toBe('cancelled');
  expect(fact('c3').task!.key).not.toBe(fact('c2').task!.key);expect(fact('c3').task!.status).toBe('open');
  expect(s.roleSeeds![at('c3')]!.binding.roles.promisor!.id).not.toBe(s.roleSeeds![at('c2')]!.binding.roles.promisor!.id);
  expect(fact('b2').task!.status).toBe('completed');expect(fact('a0').task!.status).toBe('open');
  expect(fact('d2').claim!.status).toBe('ended');expect(fact('d2').claim!.value).toBe(fact('d2').text);
  expect(c.gold.wanted.some(id=>['old','b0','c0','d1'].includes(id))).toBe(false);
 }
});
it('keeps the immutable first report and recomputes recall separately from guards and integrity',()=>{
 const seal=read('docs/benchmarks/rp303-first-report-seal.json'),r=read(seal.report);
 expect(sha(seal.baseline)).toBe(seal.baselineHash);expect(sha(seal.report)).toBe(seal.reportHash);
 expect(r.baselineDigest).toBe(digest(base));expect(r.inputDigest).toBe(base.inputDigest);expect(r.goldDigest).toBe(base.goldDigest);expect(r.fingerprints).toEqual(base.fingerprints);
 const scored=r.results.filter((v:{score:boolean})=>v.score);
 expect(r.summary.cases).toBe(64);expect(scored).toHaveLength(40);expect(r.summary.goldFacts).toBe(204);
 expect(r.summary.complete).toBe(scored.filter((v:{missing:string[]})=>!v.missing.length).length);
 expect(r.summary.missingFacts).toBe(scored.reduce((n:number,v:{missing:string[]})=>n+v.missing.length,0));
 expect(r.summary.integrityCases).toBe(r.results.filter((v:{issues:string[]})=>v.issues.length).length);
 expect(r.summary.confidenceGapCases).toBe(r.results.filter((v:{confidenceIssues:string[]})=>v.confidenceIssues.length).length);
 // Preserve the measured failures as history, not an all-green quality claim.
 expect(r.summary).toEqual({cases:64,scored:40,complete:25,goldFacts:204,missingFacts:23,integrityCases:0,confidenceGapCases:12,falseCompleteCases:0});
 for(const v of r.results){const row=base.rows.find((row:{id:string})=>row.id===v.id);expect(v.gold).toEqual(row.wanted);expect(v.missing).toEqual(v.gold.filter((id:string)=>!v.selectedIds.includes(id)));}
});
