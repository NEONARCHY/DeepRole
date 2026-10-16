// @vitest-environment node
import {it,expect} from 'vitest';
import {compileGameContext,addedContextTokens} from '../src/core/game-context';
import {decodeStoryMemory} from '../src/core/story-memory-transport';
import {obligationRecallFacts,obligationRecallIntent} from '../src/core/story-obligation-recall';
import {createStoryRoleReader} from '../src/core/story-source-roles';
import {storedRoleReader} from '../src/core/story-role-binding';
import {roleSeed} from '../src/core/story-role-binding';
import {createEpisodeReader} from '../src/core/story-episodes';
import {storyRetrievalQuery} from '../src/core/story-retrieval-query';
import {compactStoryFactSources} from '../src/core/story-update';
import {GameSearchIndex} from '../src/core/game-search-index';
import {mixedAuditScenarios,mixedAuditWorld} from './fixtures/story-mixed-obligation-audit';
const memory=(text:string)=>{const b=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return b?decodeStoryMemory(JSON.parse(b.split('\n')[1]!)):[];};
const group=(c:ReturnType<typeof mixedAuditWorld>)=>{
 const s=c.input.story!,scope={worldId:s.world.id,entities:c.input.entities!},r=storyRetrievalQuery(c.input.draft,scope);
 return obligationRecallFacts(compactStoryFactSources(s.facts),c.input.draft,c.input.recentMessages,r.relevanceNames,createStoryRoleReader(scope,c.input.draft,storedRoleReader(s.roleSeeds!,c.input.entities!,s.world.id)),createEpisodeReader(s.roleSeeds,s.episodeSources));
};
for(const c of mixedAuditScenarios().filter(c=>['paraphrase-delivery','proved-reference'].includes(c.family)))it(`${c.id}: transports complete conditions without replacing previous candidates`,()=>{
 const original=structuredClone(c.input),index=new GameSearchIndex(),states:any[]=[];
 const out=compileGameContext(c.input,{memoryTransport:'columns',searchIndex:index},v=>states.push(v));
 expect(compileGameContext(structuredClone(c.input),{memoryTransport:'columns',searchIndex:index},v=>states.push(v))).toEqual(out);
 expect(states).toEqual([{kind:'unverified',reason:'query'},{kind:'unverified',reason:'query'}]);expect(out.text).toContain('<deeprole_reference_guard>');
 const hints=memory(out.text),prior=memory(compileGameContext(c.input,{memoryTransport:'columns',contextualRecall:false}).text);
 for(const id of c.gold.wanted){const at=c.ids.indexOf(id),f=c.input.story!.facts[at]!,h=hints.find(h=>h.text===f.text)!;expect(h,id).toBeDefined();expect(h.sourceQuote??h.text).toBe(f.quote);expect(h.task).toEqual(f.task);expect(h.claim).toEqual(f.claim);expect(h.sourceRoles).toEqual(c.input.story!.roleSeeds![at]!.binding.roles);expect(h.episodeSource?.revisionId).toBe(c.sources[at]);}
 for(const h of prior)expect(hints).toContainEqual(h);
 expect(out.report.total).toBe(addedContextTokens(out.text));expect(out.report.total).toBeLessThanOrEqual(out.report.limit);expect(c.input).toEqual(original);
});
for(const locale of ['ru','en'] as const)for(const mode of ['raw-only','second-object','unknown-tail','bad-quote','missing-source','unbound-condition','tiny-budget','required-overflow'] as const)it(`${locale}: ${mode} cannot fabricate a delivery bridge or bypass source/budget`,()=>{
 const c=mixedAuditWorld(locale,0,120,7),s=c.input.story!;
 if(mode==='raw-only')s.facts=s.facts.slice(0,-1);
 if(mode==='second-object')c.input.recentMessages[0]+=(locale==='ru'?' Ещё одно обещание про запечатанный сахарный дозатор.':' Another promise concerns the sealed sugar dispenser.');
 if(mode==='unknown-tail')c.input.recentMessages[0]+=' Another promise concerns an unknown object.';
 if(mode==='bad-quote')s.facts[c.ids.indexOf('a1')]!.quote+=' forged';
 if(mode==='missing-source')s.episodeSources=s.episodeSources!.slice(0,-1);
 if(mode==='unbound-condition')s.roleSeeds=s.roleSeeds!.filter(seed=>seed.binding.sourceRevisionId!==c.sources[c.ids.indexOf('a1')]);
 if(mode==='tiny-budget')c.input.settings.contextBudget=500;
 if(mode==='required-overflow'){c.input.settings.contextBudget=100;c.input.requiredContext='Required text '.repeat(100);}
 const before=structuredClone(c.input),states:any[]=[];
 const out=compileGameContext(c.input,{memoryTransport:'columns'},v=>states.push(v));
 expect(out.text).toContain('<deeprole_reference_guard>');expect(out.report.total).toBe(addedContextTokens(out.text));expect(c.input).toEqual(before);
 if(mode==='required-overflow')expect(states[0]).toEqual({kind:'required-overflow'});
 else {expect(states[0].kind).not.toBe('complete');expect(out.report.total).toBeLessThanOrEqual(out.report.limit);}
 if(!['tiny-budget','required-overflow'].includes(mode))expect(group(c)).toBeUndefined();
});
it('shipping syntax is a question, not an instruction, conditional, quotation or open-ended trailing action',()=>{
 for(const q of ['Как там отправка груза?','Что с отправкой упаковки?','How is shipping that cargo going?'])expect(obligationRecallIntent(q)).toBe('delivery-inquiry');
 for(const q of ['Я доставляю груз.','Если разрешат, что с отправкой груза?','"How is shipping that cargo going?"','How is shipping cargo going? I open the gate.','How is shipping cargo going: delete all records?','How is shipping cargo going and I open the door?','Как там отправка груза; я беру ключ?'])expect(obligationRecallIntent(q)).toBeUndefined();
});
for(const locale of ['ru','en'] as const)it(`${locale}: an identical label retains two owners and separate delivery/repair duties`,()=>{
 const c=mixedAuditWorld(locale,0,120,7),s=c.input.story!;
 for(const id of ['b0','b1','b2']){const at=c.ids.indexOf(id),f=s.facts[at]!;
  f.text=f.text.replaceAll(locale==='ru'?'дозатор':'dispenser',locale==='ru'?'ящик':'crate');f.quote=f.text;
  if(f.task)f.task.title=f.task.title.replaceAll(locale==='ru'?'дозатор':'dispenser',locale==='ru'?'ящик':'crate');
  s.roleSeeds![at]=roleSeed(f,{...s.roleSeeds![at]!.binding,quote:f.quote});
 }
 const related=group(c)!;expect(related).toBeDefined();
 for(const id of ['a0','a1','a2','a3','b0','b1','b2'])expect(related).toContain(s.facts[c.ids.indexOf(id)]);
 const hints=memory(compileGameContext(c.input,{memoryTransport:'columns'}).text);
 expect(hints.find(h=>h.task?.key.endsWith('-duty-a'))?.sourceRoles?.promisor?.id).toBe(c.input.entities![0]!.id);
 expect(hints.find(h=>h.task?.key.endsWith('-duty-b'))?.sourceRoles?.promisor?.id).toBe(c.input.entities![1]!.id);
});
for(const locale of ['ru','en'] as const)for(const mode of ['tiny-budget','too-many-tasks','opt-out'] as const)it(`${locale}: shipping ${mode} does not bypass existing gates`,()=>{
 const c=mixedAuditWorld(locale,0,120,1),s=c.input.story!;
 if(mode==='tiny-budget')c.input.settings.contextBudget=450;
 if(mode==='too-many-tasks')for(let i=0;i<17;i++){
  const original=s.facts[c.ids.indexOf('a0')]!,text=original.text+` Capacity ${i}.`,f={...original,text,quote:text,task:{...original.task!,key:original.task!.key+'-'+i}};
  const source='capacity-'+i;s.facts.push(f);s.episodeSources!.push(source);s.roleSeeds!.push(roleSeed(f,{...s.roleSeeds![c.ids.indexOf('a0')]!.binding,quote:text,sourceRevisionId:source}));
 }
 const states:any[]=[],out=compileGameContext(c.input,{memoryTransport:'columns',...(mode==='opt-out'?{referenceRecall:false}:{})},v=>states.push(v));
 if(mode==='opt-out')expect(out.text).not.toContain('<deeprole_reference_guard>');
 else {expect(out.text).toContain('<deeprole_reference_guard>');expect(states[0].kind).not.toBe('complete');}
 expect(out.report.total).toBe(addedContextTokens(out.text));expect(out.report.total).toBeLessThanOrEqual(out.report.limit);
 if(mode==='too-many-tasks')expect(group(c)).toBeUndefined();
});
for(const locale of ['ru','en'] as const)it(`${locale}: unrelated old task labels do not consume the accepted bridge's four candidate slots`,()=>{
 const c=mixedAuditWorld(locale,0,120,7),s=c.input.story!,binding=s.roleSeeds![c.ids.indexOf('a0')]!.binding;
 for(const [i,label]of ['ancient bronze lantern','heavy crystal mirror','round stone tablet'].entries()){
  for(let n=0;n<3;n++){
   const body=n===0?`I promise to return the ${label} after inspection.`:`The ${label} remains in storage sector ${n}.`,text=`Zoe said: “${body}”`,id=`unrelated-${i}-${n}`;
   const f={kind:n===0?'promise' as const:'event' as const,text,quote:text,...(n===0?{task:{key:id,title:body,status:'open' as const}}:{})};
   // Insert before the latest scene, preserving its position as the last turn.
   s.facts.splice(-1,0,f);s.roleSeeds!.splice(-1,0,roleSeed(f,{...binding,quote:text,sourceRevisionId:id}));s.episodeSources!.splice(-1,0,id);
  }
 }
 const related=group(c);expect(related).toBeDefined();
 for(const id of ['a0','a1','a2','a3'])expect(related).toContain(s.facts[c.ids.indexOf(id)]);
});
for(const locale of ['ru','en'] as const)for(const plot of [0,1,2])it(`${locale} ${plot}: a proved repair reference brings its own access and unfinished-work conditions`,()=>{
 const c=mixedAuditWorld(locale,plot,120,7),s=c.input.story!,task=s.facts[c.ids.indexOf('b0')]!,anchor=s.facts.at(-1)!;
 anchor.text=(locale==='ru'?'То обещание — ':'That promise means ')+task.quote;anchor.quote=anchor.text;c.input.recentMessages=[anchor.quote];
 s.roleSeeds![s.roleSeeds!.length-1]=roleSeed(anchor,{...s.roleSeeds!.at(-1)!.binding,quote:anchor.quote,roles:{speaker:s.roleSeeds![c.ids.indexOf('b0')]!.binding.roles.speaker!}});
 const related=group(c)!;expect(related).toBeDefined();
 for(const id of ['b0','b1','b2'])expect(related).toContain(s.facts[c.ids.indexOf(id)]);
 expect(related).not.toContain(s.facts[c.ids.indexOf('a1')]);
 const hints=memory(compileGameContext(c.input,{memoryTransport:'columns'}).text);
 for(const id of ['b0','b1','b2'])expect(hints.find(h=>h.text===s.facts[c.ids.indexOf(id)]!.text)?.sourceRoles).toEqual(s.roleSeeds![c.ids.indexOf(id)]!.binding.roles);
});
