import { afterEach, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { readServiceDiagnostics } from "../src/storage/service-diagnostics";
import { beginServiceOperation, updateServiceOperation } from "../src/storage/service-operations";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository, VaultLockedError } from "../src/storage/repository";
import { SERVICE_OUTBOX_PREFIX, servicePending } from "../src/core/service-outbox";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { removeWorld } from "../src/storage/worlds";
import { castRecords } from "./fixtures/cast-data";

const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dbs.splice(0).map(db => db.delete())); });
async function fixture() {
 const db = new DeepRoleDatabase("service-diagnostic-" + crypto.randomUUID()); dbs.push(db);
 const repo = new DeepRoleRepository(db); await repo.mergeRecords(castRecords());
 const id = "field_" + crypto.randomUUID(); await beginServiceOperation({ id, worldId: "w", sourceChatId: "PRIVATE_GAME", mode: "suggest", fieldScope: "profile", createdAt: 1 }, repo);
 await updateServiceOperation(id, { phase: "result", workerChatId: "PRIVATE_WORKER", cleanup: "done", error: null, at: 2 }, repo); return { db, repo, id };
}
it("reads only the journal, keeps both stores unchanged and never sends RPC/model requests", async () => {
 const { repo, db, id } = await fixture();
 const entry = servicePending(id, { phase: "failed", workerChatId: "PRIVATE_WORKER", cleanup: "done", error: "vault-locked", at: 3 });
 await browser.storage.local.set({ [SERVICE_OUTBOX_PREFIX + id]: entry, PRIVATE_KEY: "PRIVATE_TOKEN" });
 const before = await db.records.toArray(), localBefore = await browser.storage.local.get(), read = vi.spyOn(repo, "list"), write = vi.spyOn(repo, "updateRecords"), localWrite = vi.spyOn(browser.storage.local, "set"), localRemove = vi.spyOn(browser.storage.local, "remove"), rpc = vi.spyOn(browser.runtime, "sendMessage");
 const value = await readServiceDiagnostics(repo);
 expect(read.mock.calls).toEqual([["service"]]); expect(value).toMatchObject({ journal: { total: 1, entries: [{ phase: "result" }] }, pending: { total: 1, entries: [{ phase: "failed" }] } });
 expect(await db.records.toArray()).toEqual(before); expect(await browser.storage.local.get()).toEqual(localBefore);
 for (const spy of [write, localWrite, localRemove, rpc]) expect(spy).not.toHaveBeenCalled(); expect(JSON.stringify(value)).not.toMatch(/PRIVATE|"token"/);
});
it("does not unlock or read the protected journal; pending metadata remains visible", async () => {
 const { repo, id } = await fixture();
 await repo.enableVault("synthetic-password"); await repo.lockVault();
 await browser.storage.local.set({ [SERVICE_OUTBOX_PREFIX + id]: servicePending(id, { phase: "failed", workerChatId: "PRIVATE_WORKER", cleanup: "done", error: "vault-locked", at: 3 }) });
 const list = vi.spyOn(repo, "list"), unlock = vi.spyOn(repo, "unlockVault"); const value = await readServiceDiagnostics(repo);
 expect(value).toMatchObject({ journal: { status: "locked", total: null, entries: [] }, pending: { status: "read", total: 1 } });
 expect(list).not.toHaveBeenCalled(); expect(unlock).not.toHaveBeenCalled(); expect(await repo.isLocked()).toBe(true);
});
it("redacts restored audits and never restarts them; a full world purge removes the report row", async () => {
 const { repo, id } = await fixture(); await repo.enableVault("synthetic-password");
 const backup = await parseBackup(JSON.stringify(await createBackup("synthetic-backup", repo)), "synthetic-backup");
 await restoreBackup(backup, "replace", repo); const value = await readServiceDiagnostics(repo);
 expect(value.journal.entries).toMatchObject([{ id, origin: "restored", phase: "result", cleanup: "done" }]);
 expect(JSON.stringify(value)).not.toMatch(/PRIVATE|worldId|ChatId/);
 await removeWorld("w", repo, { deleteLore: true }); expect((await readServiceDiagnostics(repo)).journal.total).toBe(0);
});
it("handles a vault closing during the read without exposing previously decoded rows", async () => {
 const { repo } = await fixture(); vi.spyOn(repo, "isLocked").mockResolvedValueOnce(false).mockResolvedValueOnce(true);
 expect((await readServiceDiagnostics(repo)).journal).toMatchObject({ status: "locked", total: null, entries: [] });
});
it("handles a protected read race using the typed vault error", async () => {
 const { repo } = await fixture(); vi.spyOn(repo, "list").mockRejectedValue(new VaultLockedError());
 expect((await readServiceDiagnostics(repo)).journal.status).toBe("locked");
});
it("does not expose arbitrary errors or claim inaccessible sources are empty", async () => {
 const { repo } = await fixture(); vi.spyOn(repo, "list").mockRejectedValue(new Error("PRIVATE_ERROR"));
 const value = await readServiceDiagnostics(repo, { get: vi.fn().mockRejectedValue(new Error("PRIVATE_TOKEN")) });
 expect(value).toMatchObject({ journal: { status: "unavailable", total: null }, pending: { status: "unavailable", total: null } }); expect(JSON.stringify(value)).not.toContain("PRIVATE");
});
