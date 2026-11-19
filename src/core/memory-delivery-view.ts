import { validStoryDispatchCapture } from "./story-dispatch-capture";
import type { StoryRecord } from "./story-records";
import type { ChatBinding, WorldProfile } from "./types";

/** A manually attached played game needs the same protected first send as a saved handoff. */
export function awaitingTransferredContext(world: WorldProfile | undefined, binding: ChatBinding | undefined,
  records: readonly StoryRecord[], captures: readonly unknown[]): boolean {
  const game = world?.sharedGame;
  if (!world || !binding || !game?.managed || game.restartPending || binding.worldId !== world.id
    || game.activeBindingId !== binding.id || game.activeChatId !== binding.chatId) return false;
  const checkpoint = records.find(row => row.type === "baseline" && row.gameId === game.id && row.worldId === world.id
    && row.origin.bindingId === binding.id && row.origin.chatId === binding.chatId);
  if (checkpoint?.type !== "baseline") return false;
  if (checkpoint.storySourceChatId ? checkpoint.storySourceChatId === binding.chatId
    : !checkpoint.episodeSourceSeeds?.length && (!game.recentChatId || game.recentChatId === binding.chatId)) return false;
  return !captures.some(row => row && typeof row === "object" && "bindingId" in row && row.bindingId === binding.id
    && validStoryDispatchCapture(row) && row.worldId === world.id && row.identity.chatId === binding.chatId
    && row.createdAt >= checkpoint.createdAt && row.origin === "local" && row.injection === "context" && row.delivery?.status === "accepted");
}

/** A historical transport receipt, never current-game/branch or model-use authority.
 * Only the proven prefix is exposed; no user draft, reply, IDs or wire payload. */
export interface MemoryDeliveryView {
  at: number;
  stage: "prepared" | "confirmed" | "started" | "accepted" | "failed";
  injection: "unconfirmed" | "none" | "context";
  context?: string;
  responseInterrupted: boolean;
}
export function memoryDeliveryView(captures: readonly unknown[], scope: { worldId: string; bindingId: string; chatId: string } | null): MemoryDeliveryView | undefined {
  if (!scope) return;
  let latest: import("./story-dispatch-capture").StoryDispatchCapture | undefined;
  let tied = false;
  for (const value of captures) {
    if (!validStoryDispatchCapture(value) || value.origin !== "local" || value.purpose !== "user-turn"
      || value.worldId !== scope.worldId || value.bindingId !== scope.bindingId || value.identity.chatId !== scope.chatId
      || value.originalDraft.trimStart().startsWith("[DeepRole Service]") || value.originalDraft.includes("<deeprole_character_mode>")) continue;
    if (!latest || value.createdAt > latest.createdAt) { latest = value; tied = false; }
    else if (value.createdAt === latest.createdAt && value.id !== latest.id) tied = true;
  }
  if (!latest || tied) return;
  return {
    at: latest.createdAt,
    stage: latest.delivery?.status === "failed" ? "failed" : latest.delivery?.status === "accepted" ? "accepted"
      : latest.started ? "started" : latest.injection !== "unconfirmed" ? "confirmed" : "prepared",
    injection: latest.injection,
    ...(latest.injection === "context" ? { context: latest.proposedContext } : {}),
    responseInterrupted: latest.wire.phase === "failed",
  };
}
