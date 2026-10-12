import { castServiceValidation, type ServiceValidation } from "../core/service-validation";
import { validServiceOperation, type ServiceOperation } from "../core/service-operations";
import type { CastJob } from "../core/cast-initialization";
import { sameStoryValue } from "../core/story-value";
import { repository, type DeepRoleRepository } from "./repository";

/** Background audit only. Read the existing protected job in the same transaction,
 * not caller-supplied events. Never reconstruct a job or register an old operation.
 * Diagnostic failures cannot change request/cleanup state or their timestamp. */
export async function recordCastServiceValidation(id: string, repo: DeepRoleRepository = repository): Promise<void> {
 await repo.updateRecords(records => {
  const previous = records.find(r => r.kind === "service" && r.id === id)?.data;
  const job = records.find(r => r.kind === "cast" && r.id === id)?.data as CastJob | undefined;
  if (!validServiceOperation(previous) || previous.origin !== "local" || previous.operation !== "cast-preparation" || !job || job.id !== id
   || job.worldId !== previous.worldId || job.createdAt !== previous.createdAt || previous.workerChatId !== null && job.chatId !== previous.workerChatId) return { records: [], removed: [], result: undefined };
  const incoming = castServiceValidation(job);
  if (!incoming.events.length && !incoming.excluded) return { records: [], removed: [], result: undefined };
  // The job also retains worker errors in its 24-event window. Merge safe parse
  // reasons instead of losing earlier ones when those unrelated rows roll over.
  // A repeated/older snapshot cannot replace an already saved attempt.
  const eventKey = (e: ServiceValidation["events"][number]) => `${e.step}:${e.repair}:${e.stage}:${e.code}:${e.at}`;
  const events = new Map<string, ServiceValidation["events"][number]>();
  for (const event of [...(previous.validation?.events ?? []), ...incoming.events]) if (!events.has(eventKey(event))) events.set(eventKey(event), event);
  const validation: ServiceValidation = { family: "cast", events: [...events.values()].sort((a, b) => a.at - b.at).slice(-24), excluded: Math.max(previous.validation?.excluded ?? 0, incoming.excluded) };
  if (sameStoryValue(previous.validation, validation)) return { records: [], removed: [], result: undefined };
  const next: ServiceOperation = { ...previous, contractVersion: 2, validation };
  if (!validServiceOperation(next)) throw new Error("service-validation-invalid");
  return { records: [{ kind: "service", id, data: next }], removed: [], result: undefined };
 }, undefined, ["service", "cast"]);
}
