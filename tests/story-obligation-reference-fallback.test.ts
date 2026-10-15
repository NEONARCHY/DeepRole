// @vitest-environment node
import {it,expect} from 'vitest';
import {compileGameContext,addedContextTokens} from '../src/core/game-context';
import {decodeStoryMemory} from '../src/core/story-memory-transport';
import {obligationRecallFacts} from '../src/core/story-obligation-recall';
import {createStoryRoleReader} from '../src/core/story-source-roles';
import {storedRoleReader,roleSeed} from '../src/core/story-role-binding';
import {createEpisodeReader} from '../src/core/story-episodes';
import {storyRetrievalQuery} from '../src/core/story-retrieval-query';
import {compactStoryFactSources} from '../src/core/story-update';
import {GameSearchIndex} from '../src/core/game-search-index';
import {obligationHoldoutScenarios,obligationHoldoutWorld} from './fixtures/story-obligation-holdout';

const memory=(text:string)=>{const b=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return b?decodeStoryMemory(JSON.parse(b.split('\n')[1]!)):[];};
const boundGroup=(c:ReturnType<typeof obligationHoldoutWorld>)=>{
 const s=c.input.story!,scope={worldId:s.world.id,entities:c.input.entities!},r=storyRetrievalQuery(c.input.draft,scope);
 return obligationRecallFacts(compactStoryFactSources(s.facts),c.input.draft,c.input.recentMessages,r.relevanceNames,createStoryRoleReader(scope,c.input.draft,storedRoleReader(s.roleSeeds!,c.input.entities!,s.world.id)),createEpisodeReader(s.roleSeeds,s.episodeSources));
};
for(const c of obligationHoldoutScenarios().filter(c=>c.gold.uncertainty))it(`${c.id}: unresolved is explicit, including failed/raw-only/ambiguous bridges`,()=>{
 const original=structuredClone(c.input),index=new GameSearchIndex(),states:unknown[]=[];
 const out=compileGameContext(c.input,{memoryTransport:'columns',searchIndex:index},v=>states.push(v));
 expect(compileGameContext(structuredClone(c.input),{memoryTransport:'columns',searchIndex:index},v=>states.push(v))).toEqual(out);
 expect(states).toEqual([{kind:'unverified',reason:'query'},{kind:'unverified',reason:'query'}]);
 expect(out.text).toContain('<deeprole_reference_guard>');expect(out.text).toContain('NOT resolved by DeepRole');expect(out.report.total).toBe(addedContextTokens(out.text));expect(out.report.total).toBeLessThanOrEqual(out.report.limit);
 const hints=memory(out.text);
 for(const id of c.gold.wanted){const at=c.ids.indexOf(id),fact=c.input.story!.facts[at]!,h=hints.find(h=>h.text===fact.text)!;expect(h,id).toBeDefined();expect(h.sourceQuote??h.text).toBe(fact.quote);expect(h.task).toEqual(fact.task);expect(h.claim).toEqual(fact.claim);expect(h.sourceRoles).toEqual(c.input.story!.roleSeeds![at]!.binding.roles);expect(h.episodeSource?.revisionId).toBe(c.sources[at]);}
 for(const h of hints)expect(c.input.story!.facts.some(f=>f.text===h.text)).toBe(true);
 expect(c.input).toEqual(original);
});
for(const locale of ['ru','en'] as const)for(const size of [720,5000])it(`${locale} ${size}: a qualified phrase shadows a generic prefix only at the same occurrence`,()=>{
 const c=obligationHoldoutWorld(locale,0,size,6),group=boundGroup(c)!;
 expect(group).toBeDefined();const ids=group.map(f=>c.ids[c.input.story!.facts.indexOf(f)]);
 for(const id of ['a0','a1','a2','a3','b0','b1','b2','latest'])expect(ids).toContain(id);
 expect(ids).not.toContain('c1');expect(ids).not.toContain('e0');
 const out=memory(compileGameContext(c.input,{memoryTransport:'columns'}).text);
 expect(out.find(h=>h.task?.key.endsWith('-duty-a'))?.sourceRoles?.promisor?.id).toBe(c.input.entities![0]!.id);
 expect(out.find(h=>h.task?.key.endsWith('-duty-b'))?.sourceRoles?.promisor?.id).toBe(c.input.entities![1]!.id);
},20000);
for(const locale of ['ru','en'] as const)for(const mode of ['separate-short-occurrence','two-full-objects','raw-topic','no-accepted-bridge','damaged-related-quote','missing-anchor-source','renamed-owner','tiny-budget','required-overflow'] as const)it(`${locale}: ${mode} cannot create resolved identity or a late unmetered guard`,()=>{
 const c=obligationHoldoutWorld(locale,0,720,6),s=c.input.story!,anchor=s.facts.at(-1)!,at=c.ids.indexOf('a1');
 if(mode==='separate-short-occurrence'||mode==='two-full-objects'){
  const body=locale==='ru'?' Мы также обсуждаем обещание про старый бархатный жилет.':' We also discuss a promise about the old velvet waistcoat.';
  anchor.text+=body;anchor.quote=anchor.text;c.input.recentMessages=[anchor.text];s.roleSeeds![s.roleSeeds!.length-1]=roleSeed(anchor,{...s.roleSeeds!.at(-1)!.binding,quote:anchor.quote});
  if(mode==='separate-short-occurrence'){
   // The shorter words occur both INSIDE the cloak label and independently.
   const short=locale==='ru'?'старый бархатный жилет':'old velvet waistcoat';anchor.text=anchor.text.replace(short,locale==='ru'?'старый бархатный предмет':'old velvet object');anchor.quote=anchor.text;c.input.recentMessages=[anchor.text];s.roleSeeds![s.roleSeeds!.length-1]=roleSeed(anchor,{...s.roleSeeds!.at(-1)!.binding,quote:anchor.quote});
  }
 }
 if(mode==='raw-topic')c.input.recentMessages[0]+=' Another promise concerns something unknown.';
 if(mode==='no-accepted-bridge')s.facts=s.facts.slice(0,-1);
 if(mode==='damaged-related-quote')s.facts[at]!.quote+=' Changed evidence.';
 if(mode==='missing-anchor-source')s.episodeSources=s.episodeSources!.slice(0,-1);
 if(mode==='renamed-owner')c.input.entities![0]!.name='Renamed owner';
 if(mode==='tiny-budget')c.input.settings.contextBudget=600;
 if(mode==='required-overflow'){c.input.settings.contextBudget=100;c.input.requiredContext='Required recovered reply. '.repeat(100);}
 const before=structuredClone(c.input),states:any[]=[];
 const out=compileGameContext(c.input,{memoryTransport:'columns'},v=>states.push(v));
 expect(out.text).toContain('<deeprole_reference_guard>');expect(out.report.total).toBe(addedContextTokens(out.text));expect(c.input).toEqual(before);
 if(mode==='required-overflow'){expect(states[0]).toEqual({kind:'required-overflow'});expect(out.report.required).toBeGreaterThan(out.report.limit);}
 else {expect(out.report.total).toBeLessThanOrEqual(out.report.limit);expect(states[0].kind).not.toBe('complete');}
 if(['separate-short-occurrence','two-full-objects','raw-topic','no-accepted-bridge','damaged-related-quote','missing-anchor-source'].includes(mode))expect(boundGroup(c)).toBeUndefined();
 if(mode==='renamed-owner'){
  const f=memory(out.text).find(h=>h.task?.key.endsWith('-duty-a'))!;expect(f.sourceRoles?.promisor).toMatchObject({id:c.input.entities![0]!.id,sourceName:locale==='ru'?'Нелли':'Nell'});
 }
});
it('reference opt-out remains explicit; quote, action and conditional text cannot activate this short-reference guard',()=>{
 const c=obligationHoldoutWorld('en',0,720,8);
 expect(compileGameContext(c.input,{referenceRecall:false}).text).not.toContain('<deeprole_reference_guard>');
 for(const draft of ['"Remind me about that debt."','I return the cloak.','If allowed I return the cloak.','Remind me about that debt. I take the key.']){
  c.input.draft=draft;
  expect(compileGameContext(c.input,{memoryTransport:'columns'})).toEqual(compileGameContext(c.input,{contextualRecall:false,memoryTransport:'columns'}));
 }
});
