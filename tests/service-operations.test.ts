import { afterEach, expect, it } from "vitest";
import { validDataRecord } from "../src/core/record-validation";
import { validServiceOperation, type ServiceOperation } from "../src/core/service-operations";
import { beginServiceOperation, updateServiceOperation } from "../src/storage/service-operations";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository, VaultLockedError } from "../src/storage/repository";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { exportWorld, removeWorld, parseWorldPackage } from "../src/storage/worlds";
import { castRecords } from "./fixtures/cast-data";
import { browser } from "wxt/browser";
import { LIBRARY_CHANGE_KEY } from "../src/storage/changes";

const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { await Promise.all(dbs.splice(0).map(db => db.delete())); });
async function fixture() {
 const db = new DeepRoleDatabase("service-operation-" + crypto.randomUUID()); dbs.push(db);
 const repo = new DeepRoleRepository(db); await repo.mergeRecords(castRecords()); return { db, repo };
}
const input = () => ({ id: "field_one", worldId: "w", sourceChatId: "game", mode: "history" as const, fieldScope: "profile" as const, createdAt: 1 });
const progress = (changes = {}) => ({ phase: "dispatching" as const, workerChatId: "owned", cleanup: "pending" as const, error: null, at: 2, ...changes });
it("strictly validates only bounded text-free metadata", async () => {
 const { repo } = await fixture(); const value = await beginServiceOperation(input(), repo);
 expect(validServiceOperation(value)).toBe(true); expect(validDataRecord({ kind: "service", id: value.id, data: value })).toBe(true);
 for (const changes of [{ prompt: "PRIVATE" }, { error: "PRIVATE" }, { sourceChatId: "https://chat.deepseek.com" }, { phase: "complete" }, { workerChatId: "game" }, { cleanup: "done" }, { updatedAt: 0 }, { origin: "page" }, { fieldScope: "PRIVATE" }]) expect(validServiceOperation({ ...value, ...changes })).toBe(false);
});
it("does not announce audit progress as a lore edit or start automatic preparation", async () => {
 const { repo } = await fixture(); const before = await browser.storage.local.get(LIBRARY_CHANGE_KEY);
 await beginServiceOperation(input(), repo); await updateServiceOperation("field_one", progress(), repo);
 expect(await browser.storage.local.get(LIBRARY_CHANGE_KEY)).toEqual(before);
});
it("is idempotent across repository instances and rejects ID reuse without writes", async () => {
 const { db, repo } = await fixture(); const another = new DeepRoleRepository(db);
 const [a, b] = await Promise.all([beginServiceOperation(input(), repo), beginServiceOperation(input(), another)]);
 expect(a).toEqual(b); expect(await repo.list("service")).toHaveLength(1);
 await expect(beginServiceOperation({ ...input(), sourceChatId: "other" }, repo)).rejects.toThrow("service-operation-conflict");
 expect(await repo.get("service", a.id)).toEqual(a);
});
it("retains cleanup and outcome independently and never marks dispatch as reply completion", async () => {
 const { repo } = await fixture(); await beginServiceOperation(input(), repo);
 const sent = await updateServiceOperation("field_one", progress(), repo); expect(sent).toMatchObject({ phase: "dispatching", cleanup: "pending", workerChatId: "owned" });
 await updateServiceOperation("field_one", progress({ phase: "result", cleanup: "failed", at: 3 }), repo);
 const done = await updateServiceOperation("field_one", progress({ phase: "result", cleanup: "done", at: 4 }), repo);
 expect(done).toMatchObject({ phase: "result", cleanup: "done" });
 expect(await updateServiceOperation("field_one", progress({ phase: "result", cleanup: "done", at: 99 }), repo)).toEqual(done);
});
it("rejects regressions and cross-chat changes, but permits missed intermediate stages", async () => {
 const { repo } = await fixture(); await beginServiceOperation(input(), repo);
 await updateServiceOperation("field_one", progress({ phase: "result", at: 3 }), repo);
 for (const change of [{ phase: "dispatching" }, { workerChatId: "other" }, { at: 2 }]) await expect(updateServiceOperation("field_one", progress({ phase: "result", at: 4, ...change }), repo)).rejects.toThrow("service-operation-conflict");
 await expect(updateServiceOperation("field_one", progress({ phase: "result", workerChatId: null, at: 4 }), repo)).rejects.toThrow("service-operation-invalid");
 await updateServiceOperation("field_one", progress({ phase: "failed", error: "cancelled", at: 5 }), repo);
 await expect(updateServiceOperation("field_one", progress({ phase: "result", at: 6 }), repo)).rejects.toThrow("service-operation-conflict");
});
it("does not recreate a purged operation or world from delayed updates", async () => {
 const { repo } = await fixture(); await beginServiceOperation(input(), repo);
 await removeWorld("w", repo, { deleteLore: true });
 expect(await updateServiceOperation("field_one", progress(), repo)).toBeNull();
 await expect(beginServiceOperation(input(), repo)).rejects.toThrow("service-operation-scope");
 expect(await repo.list("service")).toEqual([]);
});
it("detaches metadata without adding lore fields when only world organization is removed", async () => {
 const { repo } = await fixture(); await beginServiceOperation(input(), repo); await removeWorld("w", repo);
 const value = await repo.get<ServiceOperation>("service", "field_one"); expect(value?.worldId).toBeNull(); expect(validServiceOperation(value)).toBe(true);
});
it("encrypts metadata and prevents reads or writes while the vault is locked", async () => {
 const { db, repo } = await fixture(); await beginServiceOperation(input(), repo); await repo.enableVault("password-test");
 const row = await db.records.get("service:field_one"); expect(row?.data).toBeUndefined(); expect(row?.encrypted).toBeTruthy();
 await repo.lockVault(); await expect(updateServiceOperation("field_one", progress(), repo)).rejects.toBeInstanceOf(VaultLockedError);
 await expect(repo.get("service", "field_one")).rejects.toBeInstanceOf(VaultLockedError); await repo.unlockVault("password-test");
 expect(await repo.get("service", "field_one")).toMatchObject({ phase: "prepared" });
});
it("backs up operation metadata as version 3 and restores it as historical, never locally dispatched proof", async () => {
 const { repo } = await fixture(); await beginServiceOperation(input(), repo); await updateServiceOperation("field_one", progress(), repo);
 const backup = await parseBackup(JSON.stringify(await createBackup(undefined, repo))); expect(backup.version).toBe(3);
 const target = await fixture(); await restoreBackup(backup, "replace", target.repo);
 expect(await target.repo.get("service", "field_one")).toMatchObject({ origin: "restored", phase: "dispatching" });
 await expect(updateServiceOperation("field_one", progress({ at: 4 }), target.repo)).rejects.toThrow("service-operation-conflict");
 await expect(beginServiceOperation(input(), target.repo)).rejects.toThrow("service-operation-conflict");
 for (const version of [1, 2]) await expect(parseBackup(JSON.stringify({ ...backup, version }))).rejects.toThrow("Invalid DeepRole backup");
});
it("merge preserves an identical local operation and fails atomically on conflicts", async () => {
 const { repo } = await fixture(); await beginServiceOperation(input(), repo); const backup = await parseBackup(JSON.stringify(await createBackup(undefined, repo)));
 await restoreBackup(backup, "merge", repo); expect(await repo.get("service", "field_one")).toMatchObject({ origin: "local" });
 const conflict = structuredClone(backup); (conflict.records.find(r => r.kind === "service")!.data as ServiceOperation).sourceChatId = "other";
 const before = await repo.rawRecords(); await expect(restoreBackup(conflict, "merge", repo)).rejects.toThrow("service-merge-conflict"); expect(await repo.rawRecords()).toEqual(before);
});
it("excludes operations from portable worlds and rejects smuggling them into a world package", async () => {
 const { repo } = await fixture(); const value = await beginServiceOperation(input(), repo); const world = await exportWorld("w", repo);
 expect(world.records.some(r => r.kind === "service")).toBe(false);
 expect(() => parseWorldPackage(JSON.stringify({ ...world, records: [...world.records, { kind: "service", id: value.id, data: value }] }))).toThrow("invalidBackup");
});
it("rejects malformed progress before any write and keeps caller snapshots detached", async () => {
 const { repo } = await fixture(); const before = await beginServiceOperation(input(), repo);
 for (const changes of [{ raw: "PRIVATE" }, { error: "PRIVATE" }, { phase: "failed", error: null }, { at: NaN }, { cleanup: "done" }]) await expect(updateServiceOperation("field_one", progress(changes), repo)).rejects.toThrow("service-operation-invalid");
 expect(await repo.get("service", before.id)).toEqual(before); before.sourceChatId = "changed"; expect(await repo.get("service", before.id)).toMatchObject({ sourceChatId: "game" });
});
