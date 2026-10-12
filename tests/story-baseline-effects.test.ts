import { afterEach, describe, expect, it, vi } from "vitest";
import { captureStoryBaselineEffects, matchStoryBaselineEffects, validStoryBaselineEffects } from "../src/core/story-baseline-effects";
import { assertStoryGraph, storyRow, validStoryRecord } from "../src/core/story-records";
import type { ChatBinding, ScenePhoto } from "../src/core/types";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { ensureLegacyStory, readStoryTimeline, recordStoryObservation } from "../src/storage/story-history";
import { anchorStoryCheckpoint } from "../src/storage/story-observer";
import { selectStoryRevision } from "../src/storage/story-selection";
import { removeWorld } from "../src/storage/worlds";
import { storyWorld } from "./fixtures/story-worlds";

const databases: DeepRoleDatabase[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(databases.splice(0).map(db => db.delete())); });
function empty() { const db = new DeepRoleDatabase(`story-baseline-effects-${crypto.randomUUID()}`); databases.push(db); return { db, repo: new DeepRoleRepository(db) }; }
function fixture() {
  const f = storyWorld("en"), scene = f.binding.characterScenes![f.world.id]!;
  scene.lastReply = "before-checkpoint"; scene.progress = { status: "changed", rejected: 0, turn: "before-turn" }; scene.relationshipNotice = "limited";
  scene.portraitCycles = { [f.entities[0]!.id]: { neutral: { key: "before-cycle", order: [1, 0], cursor: 1 } } };
  const photo: ScenePhoto = { worldId: f.world.id, entityId: f.entities[0]!.id, messageKey: "before-message", turnKey: "before-turn", categoryId: "generated", imageKey: "before-image", createdAt: 20,
    generation: { status: "queued", scene: "Synthetic old portrait", updatedAt: 20, ticketId: "before-ticket" } };
  f.binding.scenePhotos = [photo]; return { ...f, photo };
}
async function setup() {
  const f = fixture(), { db, repo } = empty(); await repo.mergeRecords(f.records);
  const branch = await ensureLegacyStory({ worldId: f.world.id, bindingId: f.binding.id }, repo), initial = structuredClone(f.binding.characterScenes![f.world.id]!.states[f.entities[0]!.id]!);
  await recordStoryObservation(branch.id, { id: "synthetic-answer", messageId: "synthetic-message", nativeMessageKey: "synthetic-native", requestId: null, parentRevisionId: null, role: "assistant", completion: "complete",
    content: "The clock key was delivered.", events: [{ id: "synthetic-event", label: "Delivery", quote: "key was delivered", participantIds: [f.entities[0]!.id], changes: [{ entityId: f.entities[0]!.id, before: initial, after: { ...initial, condition: "Key delivered" } }] }] }, repo);
  return { ...f, db, repo, branch, initial };
}
const firstChoice = { headRevisionId: "synthetic-answer", expectedHeadRevisionId: null, expectedSelectionVersion: 0, acceptedEventIds: ["synthetic-event"] };
const anchor = (binding: ChatBinding) => ({ identity: { chatId: binding.chatId, nativeParentKey: null }, role: null, completion: "complete" as const, expectedSceneRevision: "legacy-scene-a" });

describe("before-checkpoint legacy effects, not a complete event ledger", () => {
  it("captures only exact target-world identities and metadata without modifying source data", () => {
    const f = fixture(); f.binding.scenePhotos!.push({ ...f.photo, worldId: "other-world" }); const before = structuredClone(f.binding), manifest = captureStoryBaselineEffects(f.binding, f.world.id);
    expect(manifest).toEqual({ algorithmVersion: 1, scene: { lastReply: "before-checkpoint", progress: { status: "changed", rejected: 0, turn: "before-turn" }, relationshipNotice: "limited", portraitCycles: f.binding.characterScenes![f.world.id]!.portraitCycles }, photos: [{ ...f.photo, generation: undefined }].map(({ generation: _, ...photo }) => photo) });
    expect(JSON.stringify(manifest)).not.toMatch(/generation|queued|ticketId|before-ticket|Synthetic old portrait|other-world/); expect(f.binding).toEqual(before);
    f.binding.characterScenes![f.world.id]!.portraitCycles![f.entities[0]!.id]!.neutral!.cursor = 0; expect(manifest.scene.portraitCycles![f.entities[0]!.id]!.neutral!.cursor).toBe(1);
  });
  it("compares a multiset of photos independent of display order, without hiding added duplicates", () => {
    const f = fixture(); f.binding.scenePhotos!.push({ ...f.photo, imageKey: "second-image" }); const manifest = captureStoryBaselineEffects(f.binding, f.world.id);
    f.binding.scenePhotos!.reverse(); expect(matchStoryBaselineEffects(f.binding, f.world.id, manifest)).toBe(true);
    manifest.photos.reverse(); const before = structuredClone(manifest); expect(matchStoryBaselineEffects(f.binding, f.world.id, manifest)).toBe(true); expect(manifest).toEqual(before);
    f.binding.scenePhotos!.push(structuredClone(f.photo)); expect(matchStoryBaselineEffects(f.binding, f.world.id, manifest)).toBe(false);
  });
  it.each(["extra", "version", "scope", "sparse", "photo-extra", "generation", "createdAt", "scene-extra", "progress-extra", "cycle-extra", "cycle-sparse", "inherited"])("rejects a malformed %s manifest", problem => {
    const f = fixture(), manifest: any = captureStoryBaselineEffects(f.binding, f.world.id);
    if (problem === "extra") manifest.extra = true;
    if (problem === "version") manifest.algorithmVersion = 2;
    if (problem === "scope") manifest.photos[0].worldId = "other-world";
    if (problem === "sparse") manifest.photos = new Array(1);
    if (problem === "photo-extra") manifest.photos[0].extra = true;
    if (problem === "generation") manifest.photos[0].generation = f.photo.generation;
    if (problem === "createdAt") manifest.photos[0].createdAt = NaN;
    if (problem === "scene-extra") manifest.scene.states = {};
    if (problem === "progress-extra") manifest.scene.progress.extra = true;
    if (problem === "cycle-extra") manifest.scene.portraitCycles[f.entities[0]!.id].neutral.extra = true;
    if (problem === "cycle-sparse") manifest.scene.portraitCycles[f.entities[0]!.id].neutral.order = new Array(2);
    if (problem === "inherited") manifest.scene = Object.create({ lastReply: "inherited" });
    expect(validStoryBaselineEffects(manifest, f.world.id)).toBe(false);
  });
  it("preserves all old effects on selection, return to the baseline and replay, without an image write", async () => {
    const f = await setup(), baseline = (await readStoryTimeline(f.branch.id, f.repo)).baseline;
    expect(baseline.legacyEffects).toEqual(captureStoryBaselineEffects(f.binding, f.world.id));
    const imageWrite = vi.spyOn(f.db.photos, "bulkPut"), imageDelete = vi.spyOn(f.db.photos, "bulkDelete");
    const selected = await selectStoryRevision(f.branch.id, firstChoice, f.repo);
    expect(selected.projection.snapshot.states[f.entities[0]!.id]!.condition).toBe("Key delivered");
    const back = await selectStoryRevision(f.branch.id, { headRevisionId: null, expectedHeadRevisionId: "synthetic-answer", expectedSelectionVersion: 1, acceptedEventIds: ["synthetic-event"] }, f.repo);
    expect(back.projection.snapshot.states[f.entities[0]!.id]).toEqual(f.initial);
    await selectStoryRevision(f.branch.id, { ...firstChoice, expectedSelectionVersion: 2 }, f.repo);
    const binding = (await f.repo.get<ChatBinding>("binding", f.binding.id))!;
    expect(captureStoryBaselineEffects(binding, f.world.id)).toEqual(baseline.legacyEffects); expect(binding.scenePhotos).toEqual(f.binding.scenePhotos);
    expect(imageWrite).not.toHaveBeenCalled(); expect(imageDelete).not.toHaveBeenCalled(); assertStoryGraph(await f.repo.rawRecords());
  });
  it.each(["working", "ready", "failed"] as const)("leaves an old photo job's current %s result live rather than replaying its queued snapshot", async status => {
    const f = await setup(), binding = (await f.repo.get<ChatBinding>("binding", f.binding.id))!;
    binding.scenePhotos![0]!.generation = { ...binding.scenePhotos![0]!.generation!, status, updatedAt: 40, illustrationId: "existing-illustration", ticketId: "current-ticket" };
    await f.repo.put("binding", binding); await selectStoryRevision(f.branch.id, firstChoice, f.repo);
    expect((await f.repo.get<ChatBinding>("binding", f.binding.id))!.scenePhotos).toEqual(binding.scenePhotos);
  });
  it.each(["photo-added", "photo-removed", "photo-key", "photo-time", "lastReply", "progress", "relationshipNotice", "portraitCycles"])("rejects an untracked %s change without any partial writes", async problem => {
    const f = await setup(), binding = (await f.repo.get<ChatBinding>("binding", f.binding.id))!, scene = binding.characterScenes![f.world.id]!;
    if (problem === "photo-added") binding.scenePhotos!.push({ ...f.photo, imageKey: "new-image" });
    if (problem === "photo-removed") binding.scenePhotos = [];
    if (problem === "photo-key") binding.scenePhotos![0]!.messageKey = "different-message";
    if (problem === "photo-time") binding.scenePhotos![0]!.createdAt++;
    if (problem === "lastReply") scene.lastReply = "different-turn";
    if (problem === "progress") scene.progress!.rejected++;
    if (problem === "relationshipNotice") scene.relationshipNotice = "unverified";
    if (problem === "portraitCycles") scene.portraitCycles![f.entities[0]!.id]!.neutral!.cursor = 0;
    await f.repo.put("binding", binding); const before = await f.repo.rawRecords();
    await expect(selectStoryRevision(f.branch.id, firstChoice, f.repo)).rejects.toThrow("story-effects-untracked"); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("preserves late changes on an exact retry, but blocks a subsequent different selection", async () => {
    const f = await setup(); await selectStoryRevision(f.branch.id, firstChoice, f.repo);
    const binding = (await f.repo.get<ChatBinding>("binding", f.binding.id))!; binding.scenePhotos!.push({ ...f.photo, imageKey: "late-image" }); await f.repo.put("binding", binding);
    const before = await f.repo.rawRecords(); expect((await selectStoryRevision(f.branch.id, firstChoice, f.repo)).status).toBe("already-selected");
    await expect(selectStoryRevision(f.branch.id, { headRevisionId: null, expectedHeadRevisionId: "synthetic-answer", expectedSelectionVersion: 1, acceptedEventIds: ["synthetic-event"] }, f.repo)).rejects.toThrow("story-effects-untracked"); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("anchors only the effects frozen when an unanchored baseline was created", async () => {
    const f = fixture(), { repo } = empty(); await repo.mergeRecords(f.records); const branch = await ensureLegacyStory({ worldId: f.world.id, bindingId: f.binding.id }, repo);
    f.binding.scenePhotos!.push({ ...f.photo, imageKey: "later-image" }); await repo.put("binding", f.binding); const before = await repo.rawRecords();
    await expect(anchorStoryCheckpoint(branch.id, anchor(f.binding), repo)).rejects.toThrow("story-effects-untracked"); expect(await repo.rawRecords()).toEqual(before);
  });
  it("never invents ownership for an older baseline lacking a manifest, including an anchor retry", async () => {
    const f = fixture(), { repo } = empty(); await repo.mergeRecords(f.records); const branch = await ensureLegacyStory({ worldId: f.world.id, bindingId: f.binding.id }, repo);
    const baseline = (await readStoryTimeline(branch.id, repo)).baseline; delete baseline.legacyEffects; expect(validStoryRecord(baseline)).toBe(true); await repo.put("story", baseline);
    const anchored = await anchorStoryCheckpoint(branch.id, anchor(f.binding), repo); expect(anchored.legacyEffects).toBeUndefined();
    expect((await anchorStoryCheckpoint(branch.id, anchor(f.binding), repo)).legacyEffects).toBeUndefined();
    await expect(selectStoryRevision(branch.id, { headRevisionId: null, expectedHeadRevisionId: null, expectedSelectionVersion: 0, acceptedEventIds: [] }, repo)).rejects.toThrow("story-effects-untracked");
    f.binding.scenePhotos = []; for (const key of ["lastReply", "progress", "relationshipNotice", "portraitCycles"] as const) delete f.binding.characterScenes![f.world.id]![key]; await repo.put("binding", f.binding);
    expect((await selectStoryRevision(branch.id, { headRevisionId: null, expectedHeadRevisionId: null, expectedSelectionVersion: 0, acceptedEventIds: [] }, repo)).status).toBe("selected");
  });
  it("does not recapture changed effects on ensure or an already anchored retry", async () => {
    const f = fixture(), { repo } = empty(); await repo.mergeRecords(f.records); const branch = await ensureLegacyStory({ worldId: f.world.id, bindingId: f.binding.id }, repo), baseline = await anchorStoryCheckpoint(branch.id, anchor(f.binding), repo);
    f.binding.scenePhotos!.push({ ...f.photo, imageKey: "later-image" }); await repo.put("binding", f.binding);
    await ensureLegacyStory({ worldId: f.world.id, bindingId: f.binding.id }, repo); expect(await anchorStoryCheckpoint(branch.id, anchor(f.binding), repo)).toEqual(baseline);
    expect((await readStoryTimeline(branch.id, repo)).baseline).toEqual(baseline);
  });
  it("restores the manifest through encrypted reload and portable backup without copying image jobs into story records", async () => {
    const f = await setup(); await f.repo.enableVault("synthetic-effects-passphrase"); expect(JSON.stringify(await f.db.records.toArray())).not.toContain("before-image");
    await f.repo.lockVault(); const reopened = new DeepRoleRepository(f.db); await reopened.unlockVault("synthetic-effects-passphrase");
    const baseline = (await readStoryTimeline(f.branch.id, reopened)).baseline;
    const backup = await createBackup("synthetic-effects-passphrase", reopened), destination = empty(); await restoreBackup(await parseBackup(JSON.stringify(backup), "synthetic-effects-passphrase"), "replace", destination.repo);
    expect((await readStoryTimeline(f.branch.id, destination.repo)).baseline).toEqual(baseline);
    await selectStoryRevision(f.branch.id, firstChoice, destination.repo); expect((await destination.repo.get<ChatBinding>("binding", f.binding.id))!.scenePhotos).toEqual(f.binding.scenePhotos);
    await removeWorld(f.world.id, destination.repo, { deleteLore: true }); expect(await destination.repo.list("story")).toEqual([]);
  });
  it("does not accept a foreign-world manifest in a backup or detached historical origin", async () => {
    const f = await setup(), baseline = (await readStoryTimeline(f.branch.id, f.repo)).baseline;
    baseline.legacyEffects!.photos[0]!.worldId = "other-world"; expect(validStoryRecord(baseline)).toBe(false);
    baseline.worldId = null; expect(validStoryRecord(baseline)).toBe(false);
    baseline.legacyEffects!.photos[0]!.worldId = f.world.id; expect(validStoryRecord(baseline)).toBe(true);
    const plain = await createBackup(undefined, f.repo); if (plain.format !== "deeprole-backup") throw Error("fixture-backup");
    const payload: any = plain; payload.records = payload.records.map((row: any) => row.id === baseline.id ? storyRow({ ...baseline, legacyEffects: { ...baseline.legacyEffects!, photos: [{ ...baseline.legacyEffects!.photos[0]!, worldId: "other-world" }] } }) : row);
    await expect(parseBackup(JSON.stringify(payload))).rejects.toThrow();
  });
  it("rolls back all scene writes if the final guard fails, including the intact photo job", async () => {
    const f = await setup(), before = await f.db.records.toArray();
    await expect(selectStoryRevision(f.branch.id, firstChoice, f.repo, async () => { throw Error("synthetic-scope-changed"); })).rejects.toThrow("synthetic-scope-changed"); expect(await f.db.records.toArray()).toEqual(before);
  });
  it("ignores effects of another world while retaining them byte-for-byte", async () => {
    const f = await setup(), binding = (await f.repo.get<ChatBinding>("binding", f.binding.id))!;
    binding.scenePhotos!.push({ ...f.photo, worldId: "unrelated-world", imageKey: "unrelated-image" }); await f.repo.put("binding", binding);
    await selectStoryRevision(f.branch.id, firstChoice, f.repo); expect((await f.repo.get<ChatBinding>("binding", f.binding.id))!.scenePhotos).toEqual(binding.scenePhotos);
  });
  it.each(["photo-first", "baseline-first"])("uses the shared lock when a second repository adds a photo: %s", async order => {
    const f = fixture(), { db, repo } = empty(); await repo.mergeRecords(f.records); const other = new DeepRoleRepository(db);
    const add = () => other.updateRecords(all => {
      const binding = structuredClone(all.find(row => row.kind === "binding" && row.id === f.binding.id)!.data as ChatBinding);
      binding.scenePhotos!.push({ ...f.photo, imageKey: "racing-image" });
      return { records: [{ kind: "binding" as const, id: binding.id, data: binding }], removed: [], result: null };
    });
    const freeze = () => ensureLegacyStory({ worldId: f.world.id, bindingId: f.binding.id }, repo);
    const [a, b] = order === "photo-first" ? await Promise.all([add(), freeze()]) : await Promise.all([freeze(), add()]);
    const branch = (order === "photo-first" ? b : a)!;
    const baseline = (await readStoryTimeline(branch.id, repo)).baseline;
    expect(baseline.legacyEffects!.photos).toHaveLength(order === "photo-first" ? 2 : 1);
    const before = await repo.rawRecords(), selection = selectStoryRevision(branch.id, { headRevisionId: null, expectedHeadRevisionId: null, expectedSelectionVersion: 0, acceptedEventIds: [] }, repo);
    if (order === "photo-first") { expect((await selection).status).toBe("selected"); expect((await repo.get<ChatBinding>("binding", f.binding.id))!.scenePhotos).toHaveLength(2); }
    else { await expect(selection).rejects.toThrow("story-effects-untracked"); expect(await repo.rawRecords()).toEqual(before); }
  });
});
