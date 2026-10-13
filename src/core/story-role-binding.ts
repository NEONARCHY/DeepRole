import type { SceneEntity } from "./types";
import type { StoryFact } from "./story-update";
import type { StoryRevision } from "./story-records";
import type { MergeSeeds } from "./story-character-merge";
import { createStoryRoleReaderV1, type StorySourceRoles } from "./story-source-roles";
import { retrievalNames, isPersonalStoryReference } from "./story-retrieval-query";
import { storyFactIdentity } from "./story-memory-lifecycle";
import { normalizeText } from "./text";

export interface RolePerson { id: string; name: string; aliases: string[] }
export interface StoryRoleBinding { version: 1; sourceRevisionId: string; quote: string; roles: StorySourceRoles }
export interface FactRoleSeed { key: string; binding: StoryRoleBinding }
const roles = ["speaker", "recipient", "promisor", "planner", "believer"] as const;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === "string" && !!v && v === v.trim() && v.length <= 160 && !["__proto__", "constructor", "prototype"].includes(v);
const name = (v: unknown): v is string => typeof v === "string" && !!v.trim();
export const validRoleRoster = (v: unknown): v is RolePerson[] => Array.isArray(v) && v.every(p => object(p) && Object.keys(p).length === 3 && id(p.id) && name(p.name) && Array.isArray(p.aliases) && p.aliases.every(name)) && new Set(v.map(p=>p.id)).size === v.length;
export const validRoleBinding = (v: unknown): v is StoryRoleBinding => object(v) && Object.keys(v).length === 4 && v.version === 1 && id(v.sourceRevisionId) && typeof v.quote === "string" && !!v.quote.trim() && v.quote.length <= 2400 && object(v.roles) && Object.entries(v.roles).every(([k,p]) => roles.includes(k as typeof roles[number]) && object(p) && Object.keys(p).length === 2 && id(p.id) && name(p.name));
export function validFactRoleSeeds(v: unknown, facts: StoryFact[]): v is FactRoleSeed[] {
  if(!Array.isArray(v))return false;const quotes=new Map(facts.map(f=>[storyFactIdentity(f),f.quote]));
  return v.every(s=>object(s)&&Object.keys(s).length===2&&typeof s.key==="string"&&validRoleBinding(s.binding)&&quotes.get(s.key)===s.binding.quote)&&new Set(v.map(s=>s.key)).size===v.length;
}
/** Names only: no profiles, ages, images, API secrets or user drafts. */
export const captureRoleRoster = (entities: SceneEntity[], worldId: string): RolePerson[] => entities.filter(p=>p.worldId===worldId && p.kind==="character" && p.name.trim()).map(p=>({id:p.id,name:p.name,aliases:p.aliases.filter(n=>n.trim())}));
export const roleEntities = (roster: RolePerson[], worldId: string): SceneEntity[] => roster.map(p=>({...p,worldId,kind:"character",description:"",memberIds:[],createdAt:0,updatedAt:0}));
/** Retain collision witnesses, including inferred forms, not just unique matches. */
export function sourceRoleRoster(roster: RolePerson[], worldId: string, prose: string) {
  const text = " " + normalizeText(prose) + " ";
  return roster.filter(p=>retrievalNames(roleEntities([p],worldId)[0]!).some(n=>!isPersonalStoryReference(n) && text.includes(" "+n+" "))).map(p=>structuredClone(p));
}
export function bindStoryRoles(fact: StoryFact, source: StoryRevision): StoryRoleBinding {
  return {version:1,sourceRevisionId:source.id,quote:fact.quote,roles:source.roleRoster?.length?createStoryRoleReaderV1({worldId:source.worldId??"",entities:roleEntities(source.roleRoster,source.worldId??"")}).read(fact)??{}:{}};
}
export const roleSeed = (fact: StoryFact, binding: StoryRoleBinding): FactRoleSeed => ({key:storyFactIdentity(fact),binding:structuredClone(binding)});
export function selectedRoleSeeds(facts: StoryFact[], candidates: FactRoleSeed[]) {
  const last = new Map(candidates.map(s=>[s.key,s]));
  return facts.flatMap(f=>{const s=last.get(storyFactIdentity(f));return s?.binding.quote===f.quote?[structuredClone(s)]:[];});
}
/** Historical IDs never re-resolve through names. Only explicit selected merges
 * may map them forward; cycles/conflicts keep the original historical identity. */
export function storedRoleReader(seeds: FactRoleSeed[], entities: SceneEntity[], worldId: string, merges: MergeSeeds = {}, strict = false) {
  const index = new Map(structuredClone(seeds).map(s=>[s.key,s.binding]));
  const people = new Map(entities.filter(p=>p.worldId===worldId && p.kind==="character").map(p=>[p.id,{id:p.id,name:p.name}]));
  const forward = new Map<string, Set<string>>();
  for (const m of Object.values(merges)) for (const source of m.sourceIds) { const targets=forward.get(source)??new Set<string>();targets.add(m.mergedId);forward.set(source,targets); }
  const target = (original: string) => { let current=original;const seen=new Set<string>();while(forward.has(current)){if(seen.has(current)||forward.get(current)!.size!==1)return original;seen.add(current);current=[...forward.get(current)!][0]!;}return current; };
  return (fact: StoryFact): StorySourceRoles | null | undefined => {
    const binding=index.get(storyFactIdentity(fact));if(!binding)return strict?null:undefined;
    if(binding.quote!==fact.quote)return null;
    if(!Object.keys(binding.roles).length)return null;
    return Object.fromEntries(Object.entries(binding.roles).map(([role,p])=>{
      const resolved=target(p.id),person=people.get(resolved);
      return [role,{id:person?.id??p.id,name:person?.name??p.name,...(person?.name!==p.name?{sourceName:p.name}:{}),...(person&&person.id!==p.id?{sourceId:p.id}:{}),...(!person?{unavailable:true as const}:{})}];
    }));
  };
}
