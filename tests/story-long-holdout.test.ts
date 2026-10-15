import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {longScenarios} from './fixtures/story-long-holdout';
import {validStoryFact} from '../src/core/story-update';
import {validFactRoleSeeds} from '../src/core/story-role-binding';
import {validEpisodeSources} from '../src/core/story-episodes';

const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const frozen=JSON.parse(readFileSync('tests/fixtures/story-long-holdout-baseline.json','utf8'));
const cases=longScenarios();
describe('RP280 independently frozen long stories',()=>{
 it('fixes all 78 identities and the historical audit manifest without pinning future runtime',()=>{
  expect(new Set(cases.map(c=>c.id)).size).toBe(78);
  expect(cases.filter(c=>c.family==='scale').map(c=>c.noiseCount)).toEqual([250,1000,5000,250,1000,5000]);
  // The original runner verifies runtime equality BEFORE the first evaluation.
  // These are historical fingerprints, not a permanent ban on future fixes.
  for(const [path,hash] of Object.entries(frozen.fingerprints)){
   expect(hash,path).toMatch(/^[a-f0-9]{64}$/u);
   if(!path.startsWith('src/'))expect(digest(readFileSync(path,'utf8').replaceAll('\r\n','\n')),path).toBe(hash);
  }
 });
 for(const c of cases)it(c.id,()=>{
  const row=frozen.rows.find((r:{id:string})=>r.id===c.id)!;
  expect(digest(c.input)).toBe(row.inputDigest);
  expect(c.input.story!.facts.every(validStoryFact)).toBe(true);
  expect(validFactRoleSeeds(c.input.story!.roleSeeds,c.input.story!.facts)).toBe(true);
  expect(validEpisodeSources(c.sources)).toBe(true);
  expect(c.input.story!.facts.length).toBe(c.noiseCount+12);
  expect(c.ids).toHaveLength(new Set(c.ids).size);
  expect(row.guard).toBe(c.gold.guard);
  expect(row.noGoldReason).toBe(c.gold.noGoldReason??null);
  expect(row.gold).toEqual(c.gold.wanted.map(id=>{const i=c.ids.indexOf(id);return {id,fact:c.input.story!.facts[i],source:c.sources[i],speaker:c.input.entities![c.speakers[i]!]!.id};}));
 });
});
