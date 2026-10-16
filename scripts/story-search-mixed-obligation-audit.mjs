import {createServer} from 'vite';
import {readFile,writeFile,readdir,access} from 'node:fs/promises';
import {parseArgs,isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {platform,arch,cpus} from 'node:os';
import {digest} from './story-search-evaluation.mjs';

const {values:args}=parseArgs({options:{freeze:{type:'boolean'},evaluate:{type:'boolean'}}});
if(Number(!!args.freeze)+Number(!!args.evaluate)!==1)throw Error('Choose exactly one of --freeze or --evaluate');
const root=new URL('../',import.meta.url),file=p=>new URL(p,root);
const baseline='tests/fixtures/story-mixed-obligation-audit-v2-baseline.json',reportPath='docs/benchmarks/rp289-mixed-obligation-results.json',sealPath='docs/benchmarks/rp289-first-report-seal.json';
const rawHash=async p=>createHash('sha256').update((await readFile(file(p),'utf8')).replaceAll('\r\n','\n')).digest('hex');
async function tree(dir){const paths=[];for(const e of await readdir(file(dir),{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())paths.push(...await tree(p));else if(/\.(?:ts|tsx)$/u.test(e.name))paths.push(p);}return paths.sort();}
async function fingerprints(){const paths=[...await tree('src'),'tests/fixtures/story-mixed-obligation-audit.ts','scripts/story-search-mixed-obligation-audit.mjs','scripts/story-search-evaluation.mjs','docs/MIXED-OBLIGATION-EVALUATION.md'];return Object.fromEntries(await Promise.all(paths.map(async p=>[p,digest((await readFile(file(p),'utf8')).replaceAll('\r\n','\n'))])));}
const server=await createServer({configFile:false,cacheDir:'.wxt/rp289-mixed-audit',optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
try{
 const {mixedAuditScenarios}=await server.ssrLoadModule('/tests/fixtures/story-mixed-obligation-audit.ts');
 const {validStoryFact}=await server.ssrLoadModule('/src/core/story-update.ts');
 const {validFactRoleSeeds}=await server.ssrLoadModule('/src/core/story-role-binding.ts');
 const {validEpisodeSources}=await server.ssrLoadModule('/src/core/story-episodes.ts');
 const scenarios=mixedAuditScenarios(),excluded=['aOld','c0','d0'];
 const rows=scenarios.map(c=>{
  const facts=c.input.story.facts;
  if(!facts.every(validStoryFact)||!validFactRoleSeeds(c.input.story.roleSeeds,facts)||!validEpisodeSources(c.sources)||new Set(c.ids).size!==facts.length||c.ids.length!==c.sources.length||facts.length!==c.noiseCount+16)throw Error('Invalid preflight source schema/alignment: '+c.id);
  if(c.gold.wanted.some(id=>!c.ids.includes(id)||excluded.includes(id))||new Set(c.gold.wanted).size!==c.gold.wanted.length)throw Error('Invalid preflight gold: '+c.id);
  return {id:c.id,family:c.family,locale:c.locale,plot:c.plotId,noiseScenes:c.noiseCount,inputDigest:digest(c.input),...c.gold,gold:c.gold.wanted.map(id=>{const i=c.ids.indexOf(id);return {id,fact:facts[i],source:c.sources[i],roles:c.input.story.roleSeeds[i].binding.roles};})};
 });
 if(rows.length!==96||new Set(rows.map(r=>r.id)).size!==96||rows.filter(r=>r.score).length!==54||rows.filter(r=>r.control).length!==36||rows.filter(r=>r.budget).length!==6||rows.filter(r=>r.uncertainty).length!==42)throw Error('Invalid case/partition counts');
 const initial=JSON.parse(await readFile(file('tests/fixtures/story-mixed-obligation-audit-baseline.json'),'utf8'));
 const inputDigest=digest(rows.map(({gold,...r})=>r)),goldDigest=digest(rows.map(r=>[r.id,r.gold,r.uncertainty]));
 if(initial.inputDigest!==inputDigest||initial.goldDigest!==goldDigest||!isDeepStrictEqual(initial.rows,rows))throw Error('Initial preflight inputs/gold changed');
 const manifest={version:2,priorPreflightDigest:digest(initial),amendment:'Before first compiler: register this runner rather than the old reused harness path; input/gold/runtime unchanged',runtime:'RP288 unchanged; freeze and schema validation before first compiler execution',scope:'Fresh agent-authored synthetic mixed-obligation accepted-memory audit; not blind external or live model evaluation',fingerprints:await fingerprints(),inputDigest,goldDigest,rows};
 if(args.freeze){
  await writeFile(file(baseline),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({frozenBeforeCompilerExecution:true,schemaValid:true,cases:rows.length,scored:54,controls:36,budget:6,inputDigest:manifest.inputDigest,goldDigest:manifest.goldDigest,fingerprints:Object.keys(manifest.fingerprints).length}));
 }else{
  const frozen=JSON.parse(await readFile(file(baseline),'utf8'));
  if(!isDeepStrictEqual(frozen,manifest))throw Error('Frozen runtime/fixture/protocol/input/gold changed; never rewrite this baseline');
  for(const path of [reportPath,sealPath]){try{await access(file(path));throw Error('First result already exists: '+path);}catch(e){if(e.code!=='ENOENT')throw e;}}
  // Imported only after frozen preflight equality in a separate invocation.
  const {compileGameContext,addedContextTokens}=await server.ssrLoadModule('/src/core/game-context.ts');
  const {GameSearchIndex}=await server.ssrLoadModule('/src/core/game-search-index.ts');
  const {decodeStoryMemory}=await server.ssrLoadModule('/src/core/story-memory-transport.ts');
  const memory=text=>{const block=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return block?decodeStoryMemory(JSON.parse(block.split('\n')[1])):[];};
  const results=[];
  for(const c of scenarios){
   const before=digest(c.input),observations=[],index=new GameSearchIndex();
   let start=performance.now();const cold=compileGameContext(c.input,{memoryTransport:'columns',searchIndex:index},v=>observations.push(v));const coldMs=performance.now()-start;
   const clone=structuredClone(c.input);start=performance.now();const warm=compileGameContext(clone,{memoryTransport:'columns',searchIndex:index},v=>observations.push(v));const warmMs=performance.now()-start;
   const hints=memory(cold.text),facts=c.input.story.facts,byText=new Map(facts.map((f,i)=>[f.text,{f,i}])),issues=[],selectedIds=[];
   for(const h of hints){
    const found=byText.get(h.text);
    if(!found||found.f.kind!==h.kind||found.f.quote!==(h.sourceQuote??h.text)||!isDeepStrictEqual(found.f.task,h.task)||!isDeepStrictEqual(found.f.claim,h.claim)){issues.push('unmatched-or-altered-fact');continue;}
    const {f,i}=found,id=c.ids[i];selectedIds.push(id);
    if(!isDeepStrictEqual(h.sourceRoles,c.input.story.roleSeeds[i].binding.roles))issues.push('altered-or-missing-role:'+id);
    if(!isDeepStrictEqual(h.episodeSource,{revisionId:c.sources[i],episode:Math.floor(i/12)+1,period:i===facts.length-1?'latest-turn':'earlier-turn'}))issues.push('altered-or-missing-source:'+id);
    if(f.claim?.lifetime==='persistent'&&h.timeStatus!=='persistent')issues.push('altered-persistent-status:'+id);
   }
   if(new Set(selectedIds).size!==selectedIds.length)issues.push('duplicate-source');
   for(const id of excluded)if(selectedIds.includes(id))issues.push('superseded-record-selected:'+id);
   if(cold.report.selected.facts!==hints.length)issues.push('selected-count-mismatch');
   if(cold.report.total!==addedContextTokens(cold.text))issues.push('whole-meter-mismatch');
   if(cold.report.total>cold.report.limit&&cold.report.required<=cold.report.limit)issues.push('optional-budget-overflow');
   if(digest(c.input)!==before||digest(clone)!==before)issues.push('input-mutated');
   if(!isDeepStrictEqual(cold,warm)||!isDeepStrictEqual(observations[0],observations[1]))issues.push('warm-output-drift');
   const missing=c.gold.wanted.filter(id=>!selectedIds.includes(id)),coverage=observations[0],guard=cold.text.includes('<deeprole_reference_guard>');
   const confidenceIssues=[];
   if(c.gold.uncertainty&&coverage?.kind!=='unverified')confidenceIssues.push('uncertainty-not-signalled');
   if(c.gold.uncertainty&&!guard)confidenceIssues.push('unresolved-guard-missing');
   if(c.gold.score&&missing.length&&coverage?.kind==='complete')confidenceIssues.push('false-complete-relative-to-gold');
   const row={id:c.id,family:c.family,locale:c.locale,plot:c.plotId,noiseScenes:c.noiseCount,acceptedFacts:facts.length,score:c.gold.score,control:c.gold.control,budget:c.gold.budget,uncertaintyExpected:c.gold.uncertainty,gold:c.gold.wanted,selectedIds,missing,complete:c.gold.score?missing.length===0:null,issues:[...new Set(issues)],confidenceIssues,coverage,guard,report:cold.report,wireCharacters:cold.text.length,outputDigest:digest(cold),coldMs,warmMs};
   results.push(row);index.clear();console.log(JSON.stringify({progress:results.length,cases:96,id:row.id,complete:row.complete,missing:row.missing,issues:row.issues,confidenceIssues,coldMs:Math.round(coldMs)}));
  }
  const group=rs=>{const scored=rs.filter(r=>r.score);return {cases:rs.length,scored:scored.length,complete:scored.filter(r=>r.complete).length,goldFacts:scored.reduce((n,r)=>n+r.gold.length,0),missingFacts:scored.reduce((n,r)=>n+r.missing.length,0),casesWithIntegrityIssues:rs.filter(r=>r.issues.length).length,uncertaintyExpected:rs.filter(r=>r.uncertaintyExpected).length,confidenceGapCases:rs.filter(r=>r.confidenceIssues.length).length,falseCompleteCases:rs.filter(r=>r.confidenceIssues.includes('false-complete-relative-to-gold')).length};};
  const groups=[...new Set(results.map(r=>r.family))].flatMap(family=>['ru','en'].map(locale=>({family,locale,...group(results.filter(r=>r.family===family&&r.locale===locale))})));
  const report={version:1,scope:manifest.scope,baselineDigest:digest(frozen),inputDigest:manifest.inputDigest,goldDigest:manifest.goldDigest,fingerprints:manifest.fingerprints,environment:{node:process.version,platform:platform(),arch:arch(),cpu:cpus()[0]?.model},summary:group(results),groups,results};
  await writeFile(file(reportPath),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  await writeFile(file(sealPath),JSON.stringify({version:1,baseline,report:reportPath,baselineHash:await rawHash(baseline),reportHash:await rawHash(reportPath),inputDigest:manifest.inputDigest,goldDigest:manifest.goldDigest},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({report:reportPath,...report.summary,groups}));
 }
}finally{await server.close();}
