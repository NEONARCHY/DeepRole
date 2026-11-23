import type { SceneState, StoryContinuation } from "./types";
import { validStoryAutomationCapture } from "./story-automation";
import { DEEPSEEK_PROMPT_CHAR_LIMIT } from "./request-injection";
import { canonicalStoryValue } from "./story-value";

/** Preserve a queued transfer while the outgoing document is still unloading. */
export function waitingForContinuationHome(sourceChatId: string | undefined, chatId: string | null, until: number | null | undefined, now = Date.now()): boolean {
 return !!sourceChatId && sourceChatId === chatId && typeof until === "number" && Number.isFinite(until) && until > now;
}

/** An unbound destination for context preparation. Game activation still needs a receipt. */
export interface ContinuationTarget { snapshotId: string; snapshotToken: string; targetChatId: string; returnHomeAfterLengthBlock?: true }
export function continuationTargetKey(value?: ContinuationTarget | null): string | null {
 return value ? JSON.stringify([value.snapshotId, value.snapshotToken, value.targetChatId, value.returnHomeAfterLengthBlock === true]) : null;
}
export interface ProvisionalContinuationTarget extends ContinuationTarget { expiresAt: number }
export function matchesContinuationTarget(target: ContinuationTarget | null, snapshotId: string | undefined, token: string | null, sourceChatId: string | undefined, chatId: string | null, hasBinding: boolean): boolean {
 return !!target && !hasBinding && !!snapshotId && !!token && !!chatId && chatId !== sourceChatId
  && target.snapshotId === snapshotId && target.snapshotToken === token && target.targetChatId === chatId
  && /^[\w-]{1,120}$/u.test(chatId);
}
export function matchesProvisionalContinuationTarget(target: ProvisionalContinuationTarget | null, snapshotId: string | undefined, token: string | null, sourceChatId: string | undefined, chatId: string | null, hasBinding: boolean, now = Date.now()): boolean {
 return !!target && matchesContinuationTarget(target, snapshotId, token, sourceChatId, chatId, hasBinding)
  && Number.isFinite(target.expiresAt) && target.expiresAt > now;
}

/** Accepted first request; retry only the local commit, never the model call. */
export interface ContinuationReceipt { snapshotId: string; snapshotToken: string | null; targetChatId: string }
/** Original user text only, kept in extension session RAM until dismissed/accepted. */
export interface ContinuationDraft extends ContinuationTarget { draft: string; blockedLength?: number; requestId?: string; promptDigest?: string; purpose?: "user-turn" | "out-of-character"; automation?: import("./story-automation").StoryAutomationCapture }
export function continuationDraftKey(value?: ContinuationDraft | null): string | null {
 return value ? canonicalStoryValue([value.snapshotId, value.snapshotToken, value.targetChatId, value.draft, value.requestId ?? null, value.promptDigest ?? null, value.automation ?? null, value.purpose ?? null, value.blockedLength ?? null]) : null;
}
export function matchingContinuationDraft(value: ContinuationDraft | null | undefined, snapshotId: string | undefined, token: string | null, target: ContinuationTarget | null | undefined): ContinuationDraft | null {
 const blocked = value?.blockedLength !== undefined;
 return value && !!snapshotId && !!token && value.snapshotId === snapshotId && value.snapshotToken === token
  && (target ? target.snapshotId === snapshotId && target.snapshotToken === token && value.targetChatId === target.targetChatId : blocked)
  && /^[\w-]{1,120}$/u.test(value.targetChatId) && typeof value.draft === "string" && !!value.draft && value.draft.length <= 40_000
   && (value.automation === undefined || validStoryAutomationCapture(value.automation))
  && (!blocked || Number.isSafeInteger(value.blockedLength) && value.blockedLength! > DEEPSEEK_PROMPT_CHAR_LIMIT && value.blockedLength! >= value.draft.length
    && value.requestId === undefined && value.promptDigest === undefined && value.automation === undefined && value.purpose === undefined)
    && (value.purpose === undefined || value.purpose === "user-turn" || value.purpose === "out-of-character")
  && (value.requestId === undefined && value.promptDigest === undefined || typeof value.requestId === "string" && /^[\w-]{1,120}$/u.test(value.requestId) && typeof value.promptDigest === "string" && /^[a-f0-9]{64}$/u.test(value.promptDigest)) ? value : null;
}
export function matchingContinuationReceipt(value: unknown, snapshotId: string | undefined, token: string | null, chatId: string | null, freshHome: boolean): ContinuationReceipt | null {
 if (!value || typeof value !== "object" || Array.isArray(value)) return null;
 const r = value as ContinuationReceipt;
 return Object.keys(r).length === 3 && ["snapshotId","snapshotToken","targetChatId"].every(k=>Object.hasOwn(r,k)) && typeof r.snapshotId === "string" && !!r.snapshotId && r.snapshotId === snapshotId
  && r.snapshotToken === token && (token === null || typeof token === "string") && typeof r.targetChatId === "string" && /^[\w-]{1,120}$/u.test(r.targetChatId)
  && (chatId === r.targetChatId || !chatId && freshHome) ? { ...r } : null;
}

/** Correlation metadata only; conversation and lore stay in the private repository. */
export interface ContinuationFlow {
  id: string;
  chatId: string;
  chatUrl: string;
  scene: SceneState;
  phase: "analysis" | "review" | "ready" | "approved" | "summary" | "opening";
  requestId: string;
  proposalId?: string;
  snapshotId?: string;
  createdAt: number;
}
export function continuationKey(flow?: ContinuationFlow | null): string | null {
  return flow ? JSON.stringify([flow.id, flow.phase, flow.requestId, flow.proposalId ?? null, flow.snapshotId ?? null, flow.chatId, flow.chatUrl, flow.scene.worldId, flow.scene.bookId, [...flow.scene.focusIds].sort()]) : null;
}
export function continuationScopeMatches(flow: ContinuationFlow, chatId: string | null, url: string, scene: SceneState): boolean {
  return flow.chatId === chatId && flow.chatUrl === url && flow.scene.worldId === scene.worldId
    && flow.scene.bookId === scene.bookId
    && JSON.stringify([...flow.scene.focusIds].sort()) === JSON.stringify([...scene.focusIds].sort());
}
/** Include every turn supplied by the history reader, preserving its partial flag. */
export function recentSceneReference(story: StoryContinuation): string {
  return JSON.stringify({ partial: story.partial, turns: story.turns });
}
