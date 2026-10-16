// @vitest-environment node
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {mixedAuditScenarios} from './fixtures/story-mixed-obligation-audit';
import {validStoryFact} from '../src/core/story-update';
import {validFactRoleSeeds} from '../src/core/story-role-binding';
import {validEpisodeSources} from '../src/core/story-episodes';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const normalized=(p:string)=>readFileSync(p,'utf8').replaceAll('\r\n','\n');
const sha=(p:string)=>createHash('sha256').update(normalized(p)).digest('hex');
const base=read('tests/fixtures/story-mixed-obligation-audit-v2-baseline.json'),initial=read('tests/fixtures/story-mixed-obligation-audit-baseline.json');
const cases=mixedAuditScenarios();
const rows=cases.map(c=>({id:c.id,family:c.family,locale:c.locale,plot:c.plotId,noiseScenes:c.noiseCount,inputDigest:digest(c.input),...c.gold,gold:c.gold.wanted.map(id=>{const i=c.ids.indexOf(id);return {id,fact:c.input.story!.facts[i],source:c.sources[i],roles:c.input.story!.roleSeeds![i]!.binding.roles};})}));
it('pins new authored queries/gold before the first compiler and preserves the pre-evaluation provenance correction',()=>{
 expect(cases).toHaveLength(96);expect(new Set(cases.map(c=>c.id)).size).toBe(96);expect(rows).toEqual(base.rows);expect(rows).toEqual(initial.rows);
 expect(base.priorPreflightDigest).toBe(digest(initial));expect(base.inputDigest).toBe(initial.inputDigest);expect(base.goldDigest).toBe(initial.goldDigest);
 expect(digest(rows.map(({gold,...r})=>r))).toBe(base.inputDigest);expect(digest(rows.map(r=>[r.id,r.gold,r.uncertainty]))).toBe(base.goldDigest);
 expect(base.fingerprints['scripts/story-search-mixed-obligation-audit.mjs']).toBe(digest(normalized('scripts/story-search-mixed-obligation-audit.mjs')));
 const preflight=normalized('docs/benchmarks/rp289-preflight-runner.txt');expect(preflight).toContain("'scripts/story-search-obligation-holdout.mjs'");
 for(const [path,hash] of Object.entries(base.fingerprints)){
  const snapshot=path==='src/core/story-obligation-recall.ts'?'docs/benchmarks/rp289-final-obligation.txt':path==='src/core/game-context.ts'?'docs/benchmarks/rp289-final-game-context.txt':path;
  expect(digest(normalized(snapshot)),path).toBe(hash);
  if(path.startsWith('src/'))expect(hash).toBe(initial.fingerprints[path]);
 }
 expect(cases.filter(c=>c.gold.score)).toHaveLength(54);expect(cases.filter(c=>c.gold.control)).toHaveLength(36);expect(cases.filter(c=>c.gold.budget)).toHaveLength(6);expect(cases.filter(c=>c.gold.uncertainty)).toHaveLength(42);
});
for(const c of cases)it(`valid separate source/status/gold: ${c.id}`,()=>{
 const facts=c.input.story!.facts;expect(facts).toHaveLength(c.noiseCount+16);expect(facts.every(validStoryFact)).toBe(true);
 expect(validFactRoleSeeds(c.input.story!.roleSeeds,facts)).toBe(true);expect(validEpisodeSources(c.sources)).toBe(true);
 expect(new Set(c.ids).size).toBe(facts.length);expect(new Set(c.sources).size).toBe(facts.length);
 expect(c.gold.wanted.every(id=>c.ids.includes(id)&&!['aOld','c0','d0'].includes(id))).toBe(true);
 const at=(id:string)=>facts[c.ids.indexOf(id)]!;
 expect(new Set(['a0','b0','c1','d1','e0'].map(id=>at(id).task!.key)).size).toBe(5);
 expect(at('a0').task?.status).toBe('open');expect(at('b0').task?.status).toBe('open');expect(at('c1').task?.status).toBe('completed');expect(at('d1').task?.status).toBe('cancelled');expect(at('e0').task?.status).toBe('open');
 if(c.family==='proved-reference'||c.family==='independent-mentions')expect(c.input.recentMessages[0]).toBe(facts.at(-1)!.quote);
 if(c.family==='false-raw-bridge'||c.family==='unknown-tail')expect(c.input.recentMessages[0]).not.toBe(facts.at(-1)!.quote);
});
it('preserves the first result and recomputes every loss instead of requiring a passing recall score',()=>{
 const seal=read('docs/benchmarks/rp289-first-report-seal.json'),r=read(seal.report);
 expect(sha(seal.baseline)).toBe(seal.baselineHash);expect(sha(seal.report)).toBe(seal.reportHash);
 expect(r.baselineDigest).toBe(digest(base));expect(r.fingerprints).toEqual(base.fingerprints);expect(r.inputDigest).toBe(base.inputDigest);expect(r.goldDigest).toBe(base.goldDigest);expect(r.results).toHaveLength(96);
 for(const row of r.results){const c=cases.find(c=>c.id===row.id)!;
  expect(row.gold).toEqual(c.gold.wanted);expect(row.missing).toEqual(row.gold.filter((id:string)=>!row.selectedIds.includes(id)));expect(row.complete).toBe(row.score?!row.missing.length:null);
  expect(row.issues).toEqual([]);expect(row.report.total<=row.report.limit||row.report.required>row.report.limit).toBe(true);
  expect(row.confidenceIssues.includes('uncertainty-not-signalled')).toBe(c.gold.uncertainty&&row.coverage.kind!=='unverified');
  expect(row.confidenceIssues.includes('unresolved-guard-missing')).toBe(c.gold.uncertainty&&!row.guard);
  expect(row.confidenceIssues.includes('false-complete-relative-to-gold')).toBe(row.score&&row.missing.length>0&&row.coverage.kind==='complete');
 }
 const group=(rs:any[])=>{const scored=rs.filter(x=>x.score);return {cases:rs.length,scored:scored.length,complete:scored.filter(x=>x.complete).length,goldFacts:scored.reduce((n,x)=>n+x.gold.length,0),missingFacts:scored.reduce((n,x)=>n+x.missing.length,0),casesWithIntegrityIssues:rs.filter(x=>x.issues.length).length,uncertaintyExpected:rs.filter(x=>x.uncertaintyExpected).length,confidenceGapCases:rs.filter(x=>x.confidenceIssues.length).length,falseCompleteCases:rs.filter(x=>x.confidenceIssues.includes('false-complete-relative-to-gold')).length};};
 expect(r.summary).toEqual(group(r.results));expect(r.summary.scored).toBe(54);expect(r.summary.goldFacts).toBe(204);
 for(const g of r.groups)expect(g).toEqual({family:g.family,locale:g.locale,...group(r.results.filter((x:any)=>x.family===g.family&&x.locale===g.locale))});
});
it('keeps both earlier independent reports and seals intact',()=>{
 for(const path of ['docs/benchmarks/rp283-first-report-seal.json','docs/benchmarks/rp287-first-report-seal.json']){
  const seal=read(path);expect(sha(seal.baseline)).toBe(seal.baselineHash);expect(sha(seal.report)).toBe(seal.reportHash);
 }
});
it('preserves the first observed limits rather than silently replacing them with a later seen fix',()=>{
 const r=read('docs/benchmarks/rp289-mixed-obligation-results.json');
 expect(r.summary).toEqual({cases:96,scored:54,complete:43,goldFacts:204,missingFacts:17,casesWithIntegrityIssues:0,uncertaintyExpected:42,confidenceGapCases:12,falseCompleteCases:0});
 expect(r.results.filter((x:any)=>x.score&&!x.complete)).toHaveLength(11);
 expect(r.results.filter((x:any)=>x.family==='paraphrase-delivery'&&x.score&&!x.complete)).toHaveLength(6);
 expect(r.results.filter((x:any)=>x.family==='proved-reference'&&x.score&&!x.complete)).toHaveLength(5);
 expect(r.results.filter((x:any)=>x.confidenceIssues.length).every((x:any)=>x.coverage.kind==='unverified'&&!x.guard&&x.confidenceIssues.length===1&&x.confidenceIssues[0]==='unresolved-guard-missing')).toBe(true);
 expect(r.results.filter((x:any)=>x.uncertaintyExpected&&x.guard)).toHaveLength(30);
});
