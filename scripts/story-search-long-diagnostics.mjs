import {createServer} from 'vite';
import {readFile,writeFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {digest} from './story-search-evaluation.mjs';
const {values:args}=parseArgs({options:{report:{type:'string',default:'rp280-long-diagnostics.json'}}});
if(!/^rp280[-a-z0-9]*\.json$/u.test(args.report))throw Error('Use an RP280 report filename');
const root=new URL('../',import.meta.url),file=p=>new URL(p,root);
const baseline=JSON.parse(await readFile(file('tests/fixtures/story-long-holdout-baseline.json'),'utf8'));
for(const [path,hash] of Object.entries(baseline.fingerprints))if(digest((await readFile(file(path),'utf8')).replaceAll('\r\n','\n'))!==hash)throw Error('Frozen source changed: '+path);
const first=JSON.parse(await readFile(file('docs/benchmarks/rp280-long-results.json'),'utf8'));
if(first.baselineDigest!==digest(baseline))throw Error('Wrong first report');
const server=await createServer({configFile:false,cacheDir:'.wxt/rp280-diagnostics',optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
try{
 const {longScenarios}=await server.ssrLoadModule('/tests/fixtures/story-long-holdout.ts'),{compileGameContext,addedContextTokens}=await server.ssrLoadModule('/src/core/game-context.ts'),{storyActionSequence}=await server.ssrLoadModule('/src/core/story-sequence-priority.ts'),{retrievalNames}=await server.ssrLoadModule('/src/core/story-retrieval-query.ts'),{decodeStoryMemory,safeMemoryJson}=await server.ssrLoadModule('/src/core/story-memory-transport.ts');
 const cases=longScenarios(),rows=[];
 for(const failed of first.results.filter(r=>r.complete===false)){
   const c=cases.find(c=>c.id===failed.id),wanted=c.gold.wanted.map(id=>{const i=c.ids.indexOf(id),f=c.input.story.facts[i];return {kind:f.kind,text:f.text,...(f.quote!==f.text?{sourceQuote:f.quote}:{}),...(f.task?{task:f.task}:{}),...(f.claim?{claim:f.claim}:{}),sourceRoles:c.input.story.roleSeeds[i].binding.roles,episodeSource:{revisionId:c.sources[i],episode:Math.floor(i/12)+1,period:i===c.sources.length-1?'latest-turn':'earlier-turn'}};});
   const variants=[];
   const connected=c.input.draft.replaceAll(',',c.locale==='ru'?' и':' and');
   const knownVerb=connected.replace(/отвязываю|подключаю|передвигаю/gu,'осматриваю').replace(/\b(?:examine|untie|connect|move)\b/gu,'inspect');
   for(const [label,draft] of [['original',c.input.draft],['commas-as-conjunctions',connected],['conjunctions-and-inspect',knownVerb]]){
     const input=structuredClone(c.input);input.draft=draft;const observations=[],out=compileGameContext(input,{memoryTransport:'columns'},v=>observations.push(v)),block=out.text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0],hints=block?decodeStoryMemory(JSON.parse(block.split('\n')[1])):[];
     const sequence=storyActionSequence(draft,input.entities.flatMap(retrievalNames));
     variants.push({label,draft,sequenceClauses:sequence?.matches.length??0,missing:c.gold.wanted.filter(id=>!hints.some(h=>h.text===c.input.story.facts[c.ids.indexOf(id)].text)),coverage:observations[0],selectedFacts:out.report.selected.facts,actualEstimatedTokens:out.report.total,limit:out.report.limit,duplicateAllGoldEstimatedTokens:addedContextTokens(out.text+'\n\nDiagnostic full gold duplicate, including exact sources and roles:\n'+safeMemoryJson(wanted))});
   }
   rows.push({id:c.id,variants});
 }
 const report={version:1,scope:'Post-evaluation diagnosis on now-seen failures; no runtime/input/gold or first report changes; punctuation/verb variants are NOT independent quality evidence.',diagnosticRunnerDigest:digest((await readFile(new URL(import.meta.url),'utf8')).replaceAll('\r\n','\n')),firstReportDigest:digest(first),baselineDigest:digest(baseline),rows};
 await writeFile(file('docs/benchmarks/'+args.report),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(report));
}finally{await server.close();}
