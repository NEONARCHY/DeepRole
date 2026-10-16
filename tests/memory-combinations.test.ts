// @vitest-environment node
import {it,expect,afterAll} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {pairwise,memoryFactors} from './helpers/memory-combinations';
import {crossOwnerWorld,crossOwnerScenarios} from './fixtures/story-cross-owner-audit';
import {compileGameContext,addedContextTokens,type GameContextOptions} from '../src/core/game-context';
import {decodeStoryMemory} from '../src/core/story-memory-transport';
import {GameSearchIndex} from '../src/core/game-search-index';
import {storyWorld} from './fixtures/story-worlds';

const matrix=pairwise(memoryFactors), results:Record<string,unknown>[]=[];
it('independently verifies every cross-factor value pair and deterministic generation',()=>{
 expect(pairwise(memoryFactors)).toEqual(matrix);
 const names=Object.keys(memoryFactors);let pairs=0;
 for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){
  const a=names[i]!,b=names[j]!;
  for(const x of memoryFactors[a]!)for(const y of memoryFactors[b]!){
   expect(matrix.rows.some(r=>r[a]===x&&r[b]===y),`${a}=${x} + ${b}=${y}`).toBe(true);pairs++;
  }
 }
 expect(pairs).toBe(matrix.totalPairs);
 expect(()=>pairwise({a:[],b:[true]})).toThrow();
 expect(()=>pairwise({a:[true,true],b:[true]})).toThrow();
});

function check(id:string,c:ReturnType<typeof crossOwnerWorld>,options:GameContextOptions,gold?:string[],configuration?:Record<string,unknown>,uncertaintyExpected=false){
 const before=JSON.stringify(c.input), observations:unknown[]=[];
 const cold=compileGameContext(c.input,options,v=>observations.push(v));
 const clone=structuredClone(c.input);
 const warm=compileGameContext(clone,options,v=>observations.push(v));
 const block=cold.text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];
 const payload=block?.split('\n').find(line=>line.startsWith('[')||line.startsWith('{'));
 const hints=payload?decodeStoryMemory(JSON.parse(payload)):[];
 const issues:string[]=[],selected:string[]=[];
 for(const h of hints){
  const i=c.input.story!.facts.findIndex(f=>f.text===h.text),f=c.input.story!.facts[i];
  if(!f){issues.push('unknown-fact');continue;}
  selected.push(c.ids[i]!);
  if(f.kind!==h.kind||f.quote!==(h.sourceQuote??h.text)||!isDeepStrictEqual(f.task,h.task)||!isDeepStrictEqual(f.claim,h.claim))issues.push('altered-fact');
  if(!isDeepStrictEqual(h.sourceRoles,c.input.story!.roleSeeds![i]!.binding.roles))issues.push('altered-roles');
  if(h.episodeSource?.revisionId!==c.sources[i])issues.push('altered-source');
 }
 if(selected.includes('aOld')||selected.includes('b0'))issues.push('superseded-fact');
 if(new Set(selected).size!==selected.length)issues.push('duplicate-fact');
 if(cold.report.total!==addedContextTokens(cold.text))issues.push('wrong-meter');
 if(cold.report.total>cold.report.limit&&cold.report.required<=cold.report.limit)issues.push('optional-overflow');
 if(cold.report.selected.facts!==hints.length)issues.push('wrong-count');
 if(c.input.entries.some(e=>!e.enabled)||[...(c.input.excludedIds??[])].includes('matrix-lore'))if(cold.text.includes('MATRIX_LORE_SENTINEL'))issues.push('excluded-lore-leak');
 if(c.input.requiredContext&&!cold.text.includes(c.input.requiredContext))issues.push('required-context-lost');
 if(JSON.stringify(c.input)!==before||JSON.stringify(clone)!==before)issues.push('mutated-input');
 if(!isDeepStrictEqual(cold,warm)||!isDeepStrictEqual(observations[0],observations[1]))issues.push('warm-cache-drift');
 const missing=gold?.filter(id=>!selected.includes(id));
 const guard=cold.text.includes('<deeprole_reference_guard>');
 results.push({id,configuration,options:{...options,searchIndex:!!options.searchIndex},locale:c.locale,plot:c.plotId,noise:c.noiseCount,budget:c.input.settings.contextBudget,selected,missing,coverage:observations[0],guard,uncertaintyExpected,confidenceGap:uncertaintyExpected&&!guard,issues,report:cold.report});
 expect(issues,id).toEqual([]);
 options.searchIndex?.clear();
}
matrix.rows.forEach((row,i)=>it(`pairwise ${i}: ${JSON.stringify(row)}`,()=>{
 const {locale,plot,noise,budget,transport,variant,cache,lore,profiles,recap,choices,required,...flags}=row;
 const c=crossOwnerWorld(locale as 'ru'|'en',Number(plot),Number(noise),Number(variant));
 c.input.settings.contextBudget=Number(budget);c.input.story!.world.contextBudget=Number(budget);
 const extra=storyWorld(locale as 'ru'|'en'),worldId=c.input.story!.world.id;
 c.input.entries=[{...extra.entry,id:'matrix-lore',worldId,entityIds:[],activation:'always',enabled:lore!=='disabled',content:'MATRIX_LORE_SENTINEL: a mountain town has no sea.'}];
 if(lore==='excluded')c.input.excludedIds=['matrix-lore'];
 if(profiles){c.input.entities![0]!.characterSheet=structuredClone(extra.entities[0]!.characterSheet);c.input.scene!.focusIds=[c.input.entities![0]!.id];}
 if(recap)c.input.continuation={version:1,source:'history',partial:true,omittedTurns:1200,turns:[{role:'assistant',text:'MATRIX_RECAP: the party is waiting at the gate.'}]};
 c.input.choices=!!choices;if(required)c.input.requiredContext='MATRIX_REQUIRED: retain the player correction.';
 check(`pairwise:${i}`,c,{...flags,memoryTransport:transport,searchIndex:cache?new GameSearchIndex():undefined} as GameContextOptions,undefined,row);
},30000));
// Default-mode recall stays visible and scored separately from integrity.
for(const c of crossOwnerScenarios())it(`default recall observation ${c.id}`,()=>{
 check(`default:${c.id}`,c,{memoryTransport:'columns',searchIndex:new GameSearchIndex()},c.gold.score?c.gold.wanted:undefined,undefined,c.gold.uncertainty);
},30000);
afterAll(()=>{
 const dir=process.env.DEEPROLE_MEMORY_REPORT_DIR;if(!dir)return;
 mkdirSync(dir,{recursive:true});
 const scored=results.filter(r=>Array.isArray(r.missing));
 writeFileSync(join(dir,'combinations.json'),JSON.stringify({version:1,scope:'Synthetic accepted memory, finite pairwise feature interactions; not exhaustive or live DeepSeek',factors:memoryFactors,totalPairs:matrix.totalPairs,matrixRows:matrix.rows.length,executedRows:results.length,integrityFailures:results.filter(r=>(r.issues as string[]).length).length,recall:{scored:scored.length,complete:scored.filter(r=>(r.missing as string[]).length===0).length,missingRecords:scored.reduce((n,r)=>n+(r.missing as string[]).length,0),confidenceGaps:results.filter(r=>r.confidenceGap).length},results},null,2)+'\n');
});
