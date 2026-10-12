import { expect, it } from "vitest";
import { SERVICE_DIAGNOSTIC_LIMIT, readServiceDiagnosticSnapshot, serviceDiagnosticReport, serviceDiagnosticSnapshot } from "../src/core/service-diagnostics";
import { serviceOperationFromStart, type ServiceOperation } from "../src/core/service-operations";
import { SERVICE_OUTBOX_PREFIX, servicePending } from "../src/core/service-outbox";

const id = (i = 1) => `field_00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
function record(i = 1, changes = {}): ServiceOperation {
 return { ...serviceOperationFromStart({ id: id(i), worldId: "PRIVATE_WORLD", sourceChatId: "PRIVATE_CHAT", mode: "suggest", fieldScope: "profile", createdAt: i }), ...changes };
}
const pending = (i = 1, changes = {}) => servicePending(id(i), { phase: "failed", cleanup: "done", error: "vault-locked", workerChatId: "PRIVATE_WORKER", at: i + 1, ...changes });
const read = (rows: unknown = [record()], updates: unknown = {}) => serviceDiagnosticSnapshot({ status: "read", values: rows }, { status: "read", values: updates });
it("projects only allowed fields, redacts legacy IDs and keeps committed/pending states separate", () => {
 const row = record(1, { phase: "dispatching", workerChatId: "PRIVATE_WORKER" }), entry = pending();
 const snapshot = read([row, record(2, { id: "PRIVATE_LEGACY", origin: "restored" })], { [SERVICE_OUTBOX_PREFIX + entry.id]: entry, apiKey: "PRIVATE_KEY", other: { text: "PRIVATE_LORE" } });
 expect(snapshot.journal).toMatchObject({ total: 2, invalid: 0, entries: [{ id: null, origin: "restored" }, { phase: "dispatching", cleanup: "pending" }] });
 expect(snapshot.pending).toMatchObject({ total: 1, entries: [{ id: entry.id, phase: "failed", cleanup: "done", error: "vault-locked" }] });
 const text = serviceDiagnosticReport(snapshot, 3)!;
 expect(text).not.toMatch(/PRIVATE|worldId|sourceChatId|workerChatId|"token"|https:/);
 expect(text).not.toContain(entry.token);
 expect(JSON.parse(text)).toMatchObject({ readOnly: true, nativeCompletion: "not-verified" });
 expect(row.phase).toBe("dispatching"); expect(entry.phase).toBe("failed");
});
for (const changes of [{ text: "PRIVATE" }, { error: "PRIVATE" }, { mode: "PRIVATE" }, { origin: "PRIVATE" }, { fieldScope: "PRIVATE" }, { updatedAt: 9_000_000_000_000_000 }, { cleanup: "done" }, { id: "cast_00000000-0000-4000-8000-000000000001" }]) it(`excludes unsafe journal records ${JSON.stringify(changes)}`, () => {
 const snapshot = read([record(1, changes)]);
 expect(snapshot.journal).toEqual({ status: "read", total: 0, invalid: 1, omitted: 0, entries: [] });
 expect(serviceDiagnosticReport(snapshot, 1)).not.toContain("PRIVATE");
});
for (const changes of [{ prompt: "PRIVATE" }, { token: "PRIVATE" }, { error: "PRIVATE" }, { at: 9_000_000_000_000_000 }, { id: "field_PRIVATE" }, { phase: "PRIVATE" }]) it(`excludes unsafe pending entries ${JSON.stringify(changes)}`, () => {
 const entry = { ...pending(), ...changes };
 const snapshot = read([], { [SERVICE_OUTBOX_PREFIX + id()]: entry });
 expect(snapshot.pending).toMatchObject({ total: 0, invalid: 1, entries: [] });
 expect(serviceDiagnosticReport(snapshot, 1)).not.toContain("PRIVATE");
});
it("rejects mismatched pending keys and duplicate journal records without echoing either", () => {
 const entry = pending(), snapshot = read([record(), record()], { [SERVICE_OUTBOX_PREFIX + id(2)]: entry });
 expect(snapshot.journal).toMatchObject({ total: 1, invalid: 1 }); expect(snapshot.pending).toMatchObject({ total: 0, invalid: 1 });
});
it("bounds only displayed/exported rows, preserving full counts and newest-first ordering", () => {
 const rows = Array.from({ length: SERVICE_DIAGNOSTIC_LIMIT + 15 }, (_, i) => record(i + 1)), updates = Object.fromEntries(rows.map((r, i) => [SERVICE_OUTBOX_PREFIX + r.id, pending(i + 1)]));
 const snapshot = read(rows, updates);
 for (const part of [snapshot.journal, snapshot.pending]) expect(part).toMatchObject({ total: 65, omitted: 15, entries: expect.any(Array) });
 expect(snapshot.journal.entries).toHaveLength(50); expect(snapshot.pending.entries).toHaveLength(50); expect(snapshot.journal.entries[0]?.id).toBe(id(65)); expect(rows).toHaveLength(65);
 expect(readServiceDiagnosticSnapshot(snapshot)).toEqual(snapshot);
});
for (const input of [null, "PRIVATE", 4]) it(`does not call unreadable data empty ${JSON.stringify(input)}`, () => {
 const snapshot = read(input, input);
 expect(snapshot.journal.status).toBe("unavailable"); expect(snapshot.journal.total).toBeNull();
 expect(snapshot.pending.status).toBe("unavailable"); expect(snapshot.pending.total).toBeNull();
});
it("accepts an empty journal array but not an array in place of extension storage", () => {
 const snapshot = read([], []); expect(snapshot.journal).toMatchObject({ status: "read", total: 0 }); expect(snapshot.pending).toMatchObject({ status: "unavailable", total: null });
});
it("shows unknown counts while the vault or queue is unavailable", () => {
 const snapshot = serviceDiagnosticSnapshot({ status: "locked", values: [record()] }, { status: "unavailable", values: {} });
 expect(snapshot.journal).toEqual({ status: "locked", total: null, invalid: null, omitted: null, entries: [] });
 expect(readServiceDiagnosticSnapshot(snapshot)).toEqual(snapshot);
});
it("rebuilds detached snapshots before export", () => {
 const input = read(), safe = readServiceDiagnosticSnapshot(input)!;
 expect(safe).toEqual(input); expect(safe).not.toBe(input); expect(safe.journal.entries[0]).not.toBe(input.journal.entries[0]);
 input.journal.entries[0]!.phase = "failed"; expect(safe.journal.entries[0]!.phase).toBe("prepared");
});
it("rejects duplicate request IDs in an incoming projected report", () => {
 const value = read(); value.journal.entries.push({ ...value.journal.entries[0]! }); value.journal.total = 2;
 expect(readServiceDiagnosticSnapshot(value)).toBeNull();
});
for (const alter of [
 (v: any) => { v.privateText = "PRIVATE"; },
 (v: any) => { v.journal.entries[0].privateText = "PRIVATE"; },
 (v: any) => { v.journal.entries[0].id = "PRIVATE"; },
 (v: any) => { v.journal.entries[0].error = "PRIVATE"; },
 (v: any) => { v.journal.entries[0].updatedAt = 9_000_000_000_000_000; },
 (v: any) => { v.journal.total = 2; },
 (v: any) => { v.pending.status = "PRIVATE"; },
 (v: any) => { v.journal.status = "locked"; },
]) it("refuses tampered reports at the display/copy boundary", () => {
 const value = read(); alter(value); expect(readServiceDiagnosticSnapshot(value)).toBeNull(); expect(serviceDiagnosticReport(value, 1)).toBeNull();
});
for (const checkedAt of [-1, NaN, Infinity, 1.2, 9_000_000_000_000_000]) it(`refuses an invalid report date ${checkedAt}`, () => expect(serviceDiagnosticReport(read(), checkedAt)).toBeNull());
it("supports cast failures without revealing world IDs", () => {
 const cast = record(1, { id: id().replace("field_", "cast_"), operation: "cast-preparation", mode: "history", fieldScope: "cast", sourceChatId: null, phase: "failed", error: "model-refusal", cleanup: "failed" });
 const snapshot = read([cast]); expect(readServiceDiagnosticSnapshot(snapshot)).toEqual(snapshot); expect(snapshot.journal.entries[0]).toMatchObject({ operation: "cast-preparation", error: "model-refusal", cleanup: "failed" });
 expect(serviceDiagnosticReport(snapshot, 1)).not.toContain("PRIVATE_WORLD");
});
