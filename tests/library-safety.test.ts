import { afterEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import type { BackupPayload, MemoryBook, MemoryEntry, SceneEntity, WorldProfile } from "../src/core/types";
import { parseBackup, restoreBackup } from "../src/storage/backup";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { getSettings, saveSettings } from "../src/storage/settings";
import { assignBookWorld, duplicateEntity, removeBook, removeEntity, removeWorld } from "../src/storage/worlds";
import { removeMapBranch } from "../src/storage/lore-map";
import { saveEditorRecord } from "../src/storage/editing";

const world: WorldProfile = { id: "w", name: "World", description: "", color: "#58a6ff", contextBudget: 2000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
const book: MemoryBook = { id: "b", worldId: "w", name: "Book", description: "", color: world.color, active: true, createdAt: 1, updatedAt: 1 };
const person: SceneEntity = { id: "c", worldId: "w", kind: "character", name: "Mira", description: "Original", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1 };
const entry: MemoryEntry = { id: "e", worldId: "w", bookId: "b", title: "Original title", content: "  Original lore.\n", keywords: [], entityIds: ["c"], activation: "always", priority: "normal", enabled: true, source: { type: "manual" }, createdAt: 1, updatedAt: 1 };
const payload = (): BackupPayload => ({ format: "deeprole-backup", version: 1, exportedAt: new Date().toISOString(), records: [{ kind: "entry", id: entry.id, data: structuredClone(entry) }], settings: { ...DEFAULT_SETTINGS } });
const databases: DeepRoleDatabase[] = [];
async function setup() {
  const db = new DeepRoleDatabase("library-safety-" + crypto.randomUUID()); databases.push(db);
  const repo = new DeepRoleRepository(db);
  await repo.mergeRecords([{ kind: "world", id: world.id, data: world }, { kind: "book", id: book.id, data: book }, { kind: "entity", id: person.id, data: person }, { kind: "entry", id: entry.id, data: entry }]);
  return repo;
}
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(databases.map((db) => db.delete())); databases.length = 0; });

describe("backup integrity before any write", () => {
  it("rejects incomplete memory rather than installing data that crashes the menu", async () => {
    const value = payload(); delete (value.records[0]!.data as Partial<MemoryEntry>).title;
    await expect(parseBackup(JSON.stringify(value))).rejects.toThrow();
  });
  it("rejects duplicate record keys rather than silently keeping the last one", async () => {
    const value = payload(); value.records.push({ kind: "entry", id: entry.id, data: { ...entry, content: "Other version" } });
    await expect(parseBackup(JSON.stringify(value))).rejects.toThrow();
  });
  it("rejects invalid settings without replacing working settings", async () => {
    const value = payload(); value.settings.contextBudget = -1;
    await expect(parseBackup(JSON.stringify(value))).rejects.toThrow();
  });
  it("validates again when restore is called directly", async () => {
    const repo = await setup(); const before = await repo.rawRecords(); const value = payload();
    (value.records[0]!.data as MemoryEntry).keywords = null as any;
    await expect(restoreBackup(value, "replace", repo)).rejects.toThrow();
    expect(await repo.rawRecords()).toEqual(before);
  });
  it("accepts old optional fields and a BOM without changing any lore strings", async () => {
    const value = payload(); delete (value.records[0]!.data as MemoryEntry).entityIds;
    delete (value.records[0]!.data as MemoryEntry).worldId;
    const old = { ...value, settings: { locale: "ru" } };
    const parsed = await parseBackup("\uFEFF" + JSON.stringify(old));
    expect(parsed.settings).toEqual({ ...DEFAULT_SETTINGS, locale: "ru" });
    expect(parsed.records).toEqual(value.records);
  });
  it.each(["book", "entity", "template", "binding", "snapshot", "proposal", "change"])("rejects a malformed %s before replacing the library", async (kind) => {
    const value = payload(); value.records = [{ kind, id: "bad", data: { id: "bad", createdAt: 1, updatedAt: 1 } } as any];
    await expect(parseBackup(JSON.stringify(value))).rejects.toThrow();
  });
  it("adding a backup preserves existing records and current settings", async () => {
    const repo = await setup(); const current = { ...entry, content: "Edited after the backup", updatedAt: 2 };
    await repo.put("entry", current); await saveSettings({ ...DEFAULT_SETTINGS, contextBudget: 3500 });
    const value = payload(); value.records.push({ kind: "entry", id: "extra", data: { ...entry, id: "extra", bookId: null, worldId: null } });
    await restoreBackup(value, "merge", repo);
    expect(await repo.get("entry", entry.id)).toEqual(current);
    expect(await repo.get("entry", "extra")).not.toBeNull();
    expect((await getSettings()).contextBudget).toBe(3500);
  });
  it("rolls the library back if replacement settings cannot be saved", async () => {
    const repo = await setup(); const before = await repo.rawRecords();
    const value = payload(); value.records = [{ kind: "entry", id: "new", data: { ...entry, id: "new" } }];
    const original = browser.storage.local.set.bind(browser.storage.local);
    vi.spyOn(browser.storage.local, "set").mockImplementation(async (values) => {
      if ("deeprole_settings" in values) throw new Error("Storage unavailable");
      return original(values);
    });
    await expect(restoreBackup(value, "replace", repo)).rejects.toThrow();
    expect(await repo.rawRecords()).toEqual(before);
  });
});

describe("organizational actions never restore stale lore", () => {
  it.each(["world", "entity", "branch"] as const)("keeps a concurrent edit when removing a %s", async (kind) => {
    const repo = await setup();
    if (kind === "branch") {
      await repo.put("world", { ...world, mapLayout: { positions: {}, expandedIds: [], customCategories: [{ id: "custom-one", title: "One", parentId: null }] } });
      await repo.put("entry", { ...entry, mapCategory: "custom-one" });
    }
    // A second window commits after the operation reads its old snapshot.
    const oldRecords = await repo.rawRecords();
    const oldEntry = await repo.get<MemoryEntry>("entry", entry.id);
    const current = { ...oldEntry!, content: "Newest lore", updatedAt: 2 };
    await repo.put("entry", current);
    vi.spyOn(repo, "rawRecords").mockResolvedValueOnce(oldRecords);
    if (kind === "branch") vi.spyOn(repo, "list").mockImplementation(async (recordKind) => oldRecords.filter((r) => r.kind === recordKind).map((r) => r.data) as any);
    if (kind === "world") await removeWorld(world.id, repo);
    else if (kind === "entity") await removeEntity(person.id, repo);
    else await removeMapBranch(world.id, "custom-one", repo);
    expect((await repo.get<MemoryEntry>("entry", entry.id))?.content).toBe("Newest lore");
  });
  it("moves the current book instead of restoring an old name/activation", async () => {
    const repo = await setup(); await repo.put("world", { ...world, id: "other" });
    await repo.put("book", { ...book, name: "New name", active: false, updatedAt: 2 });
    await assignBookWorld(book, "other", repo);
    expect(await repo.get("book", book.id)).toMatchObject({ name: "New name", active: false, worldId: "other" });
  });
  it("copies the current profile rather than a stale menu snapshot", async () => {
    const repo = await setup(); await repo.put("entity", { ...person, description: "Newest profile", updatedAt: 2 });
    await duplicateEntity(person, "Copy", repo);
    expect((await repo.list<SceneEntity>("entity")).find((p) => p.id !== person.id)?.description).toBe("Newest profile");
  });
  it("does not recreate a deleted profile or move a book to a deleted world", async () => {
    const repo = await setup(); await repo.delete("entity", person.id);
    await expect(duplicateEntity(person, "Copy", repo)).rejects.toThrow();
    await expect(assignBookWorld(book, "missing", repo)).rejects.toThrow();
    expect(await repo.get("book", book.id)).toEqual(book);
    expect(await repo.list("entity")).toEqual([]);
  });
  it("keeps organizational updates encrypted and blocks them while the vault is locked", async () => {
    const repo = await setup(); await repo.enableVault("secret");
    await removeEntity(person.id, repo);
    expect((await repo.get<MemoryEntry>("entry", entry.id))?.entityIds).toEqual([]);
    await repo.lockVault();
    await expect(removeWorld(world.id, repo)).rejects.toThrow();
    await repo.unlockVault("secret");
    expect(await repo.get("world", world.id)).toEqual(world);
  });
  it("detaches all current entries when removing a book, including newly added ones", async () => {
    const repo = await setup(); await repo.put("entry", { ...entry, id: "added", content: "Latest addition" });
    await removeBook(book.id, repo);
    expect(await repo.get("book", book.id)).toBeNull();
    for (const e of await repo.list<MemoryEntry>("entry")) expect(e).toMatchObject({ worldId: world.id, bookId: null });
    expect((await repo.get<MemoryEntry>("entry", "added"))?.content).toBe("Latest addition");
  });
  it("an edit and an organizational change are serialized without losing the new text", async () => {
    const repo = await setup();
    await Promise.all([saveEditorRecord("entry", { ...entry, content: "New text", updatedAt: 2 }, entry, repo), removeEntity(person.id, repo)]);
    expect(await repo.get("entry", entry.id)).toMatchObject({ content: "New text", entityIds: [] });
  });
  it("refuses new records in missing worlds/books and references from another world", async () => {
    const repo = await setup();
    await expect(saveEditorRecord("entry", { ...entry, id: "new", worldId: "missing", bookId: null }, null, repo)).rejects.toThrow("memory-conflict");
    await expect(saveEditorRecord("book", { ...book, id: "new", worldId: "missing" }, null, repo)).rejects.toThrow("memory-conflict");
    await expect(saveEditorRecord("entry", { ...entry, id: "new", bookId: "missing" }, null, repo)).rejects.toThrow("memory-conflict");
    await repo.put("entry", { ...entry, id: "foreign", worldId: null, bookId: null, entityIds: [] });
    await expect(saveEditorRecord("entry", { ...entry, links: [{ targetId: "foreign", label: "", mode: "context" }] }, entry, repo)).rejects.toThrow("memory-conflict");
    expect(await repo.get("entry", entry.id)).toEqual(entry);
  });
  it("keeps an old reference to a deleted entry without inventing a replacement", async () => {
    const repo = await setup(); const base = { ...entry, links: [{ targetId: "deleted", label: "Original link", mode: "reference" as const }] };
    await repo.put("entry", base); await saveEditorRecord("entry", { ...base, content: "Edited", updatedAt: 2 }, base, repo);
    expect((await repo.get<MemoryEntry>("entry", entry.id))?.links).toEqual(base.links);
  });
});
