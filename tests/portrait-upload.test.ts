import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import { validPortrait } from "../src/core/portrait-variations";
import { DEFAULT_PORTRAIT_MAX_EDGE, MAX_PORTRAIT_IMAGE_LENGTH, portraitUploadDimensions, validPortraitMaxEdge, validPortraitPreviewSize } from "../src/core/portrait-upload";
import { parseBackupSettings } from "../src/core/record-validation";
import { readPortrait, readPortraitFiles } from "../src/entrypoints/shared/portrait-file";
import { saveSettings } from "../src/storage/settings";
import { EMPTY_CHARACTER } from "../src/core/characters";
import { world } from "./image-fixtures";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { exportWorld, parseWorldPackage, cloneWorldPackage } from "../src/storage/worlds";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { selfieImageKey } from "../src/core/selfies";
import type { SceneEntity } from "../src/core/types";
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
function decoder(width:number,height:number) {
  const revoke=vi.fn(),draw=vi.fn(),encode=vi.fn(()=>"data:image/webp;base64,AAAA");
  vi.stubGlobal("Image",class{src="";naturalWidth=width;naturalHeight=height;decode=vi.fn(async()=>{});});
  vi.stubGlobal("URL",{createObjectURL:vi.fn(()=>"blob:owned"),revokeObjectURL:revoke});
  const original=document.createElement.bind(document),sizes:number[][]=[];
  vi.spyOn(document,"createElement").mockImplementation(((name:string)=>{
    const element=original(name);
    if(name==="canvas"){vi.spyOn(element as HTMLCanvasElement,"getContext").mockReturnValue({drawImage:draw} as any);vi.spyOn(element as HTMLCanvasElement,"toDataURL").mockImplementation((...args)=>{sizes.push([(element as HTMLCanvasElement).width,(element as HTMLCanvasElement).height]);return encode(...args as []);});}
    return element;
  }) as typeof document.createElement);
  return{revoke,draw,encode,sizes};
}
it("defaults to 1920px and validates one shared strict setting in old and new backups",()=>{
  expect(DEFAULT_SETTINGS.portraitMaxEdge).toBe(1920);expect(parseBackupSettings({...DEFAULT_SETTINGS,portraitMaxEdge:undefined}).portraitMaxEdge).toBe(DEFAULT_PORTRAIT_MAX_EDGE);
  for(const value of [256,720,1920,4096])expect(validPortraitMaxEdge(value)).toBe(true);
  for(const value of [255,4097,720.5,"1920",null]){expect(validPortraitMaxEdge(value)).toBe(false);expect(()=>parseBackupSettings({...DEFAULT_SETTINGS,portraitMaxEdge:value})).toThrow();}
  expect(validPortraitPreviewSize(280)).toBe(true);expect(validPortraitPreviewSize(281)).toBe(false);
  expect(parseBackupSettings({...DEFAULT_SETTINGS,portraitMaxEdge:2560,portraitPreviewSize:240})).toMatchObject({portraitMaxEdge:2560,portraitPreviewSize:240});
});
it("preserves aspect ratio, never invents pixels, and rejects oversized decoded surfaces",()=>{
  expect(portraitUploadDimensions(3840,2160,1920)).toEqual({width:1920,height:1080});
  expect(portraitUploadDimensions(1080,1920,720)).toEqual({width:405,height:720});
  expect(portraitUploadDimensions(120,160,1920)).toEqual({width:120,height:160});
  expect(()=>portraitUploadDimensions(10000,10000,1920)).toThrow("image-invalid");
});
it("preserves fitting source bytes rather than recompressing transparency",async()=>{
  const{revoke,draw}=decoder(1080,1920),file=new File([Uint8Array.of(1,2,3)],"portrait.png",{type:"image/png"});
  expect(await readPortrait(file)).toBe("data:image/png;base64,AQID");expect(draw).not.toHaveBeenCalled();expect(revoke).toHaveBeenCalledWith("blob:owned");
});
it("reads a custom edge once per batch and encodes WebP at .92, never 384px",async()=>{
  await saveSettings({...DEFAULT_SETTINGS,portraitMaxEdge:1280});const mock=decoder(2160,3840),file=new File(["source"],"portrait.jpg",{type:"image/jpeg"});
  await readPortraitFiles([file,file],()=>{void saveSettings({...DEFAULT_SETTINGS,portraitMaxEdge:256});});
  expect(mock.sizes).toEqual([[720,1280],[720,1280]]);expect(mock.encode).toHaveBeenCalledWith("image/webp",.92);expect(mock.revoke).toHaveBeenCalledTimes(2);
});
it("rejects invalid files and failed decodes, always revoking owned URLs",async()=>{
  const mock=decoder(800,600);await expect(readPortrait(new File(["x"],"bad.svg",{type:"image/svg+xml"}))).rejects.toThrow("image-invalid");
  vi.stubGlobal("Image",class{src="";decode=vi.fn(async()=>{throw Error("decode");});});
  await expect(readPortrait(new File(["x"],"bad.png",{type:"image/png"}))).rejects.toThrow("decode");expect(mock.revoke).toHaveBeenCalledOnce();
});
it("retains the larger per-image budget but rejects oversize instead of silently degrading quality",async()=>{
  const mock=decoder(3840,2160);mock.encode.mockReturnValue("data:image/webp;base64,"+"A".repeat(MAX_PORTRAIT_IMAGE_LENGTH));
  expect(validPortrait("data:image/png;base64,"+"A".repeat(400000))).toBe(true);
  await expect(readPortrait(new File(["x"],"large.png",{type:"image/png"}))).rejects.toThrow("image-too-large");
  expect(mock.encode).toHaveBeenCalledOnce();expect(mock.revoke).toHaveBeenCalledOnce();
});
it("embeds every uploaded collection and pinned reference in a portable JSON and restores bytes unchanged",async()=>{
  const db=new DeepRoleDatabase("portrait-portable-"+crypto.randomUUID()),repo=new DeepRoleRepository(db);
  const [neutral,variation,library,selfie]=["AAAA","BBBB","CCCC","DDDD"].map(value=>"data:image/png;base64,"+value.repeat(100000));
  const sheet={...EMPTY_CHARACTER,appearance:"Original visual canon",sprites:{neutral:neutral!,happy:[variation!]},portraitLibrary:[library!],selfieCategories:[{id:"ordinary",name:"Ordinary",description:"At home",default:true,minTrust:40,minAffinity:30,images:[selfie!]}],imageGeneration:{canonical:"Blue coat",sceneDelta:"",prefix:"",suffix:"",format:"prose" as const,referenceKey:selfieImageKey(library!)}};
  const person:SceneEntity={id:"portable-cast",worldId:world.id,kind:"character",name:"Mira",description:"Unchanged lore",aliases:[],memberIds:[],characterSheet:sheet,createdAt:1,updatedAt:1};
  try{
    await repo.put("world",world);await repo.put("entity",person);
    const json=JSON.stringify(await exportWorld(world.id,repo));
    for(const image of [neutral,variation,library,selfie])expect(json.includes(image!)).toBe(true);
    const pack=parseWorldPackage(json),cloned=cloneWorldPackage(pack);
    expect((cloned.find(record=>record.kind==="entity")!.data as SceneEntity).characterSheet).toEqual(sheet);
    const backup=await parseBackup(JSON.stringify(await createBackup(undefined,repo)));
    await repo.clear();await restoreBackup(backup,"replace",repo);
    expect((await repo.get<SceneEntity>("entity",person.id))!.characterSheet).toEqual(sheet);
  }finally{await repo.clear();db.close();await db.delete();}
});
