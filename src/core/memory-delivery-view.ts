import { validStoryDispatchCapture } from "./story-dispatch-capture";

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
