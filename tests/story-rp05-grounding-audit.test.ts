import {expect,it} from 'vitest';
import {addedContextTokens,compileGameContext} from '../src/core/game-context';
import {decodeStoryMemory} from '../src/core/story-memory-transport';
import {rp05GroundingScenarios} from './fixtures/story-rp05-grounding';

const cases=(['ru','en'] as const).flatMap(locale=>rp05GroundingScenarios(locale));
const results:{id:string;locale:string;plot:string;control:boolean;wanted:string[];selected:string[];selectedCount:number;missing:string[];noise:number;taskStates:string[];integrity:string[]}[]=[];
const memory=(text:string)=>{
 const block=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];
 return block?decodeStoryMemory(JSON.parse(block.split('\n')[1]!)):[];
};

for(const c of cases)it(`fresh RP-05 grounding ${c.locale}:${c.id}`,()=>{
 const before=structuredClone(c.input),out=compileGameContext(c.input),selected=memory(out.text),selectedIds:string[]=[],integrity:string[]=[];
 for(const hint of selected){
  const i=c.facts.findIndex(f=>f.text===hint.text),id=c.ids[i];
  if(i<0){integrity.push('unknown-source');continue;}
  selectedIds.push(id!);
  const fact=c.facts[i]!,seed=c.input.story!.roleSeeds!.find(s=>s.binding.quote===fact.quote)!;
  if(hint.kind!==fact.kind||(hint.sourceQuote??hint.text)!==fact.quote)integrity.push(`source-or-kind:${id}`);
  if(JSON.stringify(hint.task??null)!==JSON.stringify(fact.task??null))integrity.push(`task-status-or-condition:${id}`);
  if(JSON.stringify(hint.sourceRoles??{})!==JSON.stringify(seed.binding.roles))integrity.push(`attribution:${id}`);
  if(hint.episodeSource?.revisionId!==c.sources[i])integrity.push(`source-id:${id}`);
 }
 const wanted=c.wanted.map(id=>c.ids.indexOf(id)).map(i=>c.ids[i]!),missing=c.wanted.filter(id=>!selectedIds.includes(id));
 results.push({id:c.id,locale:c.locale,plot:c.plot,control:c.control,wanted,selected:selectedIds,selectedCount:selected.length,missing,noise:selectedIds.filter(id=>id.startsWith('noise-')).length,taskStates:selected.flatMap(h=>h.task?[`${h.task.key}:${h.task.status}`]:[]),integrity});
 expect(integrity).toEqual([]);expect(out.report.total).toBe(addedContextTokens(out.text));
 expect(out.report.total<=out.report.limit||out.report.required>out.report.limit).toBe(true);expect(out.report.selected.facts).toBe(selected.length);
 expect(c.input).toEqual(before);
});

it('reports the preregistered fresh set without hiding misses behind control totals',()=>{
 const scored=results.filter(r=>!r.control),controls=results.filter(r=>r.control);
 const report={cases:results.length,scored:scored.length,complete:scored.filter(r=>!r.missing.length).length,
  wanted:scored.reduce((n,r)=>n+r.wanted.length,0),missing:scored.reduce((n,r)=>n+r.missing.length,0),
  ruComplete:scored.filter(r=>r.locale==='ru'&&!r.missing.length).length,enComplete:scored.filter(r=>r.locale==='en'&&!r.missing.length).length,
  controls:controls.length,controlSourcesOnlyAsBeliefs:controls.filter(r=>r.selected.length>0&&r.selected.every(id=>id==='rumor')).length,
  controlEventLeaks:controls.filter(r=>r.selected.some(id=>id.startsWith('noise-')||id==='action'||id==='promise')).length,
  noiseDisplacingRequired:scored.filter(r=>r.missing.length&&r.noise>0).length,integrityIssues:results.reduce((n,r)=>n+r.integrity.length,0),
  casesWithRepeatedDiscussion:selectedCaseCount(results)};
 console.info('RP05-grounding-fresh',JSON.stringify(report),JSON.stringify(results.filter(r=>r.missing.length||r.integrity.length)));
 expect(results).toHaveLength(22);expect(scored).toHaveLength(18);expect(controls).toHaveLength(4);
 expect(report.wanted).toBe(24);expect(report.integrityIssues).toBe(0);
 expect(report).toMatchObject({complete:18,missing:0,ruComplete:9,enComplete:9,controlSourcesOnlyAsBeliefs:4,controlEventLeaks:0,noiseDisplacingRequired:0});
});

function selectedCaseCount(rows:typeof results){return rows.filter(r=>r.noise>0).length;}
