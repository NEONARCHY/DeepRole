import {afterEach,expect,it,vi} from 'vitest';
import {EMPTY_CHARACTER} from '../src/core/characters';
import {DEFAULT_IMAGE_SETTINGS,type ImageProviderConfig,type ImageModelInfo} from '../src/core/image-generation';
import {planImageInput,imagePlanInstruction,imagePlanPromptComposition} from '../src/core/image-plan';
import {ImageJobs} from '../src/storage/image-jobs';
import {DeepRoleDatabase} from '../src/storage/database';
import {DeepRoleRepository} from '../src/storage/repository';
import {saveImageSettings} from '../src/storage/image-settings';
import {saveProviderKey} from '../src/storage/image-keys';
import {world,profile,tinyImage,realPng} from './image-fixtures';
import type {SceneEntity,ChatBinding} from '../src/core/types';
import {selfieImageKey} from '../src/core/selfies';
import * as codec from '../src/adapters/image/image-codec';
const config:ImageProviderConfig={...profile,kind:'venice-native',modelId:'new-scene',editModelId:'edit-scene',maxReferences:3};
const image='data:image/png;base64,'+realPng,target={worldId:world.id,chatId:'a',chatUrl:'https://chat.deepseek.com/chat/s/a',messageKey:'reply'};
const entities:SceneEntity[]=['Avery','Blake'].map((name,i)=>({id:'person'+i,worldId:world.id,name,kind:'character',description:'Original lore',aliases:[],memberIds:[],createdAt:1,updatedAt:1,characterSheet:{...EMPTY_CHARACTER,appearance:'Established hair and eyes.',portraitLibrary:[image],imageGeneration:{canonical:'Established hair and eyes.',sceneDelta:'',prefix:'',suffix:'',format:'prose',referenceKey:selfieImageKey(image)}}}));
const settings={...DEFAULT_IMAGE_SETTINGS,enabled:true,profiles:[config],profileByLevel:{off:config.id},stylePrefix:'Watercolor',styleSuffix:'Detailed light'};
const plan={scene:'Two people study the sky beside an observatory.',characters:entities.map(e=>({id:e.id,reference:'neutral' as const,appearance:'Everyday coat.',action:'Studying the sky.',position:'Beside the telescope.',focus:'primary' as const}))};
const databases:DeepRoleDatabase[]=[];
afterEach(async()=>{vi.restoreAllMocks();await Promise.all(databases.map(db=>db.delete()));databases.length=0;});
async function fixture(models:ImageModelInfo[]=[{id:config.modelId,label:'New',promptLimit:3000},{id:config.editModelId!,label:'Edit',promptLimit:1500}]){
 const db=new DeepRoleDatabase('image-budget-'+crypto.randomUUID());databases.push(db);const repo=new DeepRoleRepository(db);await repo.put('world',world);for(const e of entities)await repo.put('entity',e);
 await repo.put('binding',{id:'binding:a',chatId:'a',chatUrl:target.chatUrl,worldId:world.id,bookId:null,messageCountAtAnalysis:0,createdAt:1,updatedAt:1} satisfies ChatBinding);
 await saveImageSettings(settings);await saveProviderKey(config.id,'SYNTHETIC-KEY');vi.spyOn(codec,'normalizeImage').mockResolvedValue(image);
 const provider={listModels:vi.fn(async()=>models),generate:vi.fn(async()=>({image:tinyImage,headers:{}})),edit:vi.fn(async()=>({image:tinyImage,headers:{}}))};const jobs=new ImageJobs(repo,async()=>true,()=>provider);return{repo,jobs,provider,models};
}
it('protects a 1500-character edit budget by shortening only application boilerplate',()=>{
 const data={...plan,scene:plan.scene+' A star chart is visible.'.repeat(23)},before=structuredClone({data,entities,settings});
 const full=planImageInput(data,target,entities,settings);expect(full.prompt.length).toBeGreaterThan(1500);
 const bounded=planImageInput(data,target,entities,settings,{}, {generate:3000,edit:1500});expect(bounded.prompt.length).toBeLessThanOrEqual(1500);
 for(const text of [data.scene,settings.stylePrefix,settings.styleSuffix,...entities.map(e=>e.characterSheet!.appearance),...data.characters.flatMap(c=>[c.appearance,c.action,c.position])])expect(bounded.prompt).toContain(text);
 expect(bounded.references).toEqual(full.references);expect(bounded.entityIds).toEqual(full.entityIds);expect({data,entities,settings}).toEqual(before);
});
it('includes an actual combined prompt-budget instruction in the DeepSeek plan',()=>{
 expect(imagePlanInstruction({name:'Scene',promptBudget:{generate:3000,edit:1500}})).toContain('Final image prompt budget: 1500');
});
it('measures real fixed costs, including full identities beyond the roster excerpt, without exposing image bytes',()=>{
 const full=entities.map(e=>({...e,characterSheet:{...e.characterSheet!,imageGeneration:{...e.characterSheet!.imageGeneration!,canonical:'Full known identity '.repeat(80),referenceContext:'Neutral outfit.',suggestiveReferenceContext:'Alternate outfit.'}}}));
 const before=structuredClone({full,settings});
 const costs=imagePlanPromptComposition(full,settings);
 expect(costs.generateModel).toBe(config.modelId);expect(costs.editModel).toBe(config.editModelId);
 expect(costs.people[0]!.textCharacters).toBeGreaterThan(1600);
 expect(JSON.stringify(costs)).not.toContain('data:image');expect(JSON.stringify(costs)).not.toContain('Full known identity');
 const data={...plan,characters:plan.characters.slice(0,1)};
 const prompt=planImageInput(data,target,full,settings,{}, {generate:1,edit:1}).prompt;
 const person=costs.people[0]!;
 const available=1500-costs.baseCharacters-person.referenceCharacters.neutral-costs.generatedFieldReserve-costs.safetyCharacters;
 expect(available).toBeLessThan(0);expect(prompt.length).toBeGreaterThan(1500);
 expect(imagePlanInstruction({promptBudget:{generate:3000,edit:1500},promptComposition:costs})).toContain('fixed costs already exhaust the limit');
 expect({full,settings}).toEqual(before);
});
it.each([0,1,2,40])('bounds compact assembly for %i selected people, charging only their costs',count=>{
 const people=Array.from({length:40},(_,i)=>({...entities[i%2]!,id:'cast-'+i,name:'Person '+i}));
 const chosen=people.slice(0,count).map(e=>({...plan.characters[0]!,id:e.id,appearance:'A blue coat.',action:'Standing.',position:'Left of the door.'}));
 const data={scene:plan.scene,characters:chosen},costs=imagePlanPromptComposition(people,settings);
 const prompt=planImageInput(data,target,people,settings,{}, {generate:1,edit:1}).prompt;
 const fixed=costs.baseCharacters+(count>1?costs.groupCharacters:0)+costs.safetyCharacters+costs.people.slice(0,count).reduce((n,p,i)=>n+(i<3?p.referenceCharacters.neutral:p.textCharacters)+costs.generatedFieldReserve,0);
 const generated=data.scene.length+chosen.reduce((n,p)=>n+p.appearance.length+p.action!.length+p.position!.length,0);
 expect(prompt.length).toBeLessThanOrEqual(fixed+generated);
 expect(costs.people).toHaveLength(40);
});
it.each(['generate','edit'] as const)('blocks an oversized complete %s prompt before the paid call',async mode=>{
 const f=await fixture(),before=await f.repo.rawRecords(),input={...target,providerId:config.id,prompt:'x'.repeat(mode==='edit'?1501:3001),referenceKeys:mode==='edit'?[selfieImageKey(image)]:[],...(mode==='edit'?{entityId:entities[0]!.id}:{})};
 const error=await f.jobs.run(input).catch(e=>e);expect(error).toMatchObject({code:'modelPromptLimit',diagnostic:{source:'deeprole',phase:'local',promptLength:input.prompt.length,promptLimit:mode==='edit'?1500:3000,model:mode==='edit'?config.editModelId:config.modelId}});
 expect(f.provider.edit).not.toHaveBeenCalled();expect(f.provider.generate).not.toHaveBeenCalled();expect(await f.repo.rawRecords()).toEqual(before);
});
it('allows the exact boundary without trimming input, seed or arbitrary parameters',async()=>{
 const f=await fixture(),prompt='x'.repeat(3000);await f.jobs.run({...target,providerId:config.id,prompt,referenceKeys:[],seed:8});expect(f.provider.generate).toHaveBeenCalledExactlyOnceWith({prompt,seed:8,aspectRatio:'16:9'});
});
it('gets preparation limits only for an owned preparing attempt',async()=>{
 const f=await fixture();await expect(f.jobs.promptBudget(target,'missing')).rejects.toBeDefined();expect(f.provider.listModels).not.toHaveBeenCalled();const attempt=await f.jobs.start(target);expect(await f.jobs.promptBudget(target,attempt.id)).toEqual({generate:3000,edit:1500});
});
it('does not truncate protected identity, style or scene when even compact prose cannot fit',async()=>{
 const f=await fixture(),large={...settings,stylePrefix:'STYLE '.repeat(180)};await saveImageSettings(large);for(const e of entities)await f.repo.put('entity',{...e,characterSheet:{...e.characterSheet!,appearance:'KNOWN '.repeat(190),imageGeneration:{...e.characterSheet!.imageGeneration!,canonical:'KNOWN '.repeat(190)}}});
 const before=(await f.repo.rawRecords()).filter(r=>r.kind==='entity'),attempt=await f.jobs.start(target);await expect(f.jobs.render(target,attempt.id,plan)).rejects.toMatchObject({code:'modelPromptLimit'});expect(f.provider.edit).not.toHaveBeenCalled();expect((await f.repo.rawRecords()).filter(r=>r.kind==='entity')).toEqual(before);
});
it('a known catalog failure is saved as a catalog diagnostic without a generation call',async()=>{
 const f=await fixture(),attempt=await f.jobs.start(target);const {ImageApiError}=await import('../src/adapters/image/transport');f.provider.listModels.mockRejectedValueOnce(new ImageApiError('unauthorized',{},undefined,undefined,{source:'provider',phase:'models',status:401,endpoint:'/models'}));
 await expect(f.jobs.promptBudget(target,attempt.id)).rejects.toMatchObject({code:'unauthorized'});const saved=(await f.repo.get<ChatBinding>('binding','binding:a'))!.illustrationAttempts![0]!;expect(saved.diagnostic).toMatchObject({source:'provider',phase:'models',status:401});expect(saved.status).toBe('failed');expect(f.provider.generate).not.toHaveBeenCalled();
});
it('a manual replay keeps its old prompt/model even if current settings select another model',async()=>{
 const f=await fixture(),prompt='x'.repeat(2900),first=await f.jobs.run({...target,providerId:config.id,prompt,referenceKeys:[]});await saveImageSettings({...settings,profiles:[{...config,modelId:'different'}]});
 f.models[0]!.promptLimit=2800;await expect(f.jobs.repeat(target,first.id)).rejects.toMatchObject({code:'modelPromptLimit',diagnostic:{model:config.modelId,promptLength:2900,promptLimit:2800}});expect(f.provider.generate).toHaveBeenCalledOnce();expect(await f.repo.get('illustration',first.id)).toEqual(first);
});
it('a connection changed during a catalog lookup cannot generate with a stale prepared configuration',async()=>{
 const f=await fixture();f.provider.listModels.mockImplementationOnce(async()=>{await saveImageSettings({...settings,profiles:[{...config,modelId:'changed'}]});return f.models;});
 await expect(f.jobs.run({...target,providerId:config.id,prompt:'A small observatory scene.',referenceKeys:[]})).rejects.toMatchObject({code:'changed'});expect(f.provider.generate).not.toHaveBeenCalled();
});
