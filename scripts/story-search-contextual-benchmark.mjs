import { createServer } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { digest } from './story-search-evaluation.mjs';
const {values:args}=parseArgs({options:{'freeze-baseline':{type:'boolean'},evaluate:{type:'boolean'},report:{type:'string',default:'rp277-final-contextual-results.json'}}});
if(!/^rp277[-a-z0-9]*\.json$/u.test(args.report))throw Error('Use an RP277 report filename');
const server=await createServer({configFile:false,cacheDir:'.wxt/rp277-benchmark',optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
try {
 const f=await server.ssrLoadModule('/tests/fixtures/story-contextual-reference.ts'), {compileGameContext}=await server.ssrLoadModule('/src/core/game-context.ts');
 const scenarios=f.contextualScenarios(), rows=scenarios.map(c=>({id:c.id,split:c.split,positive:c.positive,inputDigest:digest(c.input),gold:c.wanted.map(f=>f.text),baselineDigest:digest(compileGameContext(c.input,{contextualRecall:false}))}));
 const baseline={version:1,prior:'RP276',inputDigest:digest(rows.map(({gold,...r})=>r)),goldDigest:digest(rows.map(r=>[r.id,r.gold])),rows};
 const path=new URL('../tests/fixtures/story-contextual-reference-baseline.json',import.meta.url);
 if(args['freeze-baseline']){await writeFile(path,JSON.stringify(baseline,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({frozenBeforeAlgorithm:true,cases:rows.length,inputDigest:baseline.inputDigest,goldDigest:baseline.goldDigest}));}
 else {
  if(JSON.stringify(JSON.parse(await readFile(path,'utf8')))!==JSON.stringify(baseline))throw Error('Frozen RP277 input/gold/RP276 output changed');
  if(args.evaluate){
   const results=scenarios.map(c=>{const old=compileGameContext(c.input,{contextualRecall:false}),now=compileGameContext(c.input),before=f.contextualHints(old.text),after=f.contextualHints(now.text);return {id:c.id,split:c.split,positive:c.positive,baselineComplete:c.positive&&c.wanted.every(f=>before.some(h=>h.text===f.text)),complete:c.positive&&c.wanted.every(f=>after.some(h=>h.text===f.text)),controlDrift:!c.positive&&digest(old)!==digest(now),sourceLoss:before.filter(h=>!after.some(n=>n.text===h.text)).length,outputDigest:digest(now)};});
   const report={baselineDigest:digest(baseline),fixtureDigest:digest(await readFile(new URL('../tests/fixtures/story-contextual-reference.ts',import.meta.url),'utf8')),algorithmDigest:digest(await readFile(new URL('../src/core/story-contextual-reference.ts',import.meta.url),'utf8')),compilerDigest:digest(await readFile(new URL('../src/core/game-context.ts',import.meta.url),'utf8')),results};
   await writeFile(new URL('../docs/benchmarks/'+args.report,import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
   console.log(JSON.stringify({groups:['development','evaluation'].map(split=>{const r=results.filter(x=>x.positive&&x.split===split);return {split,count:r.length,baselineComplete:r.filter(x=>x.baselineComplete).length,complete:r.filter(x=>x.complete).length}}),controls:results.filter(x=>!x.positive).length,drift:results.filter(x=>x.controlDrift).length,sourceLoss:results.reduce((n,r)=>n+r.sourceLoss,0)}));
  }else console.log(JSON.stringify({baselineUnchanged:true,cases:rows.length}));
 }
}finally{await server.close();}
