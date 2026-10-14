import type { CastDraft, CastSource, CastJob } from "./cast-initialization";
import {castCheck} from "./cast-validation";
import type { CharacterSheet, CharacterStatus, DataRecord, MemoryEntry, SceneEntity, WorldProfile } from "./types";
import { validCharacterSheet } from "./characters";
import { validMemoryEntry } from "./proposal-validation";
import { canonicalStoryValue } from "./story-value";

export interface ResetEntry { id: string; action: "remove" | "rewrite"; content: string; reason: string; quote: string }
export interface WorldResetRequest { chatId: string; revision: string; start: string }
export interface WorldResetPreparation extends WorldResetRequest {
  entryOffset?: number;
  gameId: string; worldName: string; people: { id: string; name: string; before?: {goals:string;background:string;state?:CharacterStatus} }[];
  entries: { id: string; title: string; content: string; scope?:"world"|"entry" }[];
  confirmation?: { token: string; draft: CastDraft; entries: string[] };
  snapshotId?: string;
}
export interface WorldResetArchive {
  description?:string;
  gameId: string; freshGameId: string; at: number;
  profiles: { id: string; sheet: Pick<CharacterSheet,"goals"|"background"|"initialStatus"|"attributes"|"relationships"> }[];
  entries: MemoryEntry[];
}
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
export function resetNextPeople(job:CastJob){
 const prepared=new Set(job.draft?.characters.map(c=>c.key)??[]);
 return job.reset!.people.filter(p=>!prepared.has(p.id)).slice(0,job.batchSize??1).map(p=>({id:p.id,name:p.name}));
}
/** A reset has an exact local roster. The model's more flag is not its authority. */
export function resetBatchMore(job:CastJob,incoming:CastDraft|undefined){
 const next=resetNextPeople(job),characters=incoming?.characters??[];
 castCheck(characters.length===next.length&&characters.every((c,i)=>c.key===next[i]!.id&&c.name===next[i]!.name),"characters","exact next existing reset profiles",characters);
 const completed=[...job.draft?.characters??[],...characters];
 castCheck(completed.every(c=>job.reset!.people.some(p=>p.id===c.key&&p.name===c.name)),"characters","exact next existing reset profiles",completed);
 return completed.length<job.reset!.people.length;
}
export const validResetRequest=(v:unknown):v is WorldResetRequest=>obj(v)&&Object.keys(v).length===3&&["chatId","revision"].every(k=>typeof v[k]==="string"&&/^[\w-]{1,160}$/u.test(v[k] as string))&&typeof v.start==="string"&&v.start.trim().length>=3&&v.start.length<=4000;
export function resetEntries(value:unknown,sources:CastSource[]):ResetEntry[]{
  if(value===undefined)return [];
  if(!Array.isArray(value))throw Error("invalid-result");
  const ids=new Set<string>();
  return value.map(e=>{
    if(!obj(e)||Object.keys(e).some(k=>!["id","action","content","reason","quote"].includes(k))||typeof e.id!=="string"||ids.has(e.id)||!["remove","rewrite"].includes(String(e.action))||typeof e.content!=="string"||e.content.length>30000||typeof e.reason!=="string"||!e.reason.trim()||e.reason.length>600||typeof e.quote!=="string"||e.quote.trim().length<3||e.quote.length>240||!sources.some(s=>s.id===e.id&&s.text.includes(e.quote as string))||e.action==="remove"&&e.content!==""||e.action==="rewrite"&&!e.content.trim())throw Error("invalid-evidence");
    ids.add(e.id);return structuredClone(e) as unknown as ResetEntry;
  });
}
export function validResetArchive(v:unknown):v is WorldResetArchive{
  return obj(v)&&(v.description===undefined||typeof v.description==="string")&&typeof v.gameId==="string"&&typeof v.freshGameId==="string"&&typeof v.at==="number"&&Number.isFinite(v.at)&&v.at>=0&&Array.isArray(v.entries)&&v.entries.every(validMemoryEntry)&&Array.isArray(v.profiles)&&v.profiles.every(p=>obj(p)&&typeof p.id==="string"&&obj(p.sheet)&&Object.keys(p.sheet).every(k=>["goals","background","initialStatus","attributes","relationships"].includes(k))&&validCharacterSheet({gender:"neutral",protagonist:false,appearance:"",personality:"",sprites:{},...p.sheet}));
}
/** Ignore only local chat receipts and presentation; keep game/lore guards intact.
 * Normalize the saved snapshot too, so an old ready plan needs no regeneration.
 * Never replace its baseline with the current world to make a stale plan pass. */
function resetSnapshotGuard(snapshot:unknown){
  if(!Array.isArray(snapshot)||snapshot.length!==4||!Array.isArray(snapshot[2])||!snapshot[2].every(obj)||!Array.isArray(snapshot[3]))throw Error("invalid-reset-guard");
  const bindings=snapshot[2].map(binding=>{
    const {createdAt,updatedAt,messageCountAtAnalysis,portraitLayouts,illustrationAttempts,scenePhotos,recoveredReplies,oldChatNotice,...state}=binding;
    return state;
  });
  return canonicalStoryValue([snapshot[0],snapshot[1],bindings,snapshot[3]]);
}
/** Fingerprint metadata and initial text, never image bytes or service progress. */
export function resetGuard(records:DataRecord[],worldId:string){
  const world=records.find(r=>r.kind==="world"&&r.id===worldId)?.data as WorldProfile|undefined;
  const books=records.filter(r=>r.kind==="book"&&"worldId" in r.data&&r.data.worldId===worldId).map(r=>r.id);
  return resetSnapshotGuard([world?.sharedGame,world?.description,records.filter(r=>r.kind==="binding"&&r.id===world?.sharedGame?.activeBindingId).map(r=>r.data),records.filter(r=>r.kind==="entry"&&((r.data as MemoryEntry).worldId===worldId||books.includes((r.data as MemoryEntry).bookId??""))||["template","entity"].includes(r.kind)&&"worldId" in r.data&&r.data.worldId===worldId).map(r=>r.kind==="entity"?[r.id,(r.data as SceneEntity).name,(r.data as SceneEntity).aliases,(r.data as SceneEntity).updatedAt]:[r.kind,r.id,r.data]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))]);
}
export function matchesResetGuard(records:DataRecord[],worldId:string,saved:string|undefined){
  if(typeof saved!=="string")return false;
  try{return resetSnapshotGuard(JSON.parse(saved))===resetGuard(records,worldId);}catch{return false;}
}
export const WORLD_RESET_INSTRUCTION = `This job is WORLD RESET TO THE START, not updating the latest played state. The user-specified starting point overrides the old latest-state instructions. Restore pre-game relationships individually: relatives remember their family; longstanding love, six years abroad, established past and initial distrust remain when present in original lore. NEVER make everyone strangers or set everyone's scores to zero. Later played events, fulfilled milestones, current goals and learned scene memories are NOT initial history. Preserve identity, ages, appearance, personality and all images; do not return image data. Reuse EXACT existing character ID as key and exact name; prepare ALL existing people, no new people/merges. Existing scale IDs/labels/definitions and relationship rules are fixed; propose only their initial values and starting narrative state. State includes no bonds/attributes/history: software initializes them. completed contains only milestones already true BEFORE play, not events from this playthrough. Proposed goals/background must retain original family/past, excluding later played events; user reviews them before replacing.
Library cleanup is a separate bounded stage after ALL character profiles. Do NOT output resetEntries in character batches. All proposals require TWO human confirmations; this JSON never authorizes a reset.`;
