/** Fixed lifecycle metadata only. No page text, URLs or native message IDs. */
export const fieldWorkerStages = ["opening", "ready", "sending", "waiting-reply", "reply-received", "cleanup", "finished"] as const;
export type FieldWorkerStage = typeof fieldWorkerStages[number];
export type FieldWorkerVisibility = "visible" | "hidden" | "unknown";
export interface FieldWorkerRuntime { stage: FieldWorkerStage; visibility: FieldWorkerVisibility; at: number }
export const FIELD_CLEANUP_WAIT = 20_000;
export function validFieldWorkerRuntime(value: unknown): value is FieldWorkerRuntime {
 if (!value || typeof value !== "object" || Array.isArray(value)) return false;
 const v = value as Record<string, unknown>;
 return Object.keys(v).length === 3 && Object.keys(v).every(k => ["stage", "visibility", "at"].includes(k))
  && fieldWorkerStages.some(s => s === v.stage) && ["visible", "hidden", "unknown"].includes(v.visibility as string)
  && typeof v.at === "number" && Number.isSafeInteger(v.at) && v.at >= 0 && v.at <= 8_640_000_000_000_000;
}
