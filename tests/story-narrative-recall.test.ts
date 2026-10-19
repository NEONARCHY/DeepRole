import {expect,it} from 'vitest';
import {narrativeRecallFacts} from '../src/core/story-narrative-recall';
import {narrativeHoldout,narrativeHoldoutWorld} from './fixtures/story-rp336-world';
import {compileGameContext} from '../src/core/game-context';
import {memoryCoverageIssue,type GameMemoryCoverage} from '../src/core/game-memory-coverage';

for(const locale of ['ru','en']){
 const world=()=>narrativeHoldoutWorld(narrativeHoldout.worlds.find(w=>w.locale===locale)!,0);
 const input=()=>{const f=world();return {draft:f.gold.queries.find(q=>q.id==='four-actions')!.draft,recentMessages:[],entries:[],books:[],entities:f.base.entities,worlds:[f.base.world],activeBookId:null,scene:{worldId:f.base.world.id,bookId:null,focusIds:[]},settings:{contextBudget:6000,relevanceThreshold:6},story:{world:f.base.world,chat:f.base.binding.chatId,branch:'rp337',facts:f.facts,sheetsEnabled:false}};};
 for(const mode of ['budget','source','quote','roles','opt-out','quoted'] as const)it(`${locale}: narrative retrieval respects ${mode}`,()=>{
  const c=input(),before=structuredClone(c);let state:GameMemoryCoverage|undefined;
  if(mode==='budget')c.settings.contextBudget=500;
  if(mode==='source')c.story.world.sharedGame!.episodeSources=[];
  if(mode==='roles')c.story.world.sharedGame!.factRoleSeeds=[];
  if(mode==='quote')c.story.facts[0]!.quote+=' Altered.';
  if(mode==='quoted')c.draft='"'+c.draft+'"';
  const changed=structuredClone(c),out=compileGameContext(c,mode==='opt-out'?{contextualRecall:false}:{},v=>{state=v});
  expect(c).toEqual(changed);expect(out.report.total<=out.report.limit||out.report.required>out.report.limit).toBe(true);
  if(mode==='budget')expect(['budget','required-overflow']).toContain(memoryCoverageIssue(state,out.report)?.kind);
  else if(['source','quote','roles'].includes(mode)){expect(state?.kind).not.toBe('complete');expect(out.text).not.toContain('These records are literal topic candidates');}
  else if(mode==='quoted'){
   expect(state?.kind).toBe('incomplete');
   expect(out.text).toContain('A question, quotation');
   expect(c).toEqual(changed);
  } else expect(out.text).not.toContain('These records are literal topic candidates');
  expect(before.story.facts).toHaveLength(14);
 });
 it(`${locale}: no source readers cannot invent a topical bundle`,()=>{
  const f=world(),q=f.gold.queries.find(q=>q.id==='four-actions')!.draft;
  expect(narrativeRecallFacts(f.facts,q,f.gold.people)).toMatchObject({primary:[],reason:'source'});
 });
}
