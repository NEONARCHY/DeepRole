import { afterEach, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { createCastJob, mutateCastJob, acceptCastReply } from "../src/storage/cast-initialization";
import { beginCastServiceOperation, updateServiceOperation } from "../src/storage/service-operations";
import { recordCastServiceValidation } from "../src/storage/service-validation";
import { readServiceDiagnostics } from "../src/storage/service-diagnostics";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { removeWorld, exportWorld } from "../src/storage/worlds";
import { castRecords, castBatch } from "./fixtures/cast-data";
import { LIBRARY_CHANGE_KEY } from "../src/storage/changes";
const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dbs.splice(0).map(db => db.delete())); });
async function fixture(register = true) {
 const db = new DeepRoleDatabase("validation-storage-" + crypto.randomUUID()); dbs.push(db); const repo = new DeepRoleRepository(db); await repo.mergeRecords(castRecords());
 const job = await createCastJob("w", "en", false, repo); if (register) await beginCastServiceOperation({ id: job.id, worldId: "w", createdAt: job.createdAt }, repo);
 await mutateCastJob(job.id, j => ({ ...j, phase: "analyzing", step: 1, awaiting: true, chatId: "PRIVATE_WORKER" }), repo);
 return { db, repo, id: job.id };
}
async function reject(repo: DeepRoleRepository, id: string) {
 const reply = castBatch(id, 0); reply.characters[0]!.evidence[0]!.quote = "PRIVATE_INVALID_QUOTE";
 return acceptCastReply(id, 1, JSON.stringify(reply), repo);
}
it("persists real parser reasons for both attempts without changing request state, time or lore", async () => {
 const { repo, id } = await fixture(); const first = await reject(repo, id); expect(first.repair).toBe(true);
 const before = await repo.get("service", id), changed = await browser.storage.local.get(LIBRARY_CHANGE_KEY);
 await recordCastServiceValidation(id, repo); const saved: any = await repo.get("service", id);
 expect(saved).toMatchObject({ contractVersion: 2, phase: "prepared", updatedAt: (before as any).updatedAt, validation: { events: [{ repair: false, issues: [{ path: "characters[0].evidence[0].quote", rule: "exact substring of source text" }] }] } });
 expect(await repo.get("cast", id)).toEqual(first); expect(await browser.storage.local.get(LIBRARY_CHANGE_KEY)).toEqual(changed);
 await mutateCastJob(id, j => ({ ...j, awaiting: true }), repo); const second = await reject(repo, id); expect(second.phase).toBe("error"); await recordCastServiceValidation(id, repo);
 expect((await readServiceDiagnostics(repo)).journal.entries[0]!.validation!.events.map(e => e.repair)).toEqual([false, true]); expect((await repo.list("entity")).length).toBe(0);
 expect(JSON.stringify((await readServiceDiagnostics(repo)).journal)).not.toContain("PRIVATE");
 const write = vi.spyOn(repo, "updateRecords"), previous = await repo.get("service", id); await recordCastServiceValidation(id, repo); expect(await repo.get("service", id)).toEqual(previous); expect(write).toHaveBeenCalledTimes(1);
});
it("retains reasons after deletion of the temporary job and ignores inherited errors of a new request", async () => {
 const { repo, id } = await fixture(); await reject(repo, id); await recordCastServiceValidation(id, repo);
 await mutateCastJob(id, j => ({ ...j, phase: "error", cleanup: "done" }), repo); const next = await createCastJob("w", "en", true, repo);
 await beginCastServiceOperation({ id: next.id, worldId: "w", createdAt: next.createdAt }, repo); await recordCastServiceValidation(next.id, repo);
 expect(await repo.get("cast", id)).toBeNull(); expect((await repo.get<any>("service", id))!.validation.events).toHaveLength(1); expect((await repo.get<any>("service", next.id))!.validation).toBeUndefined();
});
it("does not register old jobs or reconstruct records removed by a world purge", async () => {
 const { repo, id } = await fixture(false); await reject(repo, id); await recordCastServiceValidation(id, repo); expect(await repo.get("service", id)).toBeNull();
 await removeWorld("w", repo, { deleteLore: true }); await recordCastServiceValidation(id, repo); expect(await repo.get("service", id)).toBeNull();
});
for (const change of [{ worldId: "other" }, { createdAt: 0 }, { chatId: "other" }]) it(`rejects a mismatched protected job ${JSON.stringify(change)}`, async () => {
 const { repo, id } = await fixture(); await reject(repo, id); await updateServiceOperation(id, { phase: "dispatching", workerChatId: "PRIVATE_WORKER", cleanup: "pending", error: null, at: Date.now() }, repo);
 await mutateCastJob(id, j => ({ ...j, ...change }), repo); await recordCastServiceValidation(id, repo); expect((await repo.get<any>("service", id))!.contractVersion).toBe(1);
});
it("recovers a failed diagnostic write from the durable job without inventing success", async () => {
 const { repo, id } = await fixture(); await reject(repo, id); const write = vi.spyOn(repo, "updateRecords").mockRejectedValueOnce(new Error("PRIVATE_DISK"));
 await expect(recordCastServiceValidation(id, repo)).rejects.toThrow("PRIVATE_DISK"); write.mockRestore(); expect((await repo.get<any>("service", id))!.contractVersion).toBe(1);
 await recordCastServiceValidation(id, repo); expect((await repo.get<any>("service", id))!.validation.events).toHaveLength(1);
});
it("merges new reasons after worker rows roll over and ignores an older repeated snapshot", async () => {
 const { repo, id } = await fixture(); const first = await reject(repo, id); await recordCastServiceValidation(id, repo);
 const original = first.diagnostics![0]!;
 const next = { ...original, step: 2, repair: true, at: original.at! + 100, details: [{ path: "present[0]", rule: "key from this batch or previously validated roster (not a character name or source ID)", actual: "string(length=2)" }] };
 await mutateCastJob(id, j => ({ ...j, diagnostics: [...Array.from({ length: 23 }, () => ({ ...original, stage: "worker" as const, details: undefined })), next] }), repo);
 await recordCastServiceValidation(id, repo); const saved = await repo.get<any>("service", id);
 expect(saved.validation.events.map((event: any) => event.step)).toEqual([1, 2]);
 await mutateCastJob(id, j => ({ ...j, diagnostics: [original] }), repo); await recordCastServiceValidation(id, repo);
 expect(await repo.get("service", id)).toEqual(saved);
});
it("uses the vault and backup V3, leaves restored diagnostics historical and purges with the world", async () => {
 const { repo, db, id } = await fixture(); await reject(repo, id); await recordCastServiceValidation(id, repo); await repo.enableVault("synthetic-password");
 expect((await db.records.get("service:" + id))!.data).toBeUndefined(); await repo.lockVault(); await expect(recordCastServiceValidation(id, repo)).rejects.toThrow(); expect((await readServiceDiagnostics(repo)).journal.status).toBe("locked");
 await repo.unlockVault("synthetic-password"); const backup = await parseBackup(JSON.stringify(await createBackup("synthetic-backup", repo)), "synthetic-backup"); expect(backup.version).toBe(3);
 expect((await exportWorld("w", repo)).records.some(r => r.kind === "service")).toBe(false);
 await restoreBackup(backup, "replace", repo); const restored = await repo.get<any>("service", id); expect(restored).toMatchObject({ origin: "restored", contractVersion: 2, validation: { events: expect.any(Array) } });
 await recordCastServiceValidation(id, repo); expect(await repo.get("service", id)).toEqual(restored);
 await removeWorld("w", repo, { deleteLore: true }); expect((await readServiceDiagnostics(repo)).journal.total).toBe(0);
});
