import {createServer} from 'vite';
import {readFile,writeFile,readdir,access} from 'node:fs/promises';
import {parseArgs,isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {digest} from './story-search-evaluation.mjs';
const {values:args}=parseArgs({options:{freeze:{type:'boolean'},evaluate:{type:'boolean'}}});
if(Number(!!args.freeze)+Number(!!args.evaluate)!==1)throw Error('Choose freeze OR evaluate');
const root=new URL('../',import.meta.url),file=p=>new URL(p,root),text=async p=>(await readFile(file(p),'utf8')).replaceAll('\r\n','\n');
const sha=async p=>createHash('sha256').update(await text(p)).digest('hex');
const baseline='tests/fixtures/story-conditional-audit-baseline.json',reportPath='docs/benchmarks/rp297-conditional-results.json',sealPath='docs/benchmarks/rp297-first-report-seal.json';
async function tree(dir){const paths=[];for(const e of await readdir(file(dir),{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())paths.push(...await tree(p));else if(/\.(?:ts|tsx)$/u.test(e.name))paths.push(p);}return paths.sort();}
async function fingerprints(){return Object.fromEntries(await Promise.all([...await tree('src'),'tests/fixtures/story-conditional-audit.ts','scripts/story-search-conditional-audit.mjs','scripts/story-search-evaluation.mjs','docs/CONDITIONAL-EVALUATION.md'].map(async p=>[p,digest(await text(p))])));}
const server=await createServer({configFile:false,cacheDir:'.wxt/rp297-conditional',optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
try{
 const {conditionalScenarios}=await server.ssrLoadModule('/tests/fixtures/story-conditional-audit.ts');
 const {validStoryFact}=await server.ssrLoadModule('/src/core/story-update.ts');
 const {validFactRoleSeeds}=await server.ssrLoadModule('/src/core/story-role-binding.ts');
 const {validEpisodeSources}=await server.ssrLoadModule('/src/core/story-episodes.ts');
 const cases=conditionalScenarios(),rows=cases.map(c=>{
  const s=c.input.story;
  if(!s.facts.every(validStoryFact)||!validFactRoleSeeds(s.roleSeeds,s.facts)||!validEpisodeSources(c.sources)||s.facts.length!==c.noiseCount+18||new Set(c.ids).size!==s.facts.length||c.ids.length!==c.sources.length)throw Error('Invalid sources '+c.id);
  if(c.gold.wanted.some(id=>!c.ids.includes(id)||['old','b0','d1'].includes(id))||new Set(c.gold.wanted).size!==c.gold.wanted.length)throw Error('Invalid gold '+c.id);
  return {id:c.id,family:c.family,locale:c.locale,plot:c.plotId,noise:c.noiseCount,inputDigest:digest(c.input),...c.gold,gold:c.gold.wanted.map(id=>{const i=c.ids.indexOf(id);return {id,fact:s.facts[i],source:c.sources[i],roles:s.roleSeeds[i].binding.roles};})};
 });
 if(rows.length!==64||new Set(rows.map(r=>r.id)).size!==64||rows.filter(r=>r.score).length!==38||rows.filter(r=>r.control).length!==20||rows.filter(r=>r.budget).length!==6||rows.filter(r=>r.uncertainty).length!==28||rows.filter(r=>r.score).reduce((n,r)=>n+r.gold.length,0)!==176)throw Error('Unexpected partitions');
 const manifest={version:1,scope:'Fresh authored synthetic conditional-commitment audit; not blind external or live model proof',runtime:'RP296 unchanged',fingerprints:await fingerprints(),inputDigest:digest(rows.map(({gold,...r})=>r)),goldDigest:digest(rows.map(r=>[r.id,r.gold,r.uncertainty])),rows};
 if(args.freeze){await writeFile(file(baseline),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({frozenBeforeCompiler:true,cases:64,scored:38,gold:176,fingerprints:Object.keys(manifest.fingerprints).length,inputDigest:manifest.inputDigest}));}
 else{
  const frozen=JSON.parse(await text(baseline));if(!isDeepStrictEqual(frozen,manifest))throw Error('Frozen state changed');
  for(const p of [reportPath,sealPath])try{await access(file(p));throw Error('First result exists '+p);}catch(e){if(e.code!=='ENOENT')throw e;}
  const {compileGameContext,addedContextTokens}=await server.ssrLoadModule('/src/core/game-context.ts');
  const {decodeStoryMemory}=await server.ssrLoadModule('/src/core/story-memory-transport.ts');
  const {GameSearchIndex}=await server.ssrLoadModule('/src/core/game-search-index.ts');
  const results=[];
  for(const c of cases){
   const before=digest(c.input),coverage=[],index=new GameSearchIndex(),start=performance.now();
   const out=compileGameContext(c.input,{memoryTransport:'columns',searchIndex:index},v=>coverage.push(v)),coldMs=performance.now()-start;
   const clone=structuredClone(c.input),warmStart=performance.now(),warm=compileGameContext(clone,{memoryTransport:'columns',searchIndex:index},v=>coverage.push(v)),warmMs=performance.now()-warmStart;
   const b=out.text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0],hints=b?decodeStoryMemory(JSON.parse(b.split('\n')[1])):[],selectedIds=[],issues=[];
   for(const h of hints){const i=c.input.story.facts.findIndex(f=>f.text===h.text),f=c.input.story.facts[i];
    if(!f||h.kind!==f.kind||(h.sourceQuote??h.text)!==f.quote||!isDeepStrictEqual(h.task,f.task)||!isDeepStrictEqual(h.claim,f.claim)){issues.push('altered-or-unknown-fact');continue;}selectedIds.push(c.ids[i]);
    if(!isDeepStrictEqual(h.sourceRoles,c.input.story.roleSeeds[i].binding.roles))issues.push('altered-role:'+c.ids[i]);
    if(!isDeepStrictEqual(h.episodeSource,{revisionId:c.sources[i],episode:Math.floor(i/12)+1,period:i===c.ids.length-1?'latest-turn':'earlier-turn'}))issues.push('altered-episode:'+c.ids[i]);
    if(f.claim?.lifetime==='persistent'&&h.timeStatus!=='persistent')issues.push('altered-lifetime:'+c.ids[i]);
    if(f.claim?.status==='ended'&&h.timeStatus!=='ended')issues.push('altered-ended-status:'+c.ids[i]);
   }
   if(new Set(selectedIds).size!==selectedIds.length)issues.push('duplicate');
   for(const id of ['old','b0','d1'])if(selectedIds.includes(id))issues.push('superseded:'+id);
   if(digest(c.input)!==before||digest(clone)!==before)issues.push('input-mutated');
   if(!isDeepStrictEqual(out,warm)||!isDeepStrictEqual(coverage[0],coverage[1]))issues.push('cache-drift');
   if(out.report.total!==addedContextTokens(out.text)||out.report.selected.facts!==hints.length)issues.push('meter-or-count');
   if(out.report.total>out.report.limit&&out.report.required<=out.report.limit)issues.push('optional-overflow');
   const missing=c.gold.wanted.filter(id=>!selectedIds.includes(id)),guard=out.text.includes('<deeprole_reference_guard>'),confidenceIssues=[];
   if(c.gold.uncertainty&&!guard)confidenceIssues.push('guard-missing');
   if(c.gold.uncertainty&&coverage[0]?.kind!=='unverified')confidenceIssues.push('uncertainty-not-signalled');
   if(c.gold.score&&missing.length&&coverage[0]?.kind==='complete')confidenceIssues.push('false-complete');
   results.push({id:c.id,family:c.family,locale:c.locale,plot:c.plotId,noise:c.noiseCount,score:c.gold.score,control:c.gold.control,budget:c.gold.budget,uncertaintyExpected:c.gold.uncertainty,gold:c.gold.wanted,selectedIds,missing,complete:c.gold.score?!missing.length:null,issues:[...new Set(issues)],confidenceIssues,coverage:coverage[0],guard,report:out.report,outputDigest:digest(out),coldMs,warmMs});index.clear();
   console.log(JSON.stringify({progress:results.length,id:c.id,missing,issues,confidenceIssues}));
  }
  if(!isDeepStrictEqual(await fingerprints(),manifest.fingerprints))throw Error('Runtime or frozen inputs changed during evaluation');
  const summarize=rs=>{const scored=rs.filter(r=>r.score);return {cases:rs.length,scored:scored.length,complete:scored.filter(r=>r.complete).length,goldFacts:scored.reduce((n,r)=>n+r.gold.length,0),missingFacts:scored.reduce((n,r)=>n+r.missing.length,0),integrityCases:rs.filter(r=>r.issues.length).length,confidenceGapCases:rs.filter(r=>r.confidenceIssues.length).length,falseCompleteCases:rs.filter(r=>r.confidenceIssues.includes('false-complete')).length};};
  const report={version:1,scope:manifest.scope,baselineDigest:digest(frozen),inputDigest:manifest.inputDigest,goldDigest:manifest.goldDigest,fingerprints:manifest.fingerprints,summary:summarize(results),groups:[...new Set(results.map(r=>r.family))].map(family=>({family,...summarize(results.filter(r=>r.family===family))})),results};
  await writeFile(file(reportPath),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  await writeFile(file(sealPath),JSON.stringify({version:1,baseline,report:reportPath,baselineHash:await sha(baseline),reportHash:await sha(reportPath),inputDigest:manifest.inputDigest,goldDigest:manifest.goldDigest},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({report:reportPath,...report.summary,groups:report.groups}));
 }
}finally{await server.close();}
