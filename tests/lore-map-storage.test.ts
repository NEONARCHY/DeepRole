import { afterEach, describe, expect, it } from "vitest";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { saveMapLayout, changeMapActivations, changeMapCategory, changeMapLink, confirmMapPerson, placeMapEntry, removeMapBranch } from "../src/storage/lore-map";
import { MapEditHistory } from "../src/storage/lore-map-history";
import { exportWorld, parseWorldPackage, cloneWorldPackage } from "../src/storage/worlds";
import { createBackup, parseBackup } from "../src/storage/backup";
import type { WorldProfile, MemoryEntry, LoreMapLayout } from "../src/core/types";

const world: WorldProfile = { id: "w", name: "Test", description: "", color: "#64b5f6", contextBudget: 2000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
const entry = (id: string, worldId = "w"): MemoryEntry => ({ id, worldId, title: " Original_" + id + " ", content: "  Lore\nkept intact.  ", keywords: [], bookId: null, enabled: true, activation: "smart", priority: "normal", source: { type: "import", originalImportance: "called" }, createdAt: 1, updatedAt: 1 });
const layout: LoreMapLayout = { positions: { "world:w": { x: 2400, y: 2400 }, "entry:a": { x: 2700, y: 2000 } }, expandedIds: ["branch:custom-one", "entry:a"], customCategories: [{ id: "custom-one", title: "Private branch", parentId: "characters" }], categoryNames: { body: "Body notes" } };
describe("map metadata persistence", () => {
  const databases: DeepRoleDatabase[] = [];
  afterEach(async () => { await Promise.all(databases.map((db) => db.delete())); databases.length = 0; });
  async function setup() {
    const db = new DeepRoleDatabase("map-" + crypto.randomUUID()); databases.push(db);
    const repo = new DeepRoleRepository(db);
    await repo.put("world", world); for (const e of [entry("a"), entry("b"), entry("foreign", "other")]) await repo.put("entry", e);
    return repo;
  }
  it("edits positions/categories/links without rewriting imported text or importance", async () => {
    const repo = await setup(); await saveMapLayout("w", layout, repo);
    await changeMapCategory("w", "a", "custom-one", repo);
    await changeMapLink("w", "a", "b", { label: "possible episode", mode: "reference" }, repo);
    const a = await repo.get<MemoryEntry>("entry", "a");
    expect(a).toMatchObject({ title: entry("a").title, content: entry("a").content, source: entry("a").source, mapCategory: "custom-one" });
    expect(a?.links).toEqual([{ targetId: "b", label: "possible episode", mode: "reference" }]);
    await changeMapCategory("w", "a", null, repo); await changeMapLink("w", "a", "b", null, repo);
    expect((await repo.get<MemoryEntry>("entry", "a"))?.links).toEqual([]);
  });
  it("changes a whole nested branch atomically, without affecting other worlds or facts, and supports undo/reset", async () => {
    const repo = await setup(); await saveMapLayout("w", { ...layout, customCategories: [...layout.customCategories, { id: "custom-child", title: "Child", parentId: "custom-one" }] }, repo);
    await changeMapCategory("w", "a", "custom-child", repo); await changeMapCategory("w", "b", "custom-one", repo);
    const expected = [(await repo.get<MemoryEntry>("entry", "a"))!, (await repo.get<MemoryEntry>("entry", "b"))!];
    const history = new MapEditHistory("w", repo, { layout, entries: expected });
    await changeMapActivations("w", expected, "always", repo, history, "branch:custom-one");
    expect((await repo.get<MemoryEntry>("entry", "a"))?.activation).toBe("always");
    expect((await repo.get<MemoryEntry>("entry", "b"))?.activation).toBe("always");
    expect((await repo.get<MemoryEntry>("entry", "foreign"))?.activation).toBe("smart");
    await history.undo(); expect((await repo.get<MemoryEntry>("entry", "a"))?.activation).toBe("smart");
    await history.redo(); await history.reset();
    expect((await repo.get<MemoryEntry>("entry", "b"))?.activation).toBe("smart");
    expect((await repo.get<MemoryEntry>("entry", "a"))?.content).toBe(entry("a").content);
  });
  it("refuses stale modes and changed branch membership without partial changes", async () => {
    const repo = await setup(); await saveMapLayout("w", layout, repo); await changeMapCategory("w", "a", "custom-one", repo);
    const a = (await repo.get<MemoryEntry>("entry", "a"))!;
    await changeMapCategory("w", "b", "custom-one", repo); const before = await repo.rawRecords();
    await expect(changeMapActivations("w", [a], "always", repo, undefined, "branch:custom-one")).rejects.toThrow("memory-conflict");
    expect(await repo.rawRecords()).toEqual(before);
    await repo.put("entry", { ...a, activation: "manual" }); const changed = await repo.rawRecords();
    await expect(changeMapActivations("w", [a, entry("b")], "always", repo)).rejects.toThrow("memory-conflict");
    expect(await repo.rawRecords()).toEqual(changed);
  });
  it("preserves fresh text and disabled status; refuses deleted targets and a locked vault", async () => {
    const repo = await setup(); const a = (await repo.get<MemoryEntry>("entry", "a"))!;
    await repo.put("entry", { ...a, content: "New facts", enabled: false });
    await changeMapActivations("w", [a], "manual", repo);
    expect(await repo.get<MemoryEntry>("entry", "a")).toMatchObject({ content: "New facts", enabled: false, activation: "manual" });
    await repo.delete("entry", "b"); await expect(changeMapActivations("w", [entry("b")], "always", repo)).rejects.toThrow();
    await repo.enableVault("secret"); await repo.lockVault(); await expect(changeMapActivations("w", [entry("a")], "always", repo)).rejects.toThrow();
  });
  it("refuses cross-world, self, unknown-category and invalid-layout writes", async () => {
    const repo = await setup(); const before = await repo.rawRecords();
    await expect(changeMapLink("w", "a", "foreign", { label: "", mode: "context" }, repo)).rejects.toThrow();
    await expect(changeMapLink("w", "a", "a", { label: "", mode: "context" }, repo)).rejects.toThrow();
    await expect(changeMapCategory("w", "a", "missing", repo)).rejects.toThrow();
    await expect(saveMapLayout("w", { ...layout, positions: { a: { x: NaN, y: 0 } } }, repo)).rejects.toThrow();
    expect(await repo.rawRecords()).toEqual(before);
  });
  it("creates profiles only on confirmation and keeps inferred entry strings intact", async () => {
    const repo = await setup(); expect(await repo.list("entity")).toEqual([]);
    await confirmMapPerson("w", "Мира", "мира", ["a", "b"], repo);
    expect(await repo.list("entity")).toHaveLength(1);
    expect((await repo.get<MemoryEntry>("entry", "a"))?.entityIds).toHaveLength(1);
    expect((await repo.get<MemoryEntry>("entry", "a"))?.content).toBe(entry("a").content);
  });
  it("exports and clones the map with fresh record IDs, and roundtrips through encryption/vault", async () => {
    const repo = await setup(); await saveMapLayout("w", layout, repo); await changeMapCategory("w", "a", "custom-one", repo);
    const pack = parseWorldPackage(JSON.stringify(await exportWorld("w", repo)));
    const copy = cloneWorldPackage(pack);
    const copyWorld = copy.find((r) => r.kind === "world")!.data as WorldProfile;
    const a = copy.find((r) => r.kind === "entry" && (r.data as MemoryEntry).title === entry("a").title)!;
    expect(copyWorld.mapLayout?.positions["entry:" + a.id]).toEqual(layout.positions["entry:a"]);
    expect(copyWorld.mapLayout?.positions["world:" + copyWorld.id]).toEqual(layout.positions["world:w"]);
    expect(copyWorld.mapLayout?.expandedIds).toContain("entry:" + a.id);
    const backup = await parseBackup(JSON.stringify(await createBackup("secret", repo)), "secret");
    expect((backup.records.find((r) => r.kind === "world")!.data as WorldProfile).mapLayout).toEqual(layout);
    await repo.enableVault("secret");
    expect((await repo.get<WorldProfile>("world", "w"))?.mapLayout).toEqual(layout);
  });
  it("removes custom branches recursively without deleting entries, confirmed connections or original strings", async () => {
    const repo = await setup(); await saveMapLayout("w", { ...layout, customCategories: [...layout.customCategories, { id: "custom-child", title: "Child", parentId: "custom-one" }] }, repo);
    await changeMapCategory("w", "a", "custom-child", repo);
    await changeMapLink("w", "a", "b", { label: "possible", mode: "reference" }, repo);
    const next = await removeMapBranch("w", "custom-one", repo);
    expect(next.customCategories).toEqual([]);
    const a = await repo.get<MemoryEntry>("entry", "a");
    expect(a?.mapCategory).toBeUndefined(); expect(a?.links?.[0]?.targetId).toBe("b");
    expect(a?.title).toBe(entry("a").title); expect(a?.content).toBe(entry("a").content);
    expect(await repo.list("entry")).toHaveLength(3);
    await expect(removeMapBranch("w", "characters", repo)).rejects.toThrow();
  });
  it("undoes, redoes and resets only map metadata, preserving later memory text edits", async () => {
    const repo = await setup(); const history = new MapEditHistory("w", repo);
    await saveMapLayout("w", layout, repo, history); await changeMapCategory("w", "a", "custom-one", repo, history);
    await changeMapLink("w", "a", "b", { label: "possible", mode: "context" }, repo, history);
    await history.undo(); expect((await repo.get<MemoryEntry>("entry", "a"))?.links).toBeUndefined();
    await history.redo(); expect((await repo.get<MemoryEntry>("entry", "a"))?.links?.[0]?.label).toBe("possible");
    const latest = (await repo.get<MemoryEntry>("entry", "a"))!; await repo.put("entry", { ...latest, content: "Newer user text", title: "Newer title" });
    await history.reset(); const reset = (await repo.get<MemoryEntry>("entry", "a"))!;
    expect(reset).toMatchObject({ content: "Newer user text", title: "Newer title", activation: "smart" }); expect(reset.mapCategory).toBeUndefined(); expect(reset.links).toBeUndefined(); expect(history.canReset).toBe(false);
    await history.undo(); expect((await repo.get<WorldProfile>("world", "w"))?.mapLayout).toEqual(layout); expect(history.canReset).toBe(true);
    await history.redo(); expect(history.canReset).toBe(false); expect((await repo.get<MemoryEntry>("entry", "a"))?.content).toBe("Newer user text");
  });
  it("discards redo after a new edit, but not after a no-op or a failed write", async () => {
    const repo = await setup(); const history = new MapEditHistory("w", repo);
    await saveMapLayout("w", layout, repo, history); await changeMapCategory("w", "a", "body", repo, history); await history.undo();
    await saveMapLayout("w", layout, repo, history); expect(history.canRedo).toBe(true);
    await expect(changeMapCategory("w", "a", "missing", repo, history)).rejects.toThrow(); expect(history.canRedo).toBe(true);
    await changeMapCategory("w", "a", "thoughts", repo, history); expect(history.canRedo).toBe(false);
  });
  it("refuses overlapping newer edits atomically, without consuming undo or reset", async () => {
    const repo = await setup(); const history = new MapEditHistory("w", repo);
    await saveMapLayout("w", layout, repo, history); await changeMapCategory("w", "a", "body", repo, history);
    await changeMapCategory("w", "a", "characters", repo); const before = await repo.rawRecords();
    await expect(history.undo()).rejects.toThrow("memory-conflict"); await expect(history.reset()).rejects.toThrow("memory-conflict");
    expect(await repo.rawRecords()).toEqual(before); expect(history.canUndo).toBe(true); expect(history.canReset).toBe(true);
  });
  it("restores branch deletion and all its categories in a single undo", async () => {
    const repo = await setup(); await saveMapLayout("w", layout, repo); await changeMapCategory("w", "a", "custom-one", repo);
    const history = new MapEditHistory("w", repo); await removeMapBranch("w", "custom-one", repo, history);
    await history.undo(); expect((await repo.get<WorldProfile>("world", "w"))?.mapLayout).toEqual(layout); expect((await repo.get<MemoryEntry>("entry", "a"))?.mapCategory).toBe("custom-one");
    await history.redo(); expect((await repo.get<MemoryEntry>("entry", "a"))?.mapCategory).toBeUndefined();
  });
  it("never orphans another window's category assignments or recreates deleted records", async () => {
    const repo = await setup(); const history = new MapEditHistory("w", repo); await saveMapLayout("w", layout, repo, history);
    await changeMapCategory("w", "b", "custom-one", repo); await expect(history.undo()).rejects.toThrow("memory-conflict");
    await repo.delete("world", "w"); await expect(history.reset()).rejects.toThrow("memory-conflict"); expect(await repo.get("world", "w")).toBeNull();
  });
  it("does not restore a connection to a deleted or moved target", async () => {
    const repo = await setup(); await changeMapLink("w", "a", "b", { label: "test", mode: "reference" }, repo);
    const history = new MapEditHistory("w", repo); await changeMapLink("w", "a", "b", null, repo, history); await repo.delete("entry", "b");
    await expect(history.undo()).rejects.toThrow("memory-conflict"); expect((await repo.get<MemoryEntry>("entry", "a"))?.links).toEqual([]);
  });
  it("groups category drops with their positions and respects a locked vault", async () => {
    const repo = await setup(); await saveMapLayout("w", layout, repo); const history = new MapEditHistory("w", repo);
    const next = { ...layout, positions: { "world:w": { x: 3000, y: 3000 } } };
    await placeMapEntry("w", "a", "body", next, repo, history); await repo.enableVault("secret"); await repo.lockVault();
    await expect(history.undo()).rejects.toThrow(); expect(history.canUndo).toBe(true); await repo.unlockVault("secret"); await history.undo();
    expect((await repo.get<WorldProfile>("world", "w"))?.mapLayout).toEqual(layout); expect((await repo.get<MemoryEntry>("entry", "a"))?.mapCategory).toBeUndefined(); expect(history.canUndo).toBe(false);
  });
  it("bounds step history while reset still reaches the session's original state", async () => {
    const repo = await setup(); const history = new MapEditHistory("w", repo);
    for (let i = 0; i < 105; i++) await saveMapLayout("w", { ...layout, positions: { a: { x: i, y: i } } }, repo, history);
    for (let i = 0; i < 100; i++) await history.undo(); expect(history.canUndo).toBe(false); expect(history.canReset).toBe(true);
    await history.reset(); expect((await repo.get<WorldProfile>("world", "w"))?.mapLayout?.positions).toEqual({}); expect(history.canReset).toBe(false);
  });
  it("checks the opening snapshot before the first edit rather than overwriting another window", async () => {
    const repo = await setup(); const history = new MapEditHistory("w", repo, { layout: world.mapLayout, entries: [entry("a"), entry("b")] });
    await changeMapCategory("w", "a", "body", repo);
    const before = await repo.rawRecords(); await expect(changeMapCategory("w", "a", "characters", repo, history)).rejects.toThrow("memory-conflict");
    expect(await repo.rawRecords()).toEqual(before); expect(history.canUndo).toBe(false);
  });
});
