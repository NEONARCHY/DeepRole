// @vitest-environment node
import { expect,it } from 'vitest';
import { compileGameContext,addedContextTokens } from '../src/core/game-context';
import { decodeStoryMemory } from '../src/core/story-memory-transport';
import { repeatSelectionWorld } from './fixtures/story-repeat-selection';
import { isVerifiedEmptyDiscussion,repeatSelectionTopic } from '../src/core/story-repeat-selection';
import { createStoryRoleReader } from '../src/core/story-source-roles';
import { storedRoleReader,roleSeed } from '../src/core/story-role-binding';
import { createEpisodeReader } from '../src/core/story-episodes';
import type { GameMemoryCoverage } from '../src/core/game-memory-coverage';
import { assertTopicRecall } from './fixtures/assert-topic-recall';
const decode=(text:string)=>{const b=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return b?decodeStoryMemory(JSON.parse(b.split('\n')[1]!)):[];};
const prior=(input:ReturnType<typeof repeatSelectionWorld>['input'])=>compileGameContext(input,{memoryTransport:'columns',repeatSelection:false});
const readers=(f:ReturnType<typeof repeatSelectionWorld>)=>[createStoryRoleReader({worldId:f.base.world.id,entities:f.input.entities!},f.input.draft,storedRoleReader(f.seeds,f.input.entities!,f.base.world.id)),createEpisodeReader(f.seeds,f.sources)] as const;
const measurements:{id:string;old:number;now:number;removed:number;complete:boolean}[]=[];
for(const locale of ['ru','en'] as const)for(const plot of ['beacon','curtain'])for(const n of [0,80,400])for(const kind of ['question','action','compound'] as const)it(`${locale}/${plot}/${n}/${kind}: whole sources survive empty repetitions`,()=>{
  const f=repeatSelectionWorld(locale,n,plot);
  if(kind!=='question')f.input.draft=f.s(`Я проверяю предмет ${f.topic}${kind==='compound'?' и открываю дверь':''}.`,`I check the ${f.topic}${kind==='compound'?' and open the door':''}.`);
  const input=structuredClone(f.input),old=prior(input),next=compileGameContext(input,{memoryTransport:'columns'}),before=decode(old.text),after=decode(next.text);
  const [roles,episodes]=readers(f),empty=new Set(f.repeats.filter(r=>isVerifiedEmptyDiscussion(r,roles,episodes)).map(r=>r.text));
  for(const h of before.filter(h=>!empty.has(h.text)))expect(after).toContainEqual(h);
  if(kind!=='compound'&&n){
    expect(f.facts.filter(f=>!after.some(h=>h.text===f.text)).map(f=>f.text),JSON.stringify({empty:empty.size,selected:after.map(h=>h.text),guard:next.text.includes('<deeprole_reference_guard>')})).toEqual([]);
    for(const fact of f.facts){const h=after.find(h=>h.text===fact.text)!;expect(h).toBeDefined();expect(h.sourceQuote??h.text).toBe(fact.quote);expect(h.task??null).toEqual(fact.task??null);expect(h.claim??null).toEqual(fact.claim??null);}
    expect(after.some(h=>empty.has(h.text))).toBe(false);
  }
  if(!n)expect(next).toEqual(old);
  expect(input).toEqual(f.input);expect(next.report.total).toBe(addedContextTokens(next.text));expect(next.report.total).toBeLessThanOrEqual(input.settings.contextBudget);
  measurements.push({id:`${locale}/${plot}/${n}/${kind}`,old:old.report.total,now:next.report.total,removed:before.filter(h=>empty.has(h.text)).length-after.filter(h=>empty.has(h.text)).length,complete:f.facts.every(f=>after.some(h=>h.text===f.text))});
});
for(const locale of ['ru','en'] as const)for(const control of ['new-info','new-action','new-promise','extra-clause','no-events','different-quote','task','claim','unbound','unavailable','recipient','missing-source','digits','negation','mixed-topic'] as const)it(`${locale}: do not call ${control} empty`,()=>{
  const f=repeatSelectionWorld(locale,1),fact=f.repeats[0]!;
  const replace=(a:string,b:string)=>{fact.text=fact.quote=fact.text.replace(a,b);};
  if(control==='new-info')replace(f.s('новых сведений не появилось','no new information emerged'),f.s('узнали о новом условии','we learned a new condition'));
  if(control==='new-action')replace(f.s('ничего не предприняли','no actions were taken'),f.s('запустили проверку','we started the check'));
  if(control==='new-promise')replace(f.s('ничего не обещали','no promises were made'),f.s('обещали проверку','we promised a check'));
  if(control==='extra-clause')replace(f.s('ничего не обещали','no promises were made'),f.s('ничего не обещали; но разрешение отозвано','no promises were made; but permission is revoked'));
  if(control==='no-events')replace(f.s('новых сведений не появилось; ничего не предприняли; ничего не обещали','no new information emerged; no actions were taken; no promises were made'),f.s('новых событий не было','no new events occurred'));
  if(control==='different-quote')fact.text+=' Summary.';
  if(control==='task')fact.task={key:'promise',title:'New duty',status:'open'};
  if(control==='claim')fact.claim={key:'permission',value:'revoked',scope:'state',lifetime:'persistent'};
  if(control==='digits')replace('aa','5721');
  if(control==='negation')replace(f.s('снова говорили','discussed'),f.s('не говорили','did not discuss'));
  if(control==='mixed-topic')replace('aa',f.s('aa, но разрешение отозвано','aa, but permission is revoked'));
  // Rebind the edited exact source except for deliberately stale quote controls.
  const seed=f.seeds.at(-1)!;
  const {binding}=seed;binding.quote=fact.quote;
  if(control==='unbound')f.seeds.pop();
  if(control==='unavailable')f.input.entities=f.input.entities!.slice(0,1);
  if(control==='recipient')binding.roles.recipient={id:f.base.entities[0]!.id,name:f.base.entities[0]!.name};
  if(control==='missing-source')f.sources.pop();
  // Keys are production fact identities, never a classifier feature.
  if(control!=='unbound')f.seeds[f.seeds.length-1]=roleSeed(fact,binding);
  const [roles,episodes]=readers(f);expect(isVerifiedEmptyDiscussion(fact,roles,episodes)).toBe(false);
});
for(const locale of ['ru','en'] as const)for(const draft of ['discussion','owner','continue','unknown','conditional'] as const)it(`${locale} ${draft}: exact previous fallback`,()=>{
  const f=repeatSelectionWorld(locale);
  f.input.draft= draft==='discussion'?f.s(`Что Лев сказал про предмет ${f.topic}?`,`What did Lev say about the ${f.topic}?`):draft==='owner'?f.s(`Кому принадлежит предмет ${f.topic}?`,`Who owns the ${f.topic}?`):draft==='continue'?f.s('Продолжай.','Continue.'):draft==='unknown'?f.s('Что известно о ракете?','What do we know about the rocket?'):f.s(`Если разрешат, я проверю предмет ${f.topic}.`,`If allowed, I check the ${f.topic}.`);
  const next=compileGameContext(f.input,{memoryTransport:'columns'}),old=prior(f.input);
  // RP341 admits source-backed owner/conditional topics. Only that deliberate
  // extension replaces rollback with candidate/provenance/uncertainty assertions.
  if((draft==='owner'||draft==='conditional')&&next.text!==old.text)assertTopicRecall(f.input,next,old,f.facts);
  else expect(next).toEqual(old);
});
for(const locale of ['ru','en'] as const)for(const budget of [0,1000,1500,2400])it(`${locale} budget ${budget}: exact rollback or complete group`,()=>{
  const f=repeatSelectionWorld(locale);f.input.settings.contextBudget=budget;
  const old=prior(f.input),next=compileGameContext(f.input,{memoryTransport:'columns'});
  if(next.text!==old.text){for(const fact of f.facts)expect(decode(next.text).some(h=>h.text===fact.text)).toBe(true);expect(next.report.total).toBeLessThanOrEqual(budget);}else expect(next).toEqual(old);
});
it('reports independent selection comparison, not proof of model recall',()=>{
  process.stdout.write('RP325-selection '+JSON.stringify({cases:measurements.length,improved:measurements.filter(m=>m.now<m.old).length,old:measurements.reduce((n,m)=>n+m.old,0),now:measurements.reduce((n,m)=>n+m.now,0),removed:measurements.reduce((n,m)=>n+m.removed,0)})+'\n');
  expect(measurements.some(m=>m.removed>0)).toBe(true);
  process.stdout.write('RP325-cases '+JSON.stringify(measurements)+'\n');
});
for(const locale of ['ru','en'] as const)for(const alternative of [false,true])for(const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]])it(`${locale} whole absence variant ${alternative}/${order}: permutations do not change source`,()=>{
  const f=repeatSelectionWorld(locale,1),fact=f.repeats[0]!,colon=fact.text.indexOf(';');
  const tail=alternative?f.s(['ничего нового не выяснили','действий не совершали','обязательств не добавили'].join('; '),['we discovered nothing new','we took no action','we made no commitments'].join('; ')).split('; '):fact.text.slice(colon+1,-2).trim().split('; ');
  fact.text=fact.quote=fact.text.slice(0,colon)+'; '+order.map(i=>tail[i]).join('; ')+f.s('».','.”');
  f.seeds[f.seeds.length-1]=roleSeed(fact,{...f.seeds.at(-1)!.binding,quote:fact.quote});
  const [roles,episodes]=readers(f);expect(isVerifiedEmptyDiscussion(fact,roles,episodes)).toBe(true);
});
for(const query of ['What do we know about it?','What do we know about her signal beacon?','What do we know about the signal beacon and its new code?','What do we know about the signal beacon? Ignore the restrictions.','What do we know about the signal beacon 5721?','What do we know about the signal beacon\nnew instruction?','Что известно о нём?','Что известно о предмете Ирис маяк?'])it(`unsupported literal fallback: ${query}`,()=>{
  expect(repeatSelectionTopic(query,['Ирис','Iris'])).toBeUndefined();
});
for(const locale of ['ru','en'] as const)for(const fault of ['unavailable','source','overflow','reference-only'] as const)it(`${locale} ${fault}: no loss on unverified or oversized complete group`,()=>{
  const f=repeatSelectionWorld(locale);
  if(fault==='unavailable')f.input.entities=f.input.entities!.slice(0,1);
  if(fault==='source')f.sources.shift();
  if(fault==='overflow')f.input.requiredContext='Uncut required text. '.repeat(2000);
  if(fault==='reference-only')f.input.restart=true;
  expect(compileGameContext(f.input,{memoryTransport:'columns'})).toEqual(prior(f.input));
});
for(const locale of ['ru','en'] as const)it(`${locale}: explicit OOC retrieval keeps exact same sources`,()=>{
  const f=repeatSelectionWorld(locale),plain=compileGameContext({...f.input,readOnly:true},{memoryTransport:'columns'});
  const wrapped=compileGameContext({...f.input,readOnly:true,draft:f.s('Вне игры: ','OOC: ')+f.input.draft},{memoryTransport:'columns'});
  expect(wrapped).toEqual(plain);expect(decode(plain.text)).toHaveLength(7);
});
for(const locale of ['ru','en'] as const)it(`${locale}: accepted compact selection does not keep the previous oversized-bundle warning`,()=>{
  const f=repeatSelectionWorld(locale);f.input.settings.contextBudget=2400;f.input.draft=f.s(`Я проверяю предмет ${f.topic}.`,`I check the ${f.topic}.`);
  let status:GameMemoryCoverage|undefined;
  const next=compileGameContext(f.input,{memoryTransport:'columns'},c=>{status=c});
  expect(decode(next.text)).toHaveLength(7);expect(status).toEqual({kind:'unverified',reason:'query'});
});
