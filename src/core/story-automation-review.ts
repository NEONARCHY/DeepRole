import type { ProfileField, ProfileValues } from "./character-profile";
import { PROFILE_FIELDS } from "./character-profile";
import type { AutomationReason } from "./story-automation";
import { validNativeStoryId } from "./story-transport";
import { validStoryReviewGuard, type StoryReviewGuard } from "./story-review";
export interface AutomationReviewScope { chatId: string; worldId: string }
export interface AutomationReviewRead extends AutomationReviewScope { query: string }
export interface AutomationReviewPage extends AutomationReviewScope {
  guard: StoryReviewGuard; gameRevision: string; ready: boolean; total: number;
  people: { id: string; name: string }[];
  items: { id: string; type: "fact" | "person" | "profile"; name: string; text: string; quote: string; reason: AutomationReason; fields: Partial<ProfileValues>; conflicts?: {key:string;text:string;quote:string}[] }[];
}
export interface AutomationReviewDecision extends AutomationReviewScope {
  guard: StoryReviewGuard; gameRevision: string; eventId: string; accept: boolean;
  fields: ProfileField[]; entityId: string | null; name: string;
  replaceKeys?: string[];
}
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === "string" && !!v.trim() && v === v.trim() && v.length <= 160 && !["__proto__", "prototype", "constructor"].includes(v);
export const validAutomationReviewRead = (v: unknown): v is AutomationReviewRead => obj(v) && Object.keys(v).length === 3 && validNativeStoryId(v.chatId) && id(v.worldId) && typeof v.query === "string" && v.query.length <= 80;
export const validAutomationReviewDecision = (v: unknown): v is AutomationReviewDecision => obj(v) && Object.keys(v).length === (v.replaceKeys === undefined ? 9 : 10) && (v.replaceKeys === undefined || Array.isArray(v.replaceKeys) && v.replaceKeys.length <= 8 && new Set(v.replaceKeys).size === v.replaceKeys.length && v.replaceKeys.every(k => typeof k === "string" && !!k && k.length <= 6000)) && validNativeStoryId(v.chatId) && id(v.worldId) && validStoryReviewGuard(v.guard) && id(v.gameRevision) && id(v.eventId) && typeof v.accept === "boolean" && Array.isArray(v.fields) && v.fields.length <= 4 && new Set(v.fields).size === v.fields.length && v.fields.every(k => PROFILE_FIELDS.includes(k)) && (v.entityId === null || id(v.entityId)) && typeof v.name === "string" && v.name.length <= 80;
export const validAutomationReviewPage = (v: unknown): v is AutomationReviewPage => obj(v) && Object.keys(v).length === 8 && validNativeStoryId(v.chatId) && id(v.worldId) && validStoryReviewGuard(v.guard) && id(v.gameRevision) && typeof v.ready === "boolean" && Number.isSafeInteger(v.total) && (v.total as number) >= 0 && Array.isArray(v.people) && v.people.length <= 40 && v.people.every(p => obj(p) && Object.keys(p).length === 2 && id(p.id) && typeof p.name === "string" && p.name.length <= 80) && Array.isArray(v.items) && v.items.length <= 8 && v.items.every(p => obj(p) && Object.keys(p).length === (p.conflicts === undefined ? 7 : 8) && (p.conflicts === undefined || Array.isArray(p.conflicts) && p.conflicts.length <= 8 && p.conflicts.every(c => obj(c) && Object.keys(c).length === 3 && typeof c.key === "string" && c.key.length <= 6000 && typeof c.text === "string" && c.text.length <= 1200 && typeof c.quote === "string" && c.quote.length <= 2400)) && id(p.id) && ["fact", "person", "profile"].includes(String(p.type)) && typeof p.name === "string" && p.name.length <= 80 && typeof p.text === "string" && p.text.length <= 1200 && typeof p.quote === "string" && p.quote.length <= 2400 && ["new", "manual", "duplicate", "uncertain", "conflict", "protected", "unverified", "limit", "identity"].includes(String(p.reason)) && obj(p.fields) && Object.entries(p.fields).every(([k,t]) => PROFILE_FIELDS.includes(k as ProfileField) && typeof t === "string" && t.length <= 1200));
