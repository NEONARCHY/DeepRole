import {createServer} from 'vite';
import {readFile,writeFile} from 'node:fs/promises';
import {digest} from './story-search-evaluation.mjs';
import {parseArgs} from 'node:util';
import {isDeepStrictEqual} from 'node:util';
const {values:args}=parseArgs({options:{report:{type:'string',default:'rp279b-wire-results.json'}}});
if(!/^rp279[-a-z0-9]*\.json$/u.test(args.report))throw Error('Use an RP279 report filename');
// Mechanical wire-size comparison on SEEN fixtures, not independent quality QA.
const server=await createServer({configFile:false,cacheDir:'.wxt/rp279-wire',optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
try{
 const {budgetScenarios}=await server.ssrLoadModule('/tests/fixtures/story-budget-priority.ts'),{contextualScenarios}=await server.ssrLoadModule('/tests/fixtures/story-contextual-reference.ts');
 const {compileGameContext}=await server.ssrLoadModule('/src/core/game-context.ts'),{decodeStoryMemory}=await server.ssrLoadModule('/src/core/story-memory-transport.ts');
 const memory=text=>{const block=text.split('<deeprole_story_memory>')[1]?.split('</deeprole_story_memory>')[0];return block?decodeStoryMemory(JSON.parse(block.split('\n')[1])):[];};
 const rows=[...budgetScenarios(),...contextualScenarios()].map(c=>{const input=structuredClone(c.input);input.settings.contextBudget=20000;const before=compileGameContext(input),after=compileGameContext(input,{memoryTransport:'columns'});return {id:c.id,inputDigest:digest(input),sameSelectedData:isDeepStrictEqual(memory(before.text),memory(after.text)),columns:after.text.includes('Self-contained table:'),characters:[before.text.length,after.text.length],estimatedTokens:[before.report.total,after.report.total],selected:after.report.selected.facts};});
 const invalid=rows.filter(r=>!r.sameSelectedData||r.characters[1]>r.characters[0]||r.estimatedTokens[1]>r.estimatedTokens[0]);
 if(invalid.length)throw Error('Exact data or monotonic whole-wire comparison failed: '+JSON.stringify(invalid.slice(0,8)));
 const totals=rows.reduce((a,r)=>({characters:a.characters.map((n,i)=>n+r.characters[i]),estimatedTokens:a.estimatedTokens.map((n,i)=>n+r.estimatedTokens[i])}),{characters:[0,0],estimatedTokens:[0,0]});
 const report={version:1,scope:'128 seen synthetic scenarios; 20000-token comparison budget, same complete selected data; no provider/model window assertion',compilerDigest:digest(await readFile(new URL('../src/core/game-context.ts',import.meta.url),'utf8')),transportDigest:digest(await readFile(new URL('../src/core/story-memory-transport.ts',import.meta.url),'utf8')),totals,rows};
 await writeFile(new URL('../docs/benchmarks/'+args.report,import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({cases:rows.length,sameSelectedData:rows.filter(r=>r.sameSelectedData).length,columnRequests:rows.filter(r=>r.columns).length,...totals}));
}finally{await server.close();}
