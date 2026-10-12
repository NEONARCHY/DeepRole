import { browser } from "wxt/browser";
import { FIELD_TIMEOUT } from "../core/isolated-character-text";
import type { FieldMessage } from "./isolated-field-coordinator";
import type { StoryRepairInput } from "../storage/story-repair";
/** Uses the existing owned visible-worker lane, never the roleplay composer. */
export class StoryRepairClient {
  private active = false;
  constructor(private send: (message: FieldMessage) => Promise<any> = m => browser.runtime.sendMessage(m), private wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms)), private now = Date.now) {}
  async run(input: StoryRepairInput, current: () => boolean, signal?: AbortSignal) {
    if (this.active) throw Error("busy"); this.active = true;
    let id: string | undefined, settled = false;
    try {
      if (!current() || signal?.aborted) throw Error("cancelled");
      const start = await this.send({ type: "DR_FIELD", action: "repair", input }); if (!start?.ok || typeof start.id !== "string") throw Error(start?.error ?? "request-failed");
      id = start.id; const since = this.now();
      while (this.now() - since < FIELD_TIMEOUT) {
        if (!current() || signal?.aborted) throw Error("cancelled");
        const result = await this.send({ type: "DR_FIELD", action: "read", id: id! });
        if (result?.cleanup || result?.outcome?.cleanup) settled = true;
        if (!result?.ok) throw Error(result?.error ?? "request-failed");
        if (result.outcome) {
          if (result.outcome.text !== "metadata-corrected") throw Error("invalid-result");
          const ack = await this.send({ type: "DR_FIELD", action: "ack", id: id! }); if (!ack?.ok) throw Error(ack?.error ?? "request-failed");
          return { cleanup: result.outcome.cleanup as "done" | "failed" };
        }
        await this.wait(500);
      }
      throw Error("reply-timeout");
    } catch (error) {
      if (id) { await this.send({ type: "DR_FIELD", action: "cancel", id }).catch(() => undefined); if (!settled) for (let i = 0; i < 30; i++) { const state = await this.send({ type: "DR_FIELD", action: "cleanup", id }).catch(() => undefined); if (state?.cleanup) break; await this.wait(500); } }
      throw error;
    } finally { this.active = false; }
  }
}
