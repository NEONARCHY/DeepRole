import { afterEach, describe, expect, it } from "vitest";
import { rankMemories } from "../src/core/memory-engine";
import { buildBdsImport, parseBds } from "../src/core/bds-import";
import { expandFocus, mentionedEntities } from "../src/core/scene";
import type { MemoryBook, MemoryEntry, SceneEntity, WorldProfile } from "../src/core/types";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { assignBookWorld, cloneWorldPackage, duplicateEntity, exportWorld, parseWorldPackage, removeEntity, removeWorld } from "../src/storage/worlds";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";

const now = 123;
const world: WorldProfile = { id: "w1", name: "World one", description: "", color: "#64b5f6", contextBudget: 2000, relevanceThreshold: 6, createdAt: now, updatedAt: now };
const book: MemoryBook = { id: "b1", worldId: world.id, name: "Book", description: "", color: world.color, active: true, createdAt: now, updatedAt: now };
const character: SceneEntity = { id: "c1", worldId: world.id, kind: "character", name: "Мира", aliases: ["хранительница"], description: "", memberIds: [], createdAt: now, updatedAt: now };
const location: SceneEntity = { ...character, id: "l1", kind: "location", name: "Старая башня", aliases: ["обсерватория"] };
const group: SceneEntity = { ...character, id: "g1", kind: "group", name: "Исследователи", aliases: [], memberIds: [character.id, location.id, "g1"] };
const memory = (patch: Partial<MemoryEntry> = {}): MemoryEntry => ({ id: "m1", bookId: book.id, title: "Promise", content: "The promise remains.", keywords: [], activation: "smart", priority: "normal", enabled: true, entityIds: [character.id], source: { type: "manual" }, createdAt: now, updatedAt: now, ...patch });
const base = { draft: "", recentMessages: [], activeBookId: null, books: [book], entities: [character, location, group], scene: { worldId: world.id, focusIds: [character.id], bookId: null }, settings: { contextBudget: 2000, relevanceThreshold: 6 } };

describe("world isolation and scene ranking", () => {
  it("blocks foreign and unassigned memory including always and manual", () => {
    const selection = rankMemories({ ...base, manualIds: ["foreign"], entries: [memory(), memory({ id: "foreign", bookId: null, worldId: "w2", activation: "always" }), memory({ id: "legacy", bookId: null, activation: "always" })] });
    expect(selection.entries.map((e) => e.entry.id)).toEqual(["m1"]);
    expect(selection.entries[0]!.reasons).toEqual(["focus:c1"]);
  });
  it("prioritizes relationships with multiple focused entities", () => {
    const selection = rankMemories({ ...base, scene: { ...base.scene, focusIds: [group.id] }, entries: [memory(), memory({ id: "relationship", entityIds: [character.id, location.id] })] });
    expect(selection.entries.map((e) => e.entry.id)).toEqual(["relationship", "m1"]);
    expect(expandFocus([group.id, "foreign"], [character, location, group], world.id).size).toBe(3);
  });
  it("matches aliases and Russian forms without substring false positives", () => {
    expect(mentionedEntities("У обсерватории ждёт хранительница", [character, location])).toEqual([character.id, location.id]);
    expect(mentionedEntities("admiral", [{ ...character, name: "Mira", aliases: [] }])).toEqual([]);
    expect(mentionedEntities("Говорю с Аской и Мирой", [character, { ...character, id: "c2", name: "Аска" }])).toEqual(["c1", "c2"]);
    expect(mentionedEntities("Миралин", [character])).toEqual([]);
    expect(rankMemories({ ...base, scene: { ...base.scene, focusIds: [] }, draft: "хранительница", entries: [memory()] }).entries).toHaveLength(1);
  });
  it("does not activate manual entries through focus or bypass disabled books", () => {
    expect(rankMemories({ ...base, entries: [memory({ activation: "manual" })] }).entries).toHaveLength(0);
    expect(rankMemories({ ...base, books: [{ ...book, active: false }], manualIds: ["m1"], entries: [memory({ activation: "always" })] }).entries).toHaveLength(0);
  });
  it("budgets smart scene entries and honors explicit exclusions", () => {
    expect(rankMemories({ ...base, settings: { contextBudget: 1, relevanceThreshold: 6 }, entries: [memory()] }).omittedCount).toBe(1);
    expect(rankMemories({ ...base, excludedIds: ["m1"], entries: [memory()] }).entries).toHaveLength(0);
  });
});

describe("lossless BDS conversion", () => {
  const source = { "  Original title  ": { value: "  Text\r\n\twith formatting.  ", importance: "called" }, "Rule": { value: "Keep unchanged", importance: "always" } };
  it("preserves all original strings and importance, without mutating input", () => {
    const text = JSON.stringify(source);
    const items = parseBds(text);
    const records = buildBdsImport(items, "Imported", "manual");
    const entries = records.filter((r) => r.kind === "entry").map((r) => r.data as MemoryEntry);
    expect(entries.map((e) => [e.title, e.content, e.source.originalImportance])).toEqual(Object.entries(source).map(([title, e]) => [title, e.value, e.importance]));
    expect(entries.map((e) => e.activation)).toEqual(["manual", "always"]);
    expect(JSON.stringify(source)).toBe(text);
    expect(entries.every((e) => e.keywords.length === 0)).toBe(true);
  });
  it("creates fresh IDs for repeated imports and can target an existing world", () => {
    const a = buildBdsImport(parseBds(JSON.stringify(source)), "A", "smart", world.id);
    const b = buildBdsImport(parseBds(JSON.stringify(source)), "A", "smart", world.id);
    expect(a.some((r) => r.kind === "world")).toBe(false);
    expect(a.every((r) => !b.some((s) => s.id === r.id))).toBe(true);
  });
  it.each(["null", "[]", "{}", '{"bad":{"value":"text","importance":"unknown"}}', '{"bad":{"value":"text","importance":"called","extra":"lost"}}'])("rejects unsupported input atomically: %s", (text) => expect(() => parseBds(text)).toThrow());
});

describe("world repository operations", () => {
  const databases: DeepRoleDatabase[] = [];
  afterEach(async () => { await Promise.all(databases.map((db) => db.delete())); databases.length = 0; });
  async function setup() {
    const db = new DeepRoleDatabase(`worlds-${crypto.randomUUID()}`); databases.push(db);
    const repo = new DeepRoleRepository(db);
    await repo.put("world", world); await repo.put("book", book); await repo.put("entity", character); await repo.put("entry", memory());
    return { repo, db };
  }
  it("exports inherited scope and duplicates all references without copying chat bindings", async () => {
    const { repo } = await setup();
    await repo.put("template", { id: "t1", worldId: world.id, name: "Starter", opening: "Hello", initialState: "Night", focusIds: [character.id], createdAt: now, updatedAt: now });
    const pack = parseWorldPackage(JSON.stringify(await exportWorld(world.id, repo)));
    const records = cloneWorldPackage(pack, "Copy");
    await repo.mergeRecords(records);
    const copy = records.find((r) => r.kind === "world")!;
    const entry = records.find((r) => r.kind === "entry")!.data as MemoryEntry;
    expect(entry.bookId).toBe(records.find((r) => r.kind === "book")!.id);
    expect(entry.entityIds).toEqual([records.find((r) => r.kind === "entity")!.id]);
    expect(entry.content).toBe(memory().content);
    expect(entry.worldId).toBe(copy.id);
    expect(await repo.list("entry")).toHaveLength(2);
  });
  it("deleting worlds preserves original memory and books", async () => {
    const { repo } = await setup();
    await removeWorld(world.id, repo);
    expect(await repo.list("world")).toEqual([]); expect(await repo.list("entity")).toEqual([]);
    const entry = await repo.get<MemoryEntry>("entry", "m1");
    expect(entry?.content).toBe(memory().content); expect(entry?.entityIds).toEqual([]);
    expect((await repo.get<MemoryBook>("book", book.id))?.worldId).toBeNull();
  });
  it("duplicating/deleting profiles only changes links, not lore", async () => {
    const { repo } = await setup();
    await duplicateEntity(character, "Second", repo);
    expect((await repo.get<MemoryEntry>("entry", "m1"))?.entityIds).toHaveLength(2);
    await removeEntity(character.id, repo);
    const entry = await repo.get<MemoryEntry>("entry", "m1");
    expect(entry?.entityIds).toHaveLength(1); expect(entry?.content).toBe(memory().content);
  });
  it("moves old books without changing original titles or text", async () => {
    const { repo } = await setup();
    await repo.put("world", { ...world, id: "w2" });
    await assignBookWorld(book, "w2", repo);
    const entry = await repo.get<MemoryEntry>("entry", "m1");
    expect(entry?.worldId).toBe("w2"); expect(entry?.entityIds).toEqual([]); expect(entry?.title).toBe(memory().title);
  });
  it("roundtrips new entities through encrypted backups and vault", async () => {
    const { repo } = await setup();
    const backup = await createBackup("secret", repo);
    await repo.clear();
    await restoreBackup(await parseBackup(JSON.stringify(backup), "secret"), "replace", repo);
    await repo.enableVault("secret");
    expect((await repo.list<SceneEntity>("entity"))[0]).toEqual(character);
    await repo.lockVault();
    await expect(repo.list("world")).rejects.toThrow();
  });
  it("rejects broken package references", async () => {
    const { repo } = await setup(); const pack = await exportWorld(world.id, repo);
    pack.records = pack.records.filter((r) => r.kind !== "entity");
    expect(() => parseWorldPackage(JSON.stringify(pack))).toThrow();
  });
});
