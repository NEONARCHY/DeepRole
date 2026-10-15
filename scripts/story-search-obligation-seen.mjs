import {createServer} from 'vite';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseArgs,isDeepStrictEqual} from 'node:util';
import {digest} from './story-search-evaluation.mjs';
const {values:args}=parseArgs({options:{report:{type:'string',default:'rp286d-obligation-seen-results.json'}}});
if(!/^rp286[-a-z0-9]*\.json$/u.test(args.report))throw Error('Use an RP286 report filename');
const root=new URL('../',import.meta.url),file=p=>new URL(p,root),read=async p=>JSON.parse(await readFile(file(p),'utf8'));
const text=async p=>(await readFile(file(p),'utf8')).replaceAll('\r\n','\n'),sha=async p=>createHash('sha256').update(await text(p)).digest('hex');
const seal=await read('docs/benchmarks/rp283-first-report-seal.json'),frozen=await read(seal.baseline),first=await read(seal.report),prior=await read('docs/benchmarks/rp285b-forms-seen-results.json');
if(await sha(seal.baseline)!==seal.baselineHash||await sha(seal.report)!==seal.reportHash||digest(frozen)!==first.baselineDigest||prior.firstReportDigest!==digest(first)||prior.firstReportSealDigest!==digest(seal))throw Error('Historical first result/baseline/seal changed');
const permitted=['src/core/game-context.ts','src/core/story-sequence-priority.ts','src/core/story-action-balance.ts','src/core/story-compound-action.ts','src/core/game-memory-coverage-i18n.ts'],added=['src/core/story-narrative-action.ts','src/core/story-object-forms.ts','src/core/story-obligation-recall.ts'],changed=[];
for(const [p,hash] of Object.entries(frozen.fingerprints))if(digest(await text(p))!==hash){if(!permitted.includes(p))throw Error('Unexpected change: '+p);changed.push(p);}
if(!isDeepStrictEqual([...changed].sort(),[...permitted].sort()))throw Error('Expected precisely the paragraph, object-form and obligation integration edits');
async function tree(dir){const out=[];for(const e of await readdir(file(dir),{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())out.push(...await tree(p));else if(/\.(?:ts|tsx)$/u.test(e.name))out.push(p);}return out.sort();}
const paths=await tree('src'),oldPaths=Object.keys(frozen.fingerprints).filter(p=>p.startsWith('src/'));
if(!isDeepStrictEqual(paths,[...oldPaths,...added].sort()))throw Error('Unexpected runtime addition/deletion');
const server=await createServer({configFile:false,cacheDir:'.wxt/rp286-obligation-seen',optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
try{
 const {independentScenarios}=await server.ssrLoadModule('/tests/fixtures/story-independent-sequences.ts'),{compileGameContext,addedContextTokens}=await server.ssrLoadModule('/src/core/game-context.ts'),{decodeStoryMemory}=await server.ssrLoadModule('/src/core/story-memory-transport.ts'),{GameSearchIndex}=await server.ssrLoadModule('/src/core/game-search-index.ts');
 const memory=text=>{const b=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return b?decodeStoryMemory(JSON.parse(b.split('\n')[1])):[];};
 const results=[];
 for(const c of independentScenarios()){
  const base=frozen.rows.find(r=>r.id===c.id),before=prior.results.find(r=>r.id===c.id),inputDigest=digest(c.input);
  if(!base||!before||base.inputDigest!==inputDigest||!isDeepStrictEqual(c.gold.wanted,base.gold.map(g=>g.id))||c.gold.score!==base.score)throw Error('Frozen input/gold changed: '+c.id);
  const index=new GameSearchIndex(),states=[],out=compileGameContext(c.input,{memoryTransport:'columns',searchIndex:index},v=>states.push(v)),clone=structuredClone(c.input),warm=compileGameContext(clone,{memoryTransport:'columns',searchIndex:index},v=>states.push(v)),hints=memory(out.text),ids=[],issues=[];
  for(const h of hints){const at=c.input.story.facts.findIndex(f=>f.text===h.text&&f.kind===h.kind&&f.quote===(h.sourceQuote??h.text)&&isDeepStrictEqual(f.task,h.task)&&isDeepStrictEqual(f.claim,h.claim));
   if(at<0){issues.push('altered-fact');continue;}ids.push(c.ids[at]);
   if(!isDeepStrictEqual(h.sourceRoles,c.input.story.roleSeeds[at].binding.roles))issues.push('altered-role');
   if(!isDeepStrictEqual(h.episodeSource,{revisionId:c.sources[at],episode:Math.floor(at/12)+1,period:at===c.sources.length-1?'latest-turn':'earlier-turn'}))issues.push('altered-source');
   if(c.input.story.facts[at].claim?.lifetime==='persistent'&&h.timeStatus!=='persistent')issues.push('altered-persistent-status');
  }
  if(new Set(ids).size!==ids.length)issues.push('duplicate-source');
  if(ids.includes('a-old')||ids.includes('b-old'))issues.push('superseded-record');
  if(digest(c.input)!==inputDigest||digest(clone)!==inputDigest)issues.push('input-mutated');
  if(!isDeepStrictEqual(out,warm)||!isDeepStrictEqual(states[0],states[1]))issues.push('warm-drift');
  if(out.report.total!==addedContextTokens(out.text)||out.report.selected.facts!==hints.length)issues.push('whole-meter-mismatch');
  if(out.report.total>out.report.limit&&out.report.required<=out.report.limit)issues.push('budget-overflow');
  const missing=c.gold.wanted.filter(id=>!ids.includes(id)),lostPrior=before.selectedIds.filter(id=>!ids.includes(id)),controlDrift=!c.gold.score&&digest(out)!==before.outputDigest;
  results.push({id:c.id,family:c.family,locale:c.locale,score:c.gold.score,gold:c.gold.wanted,selectedIds:ids,missing,baselineComplete:before.complete,complete:c.gold.score?!missing.length:null,lostPrior,controlDrift,rejectionControlDrift:controlDrift&&c.family!=='budget',issues:[...new Set(issues)],coverage:states[0],report:out.report,outputDigest:digest(out),outputChanged:digest(out)!==before.outputDigest});index.clear();
 }
 const scored=results.filter(r=>r.score),narrative=results.filter(r=>r.family==='narrative-sequence');
 // Keep the original all-unscored controlDrift metric: budget probes were also
 // unscored. Report their allowed, fully metered additions separately rather
 // than silently relabelling a score/gold or calling all four changes controls.
 const report={version:1,scope:'SEEN RP283 regression after source-backed return-obligation inquiries and prose-title references. Not a new independent evaluation or live model test.',historicalBaselineDigest:digest(frozen),firstReportDigest:digest(first),firstReportSealDigest:digest(seal),previousSeenReportDigest:digest(prior),changedRuntime:changed,addedRuntime:added,currentDigests:Object.fromEntries(await Promise.all([...changed,...added].map(async p=>[p,digest(await text(p))]))),summary:{cases:results.length,scored:scored.length,baselineComplete:prior.summary.complete,complete:scored.filter(r=>r.complete).length,goldFacts:prior.summary.goldFacts,baselineMissingFacts:prior.summary.missingFacts,missingFacts:scored.reduce((n,r)=>n+r.missing.length,0),integrityIssues:results.filter(r=>r.issues.length).length,controlsDrift:results.filter(r=>r.controlDrift).length,rejectionControlsDrift:results.filter(r=>r.rejectionControlDrift).length,budgetOutputChanges:results.filter(r=>r.family==='budget'&&r.outputChanged).length,lostPriorFacts:results.reduce((n,r)=>n+r.lostPrior.length,0),changedOutputs:results.filter(r=>r.outputChanged).length,narrativeComplete:narrative.filter(r=>r.complete).length,narrativeCases:narrative.length,narrativeReportedComplete:narrative.filter(r=>r.coverage.kind==='complete').length},results};
 await writeFile(file('docs/benchmarks/'+args.report),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report.summary));
}finally{await server.close();}
