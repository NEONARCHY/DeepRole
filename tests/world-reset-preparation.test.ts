import {afterEach,expect,it} from "vitest";
import {DeepRoleDatabase} from "../src/storage/database";
import {DeepRoleRepository} from "../src/storage/repository";
import {activateWorldGame} from "../src/storage/world-game";
import {createCastJob,mutateCastJob,acceptCastReply} from "../src/storage/cast-initialization";
import {castParts,castPrompt,type CastJob} from "../src/core/cast-initialization";
import type {WorldProfile} from "../src/core/types";
import {resetFixture,resetDraft} from "./fixtures/world-reset";
import {interruptedCastJob} from "../src/core/cast-batches";
const dbs:DeepRoleDatabase[]=[];
afterEach(async()=>{await Promise.all(dbs.splice(0).map(db=>db.delete()));});
async function fixture(){
 const f=resetFixture(),db=new DeepRoleDatabase('reset-preparation-'+crypto.randomUUID());dbs.push(db);const repo=new DeepRoleRepository(db);await repo.mergeRecords(f.records);
 await activateWorldGame({chatId:f.binding.chatId,chatUrl:f.binding.chatUrl,worldId:f.world.id,mode:'initialize',expectedRevision:null},repo);
 const world=(await repo.get<WorldProfile>('world',f.world.id))!,job=await createCastJob(world.id,'en',false,repo,undefined,false,{chatId:f.binding.chatId,revision:world.sharedGame!.revision,start:'The original opening before played events.'});
 await mutateCastJob(job.id,j=>({...j,phase:'analyzing',step:castParts(j.sources).length,awaiting:true}),repo);
 const current=()=>repo.get<CastJob>('cast',job.id).then(j=>j!);
 const submit=async(raw:string)=>{const j=await current();await mutateCastJob(job.id,v=>({...v,awaiting:true}),repo);return acceptCastReply(job.id,j.step,raw,repo);};
 const draft=resetDraft(job.id,f.records);
 const profile=(at:number,more:boolean)=>JSON.stringify({version:1,request:job.id,characters:[draft.characters[at]],present:[],partners:[],warnings:[],more});
 return {...f,repo,job,world,draft,current,submit,profile};
}
it('requests one exact existing reset person, not newly discovered people or generated scene keys',async()=>{
 const f=await fixture(),prompt=castPrompt(await f.current());
 expect(prompt).toContain('Next existing reset people (data):');expect(prompt).toContain('person-1');
 expect(prompt).not.toContain('NEW person');expect(prompt).not.toContain('Never use names or source record IDs as scene keys');
 const next=await f.submit(f.profile(0,false));expect(next.phase).toBe('analyzing');expect(next.draft!.characters).toHaveLength(1);
 expect(castPrompt(next)).toContain('Next existing reset people (data): [{"id":"person-2","name":"Chloe"}]');
});
it('uses the verified existing roster for completion, regardless of model more flags; preparation never resets the game',async()=>{
 const f=await fixture();let j=await f.current();
 for(let at=0;at<4;at++)j=await f.submit(f.profile(at,at===3));
 expect(j.reset!.entryOffset).toBe(0);expect(j.phase).toBe('analyzing');expect(j.draft!.characters.map(c=>c.key)).toEqual(f.entities.map(p=>p.id));
 expect((await f.repo.get<WorldProfile>('world',f.world.id))!.sharedGame).toEqual(f.world.sharedGame);
 expect(await f.repo.get('entry',f.event.id)).toEqual(f.event);
});
it.each(['foreign','out-of-order'])('rejects an unexpected reset person without advancing: %s',async mode=>{
 const f=await fixture(),v=JSON.parse(f.profile(mode==='out-of-order'?1:0,true));if(mode==='foreign')v.characters[0].key='foreign-person';
 const j=await f.submit(JSON.stringify(v));expect(j.repair).toBe(true);expect(j.draft).toBeUndefined();expect(j.step).toBe(castParts(j.sources).length);
 expect(j.diagnostics?.at(-1)?.details?.[0]?.rule).toBe('exact next existing reset profiles');
});
it('preserves completed starting states on malformed JSON and stops after one unsuccessful correction',async()=>{
 const f=await fixture();await f.submit(f.profile(0,true));const a=await f.submit('{"version":1,"characters":[');
 expect(a.repair).toBe(true);expect(a.draft!.characters).toHaveLength(1);expect(castPrompt(a)).toContain('Next existing reset people (data): [{"id":"person-2","name":"Chloe"}]');
 const b=await f.submit('not JSON');expect(b.phase).toBe('error');expect(b.draft!.characters).toHaveLength(1);
 expect((await f.repo.get<WorldProfile>('world',f.world.id))!.sharedGame).toEqual(f.world.sharedGame);
});
it('entry repair never leaks into profile repair or applies a partial cleanup plan',async()=>{
 const f=await fixture();for(let i=0;i<4;i++)await f.submit(f.profile(i,i<3));const j=await f.submit('{broken');
 expect(j.repair).toBe(true);expect(j.reset!.entryOffset).toBe(0);expect(j.repairIssues!.join(' ')).toContain('decisions');
 expect(j.repairIssues!.join(' ')).not.toContain('characters array');expect(castPrompt(j)).toContain('The previous entry decisions were invalid');
 const failed=await f.submit('{broken again');expect(failed.phase).toBe('error');expect(failed.draft!.characters).toHaveLength(4);
 expect(failed.reset!.entryOffset).toBe(0);expect(await f.repo.get('entry',f.event.id)).toEqual(f.event);
});
it('checkpoint recovery cannot bypass the exact reset target',async()=>{
 const f=await fixture(),j=await f.current();
 const checkpoint=(raw:string)=>({...j,chatId:'owned',replyCheckpoint:{step:j.step,repair:false,chatId:'owned',replyIdentity:'["message","r1"]',raw}});
 expect(interruptedCastJob(checkpoint(f.profile(1,true)),'tab-closed').draft).toBeUndefined();
 expect(interruptedCastJob(checkpoint(f.profile(0,false)),'tab-closed').draft!.characters.map(c=>c.key)).toEqual(['person-1']);
});
it('large-world reset requests the current existing target, not the first person again',async()=>{
 const f=await fixture(),j=await f.current();j.draft={...f.draft,characters:[f.draft.characters[0]!],resetEntries:[]};
 j.large={stage:'profiles',source:0,offset:0,prepared:1,candidates:f.entities.map(p=>({key:p.id,name:p.name,evidence:[{source:p.id,quote:p.name}]}))};
 expect(castPrompt(j)).toContain('Next existing reset people (data): [{"id":"person-2","name":"Chloe"}]');
});
it('an older two-person reset job retains its batch size and exact target validation',async()=>{
 const f=await fixture();await mutateCastJob(f.job.id,j=>({...j,batchSize:2}),f.repo);
 const raw=JSON.stringify({version:1,request:f.job.id,characters:f.draft.characters.slice(0,2),present:[],partners:[],warnings:[],more:false});
 const next=await f.submit(raw);expect(next.draft!.characters).toHaveLength(2);expect(next.phase).toBe('analyzing');
 expect(castPrompt(next)).toContain('Next existing reset people (data): [{"id":"person-3","name":"Mother"},{"id":"person-4","name":"Stranger"}]');
});
