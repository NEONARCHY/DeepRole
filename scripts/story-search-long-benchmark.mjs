import {createServer} from 'vite';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {parseArgs,isDeepStrictEqual} from 'node:util';
import {performance} from 'node:perf_hooks';
import {platform,arch,cpus} from 'node:os';
import {digest} from './story-search-evaluation.mjs';

const {values:args}=parseArgs({options:{freeze:{type:'boolean'},evaluate:{type:'boolean'},report:{type:'string',default:'rp280-long-results.json'}}});
if(Number(!!args.freeze)+Number(!!args.evaluate)!==1)throw Error('Choose exactly one of --freeze or --evaluate');
if(!/^rp280[-a-z0-9]*\.json$/u.test(args.report))throw Error('Use an RP280 report filename');
const root=new URL('../',import.meta.url),file=p=>new URL(p,root),baselineFile=file('tests/fixtures/story-long-holdout-baseline.json');
async function tree(dir){const out=[];for(const e of await readdir(file(dir),{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())out.push(...await tree(p));else if(/\.(?:ts|tsx)$/u.test(e.name))out.push(p);}return out.sort();}
async function fingerprints(){const paths=[...await tree('src'),'tests/fixtures/story-long-holdout.ts','scripts/story-search-long-benchmark.mjs','scripts/story-search-evaluation.mjs','docs/LONG-HISTORY-EVALUATION.md'];return Object.fromEntries(await Promise.all(paths.map(async p=>[p,digest((await readFile(file(p),'utf8')).replaceAll('\r\n','\n'))])));}
const server=await createServer({configFile:false,cacheDir:'.wxt/rp280-long',optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
try{
 const {longScenarios}=await server.ssrLoadModule('/tests/fixtures/story-long-holdout.ts');
 const scenarios=longScenarios();
 const goldFor=c=>c.gold.wanted.map(id=>{const i=c.ids.indexOf(id);if(i<0)throw Error('Foreign gold '+c.id+':'+id);return {id,fact:c.input.story.facts[i],source:c.sources[i],speaker:c.input.entities[c.speakers[i]].id};});
 const rows=scenarios.map(c=>({id:c.id,family:c.family,locale:c.locale,noiseScenes:c.noiseCount,inputDigest:digest(c.input),gold:goldFor(c),guard:c.gold.guard,noGoldReason:c.gold.noGoldReason??null}));
 if(new Set(rows.map(r=>r.id)).size!==78||rows.some(r=>new Set(r.gold.map(g=>g.id)).size!==r.gold.length))throw Error('Invalid independent case IDs/gold');
 const manifest={version:1,baseline:'Current RP279 runtime before independent audit; no algorithm changes during RP280',scope:'Agent-authored synthetic accepted-memory compiler audit, not blind external or live model evaluation',fingerprints:await fingerprints(),inputDigest:digest(rows.map(({gold,...r})=>r)),goldDigest:digest(rows.map(r=>[r.id,r.gold])),rows};
 if(args.freeze){
   // Never call compileGameContext while defining/fixing the evaluation inputs.
   await writeFile(baselineFile,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
   console.log(JSON.stringify({frozenBeforeCompilerExecution:true,cases:rows.length,inputDigest:manifest.inputDigest,goldDigest:manifest.goldDigest,runtimeFiles:Object.keys(manifest.fingerprints).length}));
 }else{
   const frozen=JSON.parse(await readFile(baselineFile,'utf8'));
   if(!isDeepStrictEqual(frozen,manifest))throw Error('Frozen runtime/fixture/protocol/input/gold changed; do not rewrite the baseline');
   const {compileGameContext}=await server.ssrLoadModule('/src/core/game-context.ts'),{GameSearchIndex}=await server.ssrLoadModule('/src/core/game-search-index.ts'),{decodeStoryMemory}=await server.ssrLoadModule('/src/core/story-memory-transport.ts');
   const memory=text=>{const block=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return block?decodeStoryMemory(JSON.parse(block.split('\n')[1])):[];};
   const results=[];
   for(const c of scenarios){
     const inputBefore=digest(c.input),observations=[],index=new GameSearchIndex();
     let started=performance.now();const cold=compileGameContext(c.input,{memoryTransport:'columns',searchIndex:index},v=>observations.push(v));const coldMs=performance.now()-started;
     const cloned=structuredClone(c.input);started=performance.now();const warm=compileGameContext(cloned,{memoryTransport:'columns',searchIndex:index},v=>observations.push(v));const warmMs=performance.now()-started;
     const hints=memory(cold.text),current=c.input.story.facts,issues=[],selectedIds=[];
     for(const h of hints){
       const candidates=current.map((fact,i)=>({fact,i})).filter(({fact})=>fact.text===h.text&&fact.kind===h.kind);
       const found=candidates.find(({fact})=>isDeepStrictEqual(fact.task,h.task)&&isDeepStrictEqual(fact.claim,h.claim)&&(h.sourceQuote??h.text)===fact.quote);
       if(!found){issues.push('unmatched-or-altered-fact');continue;}
       const i=found.i,seed=c.input.story.roleSeeds[i].binding;
       selectedIds.push(c.ids[i]);
       const expectedEpisode={revisionId:c.sources[i],episode:Math.floor(i/12)+1,period:i===current.length-1?'latest-turn':'earlier-turn'};
       if(!isDeepStrictEqual(h.sourceRoles,seed.roles))issues.push('altered-or-missing-role:'+c.ids[i]);
       if(!isDeepStrictEqual(h.episodeSource,expectedEpisode))issues.push('altered-or-missing-source:'+c.ids[i]);
     }
     const missing=c.gold.wanted.filter(id=>!selectedIds.includes(id)),guardPresent=cold.text.includes('Personal reference in the current request is NOT resolved by DeepRole.');
     if(selectedIds.includes('old-location'))issues.push('superseded-location-selected');
     if(digest(c.input)!==inputBefore||digest(cloned)!==inputBefore)issues.push('input-mutated');
     if(!isDeepStrictEqual(cold,warm)||!isDeepStrictEqual(observations[0],observations[1]))issues.push('warm-output-drift');
     if(cold.report.total>cold.report.limit&&cold.report.required<=cold.report.limit)issues.push('optional-budget-overflow');
     if(c.gold.guard&&!guardPresent)issues.push('missing-personal-reference-guard');
     const r={id:c.id,family:c.family,locale:c.locale,noiseScenes:c.noiseCount,acceptedFacts:current.length,gold:c.gold.wanted,selectedIds,missing,complete:c.gold.wanted.length?missing.length===0:null,issues:[...new Set(issues)],guardPresent,coverage:observations[0],report:cold.report,wireCharacters:cold.text.length,outputDigest:digest(cold),coldMs,warmMs};
     results.push(r);index.clear();
     console.log(JSON.stringify({progress:results.length,cases:scenarios.length,id:r.id,complete:r.complete,missing:r.missing,issues:r.issues,coldMs:Math.round(coldMs),warmMs:Math.round(warmMs)}));
   }
   const groups=[];
   for(const family of [...new Set(results.map(r=>r.family))])for(const locale of ['ru','en']){const rs=results.filter(r=>r.family===family&&r.locale===locale),scored=rs.filter(r=>r.complete!==null);groups.push({family,locale,cases:rs.length,scored:scored.length,complete:scored.filter(r=>r.complete).length,goldFacts:scored.reduce((s,r)=>s+r.gold.length,0),missingFacts:scored.reduce((s,r)=>s+r.missing.length,0),integrityIssues:rs.reduce((s,r)=>s+r.issues.length,0)});}
   const scored=results.filter(r=>r.complete!==null),report={version:1,scope:manifest.scope,baselineDigest:digest(frozen),inputDigest:manifest.inputDigest,goldDigest:manifest.goldDigest,fingerprints:manifest.fingerprints,environment:{node:process.version,platform:platform(),arch:arch(),cpu:cpus()[0]?.model},summary:{cases:results.length,scored:scored.length,complete:scored.filter(r=>r.complete).length,goldFacts:scored.reduce((s,r)=>s+r.gold.length,0),missingFacts:scored.reduce((s,r)=>s+r.missing.length,0),casesWithIntegrityIssues:results.filter(r=>r.issues.length).length},groups,results};
   await writeFile(file('docs/benchmarks/'+args.report),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
   console.log(JSON.stringify({report:args.report,...report.summary,groups}));
 }
}finally{await server.close();}
