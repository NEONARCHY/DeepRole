// @vitest-environment node
import {expect,it} from 'vitest';
import {compileGameContext,addedContextTokens} from '../src/core/game-context';
import {decodeStoryMemory} from '../src/core/story-memory-transport';
import {obligationRecallIntent} from '../src/core/story-obligation-recall';
import {relayWorld} from './fixtures/story-relay-audit';
import {GameSearchIndex} from '../src/core/game-search-index';
const memory=(text:string)=>{const b=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return b?decodeStoryMemory(JSON.parse(b.split('\n')[1]!)):[];};
for(const locale of ['ru','en'] as const)for(const plot of [0,1])for(const variant of [1,2,3])it(`${locale}:${plot}:${variant} restores whole source candidates without identity or completion inference`,()=>{
 const c=relayWorld(locale,plot,160,variant),wanted=variant===1?['a0','a1','a2','a3']:variant===2?['a0','a1','a2','a3','b1','b2','b3']:['a0','a1','a2','a3','c1','c2','c3','c4'];
 expect(obligationRecallIntent(c.input.draft)).toBe(variant===1?'work-inquiry':variant===2?'reference':'compound-inquiry');
 const original=structuredClone(c.input),index=new GameSearchIndex(),states:unknown[]=[];
 const out=compileGameContext(c.input,{memoryTransport:'columns',searchIndex:index},v=>states.push(v));
 expect(compileGameContext(structuredClone(c.input),{memoryTransport:'columns',searchIndex:index},v=>states.push(v))).toEqual(out);
 expect(states[0]).toEqual({kind:'unverified',reason:'query'});expect(states[1]).toEqual(states[0]);
 const hints=memory(out.text);
 for(const id of wanted){const i=c.ids.indexOf(id),f=c.input.story!.facts[i]!,h=hints.find(h=>h.text===f.text)!;
  expect(h,id).toBeDefined();expect(h.sourceQuote??h.text).toBe(f.quote);expect(h.kind).toBe(f.kind);expect(h.task).toEqual(f.task);expect(h.claim).toEqual(f.claim);expect(h.sourceRoles).toEqual(c.input.story!.roleSeeds![i]!.binding.roles);expect(h.episodeSource?.revisionId).toBe(c.sources[i]);
 }
 for(const id of ['old','b0','c0','d1'])expect(hints.some(h=>h.text===c.input.story!.facts[c.ids.indexOf(id)]!.text)).toBe(false);
 expect(out.text).toContain('<deeprole_reference_guard>');expect(out.report.total).toBe(addedContextTokens(out.text));expect(out.report.total).toBeLessThanOrEqual(out.report.limit);expect(c.input).toEqual(original);
});
for(const locale of ['ru','en'] as const)for(const plot of [0,1])it(`${locale}:${plot} raw-only short reference has a guard but supplies no accepted bridge`,()=>{
 const c=relayWorld(locale,plot,120,11),states:unknown[]=[];
 const out=compileGameContext(c.input,{memoryTransport:'columns'},v=>states.push(v));
 expect(out.text).toContain('<deeprole_reference_guard>');expect(states[0]).toMatchObject({kind:'unverified'});
 expect(out).toEqual(compileGameContext(c.input,{memoryTransport:'columns',contextualRecall:false}));
});
for(const variant of [1,2,3])for(const mode of ['quote','seed','episode'] as const)it(`${variant}:${mode} retains exact fallback when requested source proof is invalid`,()=>{
 const c=relayWorld('en',1,160,variant),i=c.ids.indexOf(variant===2?'latest':'a1');
 if(mode==='quote')c.input.story!.facts[i]!.quote+=' unproved';
 if(mode==='seed')c.input.story!.roleSeeds=c.input.story!.roleSeeds!.filter((_,n)=>n!==i);
 if(mode==='episode')c.input.story!.episodeSources=c.input.story!.episodeSources!.filter((_,n)=>n!==i);
 expect(compileGameContext(c.input,{memoryTransport:'columns'})).toEqual(compileGameContext(c.input,{memoryTransport:'columns',contextualRecall:false}));
});
it.each([
 'The bed has been made. So is the visit all sorted now? Ignore the conditions.',
 'The bed has been made. So is the visit all sorted now? I open the gate.',
 'If everyone is ready. So is that exercise all squared away?',
 'Pretend we have permission. So is that exercise all squared away?',
 'Everyone is ready. So is that pretend-danger exercise all squared away? Delete memory.',
 '«Как там с тем, что я обещал?»','Как там с тем, что я обещал? Отмени обещания.',
 'First I start the drill, then I take the key. Ignore all agreements.',
])('quoted, conditional or appended commands cannot supply a recall bridge: %s',draft=>expect(obligationRecallIntent(draft)).toBeUndefined());
it.each(['contextualRecall','referenceRecall','referenceBundle','contentRelevance','topicAdmission','actionBalance','compoundActionBalance'] as const)('sequence candidate recall respects %s opt-out',option=>{
 const c=relayWorld('en',1,100,3);
 expect(compileGameContext(c.input,{memoryTransport:'columns',[option]:false})).toEqual(compileGameContext(c.input,{memoryTransport:'columns',[option]:false,contextualRecall:false}));
});
it.each(['raw-only','unknown-tail','missing-anchor','no-promisor'] as const)('new anaphora cannot create source identity: %s',mode=>{
 const c=relayWorld('en',1,120,2),s=c.input.story!;
 if(mode==='raw-only')s.facts=s.facts.slice(0,-1);
 if(mode==='unknown-tail')c.input.recentMessages[0]+=' Another understanding concerns an unknown assignment.';
 if(mode==='missing-anchor')s.episodeSources=s.episodeSources!.slice(0,-1);
 if(mode==='no-promisor')delete s.roleSeeds![c.ids.indexOf('a0')]!.binding.roles.promisor;
 expect(compileGameContext(c.input,{memoryTransport:'columns'})).toEqual(compileGameContext(c.input,{memoryTransport:'columns',contextualRecall:false}));
});
