import type { SceneEntity } from "./types";
import { isWholeStoryFactStatement, storyReplyProse, type StoryFact } from "./story-update";
import type { StoryRevision } from "./story-records";
import type { MergeSeeds } from "./story-character-merge";
import { createStoryRoleReaderV1, createStoryRoleReaderV2, dativeRecipientNames, type SourcePerson, type StorySourceRoles } from "./story-source-roles";
import { retrievalNames, isPersonalStoryReference } from "./story-retrieval-query";
import { storyFactIdentity } from "./story-memory-lifecycle";
import { normalizeText } from "./text";
import { storyEventSourceV3, validStoryEventObject, type StoryEventSourceLinks } from "./story-event-source";

export interface RolePerson { id: string; name: string; aliases: string[] }
export type StoryRoleBinding = { sourceRevisionId: string; quote: string; roles: StorySourceRoles } & (
  { version: 1 | 2; eventLinks?: never } | { version: 3; eventLinks: StoryEventSourceLinks }
);
export interface FactRoleSeed { key: string; binding: StoryRoleBinding }
const roles = ["speaker", "recipient", "promisor", "planner", "believer"] as const;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === "string" && !!v && v === v.trim() && v.length <= 160 && !["__proto__", "constructor", "prototype"].includes(v);
const name = (v: unknown): v is string => typeof v === "string" && !!v.trim();
export const validRoleRoster = (v: unknown): v is RolePerson[] => Array.isArray(v) && v.every(p => object(p) && Object.keys(p).length === 3 && id(p.id) && name(p.name) && Array.isArray(p.aliases) && p.aliases.every(name)) && new Set(v.map(p=>p.id)).size === v.length;
const validSourcePerson = (p: unknown): p is Pick<SourcePerson, "id" | "name"> => object(p) && Object.keys(p).length === 2 && id(p.id) && name(p.name);
const validEventLinks = (v: unknown): v is StoryEventSourceLinks => object(v)
  && Object.keys(v).every(key => key === "subjects" || key === "object")
  && Array.isArray(v.subjects) && v.subjects.length > 0 && v.subjects.length <= 8 && v.subjects.every(validSourcePerson)
  && new Set(v.subjects.map(person => person.id)).size === v.subjects.length
  && (!Object.hasOwn(v, "object") || typeof v.object === "string" && validStoryEventObject(v.object));
export const validRoleBinding = (v: unknown): v is StoryRoleBinding => object(v)
  && (v.version === 3 ? Object.keys(v).length === 5 && validEventLinks(v.eventLinks) : (v.version === 1 || v.version === 2) && Object.keys(v).length === 4 && !Object.hasOwn(v, "eventLinks"))
  && id(v.sourceRevisionId) && typeof v.quote === "string" && !!v.quote.trim() && v.quote.length <= 2400
  && object(v.roles) && Object.entries(v.roles).every(([k,p]) => roles.includes(k as typeof roles[number]) && validSourcePerson(p));
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
  const selected = roleEntities(roster, worldId).filter(person => [...retrievalNames(person), ...dativeRecipientNames(person)]
    .some(value => !isPersonalStoryReference(value) && text.includes(" " + value + " ")));
  return selected.map(({ id, name, aliases }) => ({ id, name, aliases: [...aliases] }));
}
export function bindStoryRoles(fact: StoryFact, source: StoryRevision, version?: StoryRoleBinding["version"]): StoryRoleBinding {
  const worldId = source.worldId ?? "";
  const scope = { worldId, entities: roleEntities(source.roleRoster ?? [], worldId) };
  const old = version === 2 || version === 3 ? undefined : createStoryRoleReaderV1(scope).read(fact);
  const current = version === 1 ? undefined : createStoryRoleReaderV2(scope).read(fact);
  const candidate = version === undefined || version === 3 ? storyEventSourceV3(fact.quote, scope.entities) : undefined;
  if (candidate && source.role === "assistant" && source.completion === "complete" && source.storyPurpose !== "out-of-character" && isWholeStoryFactStatement(fact.quote, source.content)) {
    const prose = storyReplyProse(source.content);
    const leading = prose.slice(0, prose.indexOf(fact.quote));
    if (!/[«“‘"'][ \t]*$/u.test(leading)) {
      return { version: 3, sourceRevisionId: source.id, quote: fact.quote, roles: current ?? {}, eventLinks: candidate };
    }
  }
  const useV2 = version === 2 || version === undefined && current?.recipient?.id !== old?.recipient?.id;
  return { version: useV2 ? 2 : 1, sourceRevisionId: source.id, quote: fact.quote, roles: (useV2 ? current : old) ?? {} };
}
export const roleSeed = (fact: StoryFact, binding: StoryRoleBinding): FactRoleSeed => ({key:storyFactIdentity(fact),binding:structuredClone(binding)});
export function selectedRoleSeeds(facts: StoryFact[], candidates: FactRoleSeed[]) {
  const last = new Map(candidates.map(s=>[s.key,s]));
  return facts.flatMap(f=>{const s=last.get(storyFactIdentity(f));return s?.binding.quote===f.quote?[structuredClone(s)]:[];});
}
/** Historical IDs never re-resolve through names. Only explicit selected merges
 * may map them forward; cycles/conflicts keep the original historical identity. */
export function createStoredStoryPersonReader(entities: readonly SceneEntity[], worldId: string, merges: MergeSeeds = {}) {
  const people = new Map(entities.filter(p=>p.worldId===worldId && p.kind==="character").map(p=>[p.id,{id:p.id,name:p.name}]));
  const forward = new Map<string, Set<string>>();
  for (const m of Object.values(merges)) for (const source of m.sourceIds) { const targets=forward.get(source)??new Set<string>();targets.add(m.mergedId);forward.set(source,targets); }
  const target = (original: string) => { let current=original;const seen=new Set<string>();while(forward.has(current)){if(seen.has(current)||forward.get(current)!.size!==1)return original;seen.add(current);current=[...forward.get(current)!][0]!;}return current; };
  return (p: Pick<SourcePerson, "id" | "name">): SourcePerson => {
    const resolved=target(p.id),person=people.get(resolved);
    return {id:person?.id??p.id,name:person?.name??p.name,...(person?.name!==p.name?{sourceName:p.name}:{}),...(person&&person.id!==p.id?{sourceId:p.id}:{}),...(!person?{unavailable:true as const}:{})};
  };
}
export function storedRoleReader(seeds: FactRoleSeed[], entities: SceneEntity[], worldId: string, merges: MergeSeeds = {}, strict = false) {
  const index = new Map(structuredClone(seeds).map(s=>[s.key,s.binding]));
  const resolve = createStoredStoryPersonReader(entities, worldId, merges);
  return (fact: StoryFact): StorySourceRoles | null | undefined => {
    const binding=index.get(storyFactIdentity(fact));if(!binding)return strict?null:undefined;
    if(binding.quote!==fact.quote)return null;
    if(!Object.keys(binding.roles).length)return null;
    return Object.fromEntries(Object.entries(binding.roles).map(([role,p])=>[role,resolve(p)]));
  };
}
