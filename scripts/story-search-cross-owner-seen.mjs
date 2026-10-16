import {createServer} from 'vite';
import {readFile,writeFile} from 'node:fs/promises';
import {isDeepStrictEqual,parseArgs} from 'node:util';
import {digest} from './story-search-evaluation.mjs';
const {values:{suffix=''}}=parseArgs({options:{suffix:{type:'string'}}});
if(!/^[a-z]?$/u.test(suffix))throw Error('Single-letter attempt suffix only');
const root=new URL('../',import.meta.url),read=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const datasets=[
 ['rp292','story-cross-owner-audit','crossOwnerScenarios','rp292-cross-owner-results'],
 ['rp289','story-mixed-obligation-audit','mixedAuditScenarios','rp291-rp289-premise-seen-results'],
 ['rp287','story-obligation-holdout','obligationHoldoutScenarios','rp291-rp287-premise-seen-results'],
 ['rp283','story-independent-sequences','independentScenarios','rp291-rp283-premise-seen-results'],
];
const server=await createServer({configFile:false,cacheDir:'.wxt/rp294-seen',optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
try{
 const {compileGameContext,addedContextTokens}=await server.ssrLoadModule('/src/core/game-context.ts');
 const {decodeStoryMemory}=await server.ssrLoadModule('/src/core/story-memory-transport.ts');
 const {GameSearchIndex}=await server.ssrLoadModule('/src/core/game-search-index.ts');
 for(const [stage,fixture,factory,previous] of datasets){
  const prior=await read(`docs/benchmarks/${previous}.json`),seal=await read(`docs/benchmarks/${stage}-first-report-seal.json`),baseline=await read(seal.baseline);
  const cases=(await server.ssrLoadModule(`/tests/fixtures/${fixture}.ts`))[factory](),results=[];
  for(const c of cases){
   const frozen=baseline.rows.find(r=>r.id===c.id),before=prior.results.find(r=>r.id===c.id);
   if(frozen.inputDigest!==digest(c.input)||!isDeepStrictEqual(frozen.gold.map(g=>g.id),c.gold.wanted))throw Error('Changed input/gold '+c.id);
   const index=new GameSearchIndex(),coverage=[],inputDigest=digest(c.input);
   const out=compileGameContext(c.input,{memoryTransport:'columns',searchIndex:index},v=>coverage.push(v));
   const warm=compileGameContext(structuredClone(c.input),{memoryTransport:'columns',searchIndex:index});index.clear();
   const b=out.text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0],hints=b?decodeStoryMemory(JSON.parse(b.split('\n')[1])):[];
   const selectedIds=[],issues=[];
   for(const h of hints){
    const i=c.input.story.facts.findIndex(f=>f.text===h.text),f=c.input.story.facts[i];
    if(!f){issues.push('fabricated');continue;}selectedIds.push(c.ids[i]);
    if(h.kind!==f.kind||(h.sourceQuote??h.text)!==f.quote||!isDeepStrictEqual(h.task,f.task)||!isDeepStrictEqual(h.claim,f.claim)||!isDeepStrictEqual(h.sourceRoles,c.input.story.roleSeeds[i].binding.roles)||h.episodeSource?.revisionId!==c.sources[i])issues.push('altered-source');
   }
   if(digest(c.input)!==inputDigest||!isDeepStrictEqual(out,warm))issues.push('input-or-cache-drift');
   if(out.report.total!==addedContextTokens(out.text)||out.report.selected.facts!==hints.length||out.report.total>out.report.limit&&out.report.required<=out.report.limit)issues.push('meter');
   const missing=c.gold.wanted.filter(id=>!selectedIds.includes(id)),guard=out.text.includes('<deeprole_reference_guard>'),uncertaintyExpected=stage==='rp283'?c.family==='reference':c.gold.uncertainty;
   results.push({id:c.id,family:c.family,score:c.gold.score,gold:c.gold.wanted,selectedIds,missing,complete:c.gold.score?missing.length===0:null,lostPrior:before.selectedIds.filter(id=>!selectedIds.includes(id)),issues,coverage:coverage[0],guard,confidenceGap:!!uncertaintyExpected&&!guard,outputDigest:digest(out),outputChanged:digest(out)!==before.outputDigest,report:out.report});
  }
  const scored=results.filter(r=>r.score),summary={cases:results.length,scored:scored.length,complete:scored.filter(r=>r.complete).length,missingFacts:scored.reduce((n,r)=>n+r.missing.length,0),integrityIssues:results.filter(r=>r.issues.length).length,confidenceGaps:results.filter(r=>r.confidenceGap).length,lostPriorFacts:results.reduce((n,r)=>n+r.lostPrior.length,0)};
  const path=`docs/benchmarks/rp294${suffix}-${stage}-seen-results.json`;
  await writeFile(new URL(path,root),JSON.stringify({version:1,scope:'SEEN regression, not independent or live-model proof',previousDigest:digest(prior),baselineDigest:digest(baseline),summary,results},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({path,...summary}));
 }
}finally{await server.close();}
