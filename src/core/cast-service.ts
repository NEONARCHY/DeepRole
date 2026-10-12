import type { CastJob } from "./cast-initialization";
import { safeServiceError, type ServiceOperationProgress } from "./service-operations";

/** Coarse, text-free audit only. Batches, evidence, repairs and partial profiles
 * remain in the existing CastJob; this does not prove native completion. */
export function castServiceProgress(job: CastJob): ServiceOperationProgress {
 const phase = job.phase === "error" || job.phase === "cancelled" || job.phase === "applied" && !!job.error ? "failed"
  : job.phase === "ready" || job.phase === "applied" ? "result"
  : job.awaiting || job.step > 0 || job.phase !== "opening" ? "dispatching" : "prepared";
 return { phase, workerChatId: job.chatId ?? null,
  cleanup: job.cleanup === "none" ? phase === "failed" ? "done" : "pending" : job.cleanup,
  error: phase === "failed" ? job.phase === "cancelled" ? "cancelled" : safeServiceError(job.error) : null,
  at: job.updatedAt };
}
