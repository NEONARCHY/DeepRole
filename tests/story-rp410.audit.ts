import { readFileSync, writeFileSync } from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import { addedContextTokens, compileGameContext } from '../src/core/game-context';
import { GameSearchIndex } from '../src/core/game-search-index';
import { memoryCoverageIssue, type GameMemoryCoverage } from '../src/core/game-memory-coverage';
import { decodeStoryMemory } from '../src/core/story-memory-transport';
import type { SceneEntity, WorldProfile } from '../src/core/types';
import type { StoryRecord } from '../src/core/story-records';
import { DeepRoleDatabase } from '../src/storage/database';
import { DeepRoleRepository } from '../src/storage/repository';
import { makeHistory } from './fixtures/story-rp404-history';
import { digest, seals } from './fixtures/story-rp404-seal';
import type { Bilingual, Plot } from './fixtures/story-rp404-corpus';

type Probe = {id:string; recent:Bilingual[]; draft:Bilingual; wanted:string[]; exclude:string[]; warning:boolean};
const read=(path:string)=>readFileSync(path,'utf8').replaceAll('\r\n','\n');
const plan=JSON.parse(read('docs/benchmarks/rp410-frozen-plan.json'));
for(const [file,hash] of Object.entries(plan.files))expect(digest(read(file))).toBe(hash);
const corpus: {plot:Plot; probes:Probe[]}[]=JSON.parse(read('tests/fixtures/story-rp410-pairs.json'));
const runtime=seals().runtimeSha256;
const tag=process.env.RP410_RUN??'first';
if(!/^[a-z0-9-]+$/.test(tag))throw Error('Invalid report tag');
if(tag==='first')expect(runtime).toBe(plan.baselineRuntime);
const output='.output/rp410-'+tag+'.json';
// Exclude concurrent first attempts and retain the start time even if a run is interrupted.
const started=new Date().toISOString();
writeFileSync(output+'.receipt',JSON.stringify({started,runtime,plan:digest(read('docs/benchmarks/rp410-frozen-plan.json'))})+'\n',{flag:'wx'});
const results:{plot:string; locale:string; query:string; phase:string; selected:string[]; missing:string[]; forbidden:string[]; warning:string|null; problems:string[]}[]=[];
for(const {plot,probes} of corpus)for(const locale of ['ru','en'] as const)it(plot.id+' '+locale,async()=>{
  const f=makeHistory(plot,locale,plan.extraShiftsPerAct);
  expect(f.facts.length).toBe(plan.factsPerHistory);
  const db=new DeepRoleDatabase('rp410-'+crypto.randomUUID()),repo=new DeepRoleRepository(db);
  const language=locale==='ru'?0:1;
  try{
    await repo.mergeRecords(f.records);
    const before=digest(JSON.stringify(await repo.rawRecords()));
    const cold=new Map<string,string>(),indexes=new Map<string,GameSearchIndex>();
    for(const phase of ['cold','warm','reopened']){
      if(phase==='reopened'){db.close();await db.open();indexes.clear();}
      const world=(await repo.get<WorldProfile>('world',f.worldId))!;
      const branch=(await repo.list<StoryRecord>('story')).find(r=>r.type==='projection'&&r.bindingId===world.sharedGame!.activeBindingId)!.branchId;
      const entities=await repo.list<SceneEntity>('entity');
      for(const q of probes){
        const index=indexes.get(q.id)??new GameSearchIndex();
        indexes.set(q.id,index);
        let coverage:GameMemoryCoverage|undefined;
        const out=compileGameContext({draft:q.draft[language],recentMessages:q.recent.map(p=>p[language]),entries:[],books:[],entities,worlds:[world],
          activeBookId:null,scene:{worldId:world.id,bookId:null,focusIds:[]},settings:{contextBudget:plan.budget,relevanceThreshold:6},
          story:{world,chat:f.chatId,branch,facts:world.sharedGame!.facts,sheetsEnabled:false}}, {searchIndex:index},s=>{coverage=s;});
        const warning=memoryCoverageIssue(coverage,out.report)?.kind??null,problems:string[]=[];
        const block=out.text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];
        const hints=block?decodeStoryMemory(JSON.parse(block.trim().split('\n').at(-1)!)):[];
        const selected=hints.map(h=>{
          const source=f.byText.get(h.text);
          if(!source || h.episodeSource?.revisionId!==source.revisionId || (h.sourceQuote??h.text)!==source.fact.quote
            || JSON.stringify(h.sourceRoles??{})!==JSON.stringify(source.roles))problems.push('source');
          return source?.id??'unknown';
        });
        const missing=q.wanted.filter(id=>!selected.includes(id)),forbidden=selected.filter(id=>q.exclude.includes(id)||id.startsWith('shift-'));
        if(missing.length||forbidden.length)problems.push('facts');
        if(!!warning!==q.warning)problems.push('warning');
        if(q.warning&&!out.text.includes('<deeprole_reference_guard>'))problems.push('missing-model-caution');
        if(out.report.total>plan.budget||out.report.total!==addedContextTokens(out.text))problems.push('budget');
        const signature=digest(JSON.stringify([out.text,coverage]));
        if(phase==='cold')cold.set(q.id,signature);
        else if(cold.get(q.id)!==signature)problems.push('unstable');
        results.push({plot:plot.id,locale,query:q.id,phase,selected,missing,forbidden,warning,problems});
      }
    }
    expect(digest(JSON.stringify(await repo.rawRecords()))).toBe(before);
  }finally{await db.delete();}
},180000);
afterAll(()=>{
  const summary={cases:results.filter(r=>r.phase==='cold').length,passed:results.filter(r=>r.phase==='cold'&&!r.problems.length).length,measurements:results.length};
  writeFileSync(output,JSON.stringify({started,runtime,plan:digest(read('docs/benchmarks/rp410-frozen-plan.json')),summary,results},null,2)+'\n',{flag:'wx'});
  expect(results.length).toBe(plan.measurements);
  expect(summary.passed).toBe(summary.cases);
});
