import type { CharacterTextResponse, CharacterTextRunOptions } from "./character-text";

type Job = {
  run: (signal: AbortSignal) => Promise<CharacterTextResponse>;
  options: CharacterTextRunOptions;
  controller: AbortController;
  resolve: (value: CharacterTextResponse) => void;
  reject: (error: Error) => void;
  detach: () => void;
};
export function fieldCancellation(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error(signal.reason instanceof Error && signal.reason.message === "field-changed" ? "field-changed" : "cancelled");
}

/** Editor-local, memory-only FIFO. Resolving a result lets the field apply it before the next dispatch. */
export class CharacterTextQueue {
  private pending: Job[] = [];
  private running?: Job;
  private pumping = false;
  constructor(private yieldToEditor = () => new Promise<void>(resolve => setTimeout(resolve, 0))) {}

  enqueue(run: Job["run"], options: CharacterTextRunOptions = {}): Promise<CharacterTextResponse> {
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const job: Job = { run, options, controller, resolve, reject, detach: () => options.signal?.removeEventListener("abort", abort) };
      const abort = () => {
        controller.abort(options.signal?.reason);
        const index = this.pending.indexOf(job);
        if (index >= 0) { this.pending.splice(index, 1); job.detach(); try { fieldCancellation(controller.signal); } catch (error) { reject(error as Error); } this.positions(); }
      };
      try { fieldCancellation(options.signal); } catch (error) { reject(error as Error); return; }
      options.signal?.addEventListener("abort", abort, { once: true });
      this.pending.push(job); this.positions(); void this.pump();
    });
  }
  cancelAll(code = "cancelled") {
    for (const job of this.pending.splice(0)) { job.detach(); job.reject(new Error(code)); }
    this.running?.controller.abort(new Error(code));
  }
  private positions() { this.pending.forEach((job, index) => job.options.onProgress?.({ phase: "queued", position: index + 1 })); }
  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.pending.length) {
        const job = this.pending.shift()!; this.running = job; this.positions();
        try {
          fieldCancellation(job.controller.signal);
          if (job.options.isCurrent && !job.options.isCurrent()) throw new Error("field-changed");
          job.options.onProgress?.({ phase: "running", position: 0 });
          const result = await job.run(job.controller.signal);
          fieldCancellation(job.controller.signal);
          job.resolve(result);
        } catch (error) {
          const cause = error instanceof Error ? error : new Error("invalid-result"); job.reject(cause);
          if (["cleanup-pending", "scene-changed", "vault-locked", "busy", "world-unavailable", "user-interrupted", "login-required", "interrupted", "tab-unavailable"].includes(cause.message)) {
            for (const pending of this.pending.splice(0)) { pending.detach(); pending.reject(new Error("queue-stopped")); }
          }
        } finally { job.detach(); this.running = undefined; }
        await this.yieldToEditor();
      }
    } finally { this.pumping = false; }
  }
}
