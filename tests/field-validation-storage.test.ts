import { afterEach, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { recordFieldServiceValidation, recordFieldWorkerRuntime } from "../src/storage/field-service-validation";
import { validFieldWorkerRuntime } from "../src/core/field-runtime";
import { validServiceOperation } from "../src/core/service-operations";
import { readServiceDiagnosticSnapshot, serviceDiagnosticReport } from "../src/core/service-diagnostics";
import { beginServiceOperation, updateServiceOperation } from "../src/storage/service-operations";
import { FieldValidationError } from "../src/core/field-validation";
import { fieldServiceValidation } from "../src/core/service-validation";
import { readServiceDiagnostics } from "../src/storage/service-diagnostics";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { removeWorld, exportWorld } from "../src/storage/worlds";
import { castRecords } from "./fixtures/cast-data";
import { LIBRARY_CHANGE_KEY } from "../src/storage/changes";
const dbs: DeepRoleDatabase[] = [];
it("keeps V4 runtime and V3 validation together through progress, encrypted backup and world purge", async () => {
 const { repo, binding } = await fixture(), before = await repo.rawRecords();
 await recordFieldWorkerRuntime(binding, { stage: "waiting-reply", visibility: "hidden", at: 3 }, repo); await recordFieldServiceValidation(binding, validation(), repo);
 await updateServiceOperation(binding.id, { phase: "failed", workerChatId: binding.workerChatId, cleanup: "done", error: "invalid-evidence", at: 4 }, repo);
 const row = await repo.get<any>("service", binding.id); expect(validServiceOperation(row)).toBe(true); expect(row).toMatchObject({ contractVersion: 4, validation: validation(), runtime: { stage: "waiting-reply", visibility: "hidden", at: 3 }, cleanup: "done" });
 expect((await repo.rawRecords()).filter(r => r.kind !== "service")).toEqual(before.filter(r => r.kind !== "service"));
 await repo.enableVault("PRIVATE_TEST_PASSWORD"); const backup = await parseBackup(JSON.stringify(await createBackup("PRIVATE_BACKUP_PASSWORD", repo)), "PRIVATE_BACKUP_PASSWORD");
 expect(backup.records.find(r => r.kind === "service")!.data).toEqual(row); await restoreBackup(backup, "replace", repo);
 expect(await repo.get<any>("service", binding.id)).toMatchObject({ origin: "restored", runtime: row.runtime, validation: row.validation });
 expect(await recordFieldWorkerRuntime(binding, { stage: "finished", visibility: "visible", at: 5 }, repo)).toBe(false);
 await removeWorld("w", repo, { deleteLore: true }); expect(await recordFieldWorkerRuntime(binding, { stage: "finished", visibility: "visible", at: 6 }, repo)).toBe(false); expect(await repo.list("service")).toEqual([]);
});
it("filters poisoned runtime metadata and reads V1/V2/V3 reports without invented worker steps", async () => {
 const { repo, binding } = await fixture(); await recordFieldWorkerRuntime(binding, { stage: "cleanup", visibility: "visible", at: 3 }, repo);
 const safe = await readServiceDiagnostics(repo); expect(readServiceDiagnosticSnapshot(safe)).toEqual(safe);
 for (const poison of [{ stage: "PRIVATE" }, { visibility: "PRIVATE" }, { at: -1 }, { url: "PRIVATE" }, { text: "PRIVATE" }]) {
  const bad = structuredClone(safe); Object.assign(bad.journal.entries[0]!.runtime!, poison); expect(readServiceDiagnosticSnapshot(bad)).toBeNull(); expect(serviceDiagnosticReport(bad, 5)).toBeNull();
 }
 for (const version of [1, 2, 3] as const) { const old = structuredClone(safe); old.diagnosticVersion = version; delete old.journal.entries[0]!.runtime; if (version === 1) delete old.journal.entries[0]!.validation; expect(readServiceDiagnosticSnapshot(old)).toEqual(old); }
 for (const poison of [{ stage: "PRIVATE" }, { visibility: "PRIVATE" }, { text: "PRIVATE" }, { at: Infinity }]) expect(validFieldWorkerRuntime({ stage: "ready", visibility: "visible", at: 3, ...poison })).toBe(false);
 const row = await repo.get<any>("service", binding.id); await recordFieldWorkerRuntime(binding, { stage: "ready", visibility: "hidden", at: 4 }, repo); expect(await repo.get("service", binding.id)).toEqual(row);
 const failed = vi.spyOn(repo, "updateRecords"); await expect(recordFieldWorkerRuntime(binding, { stage: "PRIVATE", visibility: "visible", at: 5 } as any, repo)).rejects.toThrow("service-runtime-invalid"); expect(failed).not.toHaveBeenCalled();
});
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dbs.splice(0).map(db => db.delete())); });
const validation = () => fieldServiceValidation(new FieldValidationError([{ path: "evidence[0].quote", rule: "exact substring of source text", actual: "string(length=23)" }], "invalid-evidence"), 200, 3)!;
async function fixture() {
 const db = new DeepRoleDatabase("field-validation-" + crypto.randomUUID()); dbs.push(db); const repo = new DeepRoleRepository(db); await repo.mergeRecords(castRecords());
 const input = { id: "field_" + crypto.randomUUID(), worldId: "w", sourceChatId: "PRIVATE_GAME", mode: "history" as const, fieldScope: "profile" as const, createdAt: 1 };
 await beginServiceOperation(input, repo); await updateServiceOperation(input.id, { phase: "dispatching", workerChatId: "PRIVATE_WORKER", cleanup: "pending", error: null, at: 2 }, repo);
 return { db, repo, binding: { ...input, workerChatId: "PRIVATE_WORKER" } };
}
it("records private-safe V3 reasons once, without changing phase, cleanup, timestamp or lore", async () => {
 const { repo, binding } = await fixture(), before = await repo.rawRecords(), changed = await browser.storage.local.get(LIBRARY_CHANGE_KEY);
 expect(await recordFieldServiceValidation(binding, validation(), repo)).toBe("recorded");
 const row = await repo.get<any>("service", binding.id); expect(row).toMatchObject({ contractVersion: 3, phase: "dispatching", cleanup: "pending", updatedAt: 2, validation: validation() });
 expect((await repo.rawRecords()).filter(r => r.kind !== "service")).toEqual(before.filter(r => r.kind !== "service")); expect(await browser.storage.local.get(LIBRARY_CHANGE_KEY)).toEqual(changed);
 const replacement = validation(); replacement.events[0]!.issues[0]!.path = "evidence[1].source";
 await recordFieldServiceValidation(binding, replacement, repo); expect(await repo.get("service", binding.id)).toEqual(row);
 await updateServiceOperation(binding.id, { phase: "failed", workerChatId: binding.workerChatId, cleanup: "done", error: "invalid-evidence", at: 4 }, repo);
 expect((await readServiceDiagnostics(repo)).journal.entries[0]!.validation).toEqual(validation()); expect(JSON.stringify((await readServiceDiagnostics(repo)).journal)).not.toContain("PRIVATE");
});
for (const patch of [{ worldId: "other" }, { sourceChatId: "other" }, { workerChatId: "other" }, { workerChatId: "PRIVATE_GAME" }, { mode: "suggest" }, { fieldScope: "scene" }, { createdAt: 0 }]) it(`rejects mismatched field registration ${JSON.stringify(patch)}`, async () => {
 const { repo, binding } = await fixture(); expect(await recordFieldServiceValidation({ ...binding, ...patch } as any, validation(), repo)).toBe("discarded"); expect((await repo.get<any>("service", binding.id))!.contractVersion).toBe(1);
});
it("does not recreate purged work or change imported historical records", async () => {
 const { repo, binding } = await fixture(); await recordFieldServiceValidation(binding, validation(), repo);
 const backup = await parseBackup(JSON.stringify(await createBackup(undefined, repo))); await restoreBackup(backup, "replace", repo); const restored = await repo.get("service", binding.id);
 expect(await recordFieldServiceValidation(binding, validation(), repo)).toBe("discarded"); expect(await repo.get("service", binding.id)).toEqual(restored);
 await removeWorld("w", repo, { deleteLore: true }); expect(await recordFieldServiceValidation(binding, validation(), repo)).toBe("discarded"); expect(await repo.list("service")).toEqual([]);
});
it("uses the encrypted vault and backup V3 without exporting diagnostics in a world package", async () => {
 const { db, repo, binding } = await fixture(); await recordFieldServiceValidation(binding, validation(), repo); await repo.enableVault("synthetic-password");
 expect((await db.records.get("service:" + binding.id))!.data).toBeUndefined(); await repo.lockVault(); await expect(recordFieldServiceValidation(binding, validation(), repo)).rejects.toThrow(); expect((await readServiceDiagnostics(repo)).journal.status).toBe("locked");
 await repo.unlockVault("synthetic-password"); const backup = await parseBackup(JSON.stringify(await createBackup("synthetic-backup", repo)), "synthetic-backup"); expect(backup.version).toBe(3);
 expect((await exportWorld("w", repo)).records.some(r => r.kind === "service")).toBe(false); await restoreBackup(backup, "replace", repo); expect(await repo.get("service", binding.id)).toMatchObject({ contractVersion: 3, origin: "restored", validation: validation() });
});
it("rejects unsafe reasons before writing anything", async () => {
 const { repo, binding } = await fixture(), update = vi.spyOn(repo, "updateRecords"), value = validation(); value.events[0]!.issues[0]!.actual = "PRIVATE_QUOTE";
 await expect(recordFieldServiceValidation(binding, value, repo)).rejects.toThrow("service-validation-invalid"); expect(update).not.toHaveBeenCalled();
});
