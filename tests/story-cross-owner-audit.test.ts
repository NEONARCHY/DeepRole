// @vitest-environment node
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {crossOwnerScenarios} from './fixtures/story-cross-owner-audit';
import {validStoryFact} from '../src/core/story-update';
import {validFactRoleSeeds} from '../src/core/story-role-binding';
import {validEpisodeSources} from '../src/core/story-episodes';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const text=(p:string)=>readFileSync(p,'utf8').replaceAll('\r\n','\n');
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sha=(p:string)=>createHash('sha256').update(text(p)).digest('hex');
const base=read('tests/fixtures/story-cross-owner-audit-baseline.json'),cases=crossOwnerScenarios();
const rows=cases.map(c=>({id:c.id,family:c.family,locale:c.locale,plot:c.plotId,noiseScenes:c.noiseCount,inputDigest:digest(c.input),...c.gold,gold:c.gold.wanted.map(id=>{const i=c.ids.indexOf(id);return {id,fact:c.input.story!.facts[i],source:c.sources[i],roles:c.input.story!.roleSeeds![i]!.binding.roles};})}));
it('pins preregistered new prose/gold/protocol/own runner/all runtime before the first evaluation',()=>{
 expect(cases).toHaveLength(96);expect(rows).toEqual(base.rows);expect(new Set(cases.map(c=>c.id)).size).toBe(96);
 expect(digest(rows.map(({gold,...r})=>r))).toBe(base.inputDigest);expect(digest(rows.map(r=>[r.id,r.gold,r.uncertainty]))).toBe(base.goldDigest);
 for(const [path,hash]of Object.entries(base.fingerprints)){const snapshot=path==='src/core/game-context.ts'?'docs/benchmarks/rp291-final-game-context.txt':path==='src/core/story-obligation-recall.ts'?'docs/benchmarks/rp291-final-obligation.txt':path;expect(digest(text(snapshot)),path).toBe(hash);}
 expect(Object.keys(base.fingerprints)).toHaveLength(414);expect(Object.keys(base.fingerprints).filter(p=>p.startsWith('src/'))).toHaveLength(410);
 expect(cases.filter(c=>c.gold.score)).toHaveLength(60);expect(cases.filter(c=>c.gold.control)).toHaveLength(30);expect(cases.filter(c=>c.gold.budget)).toHaveLength(6);expect(cases.filter(c=>c.gold.uncertainty)).toHaveLength(42);
 expect(cases.filter(c=>c.gold.score).reduce((n,c)=>n+c.gold.wanted.length,0)).toBe(306);
});
for(const c of cases)it(`${c.id}: separate canonical owners, current cancellation and complete original conditions`,()=>{
 const s=c.input.story!,facts=s.facts;expect(facts).toHaveLength(c.noiseCount+15);expect(facts.every(validStoryFact)).toBe(true);
 expect(validFactRoleSeeds(s.roleSeeds,facts)).toBe(true);expect(validEpisodeSources(c.sources)).toBe(true);expect(new Set(c.ids).size).toBe(facts.length);expect(new Set(c.sources).size).toBe(facts.length);
 expect(c.gold.wanted.every(id=>c.ids.includes(id)&&!['aOld','b0'].includes(id))).toBe(true);
 const a=c.ids.indexOf('a0'),b=c.ids.indexOf('b2'),cp=c.ids.indexOf('c0');
 expect(facts[a]!.task?.status).toBe('open');expect(facts[b]!.task?.status).toBe('cancelled');expect(facts[cp]!.task?.status).toBe('open');
 expect(s.roleSeeds![a]!.binding.roles.promisor!.id).not.toBe(s.roleSeeds![b]!.binding.roles.promisor!.id);expect(facts[a]!.task!.key).not.toBe(facts[b]!.task!.key);expect(c.sources[a]).not.toBe(c.sources[b]);
 if(['same-label-reference','rephrased-reference','independent-things'].includes(c.family))expect(c.input.recentMessages[0]).toBe(facts.at(-1)!.quote);
 if(['raw-only','unknown-tail'].includes(c.family))expect(c.input.recentMessages[0]).not.toBe(facts.at(-1)!.quote);
});
it('keeps the first report immutable and recomputes losses/confidence without requiring a green score',()=>{
 const seal=read('docs/benchmarks/rp292-first-report-seal.json'),r=read(seal.report);
 expect(sha(seal.baseline)).toBe(seal.baselineHash);expect(sha(seal.report)).toBe(seal.reportHash);expect(r.baselineDigest).toBe(digest(base));expect(r.fingerprints).toEqual(base.fingerprints);expect(r.inputDigest).toBe(base.inputDigest);expect(r.goldDigest).toBe(base.goldDigest);expect(r.results).toHaveLength(96);
 for(const row of r.results){const c=cases.find(c=>c.id===row.id)!;expect(row.gold).toEqual(c.gold.wanted);expect(row.missing).toEqual(row.gold.filter((id:string)=>!row.selectedIds.includes(id)));expect(row.complete).toBe(row.score?!row.missing.length:null);expect(row.issues).toEqual([]);
  expect(row.report.total<=row.report.limit||row.report.required>row.report.limit).toBe(true);
  expect(row.confidenceIssues.includes('uncertainty-not-signalled')).toBe(c.gold.uncertainty&&row.coverage.kind!=='unverified');
  expect(row.confidenceIssues.includes('unresolved-guard-missing')).toBe(c.gold.uncertainty&&!row.guard);
  expect(row.confidenceIssues.includes('false-complete-relative-to-gold')).toBe(row.score&&row.missing.length>0&&row.coverage.kind==='complete');
 }
 const scored=r.results.filter((r:any)=>r.score);
 expect(r.summary.complete).toBe(scored.filter((r:any)=>r.complete).length);expect(r.summary.missingFacts).toBe(scored.reduce((n:number,r:any)=>n+r.missing.length,0));expect(r.summary.confidenceGapCases).toBe(r.results.filter((r:any)=>r.confidenceIssues.length).length);expect(r.summary.falseCompleteCases).toBe(r.results.filter((r:any)=>r.confidenceIssues.includes('false-complete-relative-to-gold')).length);
});
it('preserves all prior independent first reports and runtime-tested seen reports',()=>{
 for(const stage of ['rp283','rp287','rp289']){const seal=read(`docs/benchmarks/${stage}-first-report-seal.json`);expect(sha(seal.baseline)).toBe(seal.baselineHash);expect(sha(seal.report)).toBe(seal.reportHash);}
 for(const stage of ['rp289','rp287','rp283']){const r=read(`docs/benchmarks/rp291-${stage}-premise-seen-results.json`);for(const [path,hash]of Object.entries(r.currentDigests)){const snapshot=path==='src/core/game-context.ts'?'docs/benchmarks/rp291-final-game-context.txt':path==='src/core/story-obligation-recall.ts'?'docs/benchmarks/rp291-final-obligation.txt':path;expect(digest(text(snapshot))).toBe(hash);}}
});
it('anchors the first observed 39/60 result and six free-reference warning gaps for future seen-only fixes',()=>{
 const r=read('docs/benchmarks/rp292-cross-owner-results.json');
 expect(r.summary).toEqual({cases:96,scored:60,complete:39,goldFacts:306,missingFacts:42,casesWithIntegrityIssues:0,uncertaintyExpected:42,confidenceGapCases:6,falseCompleteCases:0});
 expect(r.results.filter((v:any)=>v.score&&!v.complete)).toHaveLength(21);
 expect(r.results.filter((v:any)=>v.uncertaintyExpected&&v.coverage.kind==='unverified')).toHaveLength(42);
 expect(r.results.filter((v:any)=>v.uncertaintyExpected&&v.guard)).toHaveLength(36);
 expect(r.results.filter((v:any)=>v.confidenceIssues.length).every((v:any)=>v.family==='rephrased-reference'&&v.coverage.kind==='unverified'&&!v.guard&&v.confidenceIssues[0]==='unresolved-guard-missing')).toBe(true);
});
