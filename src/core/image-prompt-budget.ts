import type {ImageModelInfo,ImageProviderConfig} from './image-generation';
export interface ImagePromptLimits {generate?:number;edit?:number}
const numeric=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>0&&Number(value)<=1_000_000;
export function modelPromptLimits(config:ImageProviderConfig,models:ImageModelInfo[]):ImagePromptLimits {
 const read=(mode:'generate'|'edit')=>{
  const id=mode==='edit'?config.editModelId||config.modelId:config.modelId;
  const model=models.find(m=>m.id===id&&(mode==='edit'?m.supportsEdit:m.supportsGenerate)!==false);
  const limit=mode==='edit'?model?.editPromptLimit??model?.promptLimit:model?.generatePromptLimit??model?.promptLimit;
  return numeric(limit)?limit:undefined;
 };
 const generate=read('generate'),edit=read('edit');return {...(generate===undefined?{}:{generate}),...(edit===undefined?{}:{edit})};
}
export function imagePromptLimit(limits:ImagePromptLimits,edit:boolean):number {const value=edit?limits.edit:limits.generate;return numeric(value)?Math.min(12000,value):12000;}
export function imagePlanBudgetInstruction(value:unknown):string {
 if(!value||typeof value!=='object'||Array.isArray(value))return '';
 const limits=value as ImagePromptLimits,known=[limits.generate,limits.edit].filter(numeric);if(!known.length)return '';
 const limit=Math.min(12000,...known);
 return `Final image prompt budget: ${limit} characters INCLUDING style, unchanged stored identities, reference guidance and ALL participants, not the JSON length. Keep scene at most ${Math.min(1200,Math.max(12,Math.floor(limit/5)))} characters and generated per-person appearance/action/position brief. Do not repeat canonical appearance already supplied by the roster. Keep concrete established outfit/actions, every present participant and identity; never omit people or rewrite saved profiles to fit. If previousPlan is supplied, retain its exact participants and scene moment. This is a size budget, not permission to invent details.`;
}
/** Numeric-only bounded local diagnostic; never contains prompt, images or key. */
export function imagePromptOverflow(prompt:string,config:ImageProviderConfig,limits:ImagePromptLimits,edit:boolean) {
 const limit=imagePromptLimit(limits,edit);if(prompt.length<=limit)return;
 return {source:'deeprole' as const,phase:'local' as const,model:edit?config.editModelId||config.modelId:config.modelId,promptLength:prompt.length,promptLimit:limit};
}
