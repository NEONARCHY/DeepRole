import { afterAll, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { compileGameContext } from '../src/core/game-context';
import { GameSearchIndex } from '../src/core/game-search-index';
import { memoryCoverageIssue, type GameMemoryCoverage } from '../src/core/game-memory-coverage';
import { decodeStoryMemory } from '../src/core/story-memory-transport';
import type { SceneEntity, WorldProfile } from '../src/core/types';
import { hearsayCases } from './fixtures/story-rp408-hearsay';
import { makeHistory } from './fixtures/story-rp404-history';
import { digest, seals } from './fixtures/story-rp404-seal';

const read=(path:string)=>readFileSync(path,'utf8').replaceAll('\r\n','\n');
const plan=JSON.parse(read('docs/benchmarks/rp408-plan.json'));
for(const [file,hash] of Object.entries(plan.files))expect(digest(read(file))).toBe(hash);
const tag=process.env.RP408_RUN;
const report='.output/rp408-'+tag+'.json';
const started=new Date().toISOString();
const runtime=tag?seals().runtimeSha256:undefined;
if(tag){
  if(!/^[a-z0-9-]+$/.test(tag))throw Error('Invalid run name');
  if(tag==='first')expect(runtime).toBe(plan.baseline);
  writeFileSync(report+'.receipt',JSON.stringify({started,runtime,plan:digest(read('docs/benchmarks/rp408-plan.json'))}),{flag:'wx'});
}
const results:{plot:string;locale:string;probe:number;phase:string;selected:string[];warning:string|null;failures:string[]}[]=[];
for(const {plot,probes} of hearsayCases)for(const locale of ['ru','en'] as const)it(plot.id+' '+locale+' verifies a report from 1024 saved scenes',()=>{
  const f=makeHistory(plot,locale,127), lang=locale==='ru'?0:1;
  const world=f.records.find(r=>r.kind==='world')!.data as WorldProfile;
  const entities=f.records.filter(r=>r.kind==='entity').map(r=>r.data as SceneEntity);
  const before=digest(JSON.stringify(f.records));
  expect(world.sharedGame!.facts.length).toBe(1024);
  for(const [probe,q] of probes.entries()){
    const index=new GameSearchIndex();
    let signature:string|undefined;
    for(const phase of ['cold','warm']){
      let coverage:GameMemoryCoverage|undefined;
      const out=compileGameContext({draft:q.draft[lang],recentMessages:[],entries:[],books:[],entities,worlds:[world],activeBookId:null,
        scene:{worldId:world.id,bookId:null,focusIds:[]},settings:{contextBudget:6000,relevanceThreshold:6},
        story:{world,chat:f.chatId,facts:world.sharedGame!.facts,sheetsEnabled:false}}, {searchIndex:index},c=>{coverage=c;});
      const warning=memoryCoverageIssue(coverage,out.report)?.kind??null;
      const block=out.text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];
      const hints=block?decodeStoryMemory(JSON.parse(block.trim().split('\n').at(-1)!)):[];
      const failures:string[]=[];
      const selected=hints.map(h=>{
        const source=f.byText.get(h.text);
        if(!source||h.kind!==source.fact.kind||h.episodeSource?.revisionId!==source.revisionId||
          (h.sourceQuote??h.text)!==source.fact.quote||JSON.stringify(h.sourceRoles??{})!==JSON.stringify(source.roles))failures.push('source');
        return source?.id??'unknown';
      });
      for(const w of q.wanted)if(!selected.includes(w))failures.push('missing '+w);
      for(const e of q.exclude)if(selected.includes(e))failures.push('unrelated '+e);
      if(!!warning!==q.warning)failures.push('warning');
      if(q.warning&&!out.text.includes('<deeprole_reference_guard>'))failures.push('model caution');
      if(out.report.total>out.report.limit)failures.push('budget');
      const next=digest(JSON.stringify([out,coverage]));
      if(signature&&next!==signature)failures.push('unstable');
      signature=next;
      results.push({plot:plot.id,locale,probe,phase,selected,warning,failures});
    }
  }
  expect(digest(JSON.stringify(f.records))).toBe(before);
},120000);
afterAll(()=>{
  const cases=results.filter(r=>r.phase==='cold'),summary={cases:cases.length,passed:cases.filter(r=>!r.failures.length).length,measurements:results.length};
  if(tag)writeFileSync(report,JSON.stringify({started,runtime,summary,results},null,2)+'\n',{flag:'wx'});
  expect(results.length).toBe(24);
  expect(results.filter(r=>r.failures.length)).toEqual([]);
});
