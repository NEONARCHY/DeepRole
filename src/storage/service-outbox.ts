import { browser } from "wxt/browser";
import { nextServicePending, SERVICE_OUTBOX_CAPACITY, SERVICE_OUTBOX_PREFIX, serviceCleanupRank, servicePending, servicePhaseRank, validServicePending, type ServicePending } from "../core/service-outbox";
import { validServiceOperation, type ServiceOperation, type ServiceOperationProgress } from "../core/service-operations";
import { repository, type DeepRoleRepository } from "./repository";
import { updateServiceOperation } from "./service-operations";
import { withNamedLock } from "./library-lock";

const LOCK = "deeprole-service-outbox";
type Local = typeof browser.storage.local;
export interface ServiceOutboxReport { recorded: number; discarded: number; pending: number; invalid: number }
/** Extension-local write-ahead metadata. No world/chat IDs or text are persisted
 * in this queue. This is not an executable job, backup content or native proof.
 * Lock order is outbox -> repository; callers must never hold the library lock.
 */
export class ServiceAuditOutbox {
 constructor(private repo: DeepRoleRepository = repository, private local: Local = browser.storage.local) {}
 private async remove(entry: ServicePending) {
  // Keep the durable entry if storage removal fails after a successful commit.
  await this.local.remove(SERVICE_OUTBOX_PREFIX + entry.id).catch(() => undefined);
 }
 private async deliver(entry: ServicePending, hint?: string | null): Promise<"recorded" | "discarded" | "queued"> {
  try {
   const previous = await this.repo.get<ServiceOperation>("service", entry.id);
   if (!previous || previous.origin === "restored") { await this.remove(entry); return "discarded"; }
   if (!validServiceOperation(previous)) return "queued";
   // A stale queue entry cannot regress an already committed later outcome.
   if (previous.updatedAt >= entry.at && servicePhaseRank[previous.phase] >= servicePhaseRank[entry.phase] && serviceCleanupRank[previous.cleanup] >= serviceCleanupRank[entry.cleanup]
    && (previous.phase !== entry.phase || previous.cleanup !== entry.cleanup || previous.error === entry.error)
    && (hint === undefined || hint === previous.workerChatId)) { await this.remove(entry); return "discarded"; }
   const workerChatId = hint === undefined ? previous.workerChatId : hint;
   // Lost binding is not a reason to invent one, or to label a valid result failed.
   if (entry.phase === "result" && workerChatId === null) return "queued";
   const result = await updateServiceOperation(entry.id, { phase: entry.phase, workerChatId, cleanup: entry.cleanup, error: entry.error, at: Math.max(entry.at, previous.updatedAt) }, this.repo);
   await this.remove(entry); return result ? "recorded" : "discarded";
  } catch { return "queued"; }
 }
 async record(id: string, progress: ServiceOperationProgress): Promise<"recorded" | "discarded" | "queued"> {
  const snapshot = structuredClone(progress), entry = servicePending(id, snapshot);
  return withNamedLock(LOCK, "exclusive", async () => {
   const key = SERVICE_OUTBOX_PREFIX + id;
   try {
    const existing = (await this.local.get(key))[key];
    if (existing !== undefined && (!validServicePending(existing) || existing.id !== id || !nextServicePending(existing, entry))) throw new Error("service-outbox-conflict");
    if (existing === undefined && Object.keys(await this.local.get()).filter(k => k.startsWith(SERVICE_OUTBOX_PREFIX)).length >= SERVICE_OUTBOX_CAPACITY) throw new Error("service-outbox-capacity");
    await this.local.set({ [key]: entry });
   } catch (error) {
    if (error instanceof Error && error.message === "service-outbox-conflict") throw error;
    // If the queue itself is unavailable, only an actual journal commit suffices.
    try { const result = await updateServiceOperation(id, snapshot, this.repo); return result ? "recorded" : "discarded"; }
    catch { throw new Error("service-outbox-unavailable"); }
   }
   return this.deliver(entry, snapshot.workerChatId);
  });
 }
 async flush(hints: ReadonlyMap<string, string> = new Map()): Promise<ServiceOutboxReport> {
  return withNamedLock(LOCK, "exclusive", async () => {
   const report: ServiceOutboxReport = { recorded: 0, discarded: 0, pending: 0, invalid: 0 };
   const values = await this.local.get();
   for (const [key, value] of Object.entries(values)) {
    if (!key.startsWith(SERVICE_OUTBOX_PREFIX)) continue;
    if (!validServicePending(value) || key !== SERVICE_OUTBOX_PREFIX + value.id) { report.invalid++; continue; }
    const status = await this.deliver(value, hints.get(value.id)); report[status === "queued" ? "pending" : status]++;
   }
   // Count what remains, including failed removals; never announce an empty queue
   // just because the repository accepted the last update.
   report.pending = Object.entries(await this.local.get()).filter(([key, v]) => key.startsWith(SERVICE_OUTBOX_PREFIX) && validServicePending(v) && key === SERVICE_OUTBOX_PREFIX + v.id).length;
   return report;
  });
 }
}
