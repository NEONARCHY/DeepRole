import {createServer} from 'vite';
import {readFile,writeFile,access} from 'node:fs/promises';
import {isDeepStrictEqual,parseArgs} from 'node:util';
import {digest} from './story-search-evaluation.mjs';
const {values:{suffix=''}}=parseArgs({options:{suffix:{type:'string'}}});
if(!/^[a-z]?$/u.test(suffix))throw Error('Single letter attempt suffix only');
const root=new URL('../',import.meta.url),text=async p=>(await readFile(new URL(p,root),'utf8')).replaceAll('\r\n','\n'),read=async p=>JSON.parse(await text(p));
const datasets=[
 ['rp303','story-relay-audit','relayScenarios','rp303-relay-results'],
 ['rp301','story-embargo-audit','embargoScenarios','rp302-rp301-seen-results'],
 ['rp299','story-exception-audit','exceptionScenarios','rp302-rp299-seen-results'],
 ['rp297','story-conditional-audit','conditionalScenarios','rp302-rp297-seen-results'],
 ['rp295','story-access-audit','accessScenarios','rp302-rp295-seen-results'],
 ['rp292','story-cross-owner-audit','crossOwnerScenarios','rp302-rp292-seen-results'],
 ['rp289','story-mixed-obligation-audit','mixedAuditScenarios','rp302-rp289-seen-results'],
 ['rp287','story-obligation-holdout','obligationHoldoutScenarios','rp302-rp287-seen-results'],
 ['rp283','story-independent-sequences','independentScenarios','rp302-rp283-seen-results'],
];
const baseline=await read('tests/fixtures/story-relay-audit-baseline.json'),snapshots={'src/core/game-context.ts':'docs/benchmarks/rp302-final-game-context.txt','src/core/story-obligation-recall.ts':'docs/benchmarks/rp302-final-obligation.txt'};
for(const [path,hash]of Object.entries(baseline.fingerprints))if(digest(await text(snapshots[path]??path))!==hash)throw Error('Historical source changed '+path);
const currentDigests=Object.fromEntries(await Promise.all(Object.keys(snapshots).map(async p=>[p,digest(await text(p))])));
for(const [stage]of datasets){try{await access(new URL(`docs/benchmarks/rp304${suffix}-${stage}-seen-results.json`,root));throw Error('Report exists');}catch(e){if(e.code!=='ENOENT')throw e;}}
// Snapshot evaluation needs no filesystem watching. A browser's temporary
// cookie database may be locked while independent native tests are running.
const server=await createServer({configFile:false,cacheDir:'.wxt/rp304-seen',optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom'});
try{
 const {compileGameContext,addedContextTokens}=await server.ssrLoadModule('/src/core/game-context.ts');
 const {decodeStoryMemory}=await server.ssrLoadModule('/src/core/story-memory-transport.ts');
 const {compactStoryFactSources}=await server.ssrLoadModule('/src/core/story-update.ts');
 const {GameSearchIndex}=await server.ssrLoadModule('/src/core/game-search-index.ts');
 for(const [stage,fixture,factory,previous] of datasets){
  const prior=await read(`docs/benchmarks/${previous}.json`),seal=await read(`docs/benchmarks/${stage}-first-report-seal.json`),base=await read(seal.baseline),results=[];
  const cases=(await server.ssrLoadModule(`/tests/fixtures/${fixture}.ts`))[factory]();
  for(const c of cases){
   const row=base.rows.find(r=>r.id===c.id),before=prior.results.find(r=>r.id===c.id),inputDigest=digest(c.input);
   if(row.inputDigest!==inputDigest||!isDeepStrictEqual(row.gold.map(g=>g.id),c.gold.wanted))throw Error('Input/gold changed '+c.id);
   const index=new GameSearchIndex(),states=[],out=compileGameContext(c.input,{memoryTransport:'columns',searchIndex:index},v=>states.push(v));
   const clone=structuredClone(c.input),warm=compileGameContext(clone,{memoryTransport:'columns',searchIndex:index},v=>states.push(v));index.clear();
   const b=out.text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0],hints=b?decodeStoryMemory(JSON.parse(b.split('\n')[1])):[],selectedIds=[],issues=[];
   const current=new Set(compactStoryFactSources(c.input.story.facts).map(digest));
   for(const h of hints){const i=c.input.story.facts.findIndex(f=>f.text===h.text),f=c.input.story.facts[i];
    if(!f){issues.push('unknown-fact');continue;}selectedIds.push(c.ids[i]);
    if(!current.has(digest(f)))issues.push('superseded');
    if(h.kind!==f.kind||(h.sourceQuote??h.text)!==f.quote||!isDeepStrictEqual(h.task,f.task)||!isDeepStrictEqual(h.claim,f.claim)||!isDeepStrictEqual(h.sourceRoles,c.input.story.roleSeeds[i].binding.roles))issues.push('altered-fact-or-role');
    if(!isDeepStrictEqual(h.episodeSource,{revisionId:c.sources[i],episode:Math.floor(i/12)+1,period:i===c.ids.length-1?'latest-turn':'earlier-turn'}))issues.push('altered-episode');
    if(f.claim?.lifetime==='persistent'&&h.timeStatus!=='persistent')issues.push('altered-time-status');
    if(f.claim?.status==='ended'&&h.timeStatus!=='ended')issues.push('altered-ended-status');
   }
   if(new Set(selectedIds).size!==selectedIds.length)issues.push('duplicates');
   if(digest(c.input)!==inputDigest||digest(clone)!==inputDigest||!isDeepStrictEqual(out,warm)||!isDeepStrictEqual(states[0],states[1]))issues.push('input-or-cache-drift');
   if(out.report.total!==addedContextTokens(out.text)||out.report.selected.facts!==hints.length||out.report.total>out.report.limit&&out.report.required<=out.report.limit)issues.push('meter');
   const missing=c.gold.wanted.filter(id=>!selectedIds.includes(id)),uncertaintyExpected=stage==='rp283'?c.family==='reference':c.gold.uncertainty,guard=out.text.includes('<deeprole_reference_guard>'),confidenceIssues=[];
   if(uncertaintyExpected&&(!guard||states[0]?.kind!=='unverified'))confidenceIssues.push('uncertainty-or-guard');
   if(c.gold.score&&missing.length&&states[0]?.kind==='complete')confidenceIssues.push('false-complete');
   results.push({id:c.id,family:c.family,locale:c.locale,score:c.gold.score,control:c.gold.control,budget:c.gold.budget,gold:c.gold.wanted,selectedIds,missing,complete:c.gold.score?!missing.length:null,lostPrior:before.selectedIds.filter(id=>!selectedIds.includes(id)),issues:[...new Set(issues)],confidenceIssues,guard,coverage:states[0],report:out.report,outputDigest:digest(out),outputChanged:digest(out)!==before.outputDigest});
  }
  const scored=results.filter(r=>r.score),summary={cases:results.length,scored:scored.length,complete:scored.filter(r=>r.complete).length,gold:scored.reduce((n,r)=>n+r.gold.length,0),missing:scored.reduce((n,r)=>n+r.missing.length,0),integrityCases:results.filter(r=>r.issues.length).length,confidenceGapCases:results.filter(r=>r.confidenceIssues.length).length,lostPriorFacts:results.reduce((n,r)=>n+r.lostPrior.length,0)};
  const path=`docs/benchmarks/rp304${suffix}-${stage}-seen-results.json`;
  await writeFile(new URL(path,root),JSON.stringify({version:1,scope:'SEEN regression, not independent or live-model proof',currentDigests,runnerDigest:digest(await text('scripts/story-search-relay-seen.mjs')),baselineDigest:digest(base),previousReportDigest:digest(prior),summary,results},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({path,...summary}));
 }
}finally{await server.close();}


