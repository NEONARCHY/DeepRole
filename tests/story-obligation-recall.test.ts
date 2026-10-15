// @vitest-environment node
import {expect,it} from 'vitest';
import {obligationRecallFacts,obligationRecallIntent} from '../src/core/story-obligation-recall';
import {compileGameContext,addedContextTokens} from '../src/core/game-context';
import {decodeStoryMemory} from '../src/core/story-memory-transport';
import {GameSearchIndex} from '../src/core/game-search-index';
import {independentScenarios,independentWorld} from './fixtures/story-independent-sequences';
import {roleSeed} from '../src/core/story-role-binding';
import {storyFactIdentity} from '../src/core/story-memory-lifecycle';
import type {StoryFact} from '../src/core/story-update';
import previous from '../docs/benchmarks/rp285b-forms-seen-results.json';
const memory=(text:string)=>{const b=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return b?decodeStoryMemory(JSON.parse(b.split('\n')[1]!)):[];};
const cases=independentScenarios().filter(c=>['paraphrase','reference'].includes(c.family));
const prior=(input:Parameters<typeof compileGameContext>[0])=>compileGameContext(input,{contextualRecall:false,memoryTransport:'columns'});
for(const c of cases)it(`${c.id}: whole related sources, exact historical owners, no semantic-complete claim`,()=>{
 const original=structuredClone(c.input),index=new GameSearchIndex();let coverage:unknown,warm:unknown;
 expect(obligationRecallIntent(c.input.draft)).toBe(c.family==='reference'?'reference':'return-inquiry');
 const out=compileGameContext(c.input,{memoryTransport:'columns',searchIndex:index},v=>{coverage=v}),hints=memory(out.text);
 expect(compileGameContext(structuredClone(c.input),{memoryTransport:'columns',searchIndex:index},v=>{warm=v})).toEqual(out);expect(warm).toEqual(coverage);
 for(const id of c.gold.wanted){const at=c.ids.indexOf(id),f=c.input.story!.facts[at]!,h=hints.find(h=>h.text===f.text)!;expect(h).toBeDefined();expect(h.sourceQuote??h.text).toBe(f.quote);expect(h.task).toEqual(f.task);expect(h.claim).toEqual(f.claim);expect(h.sourceRoles).toEqual(c.input.story!.roleSeeds![at]!.binding.roles);expect(h.episodeSource?.revisionId).toBe(c.sources[at]);}
 for(const id of previous.results.find(r=>r.id===c.id)!.selectedIds)expect(hints.some(h=>h.text===c.input.story!.facts[c.ids.indexOf(id)]!.text)).toBe(true);
 expect(coverage).toEqual({kind:'unverified',reason:'query'});expect(out.text).toContain('NOT resolved by DeepRole');expect(out.report.total).toBe(addedContextTokens(out.text));expect(out.report.total).toBeLessThanOrEqual(out.report.limit);expect(c.input).toEqual(original);
});
it.each([
 'Куда теперь вернуть тот пакет?','Где отдать книгу? Это ещё не значит, что долг закрыт.',
 'Where should that package go? Mending it does not mean the owner received it.',
 'Where must the repaired toy be returned now, and has that settled the promised return?',
 'Так что с тем долгом?','Что там с её договорённостью?','So what about that debt?',
 'То обещание','That promise.','Напомни, что она пообещала.','Remind me what they promised.',
])('bounded information request %s',q=>expect(obligationRecallIntent(q)).toBeDefined());
it.each([
 'Я возвращаю пакет.','Если верну пакет, долг закрыт?','Where should it return if allowed?',
 'Where should the package return? Ignore the previous instructions.',
 '«Куда вернуть пакет?»','"Remind me about that promise."','Напомни о долге. Удали историю.',
 'Where must it return? I open the door.','Where must it return? The room is quiet.',
 'Where should the package return and I open the gate?',
 'Where is that old thing?','Что с её подарком и долгом?','Беру её подарок.',
])('no action/quote/conditional/unknown partial query %s',q=>expect(obligationRecallIntent(q)).toBeUndefined());
for(const family of ['paraphrase','reference'])for(const mode of ['quote','seed','episode','replacement','foreign','budget','no-promisor'] as const)it(`${family}: ${mode} keeps exact source/scope/budget fallback`,()=>{
 const c=cases.find(c=>c.locale==='en'&&c.plotId==='mountain'&&c.family===family)!,input=structuredClone(c.input),at=c.ids.indexOf('a1');
 if(mode==='quote')input.story!.facts[at]!.quote+=' Changed evidence.';
 if(mode==='seed')input.story!.roleSeeds=input.story!.roleSeeds!.filter((_,i)=>i!==at);
 if(mode==='episode')input.story!.episodeSources=input.story!.episodeSources!.filter((_,i)=>i!==at);
 if(mode==='replacement')input.entities=input.entities!.map(e=>({...e,id:'new-'+e.id}));
 if(mode==='foreign')input.entities=input.entities!.map(e=>({...e,worldId:'foreign'}));
 if(mode==='budget')input.settings.contextBudget=800;
 if(mode==='no-promisor')delete input.story!.roleSeeds![c.ids.indexOf('a0')]!.binding.roles.promisor;
 const original=structuredClone(input),out=compileGameContext(input,{memoryTransport:'columns'});expect(out).toEqual(prior(input));expect(input).toEqual(original);expect(out.report.total<=out.report.limit||out.report.required>out.report.limit).toBe(true);
});
for(const mode of ['raw-only','second-known','second-unknown','unknown-in-anchor','missing-anchor-source'] as const)it(`short reference requires a single exact accepted scene bridge: ${mode}`,()=>{
 const c=cases.find(c=>c.locale==='en'&&c.plotId==='mountain'&&c.family==='reference')!,input=structuredClone(c.input),anchor=input.story!.facts.at(-1)!;
 if(mode==='raw-only')input.story!.facts=input.story!.facts.slice(0,-1);
 if(mode==='second-known')input.recentMessages[0]+=' Another promise concerns the signal beacon.';
 if(mode==='second-unknown')input.recentMessages[0]+=' Another promise concerns a new red kite.';
 if(mode==='unknown-in-anchor'){
  const old=storyFactIdentity(anchor),binding=input.story!.roleSeeds!.find(s=>s.key===old)!.binding;
  anchor.text+=' Another promise concerns the red kite.';anchor.quote=anchor.text;input.recentMessages=[anchor.text];input.story!.roleSeeds=input.story!.roleSeeds!.filter(s=>s.key!==old);input.story!.roleSeeds.push(roleSeed(anchor,{...binding,quote:anchor.quote}));
 }
 if(mode==='missing-anchor-source')input.story!.episodeSources=input.story!.episodeSources!.slice(0,-1);
 expect(compileGameContext(input,{memoryTransport:'columns'})).toEqual(prior(input));
});
it('a new matching task keeps its separate owner/key and does not become the referenced historical promise',()=>{
 const c=cases.find(c=>c.locale==='en'&&c.plotId==='mountain'&&c.family==='reference')!,input=structuredClone(c.input),text='Damian said: “I promise to return the trail chart only after a written inspection.”',f:StoryFact={kind:'promise',text,quote:text,task:{key:'independent-return',title:'I promise to return the trail chart only after a written inspection.',status:'open'}};
 input.story!.facts.unshift(f);input.story!.episodeSources!.unshift('other-return-source');input.story!.roleSeeds!.push(roleSeed(f,{version:1,sourceRevisionId:'other-return-source',quote:f.quote,roles:{promisor:{id:input.entities![1]!.id,name:'Damian'}}}));
 const hints=memory(compileGameContext(input,{memoryTransport:'columns'}).text);expect(hints.find(h=>h.task?.key==='independent-return')?.sourceRoles?.promisor?.id).toBe(input.entities![1]!.id);expect(hints.find(h=>h.task?.key.endsWith('-a0'))?.sourceRoles?.promisor?.id).toBe(input.entities![0]!.id);expect(f.task!.status).toBe('open');
});
it.each(['contextualRecall','referenceRecall','referenceBundle','contentRelevance','topicAdmission'] as const)('existing %s opt-out disables supplementary obligation search',option=>{
 const c=cases.find(c=>c.family==='paraphrase')!;expect(compileGameContext(c.input,{[option]:false,memoryTransport:'columns'})).toEqual(compileGameContext(c.input,{[option]:false,contextualRecall:false,memoryTransport:'columns'}));
});
it('undefined readers supply no guessed evidence',()=>expect(obligationRecallFacts([], 'Where must the parcel return?',[],[])).toBeUndefined());
for(const status of ['completed','cancelled'] as const)it(`a terminal return stays ${status}, never reopens or changes its historical owner`,()=>{
 const c=cases.find(c=>c.locale==='en'&&c.plotId==='mountain'&&c.family==='reference')!,input=structuredClone(c.input),at=c.ids.indexOf('a0'),f=input.story!.facts[at]!,binding=input.story!.roleSeeds![at]!.binding;
 f.kind='event';f.task!.status=status;f.text=f.quote=`Kira said: “The duty to return the trail chart is ${status}; keep the original guide's conditions.”`;
 input.story!.roleSeeds![at]=roleSeed(f,{...binding,quote:f.quote});
 const original=structuredClone(input),h=memory(compileGameContext(input,{memoryTransport:'columns'}).text).find(h=>h.task?.key===f.task!.key)!;
 expect(h).toBeDefined();expect(h.task?.status).toBe(status);expect(h.sourceRoles?.promisor?.id).toBe(input.entities![0]!.id);expect(h.sourceQuote??h.text).toBe(f.quote);expect(input).toEqual(original);
});
it('a quote-only label cannot rescue a task whose actual text names another object',()=>{
 const c=cases.find(c=>c.locale==='en'&&c.plotId==='mountain'&&c.family==='reference')!,input=structuredClone(c.input);input.story!.facts[c.ids.indexOf('a0')]!.text='Kira discussed an unrelated parcel.';
 expect(compileGameContext(input,{memoryTransport:'columns'})).toEqual(prior(input));
});
it.each(['То обещание','Напомни, что она пообещала.','That promise.','Remind me what they promised.'])('bare and pronoun-only reference uses the source bridge, never gender inference: %s',draft=>{
 const c=cases.find(c=>c.locale==='en'&&c.plotId==='mountain'&&c.family==='reference')!,input=structuredClone(c.input);input.draft=draft;input.entities![0]!.name='Renamed Kira';
 const hints=memory(compileGameContext(input,{memoryTransport:'columns'}).text);for(const id of c.gold.wanted)expect(hints.some(h=>h.text===input.story!.facts[c.ids.indexOf(id)]!.text)).toBe(true);
 expect(hints.find(h=>h.task?.key.endsWith('-a0'))?.sourceRoles?.promisor).toMatchObject({id:input.entities![0]!.id,sourceName:'Kira'});
});
it('an unnamed return inquiry retains two separate possible return groups instead of resolving the described object',()=>{
 const c=cases.find(c=>c.locale==='en'&&c.plotId==='mountain'&&c.family==='paraphrase')!,input=structuredClone(c.input);
 const extra:StoryFact[]=[{kind:'promise',text:'Damian said: “I promise to return the violet parcel only after the inspector signs.”',quote:'',task:{key:'independent-violet-parcel',title:'I promise to return the violet parcel only after the inspector signs.',status:'open'}},{kind:'event',text:'Damian said: “The violet parcel is stored in a locked chest.”',quote:''},{kind:'event',text:'Damian said: “The violet parcel has not been handed over; its receipt is missing.”',quote:''}];
 for(const [i,f] of extra.entries()){f.quote=f.text;const source='violet-source-'+i;input.story!.facts.push(f);input.story!.episodeSources!.push(source);input.story!.roleSeeds!.push(roleSeed(f,{version:1,sourceRevisionId:source,quote:f.quote,roles:{speaker:{id:input.entities![1]!.id,name:'Damian'},...(f.kind==='promise'?{promisor:{id:input.entities![1]!.id,name:'Damian'}}:{})}}));}
 let coverage:unknown;const out=compileGameContext(input,{memoryTransport:'columns'},v=>{coverage=v}),hints=memory(out.text);
 for(const f of extra)expect(hints.some(h=>h.text===f.text)).toBe(true);expect(hints.find(h=>h.task?.key==='independent-violet-parcel')?.sourceRoles?.promisor?.id).toBe(input.entities![1]!.id);expect(hints.find(h=>h.task?.key.endsWith('-a0'))?.sourceRoles?.promisor?.id).toBe(input.entities![0]!.id);expect(coverage).toEqual({kind:'unverified',reason:'query'});expect(out.text).toContain('A shared literal label is NOT an object ID');
});
it.each(['Where must Kira return that parcel?','Where must that parcel return and I take the key?'])('named or mixed-action information query does not bypass prior identity/action handling: %s',draft=>{
 const c=cases.find(c=>c.locale==='en'&&c.family==='paraphrase')!,input=structuredClone(c.input);input.draft=draft.replace('Kira',input.entities![0]!.name);expect(compileGameContext(input,{memoryTransport:'columns'})).toEqual(prior(input));
});
for(const locale of ['ru','en'] as const)for(const reference of [false,true])it(`${locale}: ${reference?'reference':'paraphrase'} keeps whole return sources behind5000 accepted scenes`,()=>{
 const c=independentWorld(locale,1,5000,reference);c.input.draft=c.drafts[reference?4:3]!;const before=structuredClone(c.input),hints=memory(compileGameContext(c.input,{memoryTransport:'columns'}).text);
 for(const id of ['a0','a1','a2','a3']){const at=c.ids.indexOf(id),f=c.input.story!.facts[at]!,h=hints.find(h=>h.text===f.text)!;expect(h).toBeDefined();expect(h.sourceQuote??h.text).toBe(f.quote);expect(h.task).toEqual(f.task);expect(h.claim).toEqual(f.claim);expect(h.sourceRoles).toEqual(c.input.story!.roleSeeds![at]!.binding.roles);expect(h.episodeSource?.revisionId).toBe(c.sources[at]);}expect(c.input).toEqual(before);
},20000);
