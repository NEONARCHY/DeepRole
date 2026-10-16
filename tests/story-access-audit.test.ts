// @vitest-environment node
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {accessScenarios} from './fixtures/story-access-audit';
import {validStoryFact} from '../src/core/story-update';
import {validFactRoleSeeds} from '../src/core/story-role-binding';
const text=(p:string)=>readFileSync(p,'utf8').replaceAll('\r\n','\n');
const read=(p:string)=>JSON.parse(text(p));
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sha=(p:string)=>createHash('sha256').update(text(p)).digest('hex');
const cases=accessScenarios(),base=read('tests/fixtures/story-access-audit-baseline.json');
it('pins input/gold/protocol/runner and all production source fingerprints before first execution',()=>{
 expect(cases).toHaveLength(60);expect(cases.filter(c=>c.gold.score)).toHaveLength(34);
 expect(cases.filter(c=>c.gold.control)).toHaveLength(20);expect(cases.filter(c=>c.gold.budget)).toHaveLength(6);
 expect(cases.filter(c=>c.gold.uncertainty)).toHaveLength(28);expect(cases.filter(c=>c.gold.score).reduce((n,c)=>n+c.gold.wanted.length,0)).toBe(160);
 for(const [path,hash]of Object.entries(base.fingerprints)){const snapshot=path==='src/core/story-obligation-recall.ts'?'docs/benchmarks/rp294-final-obligation.txt':path==='src/core/game-context.ts'?'docs/benchmarks/rp294-final-game-context.txt':path;expect(digest(text(snapshot)),path).toBe(hash);}
 expect(Object.keys(base.fingerprints)).toHaveLength(414);expect(Object.keys(base.fingerprints).filter(p=>p.startsWith('src/'))).toHaveLength(410);
 const rows=cases.map(c=>({id:c.id,family:c.family,locale:c.locale,plot:c.plotId,noise:c.noiseCount,inputDigest:digest(c.input),...c.gold,gold:c.gold.wanted.map(id=>{const i=c.ids.indexOf(id);return {id,fact:c.input.story!.facts[i],source:c.sources[i],roles:c.input.story!.roleSeeds![i]!.binding.roles};})}));
 expect(rows).toEqual(base.rows);expect(digest(rows.map(({gold,...r})=>r))).toBe(base.inputDigest);expect(digest(rows.map(r=>[r.id,r.gold,r.uncertainty]))).toBe(base.goldDigest);
});
for(const c of cases)it(`${c.id}: schema, distinct task owners, cancellation and complete source gold`,()=>{
 const s=c.input.story!;expect(s.facts.every(validStoryFact)).toBe(true);expect(validFactRoleSeeds(s.roleSeeds,s.facts)).toBe(true);
 expect(s.facts).toHaveLength(c.noiseCount+15);expect(new Set(c.ids).size).toBe(s.facts.length);expect(new Set(c.sources).size).toBe(s.facts.length);
 const a=c.ids.indexOf('a0'),b=c.ids.indexOf('b2');expect(s.facts[a]!.task!.status).toBe('open');expect(s.facts[b]!.task!.status).toBe('cancelled');
 expect(s.facts[a]!.task!.key).not.toBe(s.facts[b]!.task!.key);expect(s.roleSeeds![a]!.binding.roles.promisor!.id).not.toBe(s.roleSeeds![b]!.binding.roles.promisor!.id);
 expect(c.gold.wanted.every(id=>c.ids.includes(id)&&!['old','b0'].includes(id))).toBe(true);
});
it('preserves the immutable first result and independently recomputes its integrity and recall counters',()=>{
 const seal=read('docs/benchmarks/rp295-first-report-seal.json'),r=read(seal.report);
 expect(sha(seal.baseline)).toBe(seal.baselineHash);expect(sha(seal.report)).toBe(seal.reportHash);expect(r.baselineDigest).toBe(digest(base));expect(r.fingerprints).toEqual(base.fingerprints);
 expect(r.results).toHaveLength(60);expect(r.inputDigest).toBe(base.inputDigest);expect(r.goldDigest).toBe(base.goldDigest);
 for(const row of r.results){const c=cases.find(c=>c.id===row.id)!;expect(row.gold).toEqual(c.gold.wanted);expect(row.missing).toEqual(row.gold.filter((id:string)=>!row.selectedIds.includes(id)));expect(row.complete).toBe(row.score?row.missing.length===0:null);expect(row.issues).toEqual([]);}
 const scored=r.results.filter((x:any)=>x.score);
 expect(r.summary.complete).toBe(scored.filter((x:any)=>x.complete).length);expect(r.summary.missingFacts).toBe(scored.reduce((n:number,x:any)=>n+x.missing.length,0));
 expect(r.summary.confidenceGapCases).toBe(r.results.filter((x:any)=>x.confidenceIssues.length).length);expect(r.summary.integrityCases).toBe(0);
});
it('keeps previous first seals, snapshots and seen memory reports separate from this audit',()=>{
 for(const stage of ['rp292','rp289','rp287','rp283']){const seal=read(`docs/benchmarks/${stage}-first-report-seal.json`);expect(sha(seal.baseline)).toBe(seal.baselineHash);expect(sha(seal.report)).toBe(seal.reportHash);}
 for(const [stage,count]of [['rp292',60],['rp289',54],['rp287',62],['rp283',54]] as const){const r=read(`docs/benchmarks/rp294b-${stage}-seen-results.json`);expect(r.summary.complete).toBe(count);expect(r.summary.missingFacts).toBe(0);}
});
it('anchors the first observed 23/34 completeness and four unguarded free references, without rewriting gold',()=>{
 const r=read('docs/benchmarks/rp295-access-results.json');
 expect(r.summary).toEqual({cases:60,scored:34,complete:23,goldFacts:160,missingFacts:23,integrityCases:0,confidenceGapCases:4,falseCompleteCases:0});
 expect(r.results.filter((x:any)=>x.score&&!x.complete)).toHaveLength(11);
 expect(r.results.filter((x:any)=>x.confidenceIssues.length).every((x:any)=>x.family==='free-reference'&&x.coverage.kind==='unverified'&&x.confidenceIssues[0]==='guard-missing')).toBe(true);
 expect(r.results.filter((x:any)=>x.uncertaintyExpected&&x.guard)).toHaveLength(24);
});
