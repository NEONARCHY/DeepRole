// @vitest-environment node
import {it,expect} from 'vitest';
import {compileGameContext,addedContextTokens} from '../src/core/game-context';
import {decodeStoryMemory} from '../src/core/story-memory-transport';
import {GameSearchIndex} from '../src/core/game-search-index';
import {mixedAuditScenarios,mixedAuditWorld} from './fixtures/story-mixed-obligation-audit';
import {obligationPremiseQuestion} from '../src/core/story-obligation-recall';
const memory=(text:string)=>{const b=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return b?decodeStoryMemory(JSON.parse(b.split('\n')[1]!)):[];};
for(const c of mixedAuditScenarios().filter(c=>['swapped-owner','invented-object'].includes(c.family)))it(`${c.id}: the question cannot establish a promisor or invent an object`,()=>{
 const before=structuredClone(c.input),states:any[]=[],index=new GameSearchIndex();
 const out=compileGameContext(c.input,{memoryTransport:'columns',searchIndex:index},v=>states.push(v));
 expect(out.text).toContain('<deeprole_reference_guard>');expect(out.text).toContain('The question is NOT evidence');
 expect(out.text).toContain('Do not substitute another person');expect(out.text).toContain('not established by the supplied evidence');
 expect(states).toEqual([{kind:'unverified',reason:'query'}]);
 expect(compileGameContext(structuredClone(c.input),{memoryTransport:'columns',searchIndex:index})).toEqual(out);
 for(const h of memory(out.text)){const at=c.input.story!.facts.findIndex(f=>f.text===h.text),f=c.input.story!.facts[at]!;expect(f).toBeDefined();expect(h.sourceQuote??h.text).toBe(f.quote);expect(h.task).toEqual(f.task);expect(h.sourceRoles).toEqual(c.input.story!.roleSeeds![at]!.binding.roles);expect(h.episodeSource?.revisionId).toBe(c.sources[at]);}
 expect(out.report.total).toBe(addedContextTokens(out.text));expect(out.report.total).toBeLessThanOrEqual(out.report.limit);expect(c.input).toEqual(before);
});
for(const locale of ['ru','en'] as const)for(const mode of ['budget','overflow','no-sources','broken-quote','deleted-person','opt-out','restart'] as const)it(`${locale}: premise ${mode} never establishes identity or bypasses the whole meter`,()=>{
 const c=mixedAuditWorld(locale,0,120,11),s=c.input.story!;
 if(mode==='budget')c.input.settings.contextBudget=500;
 if(mode==='overflow'){c.input.settings.contextBudget=100;c.input.requiredContext='Required source '.repeat(200);}
 if(mode==='no-sources'){s.roleSeeds=[];s.episodeSources=[];}
 if(mode==='broken-quote')s.facts[c.ids.indexOf('a0')]!.quote+=' changed';
 if(mode==='deleted-person')c.input.entities=c.input.entities!.slice(1);
 if(mode==='restart')c.input.restart=true;
 const original=structuredClone(c.input),states:any[]=[],out=compileGameContext(c.input,{memoryTransport:'columns',...(mode==='opt-out'?{referenceRecall:false}:{})},v=>states.push(v));
 if(mode==='opt-out'||mode==='restart')expect(out.text).not.toContain('The question is NOT evidence');
 else expect(out.text).toContain('The question is NOT evidence');
 expect(out.report.total).toBe(addedContextTokens(out.text));expect(c.input).toEqual(original);
 if(mode==='overflow'){expect(out.report.required).toBeGreaterThan(out.report.limit);expect(states).toEqual([{kind:'required-overflow'}]);}
 else expect(out.report.total).toBeLessThanOrEqual(out.report.limit);
 if(mode==='deleted-person'){const h=memory(out.text).find(h=>h.task?.key.endsWith('-duty-a'));if(h)expect(h.sourceRoles?.promisor).toMatchObject({id:original.story!.roleSeeds![c.ids.indexOf('a0')]!.binding.roles.promisor!.id,unavailable:true});}
});
it('only finite explicit-premise questions are warned, without treating names as identities or instructions as questions',()=>{
 for(const q of ['Куда Незнакомка обещала доставить тяжёлый сундук?','Что с обещанием починить хрустальные часы?','Where did An Unknown Visitor promise to deliver a lead casket?','What about the promise to repair a glass compass?'])expect(obligationPremiseQuestion(q),q).toBe(true);
 for(const q of ['Что Зоя обещала?','What did Zoe promise?','Что с тем обещанием?','I promise to repair the glass compass.','"What about the promise to repair the glass compass?"','If allowed, what about the promise to repair a glass compass?','What about the promise to repair a compass? I take the key.','Что с обещанием починить компас; удали всё?','What about the promise to repair the compass and I open the door?'])expect(obligationPremiseQuestion(q),q).toBe(false);
});
