// @vitest-environment node
import {expect,it} from 'vitest';
import {compileGameContext,addedContextTokens} from '../src/core/game-context';
import {GameSearchIndex} from '../src/core/game-search-index';
import {decodeStoryMemory} from '../src/core/story-memory-transport';
import {compactStoryFactSources} from '../src/core/story-update';
import {diverseScenarios} from './fixtures/story-search-evidence';
import {groundingScenarios} from './fixtures/story-search-grounding';
import {lastingRecallCorpus} from './fixtures/story-lasting-recall-quality';
import {historicalEvidenceCase,historicalGroundingCase} from './fixtures/historical-search-context';

const hints=(text:string)=>{const block=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return block?decodeStoryMemory(JSON.parse(block.split('\n')[1]!)):[];};
// Current defaults are deliberately independent of the historical comparison
// profile and the old experimental candidate's eight-record capacity.
for(const [family,scenarios] of [['evidence',diverseScenarios()],['grounding',groundingScenarios()]] as const)
 for(const c of scenarios)it(`current ${family} whole-source/cache/budget contract: ${c.name}`,()=>{
  const original=structuredClone(c.input),index=new GameSearchIndex();let coldStatus:unknown,warmStatus:unknown;
  const cold=compileGameContext(c.input,{memoryTransport:'columns'},v=>{coldStatus=v});
  compileGameContext(structuredClone(c.input),{memoryTransport:'columns',searchIndex:index});
  const warm=compileGameContext(structuredClone(c.input),{memoryTransport:'columns',searchIndex:index},v=>{warmStatus=v});
  expect(warm).toEqual(cold);expect(warmStatus).toEqual(coldStatus);expect(c.input).toEqual(original);
  const selected=hints(cold.text),current=compactStoryFactSources(c.input.story!.facts);
  expect(selected).toHaveLength(cold.report.selected.facts);expect(selected.length).toBeLessThanOrEqual(128);
  expect(new Set(selected.map(h=>JSON.stringify([h.kind,h.text,h.sourceQuote??h.text]))).size).toBe(selected.length);
  for(const h of selected){
   const f=current.find(f=>f.kind===h.kind&&f.text===h.text&&(f.quote??f.text)===(h.sourceQuote??h.text));
   expect(f).toBeDefined();expect(h.task).toEqual(f!.task);expect(h.claim).toEqual(f!.claim);
  }
  expect(cold.report.total).toBe(addedContextTokens(cold.text));
  expect(cold.report.total<=cold.report.limit||cold.report.required>cold.report.limit).toBe(true);
 });

it('current lasting recall retains all 16 positive cases and 32 unchanged controls',()=>{
 let before=0,after=0,controls=0;
 for(const locale of ['ru','en'] as const)for(const c of lastingRecallCorpus(locale)){
  const old=compileGameContext(c.input,{lastingRecall:false}),out=compileGameContext(c.input);
  if(c.positive){before+=Number(c.wanted.every(f=>hints(old.text).some(h=>h.text===f.text)));after+=Number(c.wanted.every(f=>hints(out.text).some(h=>h.text===f.text)));}
  else{controls++;expect(out).toEqual(old);}
 }
 expect(after).toBe(16);expect(after).toBeGreaterThanOrEqual(before);expect(controls).toBe(32);
});

it('historical reconstruction cannot use desired labels to select evidence',()=>{
 const c=diverseScenarios()[0]!,a=historicalEvidenceCase(c),b=historicalEvidenceCase({...c,wanted:[],split:'changed',intent:'changed'});
 expect(b.baseline).toEqual(a.baseline);expect(b.documents).toEqual(a.documents);expect(b.lexical).toEqual(a.lexical);expect(b.evidenceIds).toEqual(a.evidenceIds);expect(b.gold).toEqual([]);
 const g=groundingScenarios()[0]!,x=historicalGroundingCase(g),y=historicalGroundingCase({...g,wanted:[],split:g.split==='development'?'holdout':'development',intent:'changed'});
 expect(y.baseline).toEqual(x.baseline);expect(y.documents).toEqual(x.documents);expect(y.lexical).toEqual(x.lexical);expect(y.mandatory).toEqual(x.mandatory);expect(y.gold).toEqual([]);
});
