import { browser } from "wxt/browser";
import { FIELD_TIMEOUT, validIsolatedFieldInput, safeFieldError, IsolatedFieldError, type CharacterTextOutcome, type IsolatedFieldInput } from "../core/isolated-character-text";
import { castChatReference } from "../core/cast-chat";
import type { FieldMessage } from "./isolated-field-coordinator";
import { fieldCancellation } from "../core/character-text-queue";

/** Checks the current editor scope again before returning a suggestion. */
export class IsolatedFieldClient {
 private active = false;
 constructor(private send: (message: FieldMessage) => Promise<any> = message => browser.runtime.sendMessage(message), private wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms)), private now = Date.now) {}
 async generate(input: IsolatedFieldInput, inScope: () => boolean, signal?: AbortSignal): Promise<CharacterTextOutcome> {
  if (this.active) throw new Error("busy");
  if (!validIsolatedFieldInput(input)) throw new Error("invalid-brief");
  this.active = true; let id: string | undefined, cleanup: "done" | "failed" | undefined, cleanupUrl: string | undefined;
  try {
   fieldCancellation(signal);
   if (!inScope()) throw new Error("scene-changed");
   const start = await this.send({ type: "DR_FIELD", action: "start", input });
   if (!start?.ok || typeof start.id !== "string") throw new Error(safeFieldError(start?.error));
   const requestId: string = start.id; id = requestId; const started = this.now();
   while (this.now() - started < FIELD_TIMEOUT) {
    fieldCancellation(signal);
    if (!inScope()) throw new Error("scene-changed");
    const result = await this.send({ type: "DR_FIELD", action: "read", id: requestId });
    const settled = result?.outcome ?? result;
    if (["done", "failed"].includes(settled?.cleanup)) { cleanup = settled.cleanup; cleanupUrl = cleanup === "failed" ? castChatReference(settled.cleanupUrl)?.url : undefined; }
    fieldCancellation(signal);
    if (!inScope()) throw new Error("scene-changed");
    if (!result?.ok) throw new IsolatedFieldError(safeFieldError(result?.error), ["done", "failed"].includes(result?.cleanup) ? result.cleanup : undefined, result?.cleanup === "failed" ? castChatReference(result?.cleanupUrl)?.url : undefined);
    const value = result.outcome as CharacterTextOutcome | undefined;
    if (value) {
     if (typeof value.text !== "string" || !value.text.trim() || !["done", "failed"].includes(value.cleanup) || typeof value.partialContext !== "boolean") throw new Error("invalid-result");
     if (value.mode !== undefined && value.mode !== input.draft.field.mode || value.historyOrigin !== undefined && !["native", "visible"].includes(value.historyOrigin)) throw new Error("invalid-result");
     if (value.evidence !== undefined && (input.draft.field.mode !== "history" || !Array.isArray(value.evidence) || value.evidence.length > 8 || !value.evidence.every(q => typeof q === "string" && q.trim() && q.length <= 4000))) throw new Error("invalid-result");
     const url = value.cleanup === "failed" && castChatReference(value.cleanupUrl)?.url;
     const ack = await this.send({ type: "DR_FIELD", action: "ack", id: requestId });
     if (!ack?.ok) throw new Error(safeFieldError(ack?.error));
     fieldCancellation(signal);
     if (!inScope()) throw new Error("scene-changed");
     return { text: value.text, partialContext: value.partialContext, cleanup: value.cleanup, mode: value.mode, historyOrigin: value.historyOrigin, evidence: value.evidence, ...(url ? { cleanupUrl: url } : {}) };
    }
    await this.pollWait(signal);
   }
   throw new Error("reply-timeout");
  } catch (error) {
   if (id) await this.send({ type: "DR_FIELD", action: "cancel", id }).catch(() => undefined);
   // A cancelled task still owns its worker. Keep this lane occupied until cleanup settles.
   if (id && !cleanup) {
    for (let attempt = 0; attempt < 30; attempt++) {
     const state = await this.send({ type: "DR_FIELD", action: "cleanup", id }).catch(() => undefined);
     if (["done", "failed"].includes(state?.cleanup)) { cleanup = state.cleanup; cleanupUrl = cleanup === "failed" ? castChatReference(state.cleanupUrl)?.url : undefined; break; }
     await this.wait(500);
    }
    if (!cleanup) throw new IsolatedFieldError("cleanup-pending");
   }
   if (error instanceof IsolatedFieldError) throw error;
   throw new IsolatedFieldError(safeFieldError(error instanceof Error ? error.message : error), cleanup, cleanupUrl);
  } finally { this.active = false; }
 }
 private async pollWait(signal?: AbortSignal) {
  if (!signal) return this.wait(500);
  fieldCancellation(signal);
  let abort!: () => void;
  const interrupted = new Promise<void>(resolve => { abort = resolve; signal.addEventListener("abort", abort, { once: true }); });
  try { await Promise.race([this.wait(500), interrupted]); } finally { signal.removeEventListener("abort", abort); }
 }
}
