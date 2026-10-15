import {createServer} from 'vite';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {parseArgs,isDeepStrictEqual} from 'node:util';
import {performance} from 'node:perf_hooks';
import {platform,arch,cpus} from 'node:os';
import {digest} from './story-search-evaluation.mjs';

const {values:args}=parseArgs({options:{freeze:{type:'boolean'},evaluate:{type:'boolean'}}});
if(Number(!!args.freeze)+Number(!!args.evaluate)!==1)throw Error('Choose exactly one of --freeze or --evaluate');
const root=new URL('../',import.meta.url),file=p=>new URL(p,root),baselineFile=file('tests/fixtures/story-independent-sequences-baseline.json');
async function tree(dir){const paths=[];for(const e of await readdir(file(dir),{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())paths.push(...await tree(p));else if(/\.(?:ts|tsx)$/u.test(e.name))paths.push(p);}return paths.sort();}
async function fingerprints(){const paths=[...await tree('src'),'tests/fixtures/story-independent-sequences.ts','scripts/story-search-independent-sequences.mjs','scripts/story-search-evaluation.mjs','docs/INDEPENDENT-SEQUENCE-EVALUATION.md'];return Object.fromEntries(await Promise.all(paths.map(async p=>[p,digest((await readFile(file(p),'utf8')).replaceAll('\r\n','\n'))])));}
const server=await createServer({configFile:false,cacheDir:'.wxt/rp283-independent',optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
try{
 const {independentScenarios}=await server.ssrLoadModule('/tests/fixtures/story-independent-sequences.ts');
 const scenarios=independentScenarios();
 const goldFor=c=>c.gold.wanted.map(id=>{const i=c.ids.indexOf(id);if(i<0)throw Error('Foreign gold '+c.id+':'+id);return {id,fact:c.input.story.facts[i],source:c.sources[i],speaker:c.input.entities[c.speakers[i]].id};});
 const rows=scenarios.map(c=>({id:c.id,family:c.family,locale:c.locale,plot:c.plotId,noiseScenes:c.noiseCount,inputDigest:digest(c.input),gold:goldFor(c),score:c.gold.score,rejectCompound:c.gold.rejectCompound,noGoldReason:c.gold.noGoldReason}));
 if(new Set(rows.map(r=>r.id)).size!==84||rows.filter(r=>r.score).length!==54||rows.some(r=>new Set(r.gold.map(g=>g.id)).size!==r.gold.length))throw Error('Invalid independent IDs/gold');
 const manifest={version:1,baseline:'Unchanged RP281 runtime after historical QA repair RP282; no runtime tuning in RP283',scope:'Fresh agent-authored synthetic accepted-memory audit, not blind external or live model evaluation',fingerprints:await fingerprints(),inputDigest:digest(rows.map(({gold,...r})=>r)),goldDigest:digest(rows.map(r=>[r.id,r.gold])),rows};
 if(args.freeze){
  // The evaluation compiler is loaded only in the OTHER branch below.
  await writeFile(baselineFile,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({frozenBeforeCompilerExecution:true,cases:rows.length,scored:54,inputDigest:manifest.inputDigest,goldDigest:manifest.goldDigest,fingerprints:Object.keys(manifest.fingerprints).length}));
 }else{
  const frozen=JSON.parse(await readFile(baselineFile,'utf8'));
  if(!isDeepStrictEqual(frozen,manifest))throw Error('Frozen runtime/fixture/protocol/input/gold changed; never rewrite this baseline');
  const {compileGameContext,addedContextTokens}=await server.ssrLoadModule('/src/core/game-context.ts');
  const {GameSearchIndex}=await server.ssrLoadModule('/src/core/game-search-index.ts');
  const {decodeStoryMemory}=await server.ssrLoadModule('/src/core/story-memory-transport.ts');
  const {storyCompoundAction}=await server.ssrLoadModule('/src/core/story-compound-action.ts');
  const memory=text=>{const block=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return block?decodeStoryMemory(JSON.parse(block.split('\n')[1])):[];};
  const results=[];
  for(const c of scenarios){
   const inputBefore=digest(c.input),observations=[],index=new GameSearchIndex();
   let started=performance.now();const cold=compileGameContext(c.input,{memoryTransport:'columns',searchIndex:index},v=>observations.push(v));const coldMs=performance.now()-started;
   const clone=structuredClone(c.input);started=performance.now();const warm=compileGameContext(clone,{memoryTransport:'columns',searchIndex:index},v=>observations.push(v));const warmMs=performance.now()-started;
   const hints=memory(cold.text),facts=c.input.story.facts,byText=new Map(facts.map((f,i)=>[f.text,{f,i}])),issues=[],selectedIds=[];
   for(const h of hints){
    const found=byText.get(h.text);
    if(!found||found.f.kind!==h.kind||found.f.quote!==(h.sourceQuote??h.text)||!isDeepStrictEqual(found.f.task,h.task)||!isDeepStrictEqual(found.f.claim,h.claim)){issues.push('unmatched-or-altered-fact');continue;}
    const {f,i}=found,seed=c.input.story.roleSeeds[i].binding,id=c.ids[i];selectedIds.push(id);
    if(!isDeepStrictEqual(h.sourceRoles,seed.roles))issues.push('altered-or-missing-role:'+id);
    const expectedEpisode={revisionId:c.sources[i],episode:Math.floor(i/12)+1,period:i===facts.length-1?'latest-turn':'earlier-turn'};
    if(!isDeepStrictEqual(h.episodeSource,expectedEpisode))issues.push('altered-or-missing-source:'+id);
    if(f.claim?.lifetime==='persistent'&&h.timeStatus!=='persistent')issues.push('altered-persistent-status:'+id);
   }
   if(new Set(selectedIds).size!==selectedIds.length)issues.push('duplicate-source');
   for(const id of ['a-old','b-old'])if(selectedIds.includes(id))issues.push('superseded-record-selected:'+id);
   if(cold.report.selected.facts!==hints.length)issues.push('selected-count-mismatch');
   if(cold.report.total!==addedContextTokens(cold.text))issues.push('whole-meter-mismatch');
   if(cold.report.total>cold.report.limit&&cold.report.required<=cold.report.limit)issues.push('optional-budget-overflow');
   if(digest(c.input)!==inputBefore||digest(clone)!==inputBefore)issues.push('input-mutated');
   if(!isDeepStrictEqual(cold,warm)||!isDeepStrictEqual(observations[0],observations[1]))issues.push('warm-output-drift');
   const parsed=storyCompoundAction(c.input.draft,c.input.entities.map(e=>e.name));
   if(c.gold.rejectCompound&&parsed)issues.push('unsupported-compound-accepted');
   const missing=c.gold.wanted.filter(id=>!selectedIds.includes(id));
   const row={id:c.id,family:c.family,locale:c.locale,plot:c.plotId,noiseScenes:c.noiseCount,acceptedFacts:facts.length,score:c.gold.score,gold:c.gold.wanted,selectedIds,missing,complete:c.gold.score?missing.length===0:null,rejectCompound:c.gold.rejectCompound,compoundRecognized:!!parsed,issues:[...new Set(issues)],coverage:observations[0],report:cold.report,wireCharacters:cold.text.length,outputDigest:digest(cold),coldMs,warmMs};
   results.push(row);index.clear();console.log(JSON.stringify({progress:results.length,cases:84,id:row.id,complete:row.complete,missing:row.missing,issues:row.issues,coldMs:Math.round(coldMs)}));
  }
  const group=rs=>{const scored=rs.filter(r=>r.score);return {cases:rs.length,scored:scored.length,complete:scored.filter(r=>r.complete).length,goldFacts:scored.reduce((n,r)=>n+r.gold.length,0),missingFacts:scored.reduce((n,r)=>n+r.missing.length,0),casesWithIntegrityIssues:rs.filter(r=>r.issues.length).length};};
  const groups=[...new Set(results.map(r=>r.family))].flatMap(family=>['ru','en'].map(locale=>({family,locale,...group(results.filter(r=>r.family===family&&r.locale===locale))})));
  const report={version:1,scope:manifest.scope,baselineDigest:digest(frozen),inputDigest:manifest.inputDigest,goldDigest:manifest.goldDigest,fingerprints:manifest.fingerprints,environment:{node:process.version,platform:platform(),arch:arch(),cpu:cpus()[0]?.model},summary:group(results),groups,results};
  await writeFile(file('docs/benchmarks/rp283-independent-results.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({report:'rp283-independent-results.json',...report.summary,groups}));
 }
}finally{await server.close();}
