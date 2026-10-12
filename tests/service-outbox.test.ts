import { afterEach, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { SERVICE_OUTBOX_CAPACITY, SERVICE_OUTBOX_PREFIX, validServicePending, servicePending, type ServicePending } from "../src/core/service-outbox";
import { ServiceAuditOutbox } from "../src/storage/service-outbox";
import { beginServiceOperation, updateServiceOperation } from "../src/storage/service-operations";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { castRecords } from "./fixtures/cast-data";
import { removeWorld } from "../src/storage/worlds";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";

const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dbs.splice(0).map(db => db.delete())); });
const id = "field_72c2c6df-3dd2-4e31-a872-0c9500fe6458";
const progress = (changes = {}) => ({ phase: "failed" as const, workerChatId: "owned", cleanup: "done" as const, error: "cancelled", at: 4, ...changes });
async function fixture() {
 const db = new DeepRoleDatabase("service-outbox-" + crypto.randomUUID()); dbs.push(db); const repo = new DeepRoleRepository(db); await repo.mergeRecords(castRecords());
 await beginServiceOperation({ id, worldId: "w", sourceChatId: "game", mode: "suggest", fieldScope: "profile", createdAt: 1 }, repo);
 await updateServiceOperation(id, { phase: "dispatching", workerChatId: "owned", cleanup: "pending", error: null, at: 2 }, repo);
 const outbox = new ServiceAuditOutbox(repo); return { db, repo, outbox };
}
const entries = async () => Object.values(await browser.storage.local.get()).filter((v: any) => v?.format === "deeprole-service-pending");
it("allows only opaque UUIDs and fixed metadata, never private text or chat identities", () => {
 const value = servicePending(id, progress()); expect(validServicePending(value)).toBe(true);
 for (const change of [{ id: "field_PRIVATE_NAME" }, { prompt: "PRIVATE" }, { chatId: "owned" }, { worldId: "w" }, { workerChatId: "owned" }, { error: "PRIVATE" }, { at: Infinity }, { phase: "complete" }, { phase: ["result"] }, { cleanup: ["done"] }, { cleanup: "done", phase: "prepared" }, { token: "PRIVATE" }]) expect(validServicePending({ ...value, ...change })).toBe(false);
 expect(JSON.stringify(value)).not.toContain("owned"); expect(() => servicePending(id, { ...progress(), prompt: "PRIVATE" })).toThrow("service-outbox-invalid");
});
it("persists an outcome through lock, lost session and a new repository/coordinator instance", async () => {
 const { db, repo, outbox } = await fixture(); await repo.enableVault("synthetic-password"); await repo.lockVault();
 expect(await outbox.record(id, progress())).toBe("queued"); await browser.storage.session.clear();
 expect(await new ServiceAuditOutbox(new DeepRoleRepository(db)).flush()).toMatchObject({ recorded: 0, pending: 1 });
 const raw = JSON.stringify(await entries()); for (const text of ["game", "owned", "worldId", "workerChatId", "chatId", "https://"]) expect(raw).not.toContain(text);
 await repo.unlockVault("synthetic-password"); expect(await new ServiceAuditOutbox(new DeepRoleRepository(db)).flush()).toMatchObject({ recorded: 1, pending: 0 });
 expect(await repo.get("service", id)).toMatchObject({ phase: "failed", cleanup: "done", error: "cancelled", workerChatId: "owned" }); expect(await entries()).toEqual([]);
});
it("survives successful acknowledgement and concurrent drains without duplicates", async () => {
 const { repo, outbox } = await fixture(); vi.spyOn(repo, "updateRecords").mockRejectedValueOnce(new Error("transient-private"));
 expect(await outbox.record(id, progress({ phase: "result", error: null }))).toBe("queued");
 const reports = await Promise.all([outbox.flush(), new ServiceAuditOutbox(repo).flush()]); expect(reports.reduce((n, r) => n + r.recorded, 0)).toBe(1);
 expect(await entries()).toEqual([]); expect(await repo.list("service")).toHaveLength(1); expect(await repo.get("service", id)).toMatchObject({ phase: "result", cleanup: "done" });
});
it("records a same-millisecond chat binding instead of discarding it as unchanged progress", async () => {
 const { repo, outbox } = await fixture(); const previous = await repo.get("service", id);
 await repo.delete("service", id); await beginServiceOperation({ id, worldId: "w", sourceChatId: "game", mode: "suggest", fieldScope: "profile", createdAt: 1 }, repo);
 await updateServiceOperation(id, { phase: "dispatching", workerChatId: null, cleanup: "pending", error: null, at: 2 }, repo);
 expect(await outbox.record(id, { phase: "dispatching", workerChatId: "owned", cleanup: "pending", error: null, at: 2 })).toBe("recorded");
 expect(await repo.get("service", id)).toEqual(previous);
});
it("retains every existing item at capacity; an unlocked journal can still record the current outcome", async () => {
 const { repo, outbox } = await fixture(); const values: Record<string, ServicePending> = {};
 for (let n = 0; n < SERVICE_OUTBOX_CAPACITY; n++) { const other = "field_" + crypto.randomUUID(); values[SERVICE_OUTBOX_PREFIX + other] = servicePending(other, progress()); }
 await browser.storage.local.set(values); expect(await outbox.record(id, progress())).toBe("recorded"); expect(await entries()).toHaveLength(SERVICE_OUTBOX_CAPACITY);
 await repo.enableVault("test-password"); await repo.lockVault(); await expect(outbox.record(id, progress({ at: 5, error: "vault-locked" }))).rejects.toThrow("service-outbox-unavailable"); expect(await entries()).toHaveLength(SERVICE_OUTBOX_CAPACITY);
});
it("can use a still-owned session binding transiently without persisting it outside the vault", async () => {
 const { repo, outbox } = await fixture(); await repo.delete("service", id); await beginServiceOperation({ id, worldId: "w", sourceChatId: "game", mode: "suggest", fieldScope: "profile", createdAt: 1 }, repo);
 vi.spyOn(repo, "updateRecords").mockRejectedValueOnce(new Error("transient")); await outbox.record(id, progress({ phase: "result", error: null }));
 expect((await outbox.flush(new Map([[id, "owned"]]))).recorded).toBe(1); expect(await repo.get("service", id)).toMatchObject({ phase: "result", workerChatId: "owned" }); expect(await entries()).toEqual([]);
});
it("does not discard the write-ahead entry when the repository write fails", async () => {
 const { repo, outbox } = await fixture(); vi.spyOn(repo, "updateRecords").mockRejectedValue(new Error("quota-private"));
 expect(await outbox.record(id, progress())).toBe("queued"); expect((await outbox.flush()).pending).toBe(1); expect(await entries()).toHaveLength(1);
});
it("retries removal after an already committed outcome without replaying it", async () => {
 const { repo, outbox } = await fixture(); vi.spyOn(browser.storage.local, "remove").mockRejectedValueOnce(new Error("transient-private"));
 expect(await outbox.record(id, progress())).toBe("recorded"); expect(await entries()).toHaveLength(1);
 const before = await repo.get("service", id); expect((await outbox.flush()).pending).toBe(0); expect(await repo.get("service", id)).toEqual(before);
});
it("uses the journal if queue storage fails, but rejects when neither durable store can accept the update", async () => {
 const { repo, outbox } = await fixture(); vi.spyOn(browser.storage.local, "set").mockRejectedValue(new Error("quota-private"));
 expect(await outbox.record(id, progress())).toBe("recorded");
 vi.spyOn(repo, "updateRecords").mockRejectedValue(new Error("quota-private")); await expect(outbox.record(id, progress({ at: 5, error: "tab-closed" }))).rejects.toThrow("service-outbox-unavailable");
});
it("purge and restored audits never resurrect an operation or continue an imported send", async () => {
 const { repo, outbox } = await fixture(); const backup = await parseBackup(JSON.stringify(await createBackup(undefined, repo)));
 const write = vi.spyOn(repo, "updateRecords").mockRejectedValueOnce(new Error("transient")); await outbox.record(id, progress()); write.mockRestore();
 await removeWorld("w", repo, { deleteLore: true }); expect(await outbox.flush()).toMatchObject({ discarded: 1, pending: 0 }); expect(await repo.list("service")).toEqual([]);
 await restoreBackup(backup, "replace", repo);
 await browser.storage.local.set({ [SERVICE_OUTBOX_PREFIX + id]: servicePending(id, progress()) });
 expect(await outbox.flush()).toMatchObject({ discarded: 1, pending: 0 }); expect(await repo.get("service", id)).toMatchObject({ phase: "dispatching", origin: "restored" });
});
it("keeps a result without its missing native binding instead of inventing a chat ID", async () => {
 const { repo, outbox } = await fixture(); await repo.delete("service", id);
 await beginServiceOperation({ id, worldId: "w", sourceChatId: "game", mode: "suggest", fieldScope: "profile", createdAt: 1 }, repo);
 vi.spyOn(repo, "updateRecords").mockRejectedValueOnce(new Error("transient")); expect(await outbox.record(id, progress({ phase: "result", error: null }))).toBe("queued");
 expect(await outbox.flush()).toMatchObject({ recorded: 0, pending: 1 }); expect(await repo.get("service", id)).toMatchObject({ phase: "prepared", workerChatId: null });
});
it("rejects malformed/foreign entries and regressions without overwriting a valid pending outcome", async () => {
 const { repo, outbox } = await fixture(); vi.spyOn(repo, "updateRecords").mockRejectedValue(new Error("transient")); await outbox.record(id, progress());
 const before = await entries(); await expect(outbox.record(id, progress({ phase: "dispatching", cleanup: "pending", error: null, at: 5 }))).rejects.toThrow("service-outbox-conflict"); expect(await entries()).toEqual(before);
 await browser.storage.local.set({ [SERVICE_OUTBOX_PREFIX + "foreign"]: { ...before[0] as ServicePending, prompt: "PRIVATE" } });
 expect(await outbox.flush()).toMatchObject({ invalid: 1, pending: 1 }); expect(await entries()).toHaveLength(2);
});
it("ignores an older queue item already superseded by a committed final outcome", async () => {
 const { repo, outbox } = await fixture(); await updateServiceOperation(id, progress({ at: 8 }), repo);
 await browser.storage.local.set({ [SERVICE_OUTBOX_PREFIX + id]: servicePending(id, progress({ phase: "dispatching", error: null, cleanup: "pending", at: 3 })) });
 expect(await outbox.flush()).toMatchObject({ discarded: 1, pending: 0 }); expect(await repo.get("service", id)).toMatchObject({ phase: "failed", cleanup: "done", updatedAt: 8 });
});
it("a full backup includes delivered outcomes, not an executable pending queue", async () => {
 const { repo, outbox } = await fixture(); vi.spyOn(repo, "updateRecords").mockRejectedValueOnce(new Error("transient")); await outbox.record(id, progress());
 const backup = await parseBackup(JSON.stringify(await createBackup(undefined, repo))); expect(backup.records.find(r => r.kind === "service")?.data).toMatchObject({ phase: "failed", cleanup: "done" }); expect(await entries()).toEqual([]);
 expect(JSON.stringify(backup)).not.toContain("deeprole-service-pending");
});
