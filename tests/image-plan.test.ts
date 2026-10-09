import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_CHARACTER } from "../src/core/characters";
import { DEFAULT_IMAGE_SETTINGS, validIllustration, validCharacterImagePrompt, type ImageProviderConfig } from "../src/core/image-generation";
import { imagePlanInstruction, imagePlanRoster, parseImageScenePlan, planImageInput, validImageAttempts, validImageReplay } from "../src/core/image-plan";
import { selfieImageKey } from "../src/core/selfies";
import type { ChatBinding, SceneEntity } from "../src/core/types";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { ImageJobs } from "../src/storage/image-jobs";
import { saveImageSettings } from "../src/storage/image-settings";
import { saveProviderKey } from "../src/storage/image-keys";
import { cloneWorldPackage } from "../src/storage/worlds";
import { worldImageUsage } from "../src/storage/illustrations";
import { ImageApiError, requestBody } from "../src/adapters/image/transport";
import * as codec from "../src/adapters/image/image-codec";
import { profile, tinyImage, realPng, world } from "./image-fixtures";
const neutral = "data:image/png;base64," + realPng, alternate = "data:image/jpeg;base64,/9j/AAAA";
const imageProfile = { canonical: "Copper hair. Brown eyes.", sceneDelta: "OLD SCENE", prefix: "", suffix: "", format: "prose" as const, referenceKey: selfieImageKey(neutral), suggestiveReferenceKey: selfieImageKey(alternate), referenceContext: "Everyday coat", suggestiveReferenceContext: "Alternate evening look" };
const person: SceneEntity = { id:"mira",worldId:world.id,name:"Mira",kind:"character",description:"ORIGINAL LORE",aliases:[],memberIds:[],createdAt:1,updatedAt:1,characterSheet:{ ...EMPTY_CHARACTER, appearance:"Original appearance",portraitLibrary:[neutral,alternate],imageGeneration:imageProfile } };
const target = { worldId:world.id,chatId:"a",chatUrl:"https://chat.deepseek.com/chat/s/a",messageKey:'["message","reply-1"]' };
const config = { ...profile, maxReferences:2, editModelId:"original-edit",extraParams:{seed:7,unknown:{keep:true}} };
const settings = { ...DEFAULT_IMAGE_SETTINGS, enabled:true,contentLevel:"suggestive" as const,stylePrefix:"Watercolor",profiles:[config],profileByLevel:{off:config.id,suggestive:config.id} };
const plan = { scene:"Mira stands beside the observatory at sunset.",characters:[{id:person.id,reference:"suggestive" as const,appearance:"Model fallback"}] };
const dbs: DeepRoleDatabase[] = [];
afterEach(async()=>{vi.restoreAllMocks();await Promise.all(dbs.map(db=>db.delete()));dbs.length=0;});
async function setup(){const db=new DeepRoleDatabase("image-plan-"+crypto.randomUUID());dbs.push(db);const repo=new DeepRoleRepository(db);
await repo.put("world",world);await repo.put("entity",person);
const binding:ChatBinding={id:"binding:a",chatId:target.chatId,chatUrl:target.chatUrl,worldId:world.id,bookId:null,messageCountAtAnalysis:0,createdAt:1,updatedAt:1};await repo.put("binding",binding);
await saveImageSettings(settings);await saveProviderKey(config.id,"SYNTHETIC-PRIVATE-KEY");vi.spyOn(codec,"normalizeImage").mockImplementation(async blob=>blob.type==="image/jpeg"?alternate:neutral);
const provider={generate:vi.fn(async()=>({image:tinyImage,headers:{}})),edit:vi.fn(async()=>({image:tinyImage,headers:{}})),listModels:async()=>[]};
const factory=vi.fn((_config: ImageProviderConfig)=>provider),jobs=new ImageJobs(repo,async()=>true,factory);return{repo,jobs,provider,factory};}
describe("private scene planning",()=>{
it("accepts plain and fenced JSON only",()=>{expect(parseImageScenePlan(JSON.stringify(plan))).toEqual(plan);expect(parseImageScenePlan("\`\`\`json\n"+JSON.stringify(plan)+"\n\`\`\`")).toEqual(plan);expect(()=>parseImageScenePlan("Explanation "+JSON.stringify(plan))).toThrow("invalidPlan");});
it.each([{...plan,scene:"short"},{...plan,characters:[{...plan.characters[0],reference:"unknown"}]},{...plan,characters:[...plan.characters,...plan.characters]}])("rejects malformed frame %#",v=>expect(()=>parseImageScenePlan(JSON.stringify(v))).toThrow());
it("supplies textual identity and both reference contexts without pixels",()=>{const roster=imagePlanRoster([person]);expect(roster[0]?.references).toMatchObject({neutral:{available:true,context:"Everyday coat"},suggestive:{available:true,context:"Alternate evening look"}});const prompt=imagePlanInstruction({completedScene:"OLD requested scene",roster});expect(prompt).toContain("OLD requested scene");expect(prompt).toContain("Other replies");expect(prompt).not.toContain("data:image");});
it.each(["neutral","suggestive","none"] as const)("chooses the requested %s slot with the pinned ordinary reference as fallback",reference=>{const input=planImageInput({...plan,characters:[{...plan.characters[0]!,reference}]},target,[person],settings);expect(input.referenceKeys).toEqual([imageProfile[reference==="suggestive"?"suggestiveReferenceKey":"referenceKey"]]);expect(input.aspectRatio).toBe("16:9");expect(input.prompt).toContain("Watercolor");expect(input.prompt).toContain("Copper hair.");expect(input.prompt).not.toContain("OLD SCENE");});
it("ordinary preset forces the neutral look",()=>expect(planImageInput(plan,target,[person],{...settings,contentLevel:"off"}).referenceKeys).toEqual([imageProfile.referenceKey]));
it("missing alternate falls back to neutral then text",()=>{const a={...person,characterSheet:{...person.characterSheet!,portraitLibrary:[neutral]}};expect(planImageInput(plan,target,[a],settings).referenceKeys).toEqual([imageProfile.referenceKey]);expect(planImageInput(plan,target,[{...a,characterSheet:{...a.characterSheet!,portraitLibrary:[]}}],settings).referenceKeys).toEqual([]);});
it("combines identities in order within the provider reference limit",()=>{const second={...person,id:"noah",name:"Noah"},both={...plan,characters:[...plan.characters,{...plan.characters[0]!,id:"noah"}]};const input=planImageInput(both,target,[person,second],settings);expect(input.entityIds).toEqual(["mira","noah"]);expect(input.references).toEqual([{entityId:"mira",key:imageProfile.suggestiveReferenceKey},{entityId:"noah",key:imageProfile.suggestiveReferenceKey}]);const one=planImageInput(both,target,[person,second],{...settings,profiles:[{...config,maxReferences:1}]});expect(one.references).toHaveLength(1);expect(one.prompt).toContain("Noah");});
it.each(["unknown","other-world"])("rejects unknown or foreign identity %s",id=>expect(()=>planImageInput({...plan,characters:[{...plan.characters[0]!,id}]},target,[person,{...person,id:"other-world",worldId:"foreign"}],settings)).toThrow());
it("supports a landscape with no characters",()=>expect(planImageInput({...plan,characters:[]},target,[person],settings).referenceKeys).toEqual([]));
it("validates both persisted slots and limits their hints",()=>{expect(validCharacterImagePrompt(imageProfile)).toBe(true);expect(validCharacterImagePrompt({...imageProfile,suggestiveReferenceContext:"x".repeat(601)})).toBe(false);});
});
describe("exact manual retry and reload",()=>{
it("freezes model, params, style and normalized references without keys",async()=>{const{repo,jobs,provider,factory}=await setup();const job=await jobs.start(target),first=await jobs.render(target,job.id,plan);expect(validIllustration(first)).toBe(true);expect(validImageReplay(first.request)).toBe(true);expect((await repo.get<ChatBinding>("binding","binding:a"))!.illustrationAttempts).toEqual([]);const sent=structuredClone(provider.edit.mock.calls);expect(JSON.stringify(first)).not.toContain("SYNTHETIC-PRIVATE-KEY");await saveImageSettings({...settings,stylePrefix:"CHANGED",profiles:[{...config,modelId:"changed",editModelId:"changed-edit",extraParams:{seed:99}}]});await repo.put("entity",{...person,characterSheet:{...person.characterSheet!,portraitLibrary:[]}});const again=await new ImageJobs(repo,async()=>true,factory).repeat(target,first.id);expect(provider.edit.mock.calls[1]).toEqual(sent[0]);expect(factory.mock.calls.at(-1)?.[0]).toMatchObject(config);expect(again.id).not.toBe(first.id);expect(again.request).toEqual(first.request);expect(await repo.list("illustration")).toHaveLength(2);});
it("keeps failed snapshots and retries only on an explicit click",async()=>{const{repo,jobs,provider,factory}=await setup();provider.edit.mockRejectedValueOnce(new ImageApiError("timeout"));const job=await jobs.start(target);await expect(jobs.render(target,job.id,plan)).rejects.toMatchObject({code:"timeout"});const failed=(await repo.get<ChatBinding>("binding","binding:a"))!.illustrationAttempts![0]!;expect(failed.status).toBe("failed");expect(validImageAttempts([failed])).toBe(true);const reload=new ImageJobs(repo,async()=>true,factory);expect(provider.edit).toHaveBeenCalledOnce();await reload.repeat(target,job.id,true);expect(provider.edit).toHaveBeenCalledTimes(2);expect(provider.edit.mock.calls[1]).toEqual(provider.edit.mock.calls[0]);});
it("preparation failure cannot call the provider",async()=>{const{jobs,provider}=await setup();const job=await jobs.start(target);await expect(jobs.render(target,job.id,{...plan,characters:[{...plan.characters[0]!,id:"unknown"}]})).rejects.toThrow("invalidPlan");expect(provider.edit).not.toHaveBeenCalled();});
it("double clicks and worker instances share a single claim",async()=>{const{repo,jobs,factory}=await setup();await jobs.start(target);await expect(new ImageJobs(repo,async()=>true,factory).start(target)).rejects.toMatchObject({code:"busy"});});
it("cannot replay against a different reply or changed API host",async()=>{const{jobs,provider}=await setup();const job=await jobs.start(target),first=await jobs.render(target,job.id,plan);await expect(jobs.repeat({...target,messageKey:"another"},first.id)).rejects.toMatchObject({code:"expired"});await saveImageSettings({...settings,profiles:[{...config,baseUrl:"https://other.example.test/v1"}]});await expect(jobs.repeat(target,first.id)).rejects.toMatchObject({code:"changed"});expect(provider.edit).toHaveBeenCalledOnce();});
it("preserves pictures and remaps archived replay identities when cloning a world",async()=>{const{repo,jobs}=await setup();const job=await jobs.start(target),first=await jobs.render(target,job.id,plan);const copy=cloneWorldPackage({format:"deeprole-world",version:1,records:(await repo.rawRecords()).filter(r=>r.kind!=="binding")});const image=copy.find(r=>r.kind==="illustration")!.data as typeof first, entity=copy.find(r=>r.kind==="entity")!.data as SceneEntity;expect(validIllustration(image)).toBe(true);expect(image.image).toBe(first.image);expect(image.request!.input.worldId).toBe(copy.find(r=>r.kind==="world")!.id);expect(image.request!.input.references![0]!.entityId).toBe(entity.id);expect(image.request!.images).toEqual(first.request!.images);});
it("counts saved retry references in the image budget",async()=>{const{repo,jobs}=await setup();const job=await jobs.start(target),first=await jobs.render(target,job.id,plan);const records=await repo.rawRecords();expect(worldImageUsage(records,world.id).bytes).toBe(neutral.length+alternate.length+first.image.length+first.request!.images.reduce((n,x)=>n+x.length,0));});
});
describe("required image framing",()=>{
it.each(["16:9","9:16"] as const)("defaults framing without overwriting user sizing: %s",aspectRatio=>{
 const open=requestBody(config,{prompt:plan.scene,aspectRatio});expect(open.size).toBe(aspectRatio==="16:9"?"1536x1024":"1024x1536");
 const explicit=requestBody({...config,extraParams:{size:"auto",other:true}},{prompt:plan.scene,aspectRatio});expect(explicit).toMatchObject({size:"auto",other:true});
 const venice=requestBody({...config,kind:"venice-native"},{prompt:plan.scene,aspectRatio});expect(venice.aspect_ratio).toBe(aspectRatio);expect(venice).not.toHaveProperty("width");
 const pixel=requestBody({...config,kind:"venice-native",extraParams:{width:1024,height:1024,aspect_ratio:"1:1"}},{prompt:plan.scene,aspectRatio});expect(pixel).toMatchObject({width:1024,height:1024,aspect_ratio:"1:1"});
});
});
describe("persistent safe error details",()=>{
it("retains worker diagnostics through content cleanup and reload without leaking the key",async()=>{
  const {repo,jobs,provider}=await setup(); const diagnostic={source:"provider" as const,phase:"request" as const,status:400,endpoint:"/image/edit",providerCode:"INVALID_MODEL",message:"Unsupported model SYNTHETIC-PRIVATE-KEY"};
  provider.edit.mockRejectedValueOnce(new ImageApiError("badRequest",{"x-venice-is-content-violation":"false"},undefined,undefined,diagnostic));
  const job=await jobs.start(target);await expect(jobs.render(target,job.id,plan)).rejects.toMatchObject({code:"badRequest",diagnostic:{status:400}});
  await jobs.fail(target,job.id,{code:"failed"},"plan");
  const saved=(await repo.get<ChatBinding>("binding","binding:a"))!.illustrationAttempts![0]!;
  expect(saved).toMatchObject({error:"badRequest",diagnostic:{status:400,providerCode:"INVALID_MODEL",message:"Unsupported model [redacted]"},headers:{"x-venice-is-content-violation":"false"}});
  expect(validImageAttempts([saved])).toBe(true);expect(JSON.stringify(saved)).not.toContain("SYNTHETIC-PRIVATE-KEY");expect(provider.edit).toHaveBeenCalledOnce();
});
it("records a plan-stage failure without claiming an image API request was made",async()=>{
  const {repo,jobs,provider}=await setup();const job=await jobs.start(target);await jobs.fail(target,job.id,{code:"invalidPlan"},"plan");
  const saved=(await repo.get<ChatBinding>("binding","binding:a"))!.illustrationAttempts![0]!;
  expect(saved.diagnostic).toEqual({source:"deepseek",phase:"plan"});expect(saved.request).toBeUndefined();expect(provider.edit).not.toHaveBeenCalled();expect(provider.generate).not.toHaveBeenCalled();
});
});
