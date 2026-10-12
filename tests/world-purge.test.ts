import {afterEach,expect,it,vi} from 'vitest';
import {DeepRoleDatabase} from '../src/storage/database';
import {DeepRoleRepository} from '../src/storage/repository';
import {removeWorld} from '../src/storage/worlds';
import {EMPTY_CHARACTER} from '../src/core/characters';
const dbs:DeepRoleDatabase[]=[];
afterEach(async()=>{vi.restoreAllMocks();await Promise.all(dbs.splice(0).map(db=>db.delete()));});
async function setup(){
 const db=new DeepRoleDatabase('purge-'+crypto.randomUUID());dbs.push(db);const repo=new DeepRoleRepository(db,true);
 for(const id of ['w','other'])await repo.put('world',{id,name:id,description:'',color:'#123456',contextBudget:1000,relevanceThreshold:6,createdAt:1,updatedAt:1});
 await repo.put('book',{id:'book',worldId:'w',name:'Imported',description:'',color:'#123456',active:true,createdAt:1,updatedAt:1});
 for(const [id,worldId,bookId] of [['entry',undefined,'book'],['foreign','other',null]] as const) await repo.put('entry',{id,worldId,bookId,title:id,content:'Lore',keywords:[],activation:'smart',priority:'normal',enabled:true,source:{type:'manual'},createdAt:1,updatedAt:1,...(id==='foreign'?{links:[{targetId:'entry',label:'Link',mode:'reference' as const}]}:{})});
 const own=await repo.storePhoto('data:image/png;base64,YQ=='),shared=await repo.storePhoto('data:image/png;base64,Yg==');
 for(const [id,worldId,sprites] of [['p','w',{neutral:own,sitting:shared}],['q','other',{neutral:shared}]] as const) await repo.put('entity',{id,worldId,kind:'character',name:id,description:'',aliases:[],memberIds:[],createdAt:1,updatedAt:1,characterSheet:{...EMPTY_CHARACTER,sprites}});
 await repo.put('snapshot',{id:'snap',worldId:'w',focusIds:['p'],title:'Scene',summary:'Original lore',sourceChatId:'c',sourceChatUrl:'https://chat.deepseek.com/a/chat/s/c',bookId:'book',createdAt:1});
 await repo.put('binding',{id:'binding',worldId:'w',focusIds:['p'],bookId:'book',chatId:'c',chatUrl:'https://chat.deepseek.com/a/chat/s/c',messageCountAtAnalysis:0,createdAt:1,updatedAt:1,continuationSnapshotId:'snap',memoryOverrides:{includedIds:['entry','foreign'],excludedIds:['entry']}});
 return{db,repo,own,shared};
}
it('purges world lore and exclusive photos atomically, retaining other worlds and shared images',async()=>{
 const {db,repo,own,shared}=await setup();await removeWorld('w',repo,{deleteLore:true});
 for(const [kind,id] of [['world','w'],['book','book'],['entry','entry'],['entity','p'],['snapshot','snap']] as const)expect(await repo.get(kind,id)).toBeNull();
 expect(await repo.get('world','other')).toBeTruthy();expect(await repo.get('entity','q')).toBeTruthy();
 expect((await repo.get<any>('entry','foreign')).links).toEqual([]);
 expect(await repo.get('binding','binding')).toMatchObject({worldId:null,bookId:null,focusIds:[],memoryOverrides:{includedIds:['foreign'],excludedIds:[]}});
 expect(await repo.get('binding','binding')).not.toHaveProperty('continuationSnapshotId');
 expect(await db.photos.get(own)).toBeUndefined();expect(await db.photos.get(shared)).toBeTruthy();
});
it('preserves the legacy keep-lore deletion option',async()=>{const {repo,db,own}=await setup();await removeWorld('w',repo);expect(await repo.get('entry','entry')).toBeTruthy();expect(await repo.get('book','book')).toMatchObject({worldId:null});expect(await db.photos.get(own)).toBeTruthy();});
it('rolls back the full deletion if photo cleanup fails',async()=>{const {repo,db,own}=await setup();vi.spyOn(db.photos,'bulkDelete').mockRejectedValueOnce(new Error('disk-error'));await expect(removeWorld('w',repo,{deleteLore:true})).rejects.toThrow('disk-error');expect(await repo.get('world','w')).toBeTruthy();expect(await repo.get('entry','entry')).toBeTruthy();expect(await db.photos.get(own)).toBeTruthy();});
it('refuses a missing world without touching any records',async()=>{const {repo}=await setup();const before=await repo.rawRecords();await expect(removeWorld('missing',repo,{deleteLore:true})).rejects.toThrow('memory-conflict');expect(await repo.rawRecords()).toEqual(before);});
