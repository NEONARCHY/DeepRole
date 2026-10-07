import type { SceneState, StoryContinuation } from "./types";

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
