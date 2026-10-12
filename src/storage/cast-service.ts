import { castDiagnostic, type CastJob } from "../core/cast-initialization";
import { interruptedCastJob } from "../core/cast-batches";
import { progressServiceOperation, validServiceOperation, type ServiceOperation } from "../core/service-operations";
import { validNativeStoryId } from "../core/story-transport";
import type { DataRecord } from "../core/types";
import { repository, type DeepRoleRepository } from "./repository";

/** Deliver terminal metadata only to the same existing local job. A journal
 * cannot reconstruct replies, declare a draft ready, or create/import jobs. */
export async function reconcileCastServiceJobs(repo: DeepRoleRepository = repository): Promise<void> {
 await repo.updateRecords(records => {
  const audits = new Map(records.filter(r => r.kind === "service").map(r => [r.id, r.data as ServiceOperation]));
  const changes: DataRecord[] = [];
  for (const row of records.filter(r => r.kind === "cast")) {
   const job = row.data as CastJob; let audit = audits.get(job.id);
   if (!validServiceOperation(audit) || audit.origin !== "local" || audit.operation !== "cast-preparation"
    || audit.worldId !== job.worldId || audit.createdAt !== job.createdAt
    || job.chatId && audit.workerChatId !== null && audit.workerChatId !== job.chatId || !["result", "failed"].includes(audit.phase)) continue;
   if (audit.workerChatId === null && validNativeStoryId(job.chatId)) {
    // A protected job already saved the exact binding. Recover that binding,
    // never infer it from text, a missing tab, or imported metadata.
    audit = progressServiceOperation(audit, { phase: audit.phase, cleanup: audit.cleanup, error: audit.error, workerChatId: job.chatId, at: Math.max(audit.updatedAt, job.updatedAt) });
    changes.push({ kind: "service", id: audit.id, data: audit });
   }
   let next = job;
   if ((["opening", "reading", "analyzing"].includes(job.phase) || job.phase === "ready" && audit.phase === "failed" && audit.updatedAt >= job.updatedAt) && (audit.phase === "failed" || audit.cleanup !== "pending")) {
    const error = audit.error ?? "interrupted";
    next = { ...castDiagnostic(interruptedCastJob(job, error), error, [], { stage: "worker" }),
     ...(error === "cancelled" ? { phase: "cancelled" as const } : {}) };
   }
   if (audit.cleanup !== "pending" && job.cleanup !== "done" && job.cleanup !== audit.cleanup) next = { ...next, cleanup: audit.cleanup };
   if (next === job) continue;
   // Do not rewrite an already applied partial draft or any profile/lore records.
   changes.push({ ...row, data: { ...next, updatedAt: Math.max(job.updatedAt, audit.updatedAt) } });
  }
  return { records: changes, removed: [], result: undefined };
 }, undefined, ["cast", "service"]);
}
