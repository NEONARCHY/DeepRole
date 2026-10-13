import type { StoryFact } from "./story-update";

export interface StoryTask { key: string; title: string; status: "open" | "completed" | "cancelled" }
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number): v is string => typeof v === "string" && !!v.trim() && v === v.trim() && v.length <= max;
export const validStoryTask = (v: unknown): v is StoryTask => obj(v) && Object.keys(v).length === 3 && text(v.key,160) && !["__proto__","prototype","constructor"].includes(v.key) && text(v.title,320) && ["open","completed","cancelled"].includes(String(v.status));
export const memoryKeyText = (v: string) => v.normalize("NFKC").toLocaleLowerCase().replace(/ё/gu,"е").replace(/[^\p{L}\p{N}]+/gu," ").trim();
/** Exact data identity, not a hash or fuzzy matching. Used only by human resolutions. */
export const storyFactIdentity = (f: StoryFact) => JSON.stringify([f.kind,f.text,f.claim?.key ?? "",f.claim?.value ?? "",f.claim?.scope ?? "",f.claim?.transition ?? "",f.task?.key ?? "",f.task?.title ?? "",f.task?.status ?? "",...(f.claim?.lifetime ? [f.claim.lifetime] : []),...(f.claim?.status ? [f.claim.status] : [])]);
export const storyFactSlot = (f: StoryFact) => f.task ? "task:"+f.task.key : f.claim ? "claim:"+memoryKeyText(f.claim.key) : storyFactIdentity(f);
export function relatedStoryFacts(f: StoryFact, previous: StoryFact[]) {
  return previous.filter(p => f.task && p.task ? f.task.key === p.task.key : f.claim && p.claim ? memoryKeyText(f.claim.key) === memoryKeyText(p.claim.key) : false);
}
export const STORY_TASK_INSTRUCTION = 'Optional task:{key,title,status:"open"|"completed"|"cancelled"} links ONE explicit obligation, promise or plan to its later fulfillment/cancellation. Reuse its EXACT supplied key and title; separate obligations use separate keys even for the same person. New open titles are literal clauses of their quote; open kind is promise/plan/task. Terminal status requires kind:event and an explicitly played fulfillment/cancellation, NEVER an intention, future promise, silence, a missed mention, belief, hypothetical or suggested choice. Do not create a terminal task without a known open task; mark ambiguous linkage uncertain. Reopening a terminal task requires review. Do not combine task with claim. Optional claim.transition:"progress"|"correction": progress ONLY for explicitly played changes of a mutable state, not a contradiction or retcon of past/static facts; correction requires review. A different state value without progress requires review. Never output replaces: human resolutions only.';
