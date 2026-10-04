import { afterEach, describe, expect, it } from "vitest";
import { browser } from "wxt/browser";
import { characterFactFingerprint, memoryFingerprint, prepareMemoryProposals } from "../src/core/memory-proposals";
import { parseServiceData, loreDraftPrompt, characterFactPrompt } from "../src/core/service-protocol";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository, MemoryConflictError } from "../src/storage/repository";
import { applyMemoryProposals, undoLoreChange } from "../src/storage/memory-proposals";
import { createBackup, parseBackup } from "../src/storage/backup";
import { LIBRARY_CHANGE_KEY } from "../src/storage/changes";
import { PENDING_SUGGESTIONS_KEY } from "../src/core/messages";
import { migrateLegacyProposals } from "../src/storage/legacy-proposals";
import type { MemoryCandidate, MemoryEntry, MemoryProposalBatch, SceneEntity, ServiceRequest, WorldProfile } from "../src/core/types";

const world: WorldProfile = { id: "w", name: "World", description: "", color: "blue", contextBudget: 2000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
const entry: MemoryEntry = { id: "one", worldId: "w", bookId: null, title: "Mira's oath", content: "Keep the old promise.", keywords: ["promise"], activation: "always", priority: "high", enabled: true, mapCategory: "world-rules", links: [{ targetId: "other", label: "possible", mode: "reference" }], source: { type: "import", originalTitle: "Mira's oath", originalImportance: "always" }, createdAt: 1, updatedAt: 1 };
const candidate = (patch: Partial<MemoryCandidate> = {}): MemoryCandidate => ({ id: crypto.randomUUID(), title: entry.title, content: "Keep the old promise. The gate is now open.", keywords: [], activation: "smart", priority: "normal", bookId: null, selected: true, ...patch });
const character: SceneEntity = { id: "mira", worldId: "w", kind: "character", name: "Mira", description: "Mira has red hair.", aliases: [], memberIds: [], characterSheet: { gender: "female", protagonist: false, appearance: "Red hair, blue coat.", personality: "Careful", goals: "Find the gate", background: "Lives in the tower", sprites: { neutral: "data:image/png;base64,AA==" } }, createdAt: 1, updatedAt: 1 };
const request = async (patch: Partial<ServiceRequest> = {}): Promise<ServiceRequest> => ({ id: crypto.randomUUID(), type: "memory-analysis", worldId: "w", bookId: null, focusIds: [], chatId: "chat", createdAt: 2, baseVersions: { one: await memoryFingerprint(entry) }, ...patch });
const databases: DeepRoleDatabase[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map((db) => db.delete())); });
async function setup(items = [candidate({ targetEntryId: "one" }), candidate({ title: "New location", content: "A bridge", activation: "manual" })]) {
  const db = new DeepRoleDatabase(`proposals-${crypto.randomUUID()}`); databases.push(db); const repo = new DeepRoleRepository(db);
  await repo.mergeRecords([{ kind: "world", id: world.id, data: world }, { kind: "entry", id: entry.id, data: entry }]);
  const batch = await prepareMemoryProposals(items, [entry], await request()); await repo.put("proposal", batch); return { repo, db, batch };
}
describe("approved lore updates", () => {
  it("reviews a whole-world character correction, applies profile and entries atomically, then undoes both", async () => {
    const db = new DeepRoleDatabase(`character-fact-${crypto.randomUUID()}`); databases.push(db); const repo = new DeepRoleRepository(db);
    const second = { ...entry, id: "two", title: "The tower", content: "At the tower, her red hair catches the light." };
    await repo.mergeRecords([{ kind: "world", id: world.id, data: world }, { kind: "entity", id: character.id, data: character }, { kind: "entry", id: entry.id, data: entry }, { kind: "entry", id: second.id, data: second }]);
    const targeted = await request({ targetEntityId: character.id, baseEntityVersion: await characterFactFingerprint(character), baseVersions: { one: await memoryFingerprint(entry), two: await memoryFingerprint(second) } });
    const prompt = characterFactPrompt(character, "Her hair is now black, not red", [entry, second], "en");
    expect(prompt).toContain('"id":"two"'); expect(prompt).toContain("nothing is saved automatically");
    const profile = { description: "Mira has black hair.", appearance: "Black hair, blue coat.", personality: "Careful", goals: "Find the gate", background: "Lives in the tower" };
    const batch = await prepareMemoryProposals([candidate({ targetEntryId: "two", title: second.title, content: "At the tower, her black hair catches the light." })], [entry, second], targeted, profile, character);
    expect(batch.profileChange?.beforeAppearance).toBe("Red hair, blue coat."); expect(batch.scanVersions).toHaveProperty("two");
    await repo.put("proposal", batch);
    const change = await applyMemoryProposals(batch.id, batch.items, repo, profile);
    expect((await repo.get<SceneEntity>("entity", character.id))?.characterSheet?.sprites).toEqual(character.characterSheet?.sprites);
    expect((await repo.get<SceneEntity>("entity", character.id))?.characterSheet?.appearance).toBe("Black hair, blue coat.");
    expect((await repo.get<MemoryEntry>("entry", "two"))?.content).toContain("black hair");
    await undoLoreChange(change!.id, repo);
    expect((await repo.get<SceneEntity>("entity", character.id))?.characterSheet?.appearance).toBe("Red hair, blue coat.");
    expect((await repo.get<MemoryEntry>("entry", "two"))?.content).toContain("red hair");
  });
  it("blocks targeted corrections when a scanned record changes or the model invents a target", async () => {
    const db = new DeepRoleDatabase(`character-fact-${crypto.randomUUID()}`); databases.push(db); const repo = new DeepRoleRepository(db);
    await repo.mergeRecords([{ kind: "world", id: world.id, data: world }, { kind: "entity", id: character.id, data: character }, { kind: "entry", id: entry.id, data: entry }]);
    const targeted = await request({ targetEntityId: character.id, baseEntityVersion: await characterFactFingerprint(character) });
    const unchangedProfile = { description: character.description, appearance: character.characterSheet!.appearance, personality: character.characterSheet!.personality, goals: character.characterSheet!.goals, background: character.characterSheet!.background };
    await expect(prepareMemoryProposals([candidate({ targetEntryId: "foreign" })], [entry], targeted, unchangedProfile, character)).rejects.toThrow("character-fact-target");
    const batch = await prepareMemoryProposals([candidate({ targetEntryId: "one" })], [entry], targeted, unchangedProfile, character);
    await repo.put("proposal", batch); await repo.put("entry", { ...entry, content: "Later user edit", updatedAt: 4 });
    await expect(applyMemoryProposals(batch.id, batch.items, repo)).rejects.toBeInstanceOf(MemoryConflictError);
    expect(await repo.get("proposal", batch.id)).toBeTruthy(); expect(await repo.list("change")).toEqual([]);
  });
  it("handles a profile-only correction without creating a duplicate memory record", async () => {
    const db = new DeepRoleDatabase(`character-fact-${crypto.randomUUID()}`); databases.push(db); const repo = new DeepRoleRepository(db);
    const withoutSheet = { ...character, id: "uncarded", characterSheet: undefined };
    await repo.mergeRecords([{ kind: "world", id: world.id, data: world }, { kind: "entity", id: withoutSheet.id, data: withoutSheet }]);
    const targeted = await request({ targetEntityId: withoutSheet.id, baseEntityVersion: await characterFactFingerprint(withoutSheet), baseVersions: {} });
    const profile = { description: "Mira has black hair.", appearance: "Black hair", personality: "", goals: "", background: "" };
    const batch = await prepareMemoryProposals([], [], targeted, profile, withoutSheet);
    expect(batch.items).toEqual([]); expect(batch.profileChange?.hadCharacterSheet).toBe(false);
    await repo.put("proposal", batch);
    const change = await applyMemoryProposals(batch.id, [], repo, profile);
    expect((await repo.get<SceneEntity>("entity", withoutSheet.id))?.characterSheet?.appearance).toBe("Black hair");
    expect(await repo.list("entry")).toEqual([]);
    await undoLoreChange(change!.id, repo);
    expect((await repo.get<SceneEntity>("entity", withoutSheet.id))?.characterSheet).toBeUndefined();
  });
  it("rejects a later profile edit before approval without touching its records", async () => {
    const db = new DeepRoleDatabase(`character-fact-${crypto.randomUUID()}`); databases.push(db); const repo = new DeepRoleRepository(db);
    await repo.mergeRecords([{ kind: "world", id: world.id, data: world }, { kind: "entity", id: character.id, data: character }, { kind: "entry", id: entry.id, data: entry }]);
    const targeted = await request({ targetEntityId: character.id, baseEntityVersion: await characterFactFingerprint(character) });
    const profile = { description: "Mira has black hair.", appearance: "Black hair", personality: "Careful", goals: "Find the gate", background: "Lives in the tower" };
    const batch = await prepareMemoryProposals([candidate({ targetEntryId: "one" })], [entry], targeted, profile, character);
    await repo.put("proposal", batch);
    await repo.put("entity", { ...character, characterSheet: { ...character.characterSheet!, appearance: "User's newer edit" }, updatedAt: 3 });
    await expect(applyMemoryProposals(batch.id, batch.items, repo, profile)).rejects.toBeInstanceOf(MemoryConflictError);
    expect((await repo.get<MemoryEntry>("entry", entry.id))?.content).toBe(entry.content);
    expect(await repo.get("proposal", batch.id)).toBeTruthy();
  });
  it("prepares updates, deduplicates repeats and keeps unchanged lore untouched", async () => {
    const batch = await prepareMemoryProposals([candidate(), candidate(), candidate({ title: "Bridge", content: "one" }), candidate({ title: "Bridge", content: "two" })], [entry], await request());
    expect(batch.items).toHaveLength(2); expect(batch.items[0]?.targetEntryId).toBe("one");
    expect(batch.items[0]?.expectedEntry).toEqual(entry);
    const unchanged = await prepareMemoryProposals([candidate({ content: entry.content })], [entry], await request()); expect(unchanged.items).toEqual([]);
  });
  it("unchecks stale, unknown and ambiguous targets, including cross-world IDs", async () => {
    const stale = await prepareMemoryProposals([candidate()], [{ ...entry, content: "Edited", updatedAt: 1 }], await request());
    expect(stale.items[0]).toMatchObject({ issue: "stale", selected: false });
    const unknown = await prepareMemoryProposals([candidate({ targetEntryId: "foreign" })], [entry], await request()); expect(unknown.items[0]).toMatchObject({ issue: "unknown-target", selected: false });
    const ambiguous = await prepareMemoryProposals([candidate()], [entry, { ...entry, id: "duplicate" }], await request()); expect(ambiguous.items[0]).toMatchObject({ issue: "ambiguous", selected: false });
  });
  it("applies one atomic batch and preserves mode, links, category and BDS source", async () => {
    const { repo, batch } = await setup(); const change = await applyMemoryProposals(batch.id, batch.items, repo);
    expect(await repo.get("proposal", batch.id)).toBeNull(); expect(await repo.list("entry")).toHaveLength(2);
    expect(await repo.get("entry", "one")).toMatchObject({ activation: "always", keywords: entry.keywords, links: entry.links, mapCategory: entry.mapCategory, source: entry.source, content: batch.items[0]!.content });
    expect(change?.entries).toHaveLength(2);
    const signal = (await browser.storage.local.get(LIBRARY_CHANGE_KEY))[LIBRARY_CHANGE_KEY]; expect(JSON.stringify(signal)).not.toContain("promise");
  });
  it("rejects a stale editor or proposal without partial new entries or lost queue", async () => {
    const { repo, batch } = await setup(); const edited = { ...entry, content: "User edit", updatedAt: 1 }; await repo.put("entry", edited);
    await expect(applyMemoryProposals(batch.id, batch.items, repo)).rejects.toBeInstanceOf(MemoryConflictError);
    expect(await repo.list("entry")).toEqual([edited]); expect(await repo.get("proposal", batch.id)).toBeTruthy(); expect(await repo.list("change")).toEqual([]);
    await expect(repo.putIfUnchanged("entry", { ...entry, content: "Stale editor" }, entry)).rejects.toBeInstanceOf(MemoryConflictError);
    expect(await repo.get("entry", entry.id)).toEqual(edited);
  });
  it("undoes approved changes but never overwrites a later edit", async () => {
    const { repo, batch } = await setup(); const change = await applyMemoryProposals(batch.id, batch.items, repo);
    await undoLoreChange(change!.id, repo); expect(await repo.list("entry")).toEqual([entry]);
    const freshBatch = await prepareMemoryProposals([candidate()], [entry], await request()); await repo.put("proposal", freshBatch);
    const second = await applyMemoryProposals(freshBatch.id, freshBatch.items, repo); await repo.put("entry", { ...entry, content: "Later user edit" });
    await expect(undoLoreChange(second!.id, repo)).rejects.toBeInstanceOf(MemoryConflictError);
    expect((await repo.get<MemoryEntry>("entry", entry.id))?.content).toBe("Later user edit");
  });
  it("validates scope and target IDs even if edited choices try to redirect a write", async () => {
    const { repo, batch } = await setup();
    await expect(applyMemoryProposals(batch.id, [{ ...batch.items[0]!, targetEntryId: "foreign" }], repo)).rejects.toBeInstanceOf(MemoryConflictError);
    await expect(applyMemoryProposals(batch.id, [{ ...batch.items[1]!, bookId: "foreign-book" }], repo)).rejects.toBeInstanceOf(MemoryConflictError);
    expect(await repo.list("entry")).toEqual([entry]);
  });
  it("prevents simultaneous batches from duplicating a new title", async () => {
    const { repo, batch } = await setup([candidate({ title: "Bridge", content: "Bridge" })]);
    const second = { ...structuredClone(batch), id: "second" }; await repo.put("proposal", second);
    const results = await Promise.allSettled([applyMemoryProposals(batch.id, batch.items, repo), applyMemoryProposals(second.id, second.items, repo)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await repo.list<MemoryEntry>("entry")).filter((entry) => entry.title === "Bridge")).toHaveLength(1);
  });
  it("encrypts proposals and history in the vault and roundtrips protected backups", async () => {
    const { repo, db, batch } = await setup(); await repo.enableVault("password");
    const stored = await db.records.toArray(); expect(stored.every((row) => row.data === undefined && !!row.encrypted)).toBe(true);
    await repo.lockVault(); await expect(applyMemoryProposals(batch.id, batch.items, repo)).rejects.toThrow();
    await repo.unlockVault("password"); const change = await applyMemoryProposals(batch.id, batch.items, repo);
    expect((await db.records.get(`change:${change!.id}`))?.encrypted).toBeTruthy();
    const backup = await createBackup("backup", repo); const parsed = await parseBackup(JSON.stringify(backup), "backup"); expect(parsed.records.some((r) => r.kind === "change")).toBe(true);
    await expect(parseBackup(JSON.stringify(backup), "wrong")).rejects.toThrow();
  });
  it("rejects malformed proposal backups and oversized model output", async () => {
    const { repo } = await setup(); const backup = await createBackup(undefined, repo);
    if (backup.format !== "deeprole-backup") throw new Error();
    const row = backup.records.find((row) => row.kind === "proposal")!; (row.data as MemoryProposalBatch).items = [null as any];
    await expect(parseBackup(JSON.stringify(backup))).rejects.toThrow();
    expect(parseServiceData('<deeprole_data>{"type":"handoff","title":{},"summary":"x"}</deeprole_data>')).toBeNull();
    expect(parseServiceData(`<deeprole_data>${JSON.stringify({ type: "memory-suggestions", items: Array(101).fill({ title: "a", content: "b" }) })}</deeprole_data>`)).toBeNull();
    expect(parseServiceData(`<deeprole_data>${JSON.stringify({ type: "memory-suggestions", items: [], profile: { description: "", appearance: "Black hair", personality: "", goals: "", background: "" } })}</deeprole_data>`)).toMatchObject({ profile: { appearance: "Black hair" } });
    expect(parseServiceData(`<deeprole_data>${JSON.stringify({ type: "memory-suggestions", items: [], profile: { description: "", appearance: "X".repeat(1201), personality: "", goals: "", background: "" } })}</deeprole_data>`)).toBeNull();
    expect(loreDraftPrompt("My rules", "en")).toContain("until the user approves");
  });
  it("upgrades old pending suggestions once, without approving facts or stale replacements", async () => {
    const { repo } = await setup([]);
    await browser.storage.local.set({ [PENDING_SUGGESTIONS_KEY]: [candidate({ worldId: "w" }), candidate({ worldId: "w", title: "Legacy idea", selected: false })] });
    await Promise.all([migrateLegacyProposals(repo), migrateLegacyProposals(repo)]);
    const migrated = (await repo.list<MemoryProposalBatch>("proposal")).find((batch) => batch.id.startsWith("legacy:"))!;
    expect(migrated.items).toHaveLength(2);
    expect(migrated.items[0]).toMatchObject({ issue: "stale", selected: false });
    expect(migrated.items[1]).toMatchObject({ title: "Legacy idea", selected: false });
    expect(await repo.list("entry")).toEqual([entry]);
    expect((await browser.storage.local.get(PENDING_SUGGESTIONS_KEY))[PENDING_SUGGESTIONS_KEY]).toBeUndefined();
    await migrateLegacyProposals(repo);
    expect((await repo.list<MemoryProposalBatch>("proposal")).filter((batch) => batch.id.startsWith("legacy:"))).toHaveLength(1);
  });
  it("keeps legacy suggestions while locked and encrypts them after unlocking", async () => {
    const { repo, db } = await setup([]); await repo.enableVault("secret"); await repo.lockVault();
    const legacy = [candidate({ worldId: "w", title: "Old queue" })];
    await browser.storage.local.set({ [PENDING_SUGGESTIONS_KEY]: legacy }); await migrateLegacyProposals(repo);
    expect((await browser.storage.local.get(PENDING_SUGGESTIONS_KEY))[PENDING_SUGGESTIONS_KEY]).toEqual(legacy);
    await repo.unlockVault("secret"); await migrateLegacyProposals(repo);
    const migrated = (await db.records.toArray()).find((row) => row.id.startsWith("legacy:"));
    expect(migrated?.encrypted).toBeTruthy(); expect(migrated?.data).toBeUndefined();
  });
  it("does not erase malformed or out-of-world legacy data", async () => {
    const { repo } = await setup([]);
    for (const legacy of [[null], [candidate({ worldId: "missing" })]]) {
      await browser.storage.local.set({ [PENDING_SUGGESTIONS_KEY]: legacy });
      await expect(migrateLegacyProposals(repo)).rejects.toThrow();
      expect((await browser.storage.local.get(PENDING_SUGGESTIONS_KEY))[PENDING_SUGGESTIONS_KEY]).toEqual(legacy);
    }
  });
});
