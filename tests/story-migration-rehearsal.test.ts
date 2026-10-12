import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatBinding, DataRecord, SceneEntity, WorldProfile } from "../src/core/types";
import { DeepRoleDatabase, type StoredRecord } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { getVaultConfig } from "../src/storage/settings";
import { decodeRehearsal, prepareStoryMigration, StoryMigrationRehearsalDatabase, type LegacyBaseline } from "./fixtures/story-migration-rehearsal";
import { storyVariants } from "./fixtures/story-worlds";

const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dbs.map(db => db.delete())); dbs.length = 0; });
async function oldDatabase(encrypted: boolean, locale: "ru" | "en" = "ru") {
  const fixture = storyVariants(locale).branches;
  fixture.entities[0]!.characterSheet!.sprites = { neutral: "data:image/png;base64,U1lOVEhFVElD" };
  // A second world's manual canon is unrelated to the migrated chat.
  fixture.records.push({ kind: "world", id: "other-world", data: { ...fixture.world, id: "other-world", description: "  KEEP OTHER WORLD\n" } });
  const name = "rp00-migration-" + crypto.randomUUID();
  const old = new DeepRoleDatabase(name); dbs.push(old);
  const oldRepo = new DeepRoleRepository(old); await oldRepo.mergeRecords(fixture.records);
  if (encrypted) await oldRepo.enableVault("synthetic-test-password");
  expect(old.verno).toBe(2);
  const storedBefore = await old.records.toArray(); old.close();
  const db = new StoryMigrationRehearsalDatabase(name); dbs.push(db);
  const repo = new DeepRoleRepository(db); await db.open();
  expect(db.verno).toBe(3);
  expect(await db.records.toArray()).toEqual(storedBefore);
  return { fixture, db, repo, storedBefore };
}

describe.each([false, true])("RP-00 migration strategy, encrypted=%s (test-only database)", encrypted => {
  it.each(["ru", "en"] as const)("preserves every %s original and captures independent baselines without invented events", async locale => {
    const { db, repo, fixture, storedBefore } = await oldDatabase(encrypted, locale);
    const originals = await repo.rawRecords(), vaultBefore = await getVaultConfig();
    const plan = await prepareStoryMigration(db, repo);
    expect(plan.baselines).toHaveLength(2);
    expect(plan.baselines[0]!.playthroughId).not.toBe(plan.baselines[1]!.playthroughId);
    for (const baseline of plan.baselines) {
      const binding = originals.find(r => r.id === baseline.bindingId)!.data as ChatBinding;
      expect(baseline.currentScene).toEqual(binding.characterScenes![fixture.world.id]);
      expect(baseline.events).toEqual([]);
      expect(baseline).toMatchObject({ historyBeforeBaseline: "unknown", lineage: "unknown-legacy", parentBranchId: null, legacyEntryScope: "unclassified" });
    }
    expect(await db.rehearsal.count()).toBe(0);
    expect(await plan.commit()).toBe("committed");
    expect(await repo.rawRecords()).toEqual(originals);
    expect(await db.records.toArray()).toEqual(storedBefore);
    expect(await getVaultConfig()).toEqual(vaultBefore);
    const snapshot = await decodeRehearsal<{ records: unknown[] }>((await db.rehearsal.get("snapshot"))!);
    expect(snapshot.records).toEqual([...storedBefore].sort((a, b) => a.pk.localeCompare(b.pk)));
    for (const baseline of plan.baselines) expect(await decodeRehearsal<LegacyBaseline>((await db.rehearsal.get(baseline.id))!)).toEqual(baseline);
    expect((await repo.get<WorldProfile>("world", fixture.world.id))!.description).toBe(fixture.world.description);
    expect((await repo.get<SceneEntity>("entity", fixture.entities[0]!.id))!.characterSheet).toEqual(fixture.entities[0]!.characterSheet);
  });

  it.each(["after-snapshot", "after-baselines"] as const)("rolls back %s and resumes after reopening with no partial target", async failAt => {
    const { db, repo, storedBefore } = await oldDatabase(encrypted);
    const plan = await prepareStoryMigration(db, repo);
    await expect(plan.commit(failAt)).rejects.toThrow("rehearsal-injected-failure");
    expect(await db.rehearsal.count()).toBe(0); expect(await db.records.toArray()).toEqual(storedBefore);
    const ids = plan.baselines.map(b => b.id);
    db.close(); const reopened = new StoryMigrationRehearsalDatabase(db.name); dbs.push(reopened); await reopened.open();
    const retry = await prepareStoryMigration(reopened, new DeepRoleRepository(reopened));
    expect(retry.baselines.map(b => b.id)).toEqual(ids);
    expect(await retry.commit()).toBe("committed");
    expect(await reopened.rehearsal.count()).toBe(ids.length + 2);
    expect(await reopened.records.toArray()).toEqual(storedBefore);
  });

  it("is idempotent after successful commit and after preparing two concurrent plans", async () => {
    const { db, repo } = await oldDatabase(encrypted);
    const one = await prepareStoryMigration(db, repo), two = await prepareStoryMigration(db, repo);
    expect(await Promise.all([one.commit(), two.commit()])).toEqual(["committed", "already-complete"]);
    const completed = await db.rehearsal.toArray();
    expect(await (await prepareStoryMigration(db, repo)).commit()).toBe("already-complete");
    expect(await db.rehearsal.toArray()).toEqual(completed);
  });

  it("rejects concurrent source edits without reverting the user's new lore", async () => {
    const { fixture, db, repo } = await oldDatabase(encrypted);
    const stale = await prepareStoryMigration(db, repo);
    const edited = { ...fixture.world, description: "USER EDIT AFTER PREPARATION", updatedAt: 21 };
    await repo.put("world", edited);
    await expect(stale.commit()).rejects.toThrow("rehearsal-source-changed");
    expect(await db.rehearsal.count()).toBe(0);
    expect(await repo.get("world", fixture.world.id)).toEqual(edited);
    expect(await (await prepareStoryMigration(db, repo)).commit()).toBe("committed");
  });

  it("rejects mixed input even if a concurrent edit is reverted before commit", async () => {
    const { fixture, db, repo, storedBefore } = await oldDatabase(encrypted);
    const read = repo.rawRecords.bind(repo);
    vi.spyOn(repo, "rawRecords").mockImplementationOnce(async () => {
      await repo.put("world", { ...fixture.world, description: "TRANSIENT EDIT", updatedAt: 22 });
      const transient = await read();
      await db.records.bulkPut(storedBefore);
      return transient;
    });
    await expect(prepareStoryMigration(db, repo)).rejects.toThrow("rehearsal-source-changed");
    expect(await db.records.toArray()).toEqual(storedBefore);
    expect(await db.rehearsal.count()).toBe(0);
  });

  it("blocks a partial target rather than trusting a manifest marker", async () => {
    const { db, repo } = await oldDatabase(encrypted);
    const plan = await prepareStoryMigration(db, repo); await plan.commit();
    await db.rehearsal.delete(plan.baselines[0]!.id);
    await expect(plan.commit()).rejects.toThrow("rehearsal-incomplete-target");
  });

  it("does not accept a same-sized target with different decoded data", async () => {
    const { db, repo } = await oldDatabase(encrypted);
    const plan = await prepareStoryMigration(db, repo); await plan.commit();
    // Even with the right primary keys, a counterfeit manifest isn't completion.
    await db.rehearsal.put({ id: "manifest", data: { contractVersion: 999, status: "complete" } });
    await expect(plan.commit()).rejects.toThrow(encrypted ? "rehearsal-target-protection" : "rehearsal-target-mismatch");
  });

  it("can restore the original record table from the retained snapshot", async () => {
    const { db, repo, storedBefore } = await oldDatabase(encrypted);
    const originals = await repo.rawRecords();
    await (await prepareStoryMigration(db, repo)).commit();
    const snapshot = await decodeRehearsal<{ records: StoredRecord[] }>((await db.rehearsal.get("snapshot"))!);
    // Only the disposable test database is changed. This is a recovery rehearsal,
    // not an automatic production restore or a downloadable-backup test.
    await db.records.clear(); expect(await db.records.count()).toBe(0);
    await db.transaction("rw", db.records, () => db.records.bulkPut(snapshot.records));
    expect(await db.records.toArray()).toEqual(storedBefore);
    expect(await repo.rawRecords()).toEqual(originals);
  });

  it("keeps baseline identities when names change", async () => {
    const { fixture, db, repo } = await oldDatabase(encrypted);
    const before = await prepareStoryMigration(db, repo);
    await repo.put("entity", { ...fixture.entities[0]!, name: "A different name", updatedAt: 21 });
    const changed = await prepareStoryMigration(db, repo);
    expect(changed.baselines.map(b => [b.id, b.playthroughId, b.branchId])).toEqual(before.baselines.map(b => [b.id, b.playthroughId, b.branchId]));
    expect(await changed.commit()).toBe("committed");
    expect((await repo.get<SceneEntity>("entity", fixture.entities[0]!.id))!.name).toBe("A different name");
  });
});

it("rejects a plaintext replacement even when its decoded baseline content is correct", async () => {
  const { db, repo } = await oldDatabase(true);
  const plan = await prepareStoryMigration(db, repo); await plan.commit();
  const baseline = plan.baselines[0]!;
  await db.rehearsal.put({ id: baseline.id, data: baseline });
  await expect(plan.commit()).rejects.toThrow("rehearsal-target-protection");
});

it("does not commit data prepared with a vault key that has since been locked", async () => {
  const { db, repo, storedBefore } = await oldDatabase(true);
  const plan = await prepareStoryMigration(db, repo); await repo.lockVault();
  await expect(plan.commit()).rejects.toThrow("rehearsal-vault-changed");
  expect(await db.rehearsal.count()).toBe(0); expect(await db.records.toArray()).toEqual(storedBefore);
});

it("never stages plaintext story content when the old database uses the vault, and pauses while locked", async () => {
  const { db, repo, storedBefore } = await oldDatabase(true);
  await repo.lockVault();
  await expect(prepareStoryMigration(db, repo)).rejects.toThrow("rehearsal-vault-locked");
  expect(await db.rehearsal.count()).toBe(0); expect(await db.records.toArray()).toEqual(storedBefore);
  await repo.unlockVault("synthetic-test-password");
  const plan = await prepareStoryMigration(db, repo); await plan.commit();
  const target = await db.rehearsal.toArray();
  expect(target.every(row => row.data === undefined && row.encrypted?.algorithm === "AES-256-GCM")).toBe(true);
  const serialized = JSON.stringify(target);
  expect(serialized).not.toContain("Мастерская"); expect(serialized).not.toContain("Починить часы"); expect(serialized).not.toContain("U1lOVEhFVElD");
  await repo.lockVault(); await expect(decodeRehearsal(target[0]!)).rejects.toThrow("rehearsal-vault-locked");
});

it("preserves a malformed original and refuses conversion instead of silently fixing lore", async () => {
  const { fixture, db, repo } = await oldDatabase(false);
  await db.records.update(`world:${fixture.world.id}`, { data: { ...fixture.world, description: 123 } });
  const before = await db.records.toArray();
  await expect(prepareStoryMigration(db, repo)).rejects.toThrow("rehearsal-invalid-source");
  expect(await db.records.toArray()).toEqual(before); expect(await db.rehearsal.count()).toBe(0);
});

it("preserves dangling references and stops with an explicit missing-world reason", async () => {
  const { fixture, db, repo } = await oldDatabase(false);
  await repo.put("binding", { ...fixture.binding, worldId: "missing-world" });
  const before: DataRecord[] = await repo.rawRecords();
  await expect(prepareStoryMigration(db, repo)).rejects.toThrow("rehearsal-missing-world");
  expect(await repo.rawRecords()).toEqual(before); expect(await db.rehearsal.count()).toBe(0);
});
