import {createServer} from 'vite';
import {readFile,writeFile} from 'node:fs/promises';
import {parseArgs,isDeepStrictEqual} from 'node:util';
import {digest} from './story-search-evaluation.mjs';
const {values:args}=parseArgs({options:{report:{type:'string',default:'rp281-natural-seen-results.json'}}});
if(!/^rp281[-a-z0-9]*\.json$/u.test(args.report))throw Error('Use an RP281 report filename');
const root=new URL('../',import.meta.url),file=p=>new URL(p,root),read=async p=>JSON.parse(await readFile(file(p),'utf8'));
const frozen=await read('tests/fixtures/story-long-holdout-baseline.json'),prior=await read('docs/benchmarks/rp280-long-results.json'),seal=await read('docs/benchmarks/rp280c-long-diagnostics.json');
if(digest(frozen)!==prior.baselineDigest||digest(prior)!==seal.firstReportDigest)throw Error('Historical baseline/first report changed');
const changed=[];
for(const [p,hash] of Object.entries(frozen.fingerprints))if(digest((await readFile(file(p),'utf8')).replaceAll('\r\n','\n'))!==hash){
 if(!['src/core/story-action-balance.ts','src/core/story-compound-action.ts'].includes(p))throw Error('Unexpected change outside the parser fix: '+p);
 changed.push(p);
}
const server=await createServer({configFile:false,cacheDir:'.wxt/rp281-seen',optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
try{
 const {longScenarios}=await server.ssrLoadModule('/tests/fixtures/story-long-holdout.ts'),{compileGameContext}=await server.ssrLoadModule('/src/core/game-context.ts'),{decodeStoryMemory}=await server.ssrLoadModule('/src/core/story-memory-transport.ts'),{GameSearchIndex}=await server.ssrLoadModule('/src/core/game-search-index.ts');
 const memory=text=>{const block=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return block?decodeStoryMemory(JSON.parse(block.split('\n')[1])):[];};
 const results=[];
 for(const c of longScenarios()){
  const base=frozen.rows.find(r=>r.id===c.id),before=prior.results.find(r=>r.id===c.id),inputDigest=digest(c.input);
  if(!base||!before||inputDigest!==base.inputDigest||!isDeepStrictEqual(c.gold.wanted,base.gold.map(g=>g.id)))throw Error('Frozen input/gold changed: '+c.id);
  const index=new GameSearchIndex(),states=[],out=compileGameContext(c.input,{memoryTransport:'columns',searchIndex:index},v=>states.push(v)),clone=structuredClone(c.input),warm=compileGameContext(clone,{memoryTransport:'columns',searchIndex:index},v=>states.push(v)),selected=memory(out.text),ids=[],issues=[];
  for(const h of selected){const at=c.input.story.facts.findIndex(f=>f.kind===h.kind&&f.text===h.text&&isDeepStrictEqual(f.task,h.task)&&isDeepStrictEqual(f.claim,h.claim)&&(h.sourceQuote??h.text)===f.quote);
   if(at<0){issues.push('altered-fact');continue;}ids.push(c.ids[at]);
   if(!isDeepStrictEqual(h.sourceRoles,c.input.story.roleSeeds[at].binding.roles))issues.push('altered-role');
   if(!isDeepStrictEqual(h.episodeSource,{revisionId:c.sources[at],episode:Math.floor(at/12)+1,period:at===c.sources.length-1?'latest-turn':'earlier-turn'}))issues.push('altered-source');
  }
  if(ids.includes('old-location'))issues.push('superseded-location');
  if(digest(c.input)!==inputDigest||digest(clone)!==inputDigest)issues.push('input-mutated');
  if(!isDeepStrictEqual(out,warm)||!isDeepStrictEqual(states[0],states[1]))issues.push('warm-drift');
  if(out.report.total>out.report.limit)issues.push('budget-overflow');
  if(base.guard&&!out.text.includes('Personal reference in the current request is NOT resolved by DeepRole.'))issues.push('reference-guard');
  const missing=c.gold.wanted.filter(id=>!ids.includes(id)),lostPrior=before.selectedIds.filter(id=>!ids.includes(id)),controlDrift=!c.gold.wanted.length&&digest(out)!==before.outputDigest;
  results.push({id:c.id,family:c.family,gold:c.gold.wanted,selectedIds:ids,missing,baselineComplete:before.complete,complete:c.gold.wanted.length?!missing.length:null,lostPrior,controlDrift,issues:[...new Set(issues)],coverage:states[0],report:out.report,outputDigest:digest(out)});index.clear();
 }
 const scored=results.filter(r=>r.complete!==null),report={version:1,scope:'SEEN regression after RP280 audit. Not a new independent/holdout quality result or live model test.',historicalBaselineDigest:digest(frozen),firstReportDigest:digest(prior),changedRuntime:changed,currentDigests:Object.fromEntries(await Promise.all(changed.map(async p=>[p,digest((await readFile(file(p),'utf8')).replaceAll('\r\n','\n'))]))),summary:{cases:results.length,scored:scored.length,baselineComplete:scored.filter(r=>r.baselineComplete).length,complete:scored.filter(r=>r.complete).length,missingFacts:scored.reduce((n,r)=>n+r.missing.length,0),integrityIssues:results.filter(r=>r.issues.length).length,controlsDrift:results.filter(r=>r.controlDrift).length,lostPriorFacts:results.reduce((n,r)=>n+r.lostPrior.length,0)},results};
 await writeFile(file('docs/benchmarks/'+args.report),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report.summary));
}finally{await server.close();}
