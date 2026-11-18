import { readFileSync, writeFileSync } from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import { addedContextTokens, compileGameContext } from '../src/core/game-context';
import { GameSearchIndex } from '../src/core/game-search-index';
import { memoryCoverageIssue, type GameMemoryCoverage } from '../src/core/game-memory-coverage';
import { decodeStoryMemory } from '../src/core/story-memory-transport';
import { readTaskArchive } from '../src/core/story-task-archive';
import type { SceneEntity, WorldProfile } from '../src/core/types';
import type { StoryRecord } from '../src/core/story-records';
import { DeepRoleDatabase } from '../src/storage/database';
import { DeepRoleRepository } from '../src/storage/repository';
import { makeHistory } from './fixtures/story-rp404-history';
import { digest, seals } from './fixtures/story-rp404-seal';
import type { Bilingual, Plot } from './fixtures/story-rp404-corpus';

type Probe = { id: string; draft: Bilingual; wanted: string[]; exclude: string[]; warning: boolean };
const read = (path:string) => readFileSync(path,'utf8').replaceAll('\r\n','\n');
const planText = read('docs/benchmarks/rp411-frozen-plan.json');
const plan = JSON.parse(planText);
for (const [file,hash] of Object.entries(plan.files)) expect(digest(read(file))).toBe(hash);
const corpus: {plot:Plot; probes:Probe[]}[] = JSON.parse(read('tests/fixtures/story-rp411-comparisons.json'));
const runtime = seals().runtimeSha256;
const tag = process.env.RP411_RUN ?? 'first';
if (!/^[a-z0-9-]+$/.test(tag)) throw Error('Invalid report tag');
if (tag==='first') expect(runtime).toBe(plan.baselineRuntime);
const output = '.output/rp411-'+tag+'.json';
const receipt = {started:new Date().toISOString(),runtime,plan:digest(planText)};
writeFileSync(output+'.receipt',JSON.stringify(receipt)+'\n',{flag:'wx'});
const rows: {plot:string;locale:string;query:string;phase:string;selected:string[];warning:string|null;problems:string[]}[]=[];

for (const {plot,probes} of corpus) for (const locale of ['ru','en'] as const) it(plot.id+' '+locale,async()=>{
  const fixture=makeHistory(plot,locale,plan.extraShiftsPerAct);
  expect(fixture.facts).toHaveLength(plan.factsPerHistory);
  const db=new DeepRoleDatabase('rp411-'+crypto.randomUUID()),repo=new DeepRoleRepository(db);
  try {
    await repo.mergeRecords(fixture.records);
    const before=digest(JSON.stringify(await repo.rawRecords())), cold=new Map<string,string>();
    const indexes=new Map<string,GameSearchIndex>();
    for (const phase of ['cold','warm','reopened']) {
      if (phase==='reopened') { db.close(); await db.open(); indexes.clear(); }
      const world=(await repo.get<WorldProfile>('world',fixture.worldId))!;
      const records=await repo.list<StoryRecord>('story');
      const branch=records.find(r=>r.type==='projection'&&r.bindingId===world.sharedGame!.activeBindingId)!.branchId;
      const taskArchive=readTaskArchive(records,world,branch);
      const entities=await repo.list<SceneEntity>('entity');
      for (const q of probes) {
        const index=indexes.get(q.id)??new GameSearchIndex();
        indexes.set(q.id,index);
        let coverage:GameMemoryCoverage|undefined;
        const result=compileGameContext({draft:q.draft[locale==='ru'?0:1],recentMessages:[],entries:[],books:[],entities,worlds:[world],
          activeBookId:null,scene:{worldId:world.id,bookId:null,focusIds:[]},settings:{contextBudget:plan.budget,relevanceThreshold:6},
          story:{world,chat:fixture.chatId,branch,facts:world.sharedGame!.facts,taskArchive,sheetsEnabled:false}}, {searchIndex:index},s=>{coverage=s});
        const block=result.text.match(/<deeprole_story_memory>([\s\S]*?)<\/deeprole_story_memory>/)?.[1];
        const hints=block?decodeStoryMemory(JSON.parse(block.trim().split('\n').at(-1)!)):[];
        const problems:string[]=[];
        const selected=hints.map(h=>{
          const s=fixture.byText.get(h.text);
          if (!s||s.revisionId!==h.episodeSource?.revisionId||(h.sourceQuote??h.text)!==s.fact.quote||h.kind!==s.fact.kind||
            JSON.stringify(h.task)!==JSON.stringify(s.fact.task)||JSON.stringify(h.sourceRoles??{})!==JSON.stringify(s.roles)) problems.push('source');
          return s?.id??'unknown';
        });
        if (selected.length!==q.wanted.length||q.wanted.some(id=>!selected.includes(id))||q.exclude.some(id=>selected.includes(id))) problems.push('facts');
        const warning=memoryCoverageIssue(coverage,result.report)?.kind??null;
        if (!!warning!==q.warning || q.warning&&!result.text.includes('<deeprole_reference_guard>')) problems.push('warning');
        if (result.report.total>plan.budget||result.report.total!==addedContextTokens(result.text)) problems.push('budget');
        const signature=digest(JSON.stringify([result,coverage]));
        if (phase==='cold') cold.set(q.id,signature); else if (signature!==cold.get(q.id)) problems.push('unstable');
        rows.push({plot:plot.id,locale,query:q.id,phase,selected,warning,problems});
      }
    }
    expect(digest(JSON.stringify(await repo.rawRecords()))).toBe(before);
  } finally {await db.delete();}
},180000);
afterAll(()=>{
  const cases=rows.filter(r=>r.phase==='cold');
  const summary={cases:cases.length,passed:cases.filter(r=>!r.problems.length).length,measurements:rows.length};
  writeFileSync(output,JSON.stringify({...receipt,summary,rows},null,2)+'\n',{flag:'wx'});
  expect(rows).toHaveLength(plan.measurements);
  expect(rows.filter(r=>r.problems.length)).toHaveLength(0);
});
