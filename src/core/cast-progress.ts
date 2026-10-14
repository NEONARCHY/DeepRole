import type { CastJob } from "./cast-initialization";

type Progress = Pick<CastJob, "id" | "phase" | "step" | "repair" | "draft" | "diagnostics" | "reset"> & {
  large?: { stage: "scan" | "profiles" | "done" };
};
export type CastDiagnosticOutcome = "resolved" | "repairing" | "current" | "previous";

/** A ready handoff between source chunks is not a completed preparation. */
export function castPreparationReady(job: Pick<Progress, "phase" | "large" | "reset" | "draft">) {
  return job.phase === "ready" && !!job.draft?.characters.length
    && (!job.large || job.large.stage === "done")
    && (!job.reset || job.reset.entryOffset === job.reset.entries.length);
}

/** Only advancement or an accepted reply proves a recorded failure was resolved. */
export function castDiagnosticOutcome(job: Progress, index: number): CastDiagnosticOutcome {
  const event = job.diagnostics?.[index];
  if (!event || event.requestId !== job.id) return "previous";
  if (job.phase === "applied" || job.phase === "ready" || event.step < job.step) return "resolved";
  if (["opening", "reading", "analyzing"].includes(job.phase) && job.repair && event.step === job.step) return "repairing";
  const last = job.diagnostics?.findLastIndex(item => item.requestId === job.id);
  return job.phase === "error" && index === last ? "current" : "previous";
}
