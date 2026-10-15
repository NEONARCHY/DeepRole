import type { SceneState, StoryContinuation } from "./types";

/** Accepted first request; retry only the local commit, never the model call. */
export interface ContinuationReceipt { snapshotId: string; snapshotToken: string | null; targetChatId: string }
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
/** The model already sees the conversation; explicitly anchor its latest scene. */
export function recentSceneReference(story: StoryContinuation): string {
  const turns = [];
  let remaining = 60_000, truncated = false;
  for (const turn of story.turns.slice(-60).reverse()) {
    if (turn.text.length > remaining) {
      truncated = true;
      if (!turns.length) turns.unshift({ ...turn, text: turn.text.slice(-remaining) });
      break;
    }
    turns.unshift(turn); remaining -= turn.text.length;
  }
  return JSON.stringify({ partial: story.partial || truncated || turns.length < story.turns.length, turns });
}
