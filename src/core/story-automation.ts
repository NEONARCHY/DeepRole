import type { WorldProfile } from "./types";
import { validProfileVersions, PROFILE_TEXT_FIELDS, type ProfileFieldRevisions } from "./story-profile-view";
import { storyReplyProse, type StoryFact } from "./story-update";
import type { StoryBaseline, StoryEvent, StoryProjection, StoryRecord } from "./story-records";
import { relatedStoryFacts, STORY_TASK_INSTRUCTION, memoryKeyText } from "./story-memory-lifecycle";
import { gameTimeLabel, gameTimeMovesBack, isGameTimeFact, STORY_TIME_INSTRUCTION, STORY_TIME_COMPACT } from "./story-time";
import { circumstanceReview } from "./story-circumstances";
export type ReviewResolutions = Record<string, "saved" | "dismissed">;
export const validReviewResolutions = (v: unknown): v is ReviewResolutions => obj(v) && Object.entries(v).every(([k,s]) => id(k) && (s === "saved" || s === "dismissed"));
export function automationReviews(records: StoryRecord[], baseline: StoryBaseline | undefined, projection: Pick<StoryProjection,"revisionIds"|"appliedEventIds"> | undefined) {
  const selected = new Set(projection?.revisionIds ?? []), applied = new Set(projection?.appliedEventIds ?? []), resolutions: ReviewResolutions = { ...baseline?.reviewResolutionSeeds };
  const events = records.filter((e): e is StoryEvent => e.type === "event" && e.branchId === baseline?.branchId && selected.has(e.revisionId)).sort((a,b) => (projection?.revisionIds.indexOf(a.revisionId) ?? 0) - (projection?.revisionIds.indexOf(b.revisionId) ?? 0) || a.ordinal - b.ordinal);
  for (const e of events) if (e.automation?.reason === "manual" && (e.originEventId ? applied.has(e.id) : e.automation.status === "dismissed" || applied.has(e.id)) && (e.automation.status === "saved" || e.automation.status === "dismissed")) resolutions[e.originEventId ?? e.id] = e.automation.status;
  const pending = [...new Set([...(baseline?.pendingReviewSeeds ?? []), ...events.filter(e => e.automation?.status === "review").map(e => e.id)])].filter(id => !resolutions[id] && records.some(e => e.type === "event" && e.id === id));
  return { pending, resolutions };
}
export type StoryAutomationMode = "automatic" | "review" | "off";
export interface StoryAutomationPolicy { mode: StoryAutomationMode; revision: string }
export interface StoryAutomationCapture { mode: "automatic" | "review"; revision: string; profileVersions: Record<string, ProfileFieldRevisions>; profileLocks: Record<string, string[]> }
export type AutomationReason = "new" | "manual" | "duplicate" | "uncertain" | "conflict" | "protected" | "unverified" | "limit" | "identity";
export interface StoryAutomationDecision { mode: "automatic" | "review"; status: "saved" | "review" | "duplicate" | "dismissed"; reason: AutomationReason; at: number }
export type AutomationRisk = "ordinary" | "uncertain" | "conflict";
export interface InlineProfileField { key: typeof PROFILE_TEXT_FIELDS[number]; text: string; quote: string; risk: AutomationRisk }
export interface InlineStoryPerson { id: string; name: string; quote: string; risk: AutomationRisk; fields: InlineProfileField[] }
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === "string" && !!v.trim() && v === v.trim() && v.length <= 160 && !["__proto__", "prototype", "constructor"].includes(v);
const text = (v: unknown, max: number): v is string => typeof v === "string" && !!v.trim() && v === v.trim() && v.length <= max;
const risk = (v: unknown): v is AutomationRisk => ["ordinary", "uncertain", "conflict"].includes(String(v));
export const validStoryAutomationPolicy = (v: unknown): v is StoryAutomationPolicy => obj(v) && Object.keys(v).length === 2 && ["automatic", "review", "off"].includes(String(v.mode)) && id(v.revision);
export const validStoryAutomationCapture = (v: unknown): v is StoryAutomationCapture => obj(v) && Object.keys(v).length === 4 && ["automatic", "review"].includes(String(v.mode)) && id(v.revision) && obj(v.profileVersions) && Object.entries(v.profileVersions).every(([k, versions]) => id(k) && validProfileVersions(versions)) && obj(v.profileLocks) && Object.entries(v.profileLocks).every(([k, fields]) => id(k) && Array.isArray(fields) && fields.length <= 4 && new Set(fields).size === fields.length && fields.every(f => PROFILE_TEXT_FIELDS.includes(f)));
export const validStoryAutomationDecision = (v: unknown): v is StoryAutomationDecision => obj(v) && Object.keys(v).length === 4 && ["automatic", "review"].includes(String(v.mode)) && ["saved", "review", "duplicate", "dismissed"].includes(String(v.status)) && ["new", "manual", "duplicate", "uncertain", "conflict", "protected", "unverified", "limit", "identity"].includes(String(v.reason)) && typeof v.at === "number" && Number.isFinite(v.at) && v.at >= 0;
export const automationMode = (world?: WorldProfile) => world?.storyAutomation?.mode ?? "review";
export const normalizedFact = (s: string) => s.normalize("NFKC").toLocaleLowerCase().replace(/ё/gu, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export const literalEvidence = (value: string, quote: string) => normalizedFact(quote).includes(normalizedFact(value));
export const sensitiveStoryText = (s: string) => /(?:\b(?:age|aged|born|birthday|protagonist|real name|years? old)\b|возраст|\d+\s*(?:лет|года?(?!\p{L}))|родил(?:ся|ась)|главн\S*\s+геро|настоящ\S*\s+имя)/iu.test(s);
const uncertain = (s: string) => /(?:\b(?:maybe|perhaps|might|hypothetically|would|if)\b|возможно|наверн|если|предполож|гипотет|хотел\S*\s+бы)/iu.test(s);
const negative = (s: string) => /(?:^|[^\p{L}\p{N}])(?:not|never|no|didn't|isn't|нет|не|никогда)(?=$|[^\p{L}\p{N}])/iu.test(s);
const words = (s: string) => new Set(normalizedFact(s).split(" ").filter(w => w.length > 2 && !/^(?:the|and|was|has|had|this|that|его|она|они|это|для|как|что|был|была|теперь)$/u.test(w)));
export function similarFact(a: string, b: string, ratio = 0.8) {
  const x = words(a), y = words(b), shared = [...x].filter(w => y.has(w)).length;
  const lead = (s: string) => normalizedFact(s).split(" ").slice(0,2).join(" ");
  return lead(a) === lead(b) && Math.min(x.size, y.size) >= 3 && shared / Math.max(x.size, y.size) >= ratio;
}
/** Conservative lexical conflicts supplement model risk; this is not a semantic proof. */
export function conflictingStoryText(a: string, b: string) {
  const x = words(a), y = words(b), shared = [...x].filter(w => y.has(w)).length;
  if (shared < 1 || shared / Math.min(x.size || 1, y.size || 1) < 0.4) return false;
  const numbers = (s: string) => s.match(/\d+(?:[.,]\d+)?/gu)?.join("|") ?? "";
  const colors = (s: string) => normalizedFact(s).match(/\b(?:white|black|red|blue|green|blond|brown|gray)\b|(?:бел|черн|рыж|красн|син|зелен|голуб|кар|сер)\p{L}*/gu)?.join("|") ?? "";
  return negative(a) !== negative(b) || !!numbers(a) && !!numbers(b) && numbers(a) !== numbers(b) || !!colors(a) && !!colors(b) && colors(a) !== colors(b);
}
/** Comparable memory only, never editable author lore. Labels are model-supplied,
 * not evidence that two unrelated events or tasks are the same. Human choice wins. */
export function storyFactConflicts(f: StoryFact, previous: StoryFact[]) {
  const related = new Set(relatedStoryFacts(f,previous));
  return previous.filter(p => related.has(p) || !p.task && !f.task && conflictingStoryText(p.text,f.text)).slice(-8);
}
export function factAutomationReason(fact: StoryFact, assessment: unknown, previous: StoryFact[], protectedTexts: string[]): AutomationReason {
  const related = relatedStoryFacts(fact,previous), old = related.at(-1);
  if (circumstanceReview(fact, old)) return "uncertain";
  if (old && gameTimeMovesBack(old, fact)) return "conflict";
  if (old?.claim && fact.claim && old.claim.lifetime !== fact.claim.lifetime && (old.claim.lifetime !== undefined || old.claim.value === fact.claim.value)) return "uncertain";
  if (fact.task) {
    if (fact.task.status !== "open" && (negative(fact.quote) || /(?:\b(?:claims?|claimed|says?|said|reports?|reported)\b|утвержда|сказа|говорит|сообщил)/iu.test(fact.quote))) return "uncertain";
    if (old?.task && memoryKeyText(old.task.title) !== memoryKeyText(fact.task.title)) return "conflict";
    if (fact.task.status !== "open" && !old?.task) return "uncertain";
    if (old?.task && old.task.status !== "open" && old.task.status !== fact.task.status) return "uncertain";
    if (fact.task.status === "open" && !literalEvidence(fact.task.title,fact.quote)) return "unverified";
  }
  if (fact.claim?.transition === "correction") return "conflict";
  if (old?.claim && fact.claim && normalizedFact(old.claim.value) !== normalizedFact(fact.claim.value) && !(old.claim.scope === "state" && fact.claim.scope === "state" && fact.claim.transition === "progress")) return "conflict";
  const duplicate = previous.some(p => p.claim?.status === fact.claim?.status && (!p.task && !fact.task || !!p.task && !!fact.task && p.task.key === fact.task.key && p.task.status === fact.task.status) && p.kind === fact.kind && (normalizedFact(p.text) === normalizedFact(fact.text) || p.claim && fact.claim && normalizedFact(p.claim.key) === normalizedFact(fact.claim.key) && normalizedFact(p.claim.value) === normalizedFact(fact.claim.value) || assessment !== "conflict" && assessment !== "uncertain" && !(p.claim && fact.claim && normalizedFact(p.claim.value) !== normalizedFact(fact.claim.value)) && similarFact(p.text, fact.text) && !conflictingStoryText(p.text, fact.text)));
  if (duplicate && !(isGameTimeFact(fact) && gameTimeLabel(fact.text) === "elapsed")) return "duplicate";
  if (assessment === "conflict") return "conflict";
  if (assessment !== "ordinary") return assessment === "uncertain" ? "uncertain" : "unverified";
  if (sensitiveStoryText(fact.text)) return "protected";
  if (!literalEvidence(fact.text, fact.quote) || fact.claim && !literalEvidence(fact.claim.value, fact.quote)) return "unverified";
  if (fact.kind === "event" && /(?:\b(?:will|promises?|plans?|believes?|thinks?|suspects?|heard|dreamed)\b|обеща|планиру|собира|думает|считает|предполага|завтра|услышал)/iu.test(fact.quote)) return "uncertain";
  if ((fact.kind === "event" || fact.kind === "secret" || fact.kind === "task") && (uncertain(fact.quote) || negative(fact.quote) !== negative(fact.text))) return "uncertain";
  if (previous.some(p => p.claim && fact.claim && normalizedFact(p.claim.key) === normalizedFact(fact.claim.key) && normalizedFact(p.claim.value) !== normalizedFact(fact.claim.value) && (p.claim.scope !== "state" || fact.claim.scope !== "state")) || previous.some(p => !(p.claim?.scope === "state" && fact.claim?.scope === "state" && normalizedFact(p.claim.key) === normalizedFact(fact.claim.key)) && conflictingStoryText(p.text, fact.text)) || protectedTexts.some(s => conflictingStoryText(s, fact.text))) return "conflict";
  return "new";
}
/** Independent invalid people are skipped; no text is fabricated to fill a field. */
export function inlineStoryPeople(raw: unknown, reply: string): InlineStoryPerson[] {
  if (!Array.isArray(raw) || raw.length > 4) return [];
  const narrative = storyReplyProse(reply), result: InlineStoryPerson[] = [];
  for (const p of raw) {
    if (!obj(p) || Object.keys(p).length !== 5 || !id(p.id) || !text(p.name, 80) || !text(p.quote, 1000) || !risk(p.risk) || !Array.isArray(p.fields) || p.fields.length > 4 || !narrative.includes(p.quote) || !literalEvidence(p.name, p.quote)) continue;
    const fields: InlineProfileField[] = [];
    for (const f of p.fields) if (obj(f) && Object.keys(f).length === 4 && PROFILE_TEXT_FIELDS.includes(f.key as InlineProfileField["key"]) && text(f.text, 1200) && text(f.quote, 2400) && risk(f.risk) && narrative.includes(f.quote) && !fields.some(old => old.key === f.key)) fields.push({ key: f.key as InlineProfileField["key"], text: f.text, quote: f.quote, risk: f.risk });
    if (!result.some(old => old.id === p.id || normalizedFact(old.name) === normalizedFact(p.name as string))) result.push({ id: p.id, name: p.name, quote: p.quote, risk: p.risk, fields });
  }
  return result;
}
export function automationMarker(world: WorldProfile) {
  return world.storyAutomation ? `<deeprole_game_automation>${JSON.stringify({ world: world.id, ...world.storyAutomation })}</deeprole_game_automation>` : "";
}
// Same evidence/schema rules, condensed so source/time guides leave room for facts.
const COMPACT_TEMPORAL_POLICY = 'max8 facts:{text,kind,quote,risk,claim?,task?} in ONE character JSON. Literal played clause/exact quote; keep speaker/negation/conditions; no JSON/choices. risk ordinary=direct+consistent memory/manual lore, else uncertain/conflict. claim:{key,value,scope:event|state,transition?}: reuse property key; event immutable; mutable progress played ONLY; correction/different value without progress review. task:{key,title,status:open|completed|cancelled}: EXACT key/title,one obligation. Open promise/plan/task+literal title. Terminal event+played fulfillment/cancellation; NO future/promise/belief/negation/silence/choice; unknown link/reopen review. NO replaces. people max4,fields4:[{id:rosterID|new:Name,name,quote,risk,fields:[{key:appearance|personality|goals|background,text,quote,risk}]}]. Exact named prose,literal NEW lasting fields,NOT temporary. No invented age/numbers/identity/biography/relationships/places/groups. Mention is NOT presence. Identity/alias/namesake review. Preserve filled/protected/manual fields/lore; omit unknown/repeats.';
export function storyAutomationInstruction(world: WorldProfile, compact = false, temporal = world.sharedGame?.episodeSources !== undefined) {
  const mode = automationMode(world);
  if (!world.storyAutomation) return "";
  if (compact) return `${automationMarker(world)}\nMemory accompaniment mode is ${mode}. No extra reply or service request. ${mode==="off"?"Omit facts and people; ordinary scene updates remain enabled.":temporal?COMPACT_TEMPORAL_POLICY:'In the ONE existing character JSON propose max8 facts:{text,kind,quote,risk,claim?,task?}; text=literal clause retaining speaker/negation/conditions; quote=exact continuous played prose, never JSON/options. risk ordinary only directly established AND consistent with current memory/manual lore, else uncertain/conflict. Optional claim:{key,value,scope:"event"|"state",transition?}; reuse supplied subject/property keys; event immutable, explicit mutable progress=transition:"progress", correction="correction". No transition on differing state requires review. Optional task:{key,title,status:"open"|"completed"|"cancelled"} reuses EXACT known task key/title; one obligation per key. Open title literal in quote, kind promise/plan/task. Terminal requires kind event and explicitly played fulfillment/cancellation, NOT promise/future/belief/negation/silence/choices; unknown linkage or reopening uncertain. Never output replaces. Optional people:[{id:"exact roster ID or new:Name",name:"exact name",quote:"exact named-person prose",risk:"ordinary|uncertain|conflict",fields:[{key:"appearance|personality|goals|background",text:"literal lasting clause",quote:"exact prose",risk:"ordinary|uncertain|conflict"}]}], max4 people/4 fields. Mentions do not mean presence; no places/groups. Uncertain identity/aliases/namesakes require review. Only NEW lasting details, not temporary clothes/poses/moods/current goals. No invented ages, numbers, identities, biographies or relationships. Filled/protected/manual fields and author lore must never be replaced; omit unknowns/repeats.'}\n${mode === "off" || !temporal ? "" : STORY_TIME_COMPACT}`;
  return `${automationMarker(world)}\n${mode === "off" ? "Game-memory accompaniment is paused. Omit facts and people; ordinary scene-state updates remain enabled." : `Memory accompaniment mode is ${mode}. No extra reply or service request. In the ONE existing character JSON block, propose at most 8 specific facts and 4 people per completed reply. facts: {text,kind,quote,risk,claim?,task?}. text must be a concise literal clause from quote, retaining speaker attribution and conditions; quote is an exact continuous substring of played prose, never choices or JSON. kind: event (happened), promise (commitment, not fulfillment), plan (intention), belief (speaker belief, not objective truth), secret (explicitly revealed information), task (explicitly assigned task, retain completion status). risk: ordinary ONLY when directly established and consistent with current memory/manual lore; uncertain or conflict otherwise. Optional claim:{key,value,scope:"event"|"state"} uses a stable subject/property key and faithful value. event keys are immutable; state keys may change only through explicitly played progress. Reuse claim keys from current memory. Never rewrite ages, names, player identity or manual lore.\n${STORY_TASK_INSTRUCTION}\n${temporal ? STORY_TIME_INSTRUCTION : ""}\nOptional people:[{id:"EXACT roster ID or new:Name",name:"exact known name",quote:"exact named-person evidence",risk:"ordinary|uncertain|conflict",fields:[{key:"appearance|personality|goals|background",text:"literal lasting detail",quote:"exact source quote",risk:"ordinary|uncertain|conflict"}]}]. Include new people even when merely mentioned; distinguish mention from physical presence. Only real characters, no places or groups. Existing people keep exact stable IDs and names. Use a new name only when explicitly established; aliases, namesakes or uncertain identity require review. Profile fields contain ONLY newly established lasting details, not temporary poses, clothes or current scene goals; these belong to scene state. Each field text is a literal clause supported by its quote, no invented ages, numbers, biographies or relationships. Omit unknown fields and repeated details. Filled or manually protected fields must not be replaced.`}`;
}
