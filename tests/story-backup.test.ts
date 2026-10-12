import { afterEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { createId } from "../src/core/id";
import { validDataRecord } from "../src/core/record-validation";
import { assertStoryGraph, type StoryBaseline, type StoryEvent, type StoryRevision } from "../src/core/story-records";
import type { BackupPayload } from "../src/core/types";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository, VaultLockedError } from "../src/storage/repository";
import { ensureLegacyStory, readStoryTimeline, recordStoryObservation, type StoryObservation } from "../src/storage/story-history";
import { exportWorld, parseWorldPackage, removeEntity, removeWorld } from "../src/storage/worlds";
import { storyVariants } from "./fixtures/story-worlds";

const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dbs.splice(0).map(db => db.delete())); });
function empty() {
  const db = new DeepRoleDatabase("story-backup-" + crypto.randomUUID()); dbs.push(db);
  return { db, repo: new DeepRoleRepository(db) };
}
function turn(participant: string): StoryObservation {
  return { id: createId("revision"), messageId: createId("message"), nativeMessageKey: "synthetic-native-key", requestId: "synthetic-request", parentRevisionId: null,
    role: "assistant", completion: "complete", content: "The courier delivered the clock key.",
    events: [{ id: createId("event"), label: "Delivery", quote: "delivered the clock key", participantIds: [participant], changes: [] }] };
}
async function setup() {
  const fixture = storyVariants("ru").branches, { db, repo } = empty();
  await repo.mergeRecords(fixture.records);
  const input = { worldId: fixture.world.id, bindingId: fixture.binding.id };
  const branch = await ensureLegacyStory(input, repo), observation = turn(fixture.entities[0]!.id);
  await recordStoryObservation(branch.id, observation, repo);
  return { ...fixture, db, repo, branch, input, observation };
}
async function plainBackup(repo: DeepRoleRepository): Promise<BackupPayload> {
  const payload = await createBackup(undefined, repo);
  if (payload.format !== "deeprole-backup") throw new Error("Expected a plaintext test backup");
  return payload;
}

describe("chronicle backup compatibility and atomic recovery", () => {
  it("keeps version 1 for ordinary legacy libraries, without creating history during export", async () => {
    const fixture = storyVariants("en").ordinary, { repo } = empty(); await repo.mergeRecords(fixture.records);
    const payload = await plainBackup(repo);
    expect(payload.version).toBe(1); expect(payload.records).toEqual(await repo.rawRecords());
    expect(await repo.list("story")).toEqual([]);
    expect(await parseBackup(JSON.stringify(payload))).toEqual(payload);
  });

  it("round-trips version 2 through the real parser and repository without changing lore or identities", async () => {
    const { repo, branch } = await setup(), target = empty(), payload = await plainBackup(repo);
    expect(payload.version).toBe(2);
    await restoreBackup(await parseBackup(JSON.stringify(payload)), "replace", target.repo);
    expect(await target.repo.rawRecords()).toEqual(await repo.rawRecords());
    expect(await readStoryTimeline(branch.id, target.repo)).toEqual(await readStoryTimeline(branch.id, repo));
  });

  it.each(["legacy-envelope", "future-envelope", "future-schema", "missing-parent", "cross-world", "cycle", "extra-key", "row-id"] as const)("rejects %s before touching a working library", async problem => {
    const { repo, observation } = await setup(), payload = await plainBackup(repo), before = await repo.rawRecords();
    const row = payload.records.find(r => r.kind === "story" && r.id === observation.id)!, revision = row.data as StoryRevision;
    if (problem === "legacy-envelope") payload.version = 1;
    if (problem === "future-envelope") (payload as { version: number }).version = 999;
    if (problem === "future-schema") (revision as { contractVersion: number }).contractVersion = 999;
    if (problem === "missing-parent") revision.parentRevisionId = "missing";
    if (problem === "cross-world") revision.worldId = null;
    if (problem === "cycle") revision.parentRevisionId = revision.id;
    if (problem === "extra-key") Object.assign(revision, { secretlyApplied: true });
    if (problem === "row-id") row.id = "not-the-revision-id";
    await expect(parseBackup(JSON.stringify(payload))).rejects.toThrow();
    await expect(restoreBackup(payload, "replace", repo)).rejects.toThrow();
    expect(await repo.rawRecords()).toEqual(before);
  });

  it("merges identical history idempotently and adds new observations without selecting them", async () => {
    const { repo, branch, entities } = await setup(), payload = await plainBackup(repo), target = empty();
    await restoreBackup(payload, "merge", target.repo); await restoreBackup(payload, "merge", target.repo);
    expect(await target.repo.rawRecords()).toEqual(await repo.rawRecords());
    const addition = turn(entities[1]!.id); addition.nativeMessageKey = "synthetic-next-key";
    await recordStoryObservation(branch.id, addition, repo);
    await restoreBackup(await plainBackup(repo), "merge", target.repo);
    expect(await target.repo.rawRecords()).toEqual(await repo.rawRecords());
    expect((await readStoryTimeline(branch.id, target.repo)).branch.headRevisionId).toBeNull();
  });

  it("rejects conflicting history identities atomically, not silently mixing incompatible states", async () => {
    const { repo } = await setup(), before = await repo.rawRecords(), payload = await plainBackup(repo);
    const baseline = payload.records.find(r => r.kind === "story" && (r.data as StoryBaseline).type === "baseline")!.data as StoryBaseline;
    baseline.snapshot.presentIds = []; baseline.snapshot.partnerIds = [];
    assertStoryGraph(payload.records);
    await expect(restoreBackup(payload, "merge", repo)).rejects.toThrow("story-merge-conflict");
    expect(await repo.rawRecords()).toEqual(before);
  });

  it("does not merge independently initialized versions of the same legacy scope", async () => {
    const { repo } = await setup(), other = await setup(), before = await repo.rawRecords();
    await expect(restoreBackup(await plainBackup(other.repo), "merge", repo)).rejects.toThrow("story-baseline-conflict");
    expect(await repo.rawRecords()).toEqual(before);
  });

  it("restores the exact old chronicle when saving replacement settings fails", async () => {
    const { repo } = await setup(), before = await repo.rawRecords(), target = empty(), payload = await plainBackup(target.repo);
    const original = browser.storage.local.set.bind(browser.storage.local);
    vi.spyOn(browser.storage.local, "set").mockImplementation(async values => {
      if ("deeprole_settings" in values) throw new Error("injected-settings-failure");
      return original(values);
    });
    await expect(restoreBackup(payload, "replace", repo)).rejects.toThrow("injected-settings-failure");
    expect(await repo.rawRecords()).toEqual(before);
  });

  it("keeps all story kinds encrypted at rest, including new observations, and blocks locked operations", async () => {
    const { repo, db, branch, entities, input } = await setup(), before = await readStoryTimeline(branch.id, repo);
    await repo.enableVault("synthetic vault password");
    expect((await db.records.where("kind").equals("story").toArray()).every(r => r.data === undefined && !!r.encrypted)).toBe(true);
    const addition = turn(entities[1]!.id); addition.nativeMessageKey = "synthetic-next-key";
    await recordStoryObservation(branch.id, addition, repo);
    const encrypted = await createBackup("synthetic backup password", repo);
    expect(encrypted.format).toBe("deeprole-encrypted");
    expect(JSON.stringify(encrypted)).not.toContain(addition.content);
    await repo.lockVault(); const locked = await db.records.toArray();
    await expect(readStoryTimeline(branch.id, repo)).rejects.toBeInstanceOf(VaultLockedError);
    await expect(ensureLegacyStory(input, repo)).rejects.toBeInstanceOf(VaultLockedError);
    await expect(recordStoryObservation(branch.id, addition, repo)).rejects.toBeInstanceOf(VaultLockedError);
    await expect(createBackup(undefined, repo)).rejects.toBeInstanceOf(VaultLockedError);
    expect(await db.records.toArray()).toEqual(locked);
    await repo.unlockVault("synthetic vault password");
    const payload = await parseBackup(JSON.stringify(encrypted), "synthetic backup password");
    await restoreBackup(payload, "replace", repo);
    expect((await db.records.toArray()).every(r => r.data === undefined && !!r.encrypted)).toBe(true);
    expect((await readStoryTimeline(branch.id, repo)).baseline).toEqual(before.baseline);
    expect((await readStoryTimeline(branch.id, repo)).events).toHaveLength(2);
    const values = await repo.rawRecords(); await repo.disableVault();
    expect(await repo.rawRecords()).toEqual(values);
    expect((await db.records.toArray()).every(r => r.data !== undefined && !r.encrypted)).toBe(true);
  });
});

describe("chronicle scope in organizational actions", () => {
  it("does not leak playthrough observations into a portable world package", async () => {
    const { repo, world, observation } = await setup(), payload = await exportWorld(world.id, repo);
    expect(payload.records.some(r => r.kind === "story")).toBe(false);
    expect(JSON.stringify(payload)).not.toContain(observation.content);
    expect(parseWorldPackage(JSON.stringify(payload))).toEqual(payload);
    const bad = { ...payload, records: [...payload.records, ...(await repo.rawRecords()).filter(r => r.kind === "story")] };
    expect(() => parseWorldPackage(JSON.stringify(bad))).toThrow();
  });

  it("retains historical labels and participants when a live character profile is deleted", async () => {
    const { repo, branch, entities } = await setup(), before = await readStoryTimeline(branch.id, repo);
    await removeEntity(entities[0]!.id, repo);
    expect(await repo.get("entity", entities[0]!.id)).toBeNull();
    expect(await readStoryTimeline(branch.id, repo)).toEqual(before);
    expect(before.baseline.snapshot.names[entities[0]!.id]).toBe(entities[0]!.name);
    assertStoryGraph(await repo.rawRecords());
    const payload = await plainBackup(repo), target = empty(); await restoreBackup(payload, "replace", target.repo);
    expect(await readStoryTimeline(branch.id, target.repo)).toEqual(before);
  });

  it("detaches but preserves immutable history when removing only the world organization", async () => {
    const { repo, world, branch } = await setup(), before = await readStoryTimeline(branch.id, repo);
    await removeWorld(world.id, repo);
    const after = await readStoryTimeline(branch.id, repo);
    expect(after.baseline.snapshot).toEqual(before.baseline.snapshot); expect(after.baseline.origin).toEqual(before.baseline.origin);
    expect(after.events.map(e => e.participantIds)).toEqual(before.events.map(e => e.participantIds));
    expect(after.branch.worldId).toBeNull(); expect(after.baseline.worldId).toBeNull();
    const records = await repo.rawRecords(); expect(records.every(validDataRecord)).toBe(true); assertStoryGraph(records);
    await expect(recordStoryObservation(branch.id, turn("person-1"), repo)).rejects.toThrow("story-scope-invalid");
    expect(await parseBackup(JSON.stringify(await plainBackup(repo)))).toBeTruthy();
  });

  it("purges all chronicles of the chosen world and leaves another world intact", async () => {
    const { repo, world, input } = await setup();
    await ensureLegacyStory({ ...input, bindingId: "binding:synthetic-b" }, repo);
    const other = { ...world, id: "other-world" }; await repo.put("world", other);
    const fixture = storyVariants("en").ordinary;
    await repo.put("binding", { ...fixture.binding, id: "binding:other", chatId: "other-chat", worldId: other.id, characterScenes: {} });
    const survivor = await ensureLegacyStory({ worldId: other.id, bindingId: "binding:other" }, repo);
    const before = await readStoryTimeline(survivor.id, repo);
    await removeWorld(world.id, repo, { deleteLore: true });
    expect((await repo.list<StoryBaseline | StoryEvent>("story")).every(r => r.worldId === other.id)).toBe(true);
    expect(await readStoryTimeline(survivor.id, repo)).toEqual(before);
    expect(await repo.get("world", world.id)).toBeNull(); assertStoryGraph(await repo.rawRecords());
  });

  it("clears all chronicle records with the full library, without resurrection on read", async () => {
    const { repo, branch } = await setup(); await repo.clear();
    expect(await repo.rawRecords()).toEqual([]);
    await expect(readStoryTimeline(branch.id, repo)).rejects.toThrow("story-scope-invalid");
    expect(await repo.rawRecords()).toEqual([]);
  });
});
