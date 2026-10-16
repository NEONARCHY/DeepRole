import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
if(process.argv.slice(2).some(a=>a!=='--strict-recall'))throw Error('Supported option: --strict-recall');
const dir=join(root,'.output','memory-tests',new Date().toISOString().replaceAll(':','-')+'-'+process.pid);
mkdirSync(dir,{recursive:true});
const groups={
 combinations:['memory-combinations','memory-isolation'],
 lifecycle:['continuation-long-game','continuation-storage','continuation-flow','story-game','story-game-snapshot','story-projection','story-backup','context-service-backup','crypto-and-injection','story-dispatch-ingestion','story-dispatch-capture','story-role-binding-storage','story-time-storage','story-episodes','story-automation','profile-supplements','character-discovery','discovery-profile-queue','world-reset','world-purge'],
};
const outcomes=[];
for(const [name,files]of Object.entries(groups)){
 console.log(`\nMemory suite: ${name}`);
 const report=join(dir,name+'-vitest.json');
 const run=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run',...files.map(f=>'tests/'+f+'.test.ts'),'--reporter=default','--reporter=json','--outputFile.json='+report],{cwd:root,stdio:'inherit',env:{...process.env,DEEPROLE_MEMORY_REPORT_DIR:dir}});
 let counts=null;try{const r=JSON.parse(readFileSync(report,'utf8'));counts={passed:r.numPassedTests,failed:r.numFailedTests,pending:r.numPendingTests,suites:r.numTotalTestSuites};}catch{}
 outcomes.push({name,exitCode:run.status,error:run.error?.message,counts});
}
let combinations=null;try{combinations=JSON.parse(readFileSync(join(dir,'combinations.json'),'utf8'));}catch{}
const integrityPassed=outcomes.every(r=>r.exitCode===0)&&!!combinations&&combinations.executedRows===combinations.matrixRows+96;
const recallComplete=!!combinations&&combinations.recall.complete===combinations.recall.scored&&combinations.recall.confidenceGaps===0;
const summary={version:1,scope:'Local synthetic memory interactions and existing storage journeys, no live model/account',directory:dir,integrityPassed,recallComplete,outcomes,pairwise:combinations?{pairs:combinations.totalPairs,rows:combinations.matrixRows,factors:combinations.factors}:null,recall:combinations?.recall??null,limits:['Not all possible texts, histories or multiway combinations','Pairwise compiler dimensions do not imply lifecycle Cartesian coverage','Existing corpora are seen, not a new blind evaluation','No native browser or DeepSeek completion tested']};
writeFileSync(join(dir,'summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({...summary,pairwise:summary.pairwise?{pairs:summary.pairwise.pairs,rows:summary.pairwise.rows}:null},null,2));
process.exitCode=!integrityPassed||process.argv.includes('--strict-recall')&&!recallComplete?1:0;
