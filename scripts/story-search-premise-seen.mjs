import {createServer} from 'vite';
import {readFile,writeFile,readdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual,parseArgs} from 'node:util';
import {digest} from './story-search-evaluation.mjs';
const {values:args}=parseArgs({options:{suffix:{type:'string',default:''}}});
if(!/^[a-z]?$/u.test(args.suffix))throw Error('Optional single-letter attempt suffix only; existing reports never overwritten');
const root=new URL('../',import.meta.url),file=p=>new URL(p,root),read=async p=>JSON.parse(await readFile(file(p),'utf8'));
const text=async p=>(await readFile(file(p),'utf8')).replaceAll('\r\n','\n'),sha=async p=>createHash('sha256').update(await text(p)).digest('hex');
const runtimeBase=await read('tests/fixtures/story-mixed-obligation-audit-v2-baseline.json');
const snapshots={'src/core/story-obligation-recall.ts':'docs/benchmarks/rp289-final-obligation.txt','src/core/game-context.ts':'docs/benchmarks/rp289-final-game-context.txt'},changed=[];
for(const [p,h] of Object.entries(runtimeBase.fingerprints)){
 if(snapshots[p]&&digest(await text(snapshots[p]))!==h)throw Error('RP289 original runtime snapshot changed: '+p);
 if(digest(await text(p))!==h){if(!snapshots[p])throw Error('Unexpected frozen change: '+p);changed.push(p);}
}
if(!isDeepStrictEqual(changed.sort(),Object.keys(snapshots).sort()))throw Error('Expected exactly two runtime edits');
async function tree(dir){const out=[];for(const e of await readdir(file(dir),{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())out.push(...await tree(p));else if(/\.(?:ts|tsx)$/u.test(e.name))out.push(p);}return out.sort();}
if(!isDeepStrictEqual(await tree('src'),Object.keys(runtimeBase.fingerprints).filter(p=>p.startsWith('src/')).sort()))throw Error('Runtime addition/deletion');
const currentDigests=Object.fromEntries(await Promise.all(changed.map(async p=>[p,digest(await text(p))])));
const priorRuntime=await read('docs/benchmarks/rp290b-rp289-mixed-seen-results.json');
for(const [p,h]of Object.entries(priorRuntime.currentDigests)){
 const snapshot=p==='src/core/game-context.ts'?'docs/benchmarks/rp290-final-game-context.txt':'docs/benchmarks/rp290-final-obligation.txt';
 if(digest(await text(snapshot))!==h)throw Error('Final RP290 snapshot changed: '+p);
}
const datasets=[
 {name:'rp289',fixture:'/tests/fixtures/story-mixed-obligation-audit.ts',factory:'mixedAuditScenarios',seal:'docs/benchmarks/rp289-first-report-seal.json',prior:'docs/benchmarks/rp290b-rp289-mixed-seen-results.json'},
 {name:'rp287',fixture:'/tests/fixtures/story-obligation-holdout.ts',factory:'obligationHoldoutScenarios',seal:'docs/benchmarks/rp287-first-report-seal.json',prior:'docs/benchmarks/rp290b-rp287-mixed-seen-results.json'},
 {name:'rp283',fixture:'/tests/fixtures/story-independent-sequences.ts',factory:'independentScenarios',seal:'docs/benchmarks/rp283-first-report-seal.json',prior:'docs/benchmarks/rp290b-rp283-mixed-seen-results.json'},
];
// Check all destinations before compiler import, so an accidental rerun cannot
// execute part of an evaluation then overwrite/skip its original result.
for(const d of datasets){d.path=`docs/benchmarks/rp291${args.suffix}-${d.name}-premise-seen-results.json`;try{await access(file(d.path));throw Error('Result already exists: '+d.path);}catch(e){if(e.code!=='ENOENT')throw e;}}
const server=await createServer({configFile:false,cacheDir:'.wxt/rp291-premise-seen',optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
try{
 const {compileGameContext,addedContextTokens}=await server.ssrLoadModule('/src/core/game-context.ts'),{GameSearchIndex}=await server.ssrLoadModule('/src/core/game-search-index.ts'),{decodeStoryMemory}=await server.ssrLoadModule('/src/core/story-memory-transport.ts');
 const memory=text=>{const b=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return b?decodeStoryMemory(JSON.parse(b.split('\n')[1])):[];};
 for(const dataset of datasets){
  const seal=await read(dataset.seal),base=await read(seal.baseline),first=await read(seal.report),prior=await read(dataset.prior);
  if(await sha(seal.baseline)!==seal.baselineHash||await sha(seal.report)!==seal.reportHash||digest(base)!==first.baselineDigest)throw Error('Historical baseline/report/seal changed');
  const factory=(await server.ssrLoadModule(dataset.fixture))[dataset.factory],results=[];
  for(const c of factory()){
   const row=base.rows.find(r=>r.id===c.id),before=prior.results.find(r=>r.id===c.id),inputDigest=digest(c.input);
   if(!row||!before||row.inputDigest!==inputDigest||!isDeepStrictEqual(row.gold.map(g=>g.id),c.gold.wanted)||row.score!==c.gold.score)throw Error('Frozen input/gold changed: '+c.id);
   const index=new GameSearchIndex(),coverage=[];
   const out=compileGameContext(c.input,{memoryTransport:'columns',searchIndex:index},v=>coverage.push(v)),clone=structuredClone(c.input),warm=compileGameContext(clone,{memoryTransport:'columns',searchIndex:index},v=>coverage.push(v));
   const hints=memory(out.text),facts=c.input.story.facts,byText=new Map(facts.map((f,i)=>[f.text,{f,i}])),ids=[],issues=[];
   for(const h of hints){const found=byText.get(h.text);
    if(!found||h.kind!==found.f.kind||(h.sourceQuote??h.text)!==found.f.quote||!isDeepStrictEqual(found.f.task,h.task)||!isDeepStrictEqual(found.f.claim,h.claim)){issues.push('altered-or-fabricated-fact');continue;}
    const {f,i}=found,id=c.ids[i];ids.push(id);
    if(!isDeepStrictEqual(h.sourceRoles,c.input.story.roleSeeds[i].binding.roles))issues.push('altered-or-missing-role:'+id);
    if(!isDeepStrictEqual(h.episodeSource,{revisionId:c.sources[i],episode:Math.floor(i/12)+1,period:i===facts.length-1?'latest-turn':'earlier-turn'}))issues.push('altered-or-missing-source:'+id);
    if(f.claim?.lifetime==='persistent'&&h.timeStatus!=='persistent')issues.push('altered-persistent-status:'+id);
   }
   if(new Set(ids).size!==ids.length)issues.push('duplicate-source');
   for(const id of dataset.name==='rp283'?['a-old','b-old']:['aOld','c0','d0'])if(ids.includes(id))issues.push('superseded-record:'+id);
   if(digest(c.input)!==inputDigest||digest(clone)!==inputDigest)issues.push('input-mutated');
   if(!isDeepStrictEqual(out,warm)||!isDeepStrictEqual(coverage[0],coverage[1]))issues.push('warm-drift');
   if(out.report.total!==addedContextTokens(out.text)||out.report.selected.facts!==hints.length)issues.push('whole-meter-mismatch');
   if(out.report.total>out.report.limit&&out.report.required<=out.report.limit)issues.push('optional-budget-overflow');
   const missing=c.gold.wanted.filter(id=>!ids.includes(id)),guard=out.text.includes('<deeprole_reference_guard>'),uncertaintyExpected=dataset.name==='rp283'?c.family==='reference':c.gold.uncertainty,confidenceIssues=[];
   if(uncertaintyExpected&&coverage[0].kind!=='unverified')confidenceIssues.push('uncertainty-not-signalled');
   if(uncertaintyExpected&&!guard)confidenceIssues.push('unresolved-guard-missing');
   if(c.gold.score&&missing.length&&coverage[0].kind==='complete')confidenceIssues.push('false-complete-relative-to-gold');
   results.push({id:c.id,family:c.family,locale:c.locale,score:c.gold.score,gold:c.gold.wanted,selectedIds:ids,missing,baselineComplete:before.complete,complete:c.gold.score?!missing.length:null,lostPrior:before.selectedIds.filter(id=>!ids.includes(id)),issues:[...new Set(issues)],uncertaintyExpected,confidenceIssues,coverage:coverage[0],guard,report:out.report,outputDigest:digest(out),outputChanged:digest(out)!==before.outputDigest,coverageChanged:!isDeepStrictEqual(coverage[0],before.coverage)});index.clear();
  }
  const scored=results.filter(r=>r.score),summary={cases:results.length,scored:scored.length,baselineComplete:prior.summary.complete,complete:scored.filter(r=>r.complete).length,goldFacts:scored.reduce((n,r)=>n+r.gold.length,0),missingFacts:scored.reduce((n,r)=>n+r.missing.length,0),casesWithIntegrityIssues:results.filter(r=>r.issues.length).length,uncertaintyExpected:results.filter(r=>r.uncertaintyExpected).length,confidenceGapCases:results.filter(r=>r.confidenceIssues.length).length,falseCompleteCases:results.filter(r=>r.confidenceIssues.includes('false-complete-relative-to-gold')).length,lostPriorFacts:results.reduce((n,r)=>n+r.lostPrior.length,0),changedOutputs:results.filter(r=>r.outputChanged).length,changedCoverage:results.filter(r=>r.coverageChanged).length,rejectionControlsDrift:results.filter(r=>dataset.name==='rp283'&&['quoted-actions','conditional-actions','negated-actions','four-actions'].includes(r.family)&&r.outputChanged).length,budgetOutputChanges:results.filter(r=>r.family==='budget'&&r.outputChanged).length};
  for(const p of changed)if(digest(await text(p))!==currentDigests[p])throw Error('Runtime changed during evaluation; preserve any preliminary report, use a new attempt suffix');
  const report={version:1,scope:`SEEN ${dataset.name} regression after RP291 obligation premise warnings; not independent or live-model proof`,historicalBaselineDigest:digest(base),firstReportDigest:digest(first),firstReportSealDigest:digest(seal),previousSeenReportDigest:digest(prior),runtimeBaseDigest:digest(runtimeBase),changedRuntime:changed,currentDigests,runnerDigest:digest(await text('scripts/story-search-premise-seen.mjs')),summary,results};
  await writeFile(file(dataset.path),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({report:dataset.path,...summary}));
 }
}finally{await server.close();}
