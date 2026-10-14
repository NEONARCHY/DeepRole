import { createId } from "../core/id";
import { validateCastDraftValue, type CastDraft, type CastJob } from "../core/cast-initialization";
import { matchesResetGuard, type WorldResetArchive } from "../core/world-reset";
import { sameStoryValue } from "../core/story-value";
import { assertWorldGameWriter } from "../core/world-game";
import { assertStoryGraph, storyRow, type StoryBaseline } from "../core/story-records";
import { EMPTY_CHARACTER, validCharacterSheet } from "../core/characters";
import { attributeState } from "../core/attributes";
import type { CharacterScene, CharacterSheet, ChatBinding, DataRecord, HandoffSnapshot, MemoryEntry, SceneEntity, WorldProfile } from "../core/types";
import { resetWorldGame } from "./world-game";
import { planLegacyStory } from "./story-history";
import { repository, type DeepRoleRepository } from "./repository";

function ready(all:DataRecord[],id:string){
 const job=all.find(r=>r.kind==="cast"&&r.id===id)?.data as CastJob|undefined;
 const w=all.find(r=>r.kind==="world"&&r.id===job?.worldId)?.data as WorldProfile|undefined;
 if(!job?.reset||job.reset.entryOffset!==job.reset.entries.length||job.phase!=="ready"||!job.draft||job.large&&job.large.stage!=="done"||!["done","none"].includes(job.cleanup))throw Error("reset-not-ready");
 if(!w?.sharedGame||w.sharedGame.id!==job.reset.gameId||w.sharedGame.revision!==job.reset.revision||!matchesResetGuard(all,w.id,job.resetGuard))throw Error("reset-stale");
 const b=all.find(r=>r.kind==="binding"&&(r.data as ChatBinding).chatId===job.reset!.chatId&&(r.data as ChatBinding).worldId===w.id)?.data as ChatBinding|undefined;
 if(!b)throw Error("story-binding-conflict");assertWorldGameWriter(all,b,w.id);return {job,w,b};
}
function checkedDraft(all:DataRecord[],job:CastJob,draft:CastDraft,entries:string[]){
 const d=validateCastDraftValue(draft,job.id,job.sources),people=job.reset!.people;
 if(d.characters.length!==people.length||d.characters.some(c=>!people.some(p=>p.id===c.key&&p.name===c.name))||!Array.isArray(entries)||new Set(entries).size!==entries.length||entries.some(id=>!d.resetEntries?.some(e=>e.id===id)||!job.reset!.entries.some(e=>e.id===id)||job.reset!.entries.find(e=>e.id===id)?.scope==="world"&&d.resetEntries!.find(e=>e.id===id)!.action!=="rewrite"))throw Error("reset-incomplete");
 for(const c of d.characters){const p=all.find(r=>r.kind==="entity"&&r.id===c.key)!.data as SceneEntity,s=p.characterSheet??EMPTY_CHARACTER;
  if(c.sheet.protagonist!==s.protagonist||c.sheet.attributes?.length!==(s.attributes??[]).length||c.sheet.attributes?.some(a=>!(s.attributes??[]).some(old=>old.id===a.id&&old.label===a.label&&old.low===a.low&&old.high===a.high&&old.cap===a.cap&&old.lowAt===a.lowAt&&old.highAt===a.highAt)))throw Error("reset-rules-changed");
  if(!!c.sheet.relationships!==!!s.relationships||c.sheet.relationships&&!sameStoryValue({...c.sheet.relationships,initial:undefined,initialCompleted:undefined},{...s.relationships,initial:undefined,initialCompleted:undefined}))throw Error("reset-rules-changed");
 }
 return d;
}
export async function confirmWorldReset(id:string,draft:CastDraft,entries:string[],repo:DeepRoleRepository=repository){
 return repo.updateRecords(all=>{const {job}=ready(all,id),d=checkedDraft(all,job,draft,entries),token=createId("reset-confirm");return {records:[{kind:"cast",id,data:{...job,reset:{...job.reset!,confirmation:{token,draft:d,entries:[...entries]}},updatedAt:Date.now()}}],removed:[],result:token};});
}
/** Frozen review + second explicit confirmation; one library transaction. */
export async function applyWorldReset(id:string,token:string,worldName:string,repo:DeepRoleRepository=repository):Promise<HandoffSnapshot>{
 return repo.updateRecords(initial=>{
  const {job,w,b}=ready(initial,id),confirmed=job.reset!.confirmation;
  if(!confirmed||confirmed.token!==token||worldName!==w.name)throw Error("reset-confirmation-required");
  const draft=checkedDraft(initial,job,confirmed.draft,confirmed.entries),now=Date.now(),oldGame=w.sharedGame!,archive:WorldResetArchive={gameId:oldGame.id,freshGameId:"",at:now,profiles:[],entries:[]};
  let all=resetWorldGame(initial,b.chatId,w.id),world=all.find(r=>r.kind==="world"&&r.id===w.id)!.data as WorldProfile;
  const binding=all.find(r=>r.kind==="binding"&&(r.data as ChatBinding).chatId===b.chatId)!.data as ChatBinding;
  const scene:CharacterScene={revision:createId("scene"),states:{},presentIds:[...draft.present],partnerIds:[...draft.partners],updatedAt:now},hero=draft.characters.find(c=>c.sheet.protagonist)?.key;
  const changes=new Map<string,DataRecord>();
  for(const c of draft.characters){
   const p=initial.find(r=>r.kind==="entity"&&r.id===c.key)!.data as SceneEntity,old=p.characterSheet??EMPTY_CHARACTER;
   archive.profiles.push({id:p.id,sheet:{goals:old.goals,background:old.background,...(old.initialStatus?{initialStatus:old.initialStatus}:{}),...(old.attributes?{attributes:old.attributes}:{}),...(old.relationships?{relationships:old.relationships}:{})}});
   const sheet:CharacterSheet={...old,goals:c.sheet.goals,background:c.sheet.background,initialStatus:structuredClone(c.state),attributes:c.sheet.attributes,...(old.relationships?{relationships:{...old.relationships,initial:c.sheet.relationships!.initial,initialCompleted:c.completed}}:{})};
   if(!validCharacterSheet(sheet))throw Error("invalid-result");
   changes.set("entity:"+p.id,{kind:"entity",id:p.id,data:{...p,characterSheet:sheet,profileFieldRevisions:{...p.profileFieldRevisions,goals:createId("profile-reset"),background:createId("profile-reset")},sharedInWorld:true,updatedAt:now}});
   scene.states[p.id]={...structuredClone(c.state),...(sheet.attributes?.length?{attributes:attributeState(sheet.attributes)}:{}),...(sheet.relationships?.enabled&&hero&&p.id!==hero?{bonds:{[hero]:{...sheet.relationships.initial,locked:false,completed:[...c.completed],history:[]}}}:{})};
  }
  const removed=new Set<string>();
  for(const proposal of draft.resetEntries??[]){if(!confirmed.entries.includes(proposal.id))continue;if(proposal.id===w.id){archive.description=w.description;world={...world,description:proposal.content};continue;}const row=initial.find(r=>r.kind==="entry"&&r.id===proposal.id)!;archive.entries.push(structuredClone(row.data as MemoryEntry));
   if(proposal.action==="remove")removed.add(row.id);else changes.set("entry:"+row.id,{...row,data:{...(row.data as MemoryEntry),content:proposal.content,updatedAt:now}});
  }
  // Drop links to removed active entries; archived originals retain their links.
  for(const row of initial.filter(r=>r.kind==="entry"&&job.reset!.entries.some(e=>e.id===r.id)&&(r.data as MemoryEntry).links?.some(l=>removed.has(l.targetId)))){if(removed.has(row.id))continue;if(!archive.entries.some(e=>e.id===row.id))archive.entries.push(structuredClone(row.data as MemoryEntry));const current=(changes.get("entry:"+row.id)??row).data as MemoryEntry;changes.set("entry:"+row.id,{...row,data:{...current,links:current.links?.filter(l=>!removed.has(l.targetId)),updatedAt:now}});}
  changes.set("binding:"+binding.id,{kind:"binding",id:binding.id,data:{...binding,characterScenes:{...binding.characterScenes,[w.id]:scene},memoryOverrides:{includedIds:[],excludedIds:[]},continuationSnapshotId:undefined,updatedAt:now}});
  archive.freshGameId=world.sharedGame!.id;
  world={...world,resetArchives:[...world.resetArchives??[],archive],sharedGame:{...world.sharedGame!,scene,memoryOverrides:{includedIds:[],excludedIds:[]},mergeSeeds:structuredClone(oldGame.mergeSeeds),identitySeeds:structuredClone(oldGame.identitySeeds)},updatedAt:now};
  changes.set("world:"+w.id,{kind:"world",id:w.id,data:world});all=all.filter(r=>!changes.has(r.kind+":"+r.id)&&!(r.kind==="entry"&&removed.has(r.id))).concat([...changes.values()]);
  // Keep approved card identities/merges, while seeds of events/profiles/time are empty.
  const planned=planLegacyStory(all,{worldId:w.id,bindingId:binding.id}),plannedKeys=new Set(planned.records.map(r=>r.kind+":"+r.id));all=all.filter(r=>!plannedKeys.has(r.kind+":"+r.id)).concat(planned.records);const base=all.find(r=>r.kind==="story"&&(r.data as StoryBaseline).type==="baseline"&&(r.data as StoryBaseline).origin.bindingId===binding.id)!.data as StoryBaseline;
  all=all.map(r=>r.id===base.id?storyRow({...base,gameId:world.sharedGame!.id,mergeSeeds:world.sharedGame!.mergeSeeds,identitySeeds:world.sharedGame!.identitySeeds,factSeeds:[],episodeSourceSeeds:[],memoryBatchSeeds:[]}):r);
  const snapshot:HandoffSnapshot={id:createId("snapshot"),worldId:w.id,title:w.name,summary:job.reset!.start,sourceChatId:b.chatId,sourceChatUrl:b.chatUrl,bookId:null,focusIds:[],characterScene:scene,memoryOverrides:{includedIds:[],excludedIds:[]},sharedGameRevision:world.sharedGame!.revision,resetGameId:world.sharedGame!.id,createdAt:now};
  all.push({kind:"snapshot",id:snapshot.id,data:snapshot});all=all.map(r=>r.kind==="cast"&&r.id===id?{...r,data:{...job,phase:"applied",reset:{...job.reset!,confirmation:undefined,snapshotId:snapshot.id},updatedAt:now}}:r);assertStoryGraph(all);
  return {records:all.filter(r=>!initial.some(old=>old.kind===r.kind&&old.id===r.id&&JSON.stringify(old.data)===JSON.stringify(r.data))),removed:initial.filter(r=>!all.some(n=>n.kind===r.kind&&n.id===r.id)).map(r=>({kind:r.kind,id:r.id})),result:snapshot};
 });
}
