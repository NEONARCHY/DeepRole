import type { SceneEntity } from "./types";
import { characterInChat } from "./characters";
import type { StoryEvent, StoryRecord } from "./story-records";
import { sameStoryValue } from "./story-value";
import { identityDecisions, identityKey } from "./story-identity-management";
import { mergedStoryEntities, storyMerges, mergeCanonicalMatches, type MergeSeeds } from "./story-character-merge";

export interface IdentityCanonical { name: string; aliases: string[] }
export interface StoryCharacterIdentity { entityId: string; alias: string; canonical: IdentityCanonical }
export interface IdentitySeed { canonical: IdentityCanonical; aliases: string[]; disabledAliases?: string[] }
export type IdentitySeeds = Record<string, IdentitySeed>;
export interface IdentityLookup { eventId: string; query: string; offset: number }
export interface IdentitySelection { entityId: string; updatedAt: number }
export interface IdentityOptions extends IdentityLookup { total: number; next: number | null; people: { id: string; name: string; summary: string; updatedAt: number }[] }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, k: string[]) => Object.keys(v).length === k.length && k.every(n => Object.hasOwn(v, n));
const id = (v: unknown): v is string => typeof v === "string" && !!v && v === v.trim() && v.length <= 160 && !["__proto__", "constructor", "prototype"].includes(v);
const name = (v: unknown): v is string => typeof v === "string" && !!v.trim() && v === v.trim() && v.length <= 80;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(n => typeof n === "string" && !!n);
const num = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
export const validIdentityLookup = (v: unknown): v is IdentityLookup => object(v) && keys(v, ["eventId", "query", "offset"]) && id(v.eventId) && typeof v.query === "string" && v.query.length <= 80 && num(v.offset);
export const validIdentitySelection = (v: unknown): v is IdentitySelection => object(v) && keys(v, ["entityId", "updatedAt"]) && id(v.entityId) && num(v.updatedAt);
export function validIdentityOptions(v: unknown): v is IdentityOptions {
 if (!object(v) || !keys(v, ["eventId", "query", "offset", "total", "next", "people"]) || !validIdentityLookup({ eventId: v.eventId, query: v.query, offset: v.offset }) || !num(v.total) || !num(v.offset) || !Array.isArray(v.people) || v.people.length > 40 || !v.people.every(p => object(p) && keys(p, ["id", "name", "summary", "updatedAt"]) && id(p.id) && name(p.name) && typeof p.summary === "string" && p.summary.length <= 240 && num(p.updatedAt))) return false;
 return new Set(v.people.map(p => p.id)).size === v.people.length && v.offset + v.people.length <= v.total && (v.next === null ? v.offset + v.people.length === v.total : num(v.next) && v.next === v.offset + v.people.length && v.next < v.total);
}
export const identityName = (v: string) => v.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase();
export const identityCanonical = (p: Pick<SceneEntity, "name" | "aliases">): IdentityCanonical => ({ name: p.name, aliases: [...p.aliases] });
export const validIdentityCanonical = (v: unknown): v is IdentityCanonical => object(v) && keys(v, ["name", "aliases"]) && typeof v.name === "string" && !!v.name.trim() && strings(v.aliases);
export const validStoryCharacterIdentity = (v: unknown): v is StoryCharacterIdentity => object(v) && keys(v, ["entityId", "alias", "canonical"]) && id(v.entityId) && name(v.alias) && validIdentityCanonical(v.canonical);
export const validIdentitySeeds = (v: unknown): v is IdentitySeeds => object(v) && Object.entries(v).every(([key, seed]) => id(key) && object(seed) && Object.keys(seed).every(k => ["canonical", "aliases", "disabledAliases"].includes(k)) && validIdentityCanonical(seed.canonical) && strings(seed.aliases) && seed.aliases.every(name) && (seed.disabledAliases === undefined || strings(seed.disabledAliases) && seed.disabledAliases.every(n => (seed.aliases as string[]).includes(n))));
export function identityOwners(people: Pick<SceneEntity, "id" | "name" | "aliases">[], reference: string) {
 const key = identityName(reference); return people.filter(p => [p.name, ...p.aliases].some(n => identityName(n) === key));
}
/** An ambiguous short name is never a retrieval key for another person's facts. */
export const uniqueIdentityReferences = (people: Pick<SceneEntity, "id" | "name" | "aliases">[], references: string[], entityId?: string) => [...new Set(references)].filter(n => { const owners = identityOwners(people, n); return entityId ? owners.every(p => p.id === entityId) : owners.length === 0; });
/** User-approved names are selected-story overlays; raw world profiles stay unchanged. */
export function storyIdentityEntities(entities: SceneEntity[], records: StoryRecord[], applied: string[], worldId: string, chatId: string, seeds: IdentitySeeds = {}, mergeSeeds: MergeSeeds = {}): SceneEntity[] {
 const decisions = identityDecisions(records, applied);
 const merges = storyMerges(records, applied, mergeSeeds);
 const remaining = mergedStoryEntities(entities, records, applied, worldId, chatId, mergeSeeds);
 entities = remaining.map(p => {
  const merge = merges.find(m => m.merge.mergedId === p.id)?.merge;
   if (!merge || !characterInChat(p, chatId) || !mergeCanonicalMatches(p, merge)) return p;
   const aliases = p.aliases.filter(n => decisions.get(identityKey(p.id, n)) !== false && (decisions.get(identityKey(p.id, n)) === true || !merge.disabledAliases?.includes(n)) && identityOwners(remaining.filter(e => e.worldId === worldId && characterInChat(e, chatId)), n).every(e => e.id === p.id));
  return aliases.length === p.aliases.length ? p : { ...p, aliases };
 });
 const events = new Map(records.filter((e): e is StoryEvent => e.type === "event" && !!e.characterIdentity && e.worldId === worldId).map(e => [e.id, e]));
 const updates = new Map<string, StoryCharacterIdentity[]>();
 for (const id of applied) { const link = events.get(id)?.characterIdentity; if (link) { if (!updates.has(link.entityId)) updates.set(link.entityId, []); updates.get(link.entityId)!.push(link); } }
 if (!updates.size && !Object.keys(seeds).length) return entities;
  const local = entities.filter(p => p.kind === "character" && p.worldId === worldId && characterInChat(p, chatId));
 const localSet = new Set(local);
  const linksFor = (p: SceneEntity) => { const seed = seeds[p.id]; return [...(seed ? seed.aliases.filter(n => decisions.get(identityKey(p.id, n)) === true || !seed.disabledAliases?.includes(n)).map(alias => ({ alias, canonical: seed.canonical })) : []), ...updates.get(p.id) ?? []].filter(link => decisions.get(identityKey(p.id, link.alias)) !== false && sameStoryValue(identityCanonical(p), link.canonical)); };
 const claims = new Map<string, Set<string>>();
 for (const p of local) for (const n of [p.name, ...p.aliases, ...linksFor(p).map(link => link.alias)]) { const key = identityName(n); if (!claims.has(key)) claims.set(key, new Set()); claims.get(key)!.add(p.id); }
 return entities.map(p => {
  if (!localSet.has(p)) return p;
  const aliases = [...p.aliases];
  for (const link of linksFor(p)) if (identityName(p.name) !== identityName(link.alias) && !aliases.some(n => identityName(n) === identityName(link.alias)) && claims.get(identityName(link.alias))?.size === 1) aliases.push(link.alias);
  return aliases.length === p.aliases.length ? p : { ...p, aliases };
 });
}
