import type { ConversationEstimate } from "./types";

export const DEFAULT_CHAT_CAPACITY = 1_000_000;
export function chatCapacity(value?: number): number {
  return Number.isInteger(value) && value! >= 8_000 && value! <= 2_000_000 ? value! : DEFAULT_CHAT_CAPACITY;
}
/** A heuristic warning, never an exact count of remaining turns. */
export function contextWarningLevel(estimate: ConversationEstimate | null | undefined, capacity: number): number {
  if (!estimate || !Number.isFinite(estimate.estimatedTokens) || estimate.estimatedTokens < 0 || !estimate.messageCount) return 0;
  const ratio = estimate.estimatedTokens / chatCapacity(capacity);
  return ratio >= .97 ? 2 : ratio >= .9 ? 1 : 0;
}
