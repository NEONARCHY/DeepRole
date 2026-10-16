/** Deterministic finite pairwise coverage, not exhaustive text/state coverage. */
export type Factors = Record<string, readonly (string | number | boolean)[]>;
export function pairwise(factors: Factors) {
 const names=Object.keys(factors), levels=Object.values(factors);
 if(names.length<2||levels.some(v=>!v.length||new Set(v).size!==v.length))throw Error('Invalid factors');
 const key=(i:number,a:number,j:number,b:number)=>`${i}:${a}/${j}:${b}`;
 const missing=new Set<string>();
 for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++)for(let a=0;a<levels[i]!.length;a++)for(let b=0;b<levels[j]!.length;b++)missing.add(key(i,a,j,b));
 const total=missing.size, rows:number[][]=[];let seed=293;
 const random=(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return Math.floor(seed/4294967296*n);};
 const pairs=(r:number[])=>r.flatMap((a,i)=>r.slice(i+1).map((b,k)=>key(i,a,i+k+1,b)));
 while(missing.size){
  const [first]=missing;const [i,a,j,b]=first!.split(/[:/]/).map(Number);
  let best:number[]=[],score=-1;
  for(let trial=0;trial<256;trial++){
   const r=levels.map(v=>random(v.length));r[i!]=a!;r[j!]=b!;
   const n=pairs(r).filter(p=>missing.has(p)).length;if(n>score){best=r;score=n;}
  }
  if(score<=0)throw Error('Coverage made no progress');
  rows.push(best);pairs(best).forEach(p=>missing.delete(p));
 }
 return {totalPairs:total,rows:rows.map(row=>Object.fromEntries(names.map((n,i)=>[n,levels[i]![row[i]!]!]))) };
}
export const memoryFactors:Factors={
 locale:['ru','en'],plot:[0,1,2],noise:[450,1100,6500],budget:[900,2400,16000],
 transport:['legacy','compact','columns'],variant:Array.from({length:14},(_,i)=>i),cache:[false,true],
 lore:['enabled','disabled','excluded'],profiles:[false,true],recap:[false,true],choices:[false,true],required:[false,true],
 contentRelevance:[false,true],topicAdmission:[false,true],continuationBalance:[false,true],
 actionBalance:[false,true],taskGoalBalance:[false,true],compoundActionBalance:[false,true],
 naturalRecall:[false,true],lastingRecall:[false,true],referenceRecall:[false,true,'guard'],
 referenceBundle:[false,true],discussionPriority:[false,true],flexiblePriority:[false,true],
 sequencePriority:[false,true],budgetPriority:[false,true],contextualRecall:[false,true],
};
