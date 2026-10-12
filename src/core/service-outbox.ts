import { serviceErrorCodes } from "./service-operations";
import { fieldErrorCodes } from "./isolated-character-text";
import { validNativeStoryId } from "./story-transport";
import type { ServiceOperationProgress } from "./service-operations";

export const SERVICE_OUTBOX_PREFIX = "deeprole_service_pending:";
/** Queue capacity, not a character/world/history limit. No silent eviction. */
export const SERVICE_OUTBOX_CAPACITY = 128;
export interface ServicePending {
 format: "deeprole-service-pending"; version: 1;
 id: string; token: string;
 phase: ServiceOperationProgress["phase"];
 cleanup: ServiceOperationProgress["cleanup"];
 error: string | null; at: number;
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && Object.keys(v).every(k => keys.includes(k));
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(v);
export const serviceOperationId = (v: unknown): v is string => typeof v === "string" && (v.startsWith("field_") && uuid(v.slice(6)) || v.startsWith("cast_") && uuid(v.slice(5)) || v.startsWith("repair_") && uuid(v.slice(7)) || v.startsWith("discover_") && uuid(v.slice(9)));
export function validServicePending(v: unknown): v is ServicePending {
 return object(v) && exact(v, ["format", "version", "id", "token", "phase", "cleanup", "error", "at"])
  && v.format === "deeprole-service-pending" && v.version === 1 && serviceOperationId(v.id) && uuid(v.token)
  && typeof v.phase === "string" && ["prepared", "dispatching", "result", "failed"].includes(v.phase) && typeof v.cleanup === "string" && ["pending", "done", "failed"].includes(v.cleanup)
  && (v.phase === "failed" ? (v.id.startsWith("cast_") ? serviceErrorCodes : fieldErrorCodes).some(c => c === v.error) : v.error === null)
  && (v.cleanup === "pending" || ["result", "failed"].includes(String(v.phase)))
  && typeof v.at === "number" && Number.isSafeInteger(v.at) && v.at >= 0;
}
export function servicePending(id: string, input: unknown): ServicePending {
 if (!object(input) || !exact(input, ["phase", "cleanup", "error", "workerChatId", "at"]) || input.workerChatId !== null && !validNativeStoryId(input.workerChatId)) throw new Error("service-outbox-invalid");
 const value = { format: "deeprole-service-pending", version: 1, id, token: crypto.randomUUID(), phase: input.phase, cleanup: input.cleanup, error: input.error, at: input.at };
 if (!validServicePending(value)) throw new Error("service-outbox-invalid"); return value;
}
export const servicePhaseRank = { prepared: 0, dispatching: 1, result: 2, failed: 3 };
export const serviceCleanupRank = { pending: 0, failed: 1, done: 2 };
export function nextServicePending(previous: ServicePending, next: ServicePending): boolean {
 return next.id === previous.id && next.at >= previous.at && servicePhaseRank[next.phase] >= servicePhaseRank[previous.phase] && serviceCleanupRank[next.cleanup] >= serviceCleanupRank[previous.cleanup];
}
