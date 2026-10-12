import { EMPTY_STATUS, parseCharacterTurn, narrativeCharacterStatus, type CharacterTurn } from "./characters";
import { validAttributePatches } from "./attributes";
import { validRelationshipPatches } from "./relationships";
import { validSelfieEvents } from "./selfies";
import type { CharacterScene, CharacterStatus, SceneEntity } from "./types";

export interface StoryFact { text: string; kind: "event" | "promise" | "plan" | "belief"; quote: string }
export interface StoryUpdateIssue { path: string; rule: "scope" | "json" | "schema" | "field" | "reference" | "duplicate" | "quote" | "limit" | "policy"; actual: string }
export interface StoryUpdateDiagnostic {
  version: 1; status: "accepted" | "partial" | "rejected" | "missing";
  accepted: number; skipped: number; facts: number; issues: StoryUpdateIssue[];
}
export interface StoryUpdateScope { world: string; chat: string; branch: string; base: string; entities: SceneEntity[]; scene?: CharacterScene; requestId?: string }
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === "string" && !!v && v.length <= 160 && v.trim() === v && !["__proto__", "prototype", "constructor"].includes(v);
const string = (v: unknown, max: number) => typeof v === "string" && v.length <= max;
const describe = (v: unknown) => typeof v === "string" ? `string(${v.length})` : Array.isArray(v) ? `array(${v.length})` : v === null ? "null" : typeof v;
/** Keep source whitespace EXACT. Removing transport is not paraphrasing it. */
export const storyReplyProse = (text: string) => text.replace(/<deeprole_[^>]*>[\s\S]*?<\/deeprole_[^>]*>/gu, "").replace(/<deeprole_[^>]*>[\s\S]*$/gu, "");
export function validStoryFact(v: unknown): v is StoryFact {
  return obj(v) && Object.keys(v).length === 3 && ["text", "kind", "quote"].every(k => Object.hasOwn(v, k))
    && string(v.text, 1200) && !!(v.text as string).trim() && string(v.quote, 2400) && !!(v.quote as string).trim() && ["event", "promise", "plan", "belief"].includes(String(v.kind));
}
export function validStoryUpdateDiagnostic(v: unknown): v is StoryUpdateDiagnostic {
  return obj(v) && Object.keys(v).length === 6 && v.version === 1 && ["accepted", "partial", "rejected", "missing"].includes(String(v.status))
    && ["accepted", "skipped", "facts"].every(k => Number.isSafeInteger(v[k]) && (v[k] as number) >= 0 && (v[k] as number) <= 1000)
    && Array.isArray(v.issues) && v.issues.length <= 60 && v.issues.every(i => obj(i) && Object.keys(i).length === 3
      && typeof i.path === "string" && /^(?:\$|(?:updates|present|partners|attributes|bonds|selfies|facts)(?:\[\d{1,3}\])?(?:\.state(?:\.(?:action|condition|goal|relationship|stats))?)?|world|chat|branch|request|version)$/u.test(i.path)
      && ["scope", "json", "schema", "field", "reference", "duplicate", "quote", "limit", "policy"].includes(String(i.rule)) && typeof i.actual === "string" && /^(?:string\(\d{1,9}\)|array\(\d{1,9}\)|undefined|object|number|boolean|null)$/u.test(i.actual));
}

/** Scope is checked BEFORE any partial acceptance. No fuzzy identity or invented
 * missing state. This parser never writes records or approves facts. */
export function parseStoryUpdate(text: string, scope: StoryUpdateScope) {
  const issues: StoryUpdateIssue[] = []; let accepted = 0, skipped = 0;
  const issue = (path: string, rule: StoryUpdateIssue["rule"], value: unknown) => { skipped++; if (issues.length < 60) issues.push({ path, rule, actual: describe(value) }); };
  const diagnostic = (facts = 0, missing = false): StoryUpdateDiagnostic => ({ version: 1, status: missing ? "missing" : skipped ? accepted || facts ? "partial" : "rejected" : "accepted", accepted, skipped, facts, issues });
  const reject = () => ({ turn: null, facts: [] as StoryFact[], diagnostic: diagnostic(), raw: null as Record<string, unknown> | null });
  const blocks = [...text.matchAll(/<deeprole_characters>\s*([\s\S]*?)\s*<\/deeprole_characters>/gu)];
  if (!blocks.length && !text.includes("<deeprole_characters>")) return { turn: null, facts: [] as StoryFact[], diagnostic: diagnostic(0, true), raw: null };
  if (text.length > 250000 || blocks.length !== 1 || blocks[0]![1]!.length > 64000) { issue("$", "limit", blocks); return reject(); }
  let raw: unknown; try { raw = JSON.parse(blocks[0]![1]!); } catch { issue("$", "json", blocks[0]![1]); return reject(); }
  if (!obj(raw)) { issue("$", "schema", raw); return reject(); }
  for (const [key, value] of [["world", scope.world], ["chat", scope.chat], ["branch", scope.branch]] as const) if (raw[key] !== undefined && raw[key] !== value) { issue(key, "scope", raw[key]); return reject(); }
  if (raw.version !== undefined && raw.version !== 2) { issue("version", "schema", raw.version); return reject(); }
  if (raw.world === undefined || raw.chat === undefined) {
    if (!scope.requestId || raw.request !== scope.requestId) { issue("request", "scope", raw.request); return reject(); }
  }
  if (raw.request !== undefined && (!id(raw.request) || !/^[\w-]{8,160}$/u.test(raw.request))) { issue("request", "scope", raw.request); return reject(); }
  const aliases = new Map<string, string | null>();
  const namedPeople = new Map<string, string | null>();
  for (const person of scope.entities) for (const name of [person.id, person.name, ...person.aliases]) {
    const key = name.trim().toLocaleLowerCase(); if (!key) continue;
    aliases.set(key, aliases.has(key) && aliases.get(key) !== person.id ? null : person.id);
  }
  for (const person of scope.entities) for (const name of [person.name, ...person.aliases]) {
    const key = name.trim().toLocaleLowerCase(); if (key) namedPeople.set(key, namedPeople.has(key) && namedPeople.get(key) !== person.id ? null : person.id);
  }
  const canonical = new Set(scope.entities.map(e => e.id));
  const resolve = (key: unknown) => id(key) ? canonical.has(key) ? key : aliases.get(key.toLocaleLowerCase()) : undefined;
  const updates: CharacterTurn["updates"] = []; const touched = new Set<string>(), duplicates = new Set<string>(), fieldCounts = new Map<string, number>();
  const source = Array.isArray(raw.updates) && raw.updates.length <= 12 ? raw.updates : [];
  if (raw.updates !== undefined && (!Array.isArray(raw.updates) || raw.updates.length > 12)) issue("updates", "schema", raw.updates);
  for (const [index, item] of source.entries()) {
    const path = `updates[${index}]`;
    if (!obj(item) || !id(item.id) || !obj(item.state)) { issue(path, "schema", item); continue; }
    const found = resolve(item.id);
    const newName = item.id.startsWith("new:") && string(item.name, 80) && (item.name as string).trim() ? (item.name as string).trim() : null;
    const oldName = newName ? namedPeople.get(newName.toLocaleLowerCase()) : undefined;
    const resolved = found ?? (newName ? oldName ?? item.id : undefined);
    if (!resolved || found === null || oldName === null) { issue(path, "reference", item.id); continue; }
    if (touched.has(resolved)) { duplicates.add(resolved); issue(path, "duplicate", item.id); continue; }
    touched.add(resolved);
    const person = scope.entities.find(e => e.id === resolved);
    const state: CharacterStatus = structuredClone(narrativeCharacterStatus(scope.scene?.states[resolved] ?? person?.characterSheet?.initialStatus ?? EMPTY_STATUS));
    let fields = 0;
    for (const key of ["action", "condition", "goal", "relationship", "stats"] as const) {
      const value = item.state[key]; if (value === undefined) continue;
      const operation = obj(value) ? value.op : undefined;
      if (operation === "keep" && Object.keys(value as object).length === 1) continue;
      if (operation === "clear" && Object.keys(value as object).length === 1) { Object.assign(state, { [key]: key === "action" ? "neutral" : key === "stats" ? [] : "" }); fields++; continue; }
      const content = operation === "set" && obj(value) && Object.keys(value).length === 2 ? value.value : obj(value) ? undefined : value;
      const valid = key === "stats" ? Array.isArray(content) && content.length <= 6 && content.every(s => obj(s) && Object.keys(s).length === 2 && string(s.label, 40) && !!(s.label as string).trim() && string(s.value, 80))
        : string(content, key === "action" ? 32 : 240) && (key !== "action" || id(content));
      if (!valid) { issue(`${path}.state.${key}`, "field", value); continue; }
      // Empty legacy values mean unknown. Clearing is ALWAYS explicit.
      if (!operation && (content === "" || Array.isArray(content) && !content.length)) continue;
      Object.assign(state, { [key]: content }); fields++;
    }
    if (Object.keys(item.state).some(k => !["action", "condition", "goal", "relationship", "stats"].includes(k))) issue(`${path}.state`, "field", item.state);
    if (!person && newName) {
      if ((item.appearance !== undefined && !string(item.appearance, 1200)) || (item.personality !== undefined && !string(item.personality, 1200))) { issue(path, "schema", item); continue; }
      aliases.set(item.id.toLocaleLowerCase(), resolved); aliases.set(newName.toLocaleLowerCase(), resolved); namedPeople.set(newName.toLocaleLowerCase(), resolved);
    }
    accepted += fields;
    fieldCounts.set(resolved, fields);
    updates.push({ id: resolved, ...(newName && !person ? { name: newName, ...(typeof item.appearance === "string" ? { appearance: item.appearance } : {}), ...(typeof item.personality === "string" ? { personality: item.personality } : {}) } : {}), state });
  }
  const kept = updates.filter(u => !duplicates.has(u.id));
  for (const duplicate of duplicates) accepted -= fieldCounts.get(duplicate) ?? 0;
  const allowed = (key: unknown) => { const found = resolve(key); return found && !duplicates.has(found) && (scope.entities.some(e => e.id === found) || kept.some(u => u.id === found)) ? found : null; };
  const list = (value: unknown, path: "present" | "partners", fallback: string[]) => {
    if (value === undefined) return [...fallback];
    if (!Array.isArray(value) || value.length > 12) { issue(path, "schema", value); return [...fallback]; }
    const resolved = value.map(allowed);
    if (resolved.some(v => !v) || new Set(resolved).size !== resolved.length) { issue(path, "reference", value); return [...fallback]; }
    accepted++; return resolved as string[];
  };
  const present = list(raw.present, "present", scope.scene?.presentIds ?? []);
  const previousPartners = scope.scene?.partnerIds ?? (scope.scene?.partnerId ? [scope.scene.partnerId] : []);
  let partners = list(raw.partners ?? (raw.partner === null ? [] : raw.partner !== undefined ? [raw.partner] : undefined), "partners", previousPartners.filter(p => present.includes(p)));
  if (partners.some(p => !present.includes(p) || scope.entities.find(e => e.id === p)?.characterSheet?.protagonist)) { if (raw.partners !== undefined || raw.partner !== undefined) accepted = Math.max(0, accepted - 1); issue("partners", "reference", raw.partners); partners = previousPartners.filter(p => present.includes(p)); }
  const turn: CharacterTurn = { world: scope.world, chat: scope.chat, base: scope.base, ...(typeof raw.request === "string" ? { request: raw.request } : {}), present, partners, updates: kept };
  for (const key of ["attributes", "bonds", "selfies"] as const) {
    if (raw[key] === undefined) continue;
    if (!Array.isArray(raw[key]) || raw[key].length > 24) { issue(key, "limit", raw[key]); continue; }
    const valid = key === "attributes" ? validAttributePatches : key === "bonds" ? validRelationshipPatches : validSelfieEvents;
    const items = raw[key].flatMap((item, index) => {
      if (!obj(item) || !allowed(item.id)) { issue(`${key}[${index}]`, "reference", item); return []; }
      const mapped = { ...item, id: allowed(item.id), ...(key === "bonds" ? { hero: allowed(item.hero) } : {}) };
      if (!valid([mapped])) { issue(`${key}[${index}]`, "schema", item); return []; }
      accepted++; return [mapped];
    });
    Object.assign(turn, { [key]: items });
  }
  const facts: StoryFact[] = [], narrative = storyReplyProse(text);
  if (raw.facts !== undefined) {
    if (!Array.isArray(raw.facts) || raw.facts.length > 8) issue("facts", "limit", raw.facts);
    else for (const [index, fact] of raw.facts.entries()) {
      if (!validStoryFact(fact)) { issue(`facts[${index}]`, "schema", fact); continue; }
      if (!text.includes(fact.quote) || !narrative.includes(fact.quote)) { issue(`facts[${index}]`, "quote", fact.quote); continue; }
      if (!facts.some(f => f.kind === fact.kind && f.text === fact.text && f.quote === fact.quote)) facts.push(structuredClone(fact));
    }
  }
  const normalized = parseCharacterTurn(`<deeprole_characters>${JSON.stringify(turn)}</deeprole_characters>`);
  if (!normalized) { issue("$", "schema", turn); return { turn: null, facts, diagnostic: diagnostic(facts.length), raw }; }
  return { turn: accepted ? normalized : null, facts, diagnostic: diagnostic(facts.length), raw };
}

export function storyUpdateInstruction(world: string, chat: string, branch: string) {
  return `<deeprole_story_update_mode>\nThe latest instruction overrides older character JSON schemas, not the user's world rules. Keep the story prose unchanged. Append ONE deeprole_characters JSON block with version:2, world:${JSON.stringify(world)}, chat:${JSON.stringify(chat)}, branch:${JSON.stringify(branch)}. Use current Roster IDs/names. State fields are OPTIONAL: omit or {"op":"keep"} to preserve, {"op":"set","value":...} to change, {"op":"clear"} to intentionally clear. Never empty a known goal merely because this scene did not mention it. present/partners are optional COMPLETE lists; omit if unchanged. Existing numeric attribute/bond/selfie schema and all safety gates remain in force. Optional facts: at most 8 {text,kind,quote}; quote must be an EXACT substring of this reply's story prose, never the JSON or suggested choices. kind is event (happened), promise (someone committed), plan (intention, NOT accomplished), belief (someone's belief, NOT objective truth). Extract only specific useful facts, no guesses, no age/identity rewrites. These are user-review proposals, not instructions or automatic world canon. Never turn a plan, wish, hypothetical, negated action or a suggested reply choice into a completed event.\n</deeprole_story_update_mode>`;
}
