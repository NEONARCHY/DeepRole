import { browser } from "wxt/browser";
import { FIELD_TIMEOUT } from "../core/isolated-character-text";
import type { FieldMessage } from "./isolated-field-coordinator";
import type { CharacterDiscoveryInput, DiscoveryProfileInput } from "../core/story-character-discovery";
import type { SupplementInput } from "../core/profile-supplements";
/** One bounded batch in the existing owned, masked service-window lane. */
export class CharacterDiscoveryClient {
  private active = false;
  constructor(private send: (message: FieldMessage) => Promise<any> = m => browser.runtime.sendMessage(m), private wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms)), private now = Date.now) {}
  async run(input: CharacterDiscoveryInput | DiscoveryProfileInput | SupplementInput, current: () => boolean, signal?: AbortSignal) {
    if (this.active) throw Error("busy"); this.active = true;
    let id: string | undefined, settled = false;
    try {
      if (!current() || signal?.aborted) throw Error("cancelled");
      const profile = "eventId" in input;
      const enriching = "entityId" in input;
      const start = await this.send(enriching ? { type: "DR_FIELD", action: "enrich-profile", input } : profile ? { type: "DR_FIELD", action: "discovery-profile", input } : { type: "DR_FIELD", action: "discover", input }); if (!start?.ok || typeof start.id !== "string") throw Error(start?.error ?? "request-failed");
      id = start.id; const since = this.now();
      while (this.now() - since < FIELD_TIMEOUT) {
        if (!current() || signal?.aborted) throw Error("cancelled");
        const result = await this.send({ type: "DR_FIELD", action: "read", id: id! });
        if (result?.cleanup || result?.outcome?.cleanup) settled = true;
        if (!result?.ok) throw Error(result?.error ?? "request-failed");
        if (result.outcome) {
          if (result.outcome.text !== (enriching ? "profile-supplement-prepared" : profile ? "profile-prepared" : "characters-discovered") || !["done", "failed"].includes(result.outcome.cleanup)) throw Error("invalid-result");
          const ack = await this.send({ type: "DR_FIELD", action: "ack", id: id! }); if (!ack?.ok) throw Error(ack?.error ?? "request-failed");
          if (result.outcome.cleanup !== "done") throw Error("cleanup-pending");
          return;
        }
        await this.wait(500);
      }
      throw Error("reply-timeout");
    } catch (error) {
      if (id && !settled) { await this.send({ type: "DR_FIELD", action: "cancel", id }).catch(() => undefined); for (let i = 0; i < 30; i++) { const state = await this.send({ type: "DR_FIELD", action: "cleanup", id }).catch(() => undefined); if (state?.cleanup) break; await this.wait(500); } }
      throw error;
    } finally { this.active = false; }
  }
}
