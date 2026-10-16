import type {ImageModelInfo,ImageProviderConfig} from './image-generation';
export interface ImagePromptLimits {generate?:number;edit?:number}
const numeric=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>0&&Number(value)<=1_000_000;
export function modelPromptLimits(config:ImageProviderConfig,models:ImageModelInfo[]):ImagePromptLimits {
 const read=(mode:'generate'|'edit')=>{
  const id=mode==='edit'?config.editModelId||config.modelId:config.modelId;
  const model=models.find(m=>m.id===id&&(mode==='edit'?m.supportsEdit:m.supportsGenerate)!==false);
  const specific=mode==='edit'?model?.editPromptLimit:model?.generatePromptLimit;
  const hasModeLimits=model?.editPromptLimit!==undefined||model?.generatePromptLimit!==undefined;
  const limit=specific??(hasModeLimits?undefined:model?.promptLimit);
  return numeric(limit)?limit:undefined;
 };
 const generate=read('generate'),edit=read('edit');return {...(generate===undefined?{}:{generate}),...(edit===undefined?{}:{edit})};
}
export function imagePromptLimit(limits:ImagePromptLimits,edit:boolean):number {const value=edit?limits.edit:limits.generate;return numeric(value)?Math.min(12000,value):12000;}
export function imagePlanBudgetInstruction(value:unknown,composition?:unknown):string {
 if(!value||typeof value!=='object'||Array.isArray(value))return '';
 const limits=value as ImagePromptLimits,known=[limits.generate,limits.edit].filter(numeric);if(!known.length)return '';
 const limit=Math.min(12000,...known);
 return `Final image prompt budget: ${limit} characters is the conservative planning ceiling. Mode limits: generate=${numeric(limits.generate)?imagePromptLimit(limits,false):'unknown (local safeguard 12000)'}; edit=${numeric(limits.edit)?imagePromptLimit(limits,true):'unknown (local safeguard 12000)'}. Use edit ONLY when at least one actual reference image is attached; zero attached images uses generate. These limits cover the ENTIRE final assembled prompt INCLUDING style, unchanged stored identities, reference guidance and ALL participants, not JSON length or only scene. Keep generated scene/appearance/action/position brief. Do not repeat canonical appearance already supplied by the roster; appearance may be empty when no new visible outfit detail is needed. Keep concrete established outfit/actions, every present participant and identity; never omit people or rewrite saved profiles to fit. If previousPlan is supplied, retain its exact participants and scene moment. This is a size budget, not permission to invent details.`
  +(composition&&typeof composition==='object'&&!Array.isArray(composition)?' Before writing, choose the actual cast and resolve which references fit referenceBudget, policies and overrides. promptComposition provides measured UTF-16 character costs from the SAME compact prompt assembler: baseCharacters once, groupCharacters once only for 2+ people, then each selected person\'s textCharacters OR matching referenceCharacters (never both). Add generatedFieldReserve per person and safetyCharacters once. Subtract that sum from the applicable mode limit; the remainder is the TOTAL allowance for scene + ALL generated appearance/action/position text together. When identityFromAppearance is true, count that person\'s appearance twice (identity plus Look). Do not charge absent roster members, add them to fill slots, or spend the whole model limit on scene alone. If fixed costs already exhaust the limit, do not invent a shorter identity or silently drop the user style; the local preflight will explain the mismatch.':'');
}
/** Numeric-only bounded local diagnostic; never contains prompt, images or key. */
export function imagePromptOverflow(prompt:string,config:ImageProviderConfig,limits:ImagePromptLimits,edit:boolean) {
 const limit=imagePromptLimit(limits,edit);if(prompt.length<=limit)return;
 return {source:'deeprole' as const,phase:'local' as const,model:edit?config.editModelId||config.modelId:config.modelId,promptLength:prompt.length,promptLimit:limit};
}
