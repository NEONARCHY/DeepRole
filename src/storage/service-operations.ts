import { castServiceOperationFromStart, progressServiceOperation, serviceOperationFromStart, validServiceOperation, type CastServiceOperationStart, type ServiceOperation, type ServiceOperationProgress, type ServiceOperationStart } from "../core/service-operations";
import { sameStoryValue } from "../core/story-value";
import { repository, type DeepRoleRepository } from "./repository";
import { repairServiceOperationFromStart, discoveryServiceOperationFromStart } from "../core/service-operations";

/** Only the background coordinator calls these. No content/page write RPC. */
export async function beginServiceOperation(input: ServiceOperationStart, repo: DeepRoleRepository = repository): Promise<ServiceOperation> {
 const value = serviceOperationFromStart(structuredClone(input));
 return begin(value, repo);
}
export async function beginCastServiceOperation(input: CastServiceOperationStart, repo: DeepRoleRepository = repository): Promise<ServiceOperation> {
 return begin(castServiceOperationFromStart(structuredClone(input)), repo);
}
export async function beginRepairServiceOperation(input: { id: string; worldId: string; sourceChatId: string; createdAt: number }, repo: DeepRoleRepository = repository) { return begin(repairServiceOperationFromStart(input), repo); }
export async function beginDiscoveryServiceOperation(input: { id: string; worldId: string; sourceChatId: string; createdAt: number }, repo: DeepRoleRepository = repository) { return begin(discoveryServiceOperationFromStart(input), repo); }
async function begin(value: ServiceOperation, repo: DeepRoleRepository): Promise<ServiceOperation> {
 return repo.updateRecords(records => {
  if (value.worldId !== null && !records.some(r => r.kind === "world" && r.id === value.worldId)) throw new Error("service-operation-scope");
  const previous = records.find(r => r.kind === "service" && r.id === value.id)?.data;
  if (previous) {
   if (!validServiceOperation(previous) || !sameStoryValue(previous, value)) throw new Error("service-operation-conflict");
   return { records: [], removed: [], result: previous };
  }
  return { records: [{ kind: "service", id: value.id, data: value }], removed: [], result: value };
 }, undefined, ["service", "world"]);
}
export async function updateServiceOperation(id: string, input: ServiceOperationProgress, repo: DeepRoleRepository = repository): Promise<ServiceOperation | null> {
 const snapshot = structuredClone(input);
 return repo.updateRecords(records => {
  const previous = records.find(r => r.kind === "service" && r.id === id)?.data;
  // Missing after purge/restore: never reconstruct a record from a late worker.
  if (!previous) return { records: [], removed: [], result: null };
  if (!validServiceOperation(previous)) throw new Error("service-operation-invalid");
  const next = progressServiceOperation(previous, snapshot);
  return { records: next === previous ? [] : [{ kind: "service", id, data: next }], removed: [], result: next };
 }, undefined, ["service"]);
}
