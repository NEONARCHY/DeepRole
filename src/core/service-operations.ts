import { fieldErrorCodes } from "./isolated-character-text";
import { validNativeStoryId } from "./story-transport";
import type { CharacterTextField, CharacterTextMode } from "./character-text";
import { readServiceValidation, type ServiceValidation } from "./service-validation";
import { validFieldWorkerRuntime, type FieldWorkerRuntime } from "./field-runtime";

export const serviceErrorCodes = [...fieldErrorCodes, "model-refusal", "partial-reply", "character-limit", "preparation-failed", "world-missing", "lore-too-large", "cleanup-required", "job-missing"] as const;
export const safeServiceError = (error: unknown): string => serviceErrorCodes.find(code => code === error) ?? "preparation-failed";

/** Extension-owned audit, NOT a NativeStoryPurposeReceipt. No message IDs,
 * native parent/link, HTTP acceptance, selected revision or completion proof.
 * Imported audits are historical only and must never authorize native ingestion.
 */
export interface ServiceOperation {
 format: "deeprole-service-operation";
 contractVersion: 1 | 2 | 3 | 4;
 /** V2 cast / V3 field checks; V4 also allows null with safe worker runtime. */
 validation?: ServiceValidation | null;
 runtime?: FieldWorkerRuntime;
 id: string;
 worldId: string | null;
 sourceChatId: string | null;
 workerChatId: string | null;
 origin: "local" | "restored";
 operation: "character-field" | "cast-preparation" | "story-repair" | "character-discovery";
 purpose: "service";
 mode: CharacterTextMode;
 // Category only: custom labels/keys may contain private user text.
 fieldScope: CharacterTextField["scope"] | "cast" | "story";
 /** dispatching is the local pre-click claim, NOT HTTP acceptance. */
 phase: "prepared" | "dispatching" | "result" | "failed";
 cleanup: "pending" | "done" | "failed";
 error: string | null;
 createdAt: number;
 updatedAt: number;
}
export interface ServiceOperationStart {
 id: string; worldId: string | null; sourceChatId: string | null;
 mode: CharacterTextMode; fieldScope: CharacterTextField["scope"]; createdAt: number;
}
export interface CastServiceOperationStart { id: string; worldId: string; createdAt: number }
export interface ServiceOperationProgress {
 phase: ServiceOperation["phase"]; workerChatId: string | null;
 cleanup: ServiceOperation["cleanup"]; error: string | null; at: number;
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && Object.keys(v).every(k => keys.includes(k));
const optionalId = (v: unknown) => v === null || validNativeStoryId(v);
const time = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
export function validServiceOperation(v: unknown): v is ServiceOperation {
 if (!object(v) || !exact(v, ["format", "contractVersion", "id", "worldId", "sourceChatId", "workerChatId", "origin", "operation", "purpose", "mode", "fieldScope", "phase", "cleanup", "error", "createdAt", "updatedAt", ...([2, 3, 4].includes(v.contractVersion as number) ? ["validation"] : []), ...(v.contractVersion === 4 ? ["runtime"] : [])])) return false;
 return v.format === "deeprole-service-operation" && (v.contractVersion === 1 || v.contractVersion === 2 && v.operation === "cast-preparation" && readServiceValidation(v.validation)?.family === "cast" || v.contractVersion === 3 && v.operation === "character-field" && readServiceValidation(v.validation)?.family === "field" || v.contractVersion === 4 && v.operation === "character-field" && validFieldWorkerRuntime(v.runtime) && (v.validation === null || readServiceValidation(v.validation)?.family === "field")) && validNativeStoryId(v.id)
  && optionalId(v.worldId) && optionalId(v.sourceChatId) && optionalId(v.workerChatId) && (v.workerChatId === null || v.workerChatId !== v.sourceChatId)
  && typeof v.origin === "string" && ["local", "restored"].includes(v.origin) && v.purpose === "service"
  && (v.operation === "character-field" && typeof v.mode === "string" && ["history", "suggest"].includes(v.mode) && typeof v.fieldScope === "string" && ["profile", "scene", "relationship", "attribute", "selfie", "milestone"].includes(v.fieldScope)
   || v.operation === "cast-preparation" && v.id.startsWith("cast_") && v.mode === "history" && v.fieldScope === "cast" && v.sourceChatId === null
   || v.operation === "story-repair" && v.id.startsWith("repair_") && v.mode === "history" && v.fieldScope === "story" && v.sourceChatId !== null
   || v.operation === "character-discovery" && v.id.startsWith("discover_") && v.mode === "history" && v.fieldScope === "story" && v.sourceChatId !== null)
  && typeof v.phase === "string" && ["prepared", "dispatching", "result", "failed"].includes(v.phase) && typeof v.cleanup === "string" && ["pending", "done", "failed"].includes(v.cleanup)
  && (v.phase === "failed" ? (v.operation === "character-field" ? fieldErrorCodes : serviceErrorCodes).some(c => c === v.error) : v.error === null)
  && (v.cleanup === "pending" || ["result", "failed"].includes(String(v.phase)))
  && (v.phase !== "prepared" || v.workerChatId === null) && (v.phase !== "result" || v.workerChatId !== null)
  && time(v.createdAt) && time(v.updatedAt) && v.updatedAt >= v.createdAt;
}
export function serviceOperationFromStart(input: unknown): ServiceOperation {
 if (!object(input) || !exact(input, ["id", "worldId", "sourceChatId", "mode", "fieldScope", "createdAt"])) throw new Error("service-operation-invalid");
 const value = { ...input, format: "deeprole-service-operation", contractVersion: 1, origin: "local", operation: "character-field", purpose: "service",
  workerChatId: null, phase: "prepared", cleanup: "pending", error: null, updatedAt: input.createdAt };
 if (!validServiceOperation(value)) throw new Error("service-operation-invalid"); return value;
}
export function castServiceOperationFromStart(input: unknown): ServiceOperation {
 if (!object(input) || !exact(input, ["id", "worldId", "createdAt"]) || !validNativeStoryId(input.worldId)) throw new Error("service-operation-invalid");
 const value = { ...input, format: "deeprole-service-operation", contractVersion: 1, origin: "local", operation: "cast-preparation", purpose: "service",
  sourceChatId: null, mode: "history", fieldScope: "cast", workerChatId: null, phase: "prepared", cleanup: "pending", error: null, updatedAt: input.createdAt };
 if (!validServiceOperation(value)) throw new Error("service-operation-invalid"); return value;
}
export function repairServiceOperationFromStart(input: { id: string; worldId: string; sourceChatId: string; createdAt: number }): ServiceOperation {
 const value = { ...input, format: "deeprole-service-operation", contractVersion: 1, origin: "local", operation: "story-repair", purpose: "service", mode: "history", fieldScope: "story", workerChatId: null, phase: "prepared", cleanup: "pending", error: null, updatedAt: input.createdAt };
 if (!validServiceOperation(value)) throw Error("service-operation-invalid"); return value;
}
export function discoveryServiceOperationFromStart(input: { id: string; worldId: string; sourceChatId: string; createdAt: number }): ServiceOperation {
 const value = { ...input, format: "deeprole-service-operation", contractVersion: 1, origin: "local", operation: "character-discovery", purpose: "service", mode: "history", fieldScope: "story", workerChatId: null, phase: "prepared", cleanup: "pending", error: null, updatedAt: input.createdAt };
 if (!validServiceOperation(value)) throw Error("service-operation-invalid"); return value;
}
export function progressServiceOperation(previous: ServiceOperation, input: unknown): ServiceOperation {
 if (!object(input) || !exact(input, ["phase", "workerChatId", "cleanup", "error", "at"]) || !time(input.at)) throw new Error("service-operation-invalid");
 const next = { ...previous, phase: input.phase, workerChatId: input.workerChatId, cleanup: input.cleanup, error: input.error, updatedAt: input.at };
 if (!validServiceOperation(next)) throw new Error("service-operation-invalid");
 const rank = { prepared: 0, dispatching: 1, result: 2, failed: 3 };
 if (previous.origin !== "local" || next.updatedAt < previous.updatedAt || rank[next.phase] < rank[previous.phase]
  || previous.workerChatId !== null && next.workerChatId !== previous.workerChatId
  || previous.cleanup === "done" && next.cleanup !== "done" || previous.cleanup === "failed" && next.cleanup === "pending") throw new Error("service-operation-conflict");
 // Polling an unchanged outcome does not rewrite timestamps or announce changes.
 const { updatedAt: _before, ...a } = previous, { updatedAt: _after, ...b } = next;
 return JSON.stringify(a) === JSON.stringify(b) ? previous : next;
}
