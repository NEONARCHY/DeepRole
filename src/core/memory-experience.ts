import type { ContextSelection, ServiceRequest } from "./types";
import type { ExperienceKey } from "./experience-i18n";

/** UI feedback, not a second memory state or a claim that the model read a record. */
export interface ServiceActivity {
  phase: "preparing" | "waiting" | "empty" | "error";
  type: ServiceRequest["type"];
  /** The originating chat card owns progress and errors; keep busy state intact. */
  presentation?: "inline";
}
export const SERVICE_TIMEOUT_MS = 10 * 60 * 1000;
export function serviceActivity(request: ServiceRequest, phase: ServiceActivity["phase"]): ServiceActivity {
  const inline = request.type === "character-text" && (request.imagePlan || request.characterText?.field.key === "image-plan");
  return { phase, type: request.type, ...(inline ? { presentation: "inline" as const } : {}) };
}
export function pendingActivity(request: ServiceRequest | null, chatId: string | null, _generating: boolean, now = Date.now()): ServiceActivity | null {
  if (!request || (request.chatId ?? null) !== chatId) return null;
  return serviceActivity(request, now - request.createdAt < SERVICE_TIMEOUT_MS ? "waiting" : "error");
}
export function memoryReadiness(connected: boolean, warning: string | undefined, selected: number, available: number): "offline" | "failed" | "ready" | "empty" | "matching" {
  if (!connected) return "offline";
  if (warning) return "failed";
  if (selected > 0) return "ready";
  return available > 0 ? "matching" : "empty";
}
export function selectionReason(item: ContextSelection["entries"][number]): ExperienceKey {
  if (item.manuallySelected) return "reasonManual";
  if (item.origin?.kind === "entity") return "reasonScene";
  if (item.entry.activation === "always") return "reasonAlways";
  if (item.reasons.includes("linked")) return "reasonLink";
  if (item.reasons.some((r) => /^(focus:|entity:)/.test(r))) return "reasonScene";
  return "reasonMatch";
}
