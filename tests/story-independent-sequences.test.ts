// @vitest-environment node
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {independentScenarios} from './fixtures/story-independent-sequences';
import {independentScenarios as preflightScenarios} from './fixtures/story-independent-sequences-preflight';
import {validStoryFact} from '../src/core/story-update';
import {validFactRoleSeeds} from '../src/core/story-role-binding';
import {validEpisodeSources} from '../src/core/story-episodes';
import {storyFactIdentity} from '../src/core/story-memory-lifecycle';

const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const frozen=JSON.parse(readFileSync('tests/fixtures/story-independent-sequences-v2-baseline.json','utf8'));
const cases=independentScenarios();
const rows=cases.map(c=>({id:c.id,family:c.family,locale:c.locale,plot:c.plotId,noiseScenes:c.noiseCount,inputDigest:digest(c.input),gold:c.gold.wanted.map(id=>{const i=c.ids.indexOf(id);return {id,fact:c.input.story!.facts[i],source:c.sources[i],speaker:c.input.entities![c.speakers[i]!]!.id};}),score:c.gold.score,rejectCompound:c.gold.rejectCompound,noGoldReason:c.gold.noGoldReason}));
it('limits pre-evaluation schema repair to one non-gold kind; never changes prose, requests or labels',()=>{
 const old=preflightScenarios(),first=JSON.parse(readFileSync('tests/fixtures/story-independent-sequences-baseline.json','utf8'));
 expect(frozen.preflightBaselineDigest).toBe(digest(first));expect(frozen.goldDigest).toBe(first.goldDigest);
 const archives={'tests/fixtures/story-independent-sequences.ts':'tests/fixtures/story-independent-sequences-preflight.ts','scripts/story-search-independent-sequences.mjs':'scripts/story-search-independent-sequences-preflight.mjs','docs/INDEPENDENT-SEQUENCE-EVALUATION.md':'docs/INDEPENDENT-SEQUENCE-PREFLIGHT.md'};
 for(const [path,copy] of Object.entries(archives))expect(digest(readFileSync(copy,'utf8').replaceAll('\r\n','\n'))).toBe(first.fingerprints[path]);
 old.forEach((c,i)=>{const at=c.ids.indexOf('b-old'),f=c.input.story!.facts[at]!;expect(f.kind).toBe('event');f.kind='task';c.input.story!.roleSeeds![at]!.key=storyFactIdentity(f);expect(c.input).toEqual(cases[i]!.input);expect(c.gold).toEqual(cases[i]!.gold);expect(c.ids).toEqual(cases[i]!.ids);});
});
it('keeps all pre-evaluation inputs, labels and protocol exact without pinning future runtime',()=>{
 expect(cases).toHaveLength(84);expect(new Set(cases.map(c=>c.id)).size).toBe(84);
 expect(cases.filter(c=>c.gold.score)).toHaveLength(54);expect(cases.filter(c=>c.gold.rejectCompound)).toHaveLength(24);
 expect(cases.filter(c=>c.family==='scale').map(c=>c.noiseCount)).toEqual([250,1000,5000,250,1000,5000]);
 expect(rows).toEqual(frozen.rows);expect(digest(rows.map(({gold,...r})=>r))).toBe(frozen.inputDigest);expect(digest(rows.map(r=>[r.id,r.gold]))).toBe(frozen.goldDigest);
 for(const [path,hash] of Object.entries(frozen.fingerprints)){
  expect(hash).toMatch(/^[a-f0-9]{64}$/u);
  if(!path.startsWith('src/'))expect(digest(readFileSync(path,'utf8').replaceAll('\r\n','\n')),path).toBe(hash);
 }
});
for(const c of cases)it(`RP283 fixed accepted sources: ${c.id}`,()=>{
 expect(c.input.story!.facts).toHaveLength(c.noiseCount+13);
 expect(c.input.story!.facts.every(validStoryFact)).toBe(true);
 expect(validFactRoleSeeds(c.input.story!.roleSeeds,c.input.story!.facts)).toBe(true);expect(validEpisodeSources(c.sources)).toBe(true);
 expect(new Set(c.ids).size).toBe(c.ids.length);expect(c.ids).toHaveLength(c.sources.length);
 expect(c.gold.wanted.every(id=>c.ids.includes(id))).toBe(true);expect(c.gold.wanted).not.toContain('a-old');expect(c.gold.wanted).not.toContain('b-old');
 if(c.family==='three-actions'||c.family==='narrative-sequence'||c.family==='scale')expect(c.gold.wanted).toHaveLength(10);
 if(c.family==='reference')expect(c.input.recentMessages![0]).toBe(c.input.story!.facts.at(-1)!.text);
});
