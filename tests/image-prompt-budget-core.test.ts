import {expect,it,vi,afterEach} from 'vitest';
import {modelPromptLimits,imagePromptLimit,imagePlanBudgetInstruction,imagePromptOverflow} from '../src/core/image-prompt-budget';
import {validImageDiagnostic} from '../src/core/image-diagnostics';
import {VeniceNativeProvider} from '../src/adapters/image/venice-native';
import {ImageTransport} from '../src/adapters/image/transport';
import {profile} from './image-fixtures';
const config={...profile,kind:'venice-native' as const,modelId:'shared',editModelId:'separate'};
afterEach(()=>vi.unstubAllGlobals());
it.each([undefined,0,-1,NaN,Infinity,1.5,'1500',1_000_001])('unknown/invalid model limit %s is not guessed from its name',limit=>{
 const m={id:'shared',label:'1500 qwen uncensored',promptLimit:limit as number};expect(modelPromptLimits(config,[m])).toEqual({});expect(imagePromptLimit({generate:limit as number},false)).toBe(12000);
});
it('uses the actual edit ID and preserves separate mode limits for a shared ID',()=>{
 expect(modelPromptLimits({...config,editModelId:'shared'},[{id:'shared',label:'Shared',promptLimit:1500,generatePromptLimit:4000,editPromptLimit:1500}])).toEqual({generate:4000,edit:1500});
 expect(modelPromptLimits(config,[{id:'shared',label:'New',promptLimit:4000},{id:'separate',label:'Edit',promptLimit:1500}])).toEqual({generate:4000,edit:1500});
});
it('does not apply explicitly incompatible catalog metadata',()=>expect(modelPromptLimits(config,[{id:'shared',label:'Edit only',supportsGenerate:false,promptLimit:500},{id:'separate',label:'Generate only',supportsEdit:false,promptLimit:600}])).toEqual({}));
it('keeps the local payload safeguard and a conservative UTF16 character count',()=>{
 expect(imagePromptLimit({generate:32768},false)).toBe(12000);expect(imagePromptOverflow('🙂'.repeat(751),config,{generate:1500},false)).toMatchObject({promptLength:1502,promptLimit:1500});
 expect(imagePromptOverflow('Ж'.repeat(1500),config,{generate:1500},false)).toBeUndefined();
});
it.each([undefined,null,{},[],{generate:'1500'},{generate:0}])('unknown planning budget %j adds no guessed instruction',value=>expect(imagePlanBudgetInstruction(value)).toBe(''));
it('provides a combined budget rather than a per-character quota or JSON cap',()=>{
 const text=imagePlanBudgetInstruction({generate:3000,edit:1500});expect(text).toContain('Final image prompt budget: 1500');expect(text).toContain('unchanged stored identities');expect(text).toContain('every present participant');expect(text).not.toContain('qwen');
});
it('records only model and numeric bounds, not the full prompt',()=>{
 const text='Private data '.repeat(200),d=imagePromptOverflow(text,config,{generate:1500},false)!;expect(validImageDiagnostic(d)).toBe(true);expect(JSON.stringify(d)).not.toContain('Private');
 for(const invalid of [{...d,promptLength:-1},{...d,promptLimit:1.5},{...d,promptLength:Infinity},{...d,prompt:'secret'}])expect(validImageDiagnostic(invalid)).toBe(false);
});
it('retains both caps when the native catalogs reuse an ID',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(JSON.stringify({data:[{id:'shared',model_spec:{constraints:{promptCharacterLimit:url.includes('inpaint')?1500:4000}}}]}),{headers:{'content-type':'application/json'}})));
 const provider=new VeniceNativeProvider({...config,editModelId:'shared'},new ImageTransport(config,'SYNTHETIC',async()=>true));const models=await provider.listModels();expect(models).toHaveLength(1);expect(modelPromptLimits({...config,editModelId:'shared'},models)).toEqual({generate:4000,edit:1500});
});
