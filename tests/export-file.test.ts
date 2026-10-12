// @vitest-environment node
import { Blob as NodeBlob } from "node:buffer";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { createExportFile } from "../src/storage/export-file";
import { parseBackupData,restoreBackup,createBackup,parseBackup } from "../src/storage/backup";
import { parseWorldPackageData,cloneWorldPackage,exportWorld } from "../src/storage/worlds";
import { jsonFileBlob } from "../src/core/json-file";
import { readJsonFile } from "../src/core/read-json-file";
import { packPortablePhotos,portablePhotoId } from "../src/core/portable-photos";
import { storyWorld } from "./fixtures/story-worlds";
import type { SceneEntity,WorldProfile } from "../src/core/types";
const dbs:DeepRoleDatabase[]=[];
const image="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
beforeEach(()=>vi.stubGlobal("Blob",NodeBlob));afterEach(async()=>{await Promise.all(dbs.splice(0).map(db=>db.delete()));vi.unstubAllGlobals();});
function empty(){const db=new DeepRoleDatabase("export-file-"+crypto.randomUUID());dbs.push(db);return{db,repo:new DeepRoleRepository(db,true)};}
async function setup(){
 const f=storyWorld("ru",24),{db,repo}=empty();f.entities[1]!.characterSheet={...f.entities[1]!.characterSheet!,sprites:{neutral:image,happy:[image]},portraitLibrary:[image],selfieCategories:[{id:"home",name:"Home",description:"",minTrust:0,minAffinity:0,images:[image]}]};await repo.mergeRecords(f.records);return {...f,db,repo};
}
it("one physical photo is packed once across avatars, library, emotions and selfies",async()=>{
 const f=await setup(),before=await f.repo.rawRecords(),photosBefore=await f.db.photos.count(),stages:string[]=[];
 const file=await createExportFile("backup","",undefined,f.repo,s=>stages.push(s));
 const data=await readJsonFile(file);expect(data.version).toBe(5);expect(data.photos).toHaveLength(1);expect(data.photos[0].image).toBe(image);
 const p=data.records.find((r:any)=>r.id==="person-2").data;expect(p.characterSheet.portraitLibrary[0]).toBe(p.characterSheet.sprites.neutral);expect(p.characterSheet.sprites.happy).toEqual([p.characterSheet.sprites.neutral]);
 expect(await f.repo.rawRecords()).toEqual(before);expect(await f.db.photos.count()).toBe(photosBefore);expect(stages).toContain("photos");expect(stages.at(-1)).toBe("file");
 const payload=await parseBackupData(data,file.size),dest=empty();await restoreBackup(payload,"replace",dest.repo);
 const stored=(await dest.repo.get<SceneEntity>("entity","person-2"))!;expect(await dest.repo.readPhoto(stored.characterSheet!.sprites.neutral as string)).toBe(image);expect(await dest.db.photos.count()).toBe(1);
 expect((await dest.repo.list<SceneEntity>("entity")).length).toBe(24);expect((await dest.repo.get<WorldProfile>("world",f.world.id))!.description).toBe(f.world.description);
});
it("world files are portable with their own photo table; cloned imports keep assignments",async()=>{
 const f=await setup(),file=await createExportFile("world",f.world.id,undefined,f.repo),data=await readJsonFile(file),pack=parseWorldPackageData(data,file.size);expect(pack.version).toBe(2);expect(pack.photos).toHaveLength(1);expect(pack.records.some(r=>r.kind==="binding")).toBe(false);
 const dest=empty();await dest.repo.mergeRecords(cloneWorldPackage(pack),pack.photos);const p=(await dest.repo.list<SceneEntity>("entity")).find(p=>p.name===f.entities[1]!.name)!;
 expect(await dest.repo.readPhoto(p.characterSheet!.portraitLibrary![0]!)).toBe(image);expect(p.characterSheet!.sprites.happy).toEqual([p.characterSheet!.sprites.neutral]);
});
it("password-protected files preserve the compact table and require the password",async()=>{
 const f=await setup(),file=await createExportFile("backup","", "test-password",f.repo),data=await readJsonFile(file);expect(data.format).toBe("deeprole-encrypted");expect(JSON.stringify(data)).not.toContain("data:image");
 await expect(parseBackupData(data,file.size,"wrong")).rejects.toThrow();const payload=await parseBackupData(data,file.size,"test-password");const dest=empty();await restoreBackup(payload,"merge",dest.repo);expect(await dest.db.photos.count()).toBe(1);
});
it("old ordinary world and backup readers remain compatible",async()=>{
 const f=await setup();const world=await exportWorld(f.world.id,f.repo);expect(world.version).toBe(1);expect((world.records.find(r=>r.id==="person-2")!.data as SceneEntity).characterSheet!.sprites.neutral).toBe(image);
 const old=await createBackup(undefined,f.repo);expect((await parseBackup(JSON.stringify(old))).format).toBe("deeprole-backup");
});
it("rejects missing/duplicate/tampered assets without replacing records",async()=>{
 const f=await setup(),file=await createExportFile("backup","",undefined,f.repo),data=await readJsonFile(file),dest=empty();await dest.repo.mergeRecords(f.records);const before=await dest.repo.rawRecords();
 await expect(parseBackupData({...data,photos:[]},file.size)).rejects.toThrow();await expect(parseBackupData({...data,photos:[...data.photos,...data.photos]},file.size)).rejects.toThrow();
 const bad=await parseBackupData({...data,photos:[{...data.photos[0],image:"data:image/png;base64,YQ=="}]},file.size);await expect(restoreBackup(bad,"replace",dest.repo)).rejects.toThrow("photo-invalid");expect(await dest.repo.rawRecords()).toEqual(before);
});
it("narrative strings resembling photo addresses remain byte-for-byte unchanged",async()=>{
 const id=await portablePhotoId(image),source={appearance:id,background:image,content:id,sprites:{neutral:id}};
 const pack=await packPortablePhotos([{kind:"entity",id:"x",data:source as any}],async()=>image);
 expect(pack.records[0]!.data).toMatchObject({appearance:id,background:image,content:id});expect(pack.photos).toHaveLength(1);
});
it("packs nested saved references and archive sheets, including photos absent from the current profile",async()=>{
 const old="data:image/png;base64,YQ==",id=await portablePhotoId(old),current=await portablePhotoId(image);
 const records=[
   {kind:"world",id:"w",data:{
     sharedGameArchives:[{people:[{characterSheet:{sprites:{neutral:id},portraitLibrary:[id]}}]}],
     sharedGame:{people:[{characterSheet:{sprites:{neutral:current}}}]},description:id,
   }},
   {kind:"illustration",id:"i",data:{image:current,request:{input:{references:[{image:id}]}}}},
 ] as any;
 const pack=await packPortablePhotos(records,async id=>id===current?image:old);
 expect(pack.photos).toEqual([{id,image:old},{id:current,image}]);expect(pack.records).toEqual(records);
});
it("an unreadable original aborts export instead of producing an incomplete file; vault lock blocks export",async()=>{
 const f=await setup(),before=await f.repo.rawRecords();await f.db.photos.clear();
 await expect(createExportFile("backup","",undefined,f.repo)).rejects.toThrow("photo-missing");expect(await f.repo.rawRecords()).toEqual(before);
 const other=await setup();await other.repo.enableVault("local-password");await other.repo.lockVault();await expect(createExportFile("backup","",undefined,other.repo)).rejects.toThrow();await other.repo.unlockVault("local-password");await other.repo.disableVault();
});
it("cancelled streaming reads release the source and never produce a parsed result",async()=>{
 let cancelled=false;const file={size:20*1024*1024,stream:()=>new ReadableStream({cancel(){cancelled=true;}})} as Blob;
 await expect(readJsonFile(file,()=>false)).rejects.toMatchObject({name:"AbortError"});expect(cancelled).toBe(true);
});
it("piecewise JSON serialization agrees with native JSON including escapes and sparse values",async()=>{
 const v={text:'quotes " \\ \n Русский',array:[null,undefined,1,true],nested:{x:undefined,y:"ok"},photos:[{id:"test",image}]};const blob=jsonFileBlob(v);expect(await blob.text()).toBe(JSON.stringify(v));
 const cyclic:any={};cyclic.self=cyclic;expect(()=>jsonFileBlob(cyclic)).toThrow("export-data-invalid");
});
it("incremental parser crosses every split, UTF-8 boundary and escaped quote safely",async()=>{
 const v={format:"deeprole-backup",records:[{content:'Русский " \\ \n end',nested:[true,null,123]}],photos:[{id:"a",image}],settings:{a:[1,2]}};
 const bytes=new TextEncoder().encode(JSON.stringify(v));
 for(const split of [1,2,3,7,64,1024]){
  const file={size:20*1024*1024,stream:()=>new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=split)c.enqueue(bytes.slice(i,i+split));c.close();}})} as Blob;
  expect(await readJsonFile(file)).toEqual(v);
 }
});
it.each(['{"records":[{},]}','{"records":[{}]','{"records":[]} trailing','{"format":"a","format":"b"}'])("incremental parser rejects malformed JSON %s",async(text)=>{
 const bytes=new TextEncoder().encode(text),file={size:20*1024*1024,stream:()=>new ReadableStream({start(c){c.enqueue(bytes);c.close();}})} as Blob;await expect(readJsonFile(file)).rejects.toThrow();
});
