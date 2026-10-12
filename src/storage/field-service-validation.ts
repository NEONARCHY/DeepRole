import { readServiceValidation, type ServiceValidation } from "../core/service-validation";
import { validServiceOperation, type ServiceOperation, type ServiceOperationStart } from "../core/service-operations";
import { serviceOperationId } from "../core/service-outbox";
import { validNativeStoryId } from "../core/story-transport";
import { repository, type DeepRoleRepository } from "./repository";
import { fieldWorkerStages, validFieldWorkerRuntime, type FieldWorkerRuntime } from "../core/field-runtime";

export type FieldValidationBinding = ServiceOperationStart & { workerChatId: string };
/** Background-only, no page RPC. Metadata cannot create a registration or change
 * dispatch/result/cleanup timestamps. Never backfill imported or purged work. */
export async function recordFieldServiceValidation(binding: FieldValidationBinding, value: ServiceValidation, repo: DeepRoleRepository = repository): Promise<"recorded" | "discarded"> {
 const validation = readServiceValidation(value), input = structuredClone(binding);
 if (!validation || validation.family !== "field" || !serviceOperationId(input.id) || !input.id.startsWith("field_") || !validNativeStoryId(input.workerChatId)) throw new Error("service-validation-invalid");
 return repo.updateRecords(records => {
  const previous = records.find(record => record.kind === "service" && record.id === input.id)?.data;
  if (!validServiceOperation(previous) || previous.origin !== "local" || previous.operation !== "character-field" || previous.worldId !== input.worldId
   || previous.sourceChatId !== input.sourceChatId || previous.createdAt !== input.createdAt || previous.mode !== input.mode || previous.fieldScope !== input.fieldScope
   || input.workerChatId === input.sourceChatId || previous.workerChatId !== null && previous.workerChatId !== input.workerChatId) return { records: [], removed: [], result: "discarded" as const };
  // One request has one validation attempt: a repeat must not replace it.
  if (previous.validation) return { records: [], removed: [], result: "recorded" as const };
  const next: ServiceOperation = { ...previous, contractVersion: previous.runtime ? 4 : 3, validation };
  if (!validServiceOperation(next)) throw new Error("service-validation-invalid");
  return { records: [{ kind: "service", id: input.id, data: next }], removed: [], result: "recorded" as const };
 }, undefined, ["service"]);
}

/** Background-generated stage/time; page supplies only closed enums. */
export async function recordFieldWorkerRuntime(binding: Omit<FieldValidationBinding, "workerChatId"> & { workerChatId?: string }, value: FieldWorkerRuntime, repo: DeepRoleRepository = repository) {
 const input = structuredClone(binding), runtime = structuredClone(value);
 if (!validFieldWorkerRuntime(runtime) || !serviceOperationId(input.id) || !input.id.startsWith("field_") || input.workerChatId !== undefined && !validNativeStoryId(input.workerChatId)) throw new Error("service-runtime-invalid");
 return repo.updateRecords(records => {
  const previous = records.find(r => r.kind === "service" && r.id === input.id)?.data;
  if (!validServiceOperation(previous) || previous.origin !== "local" || previous.operation !== "character-field" || previous.worldId !== input.worldId || previous.sourceChatId !== input.sourceChatId
   || previous.createdAt !== input.createdAt || previous.mode !== input.mode || previous.fieldScope !== input.fieldScope || input.workerChatId !== undefined && input.workerChatId === input.sourceChatId
   || previous.workerChatId !== null && previous.workerChatId !== input.workerChatId) return { records: [], removed: [], result: false };
  if (previous.runtime && (runtime.at < previous.runtime.at || fieldWorkerStages.indexOf(runtime.stage) < fieldWorkerStages.indexOf(previous.runtime.stage)
   || runtime.stage === previous.runtime.stage && runtime.visibility === previous.runtime.visibility)) return { records: [], removed: [], result: true };
  const next: ServiceOperation = { ...previous, contractVersion: 4, validation: previous.validation ?? null, runtime };
  if (!validServiceOperation(next)) throw new Error("service-runtime-invalid");
  return { records: [{ kind: "service", id: input.id, data: next }], removed: [], result: true };
 }, undefined, ["service"]);
}
