import { afterEach, describe, expect, it, vi } from "vitest";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { readStoryCheckpoint, saveStoryCheckpoint } from "../src/storage/story-checkpoint";
import { prepareDispatchCapture, confirmDispatchCapture, advanceDispatchCapture } from "../src/storage/story-dispatch-capture";
import { recordDispatchReply } from "../src/storage/story-dispatch-reply";
import { readNativeStoryReply } from "../src/core/story-native-reply";
import { validStoryCheckpointChoice, validStoryCheckpointReview, type StoryCheckpointChoice } from "../src/core/story-checkpoint";
import { nativeStoryMessageKey as key } from "../src/core/story-transport";
import { assertStoryGraph, type StoryBaseline } from "../src/core/story-records";
import { ensureLegacyStory, readStoryTimeline, recordStoryObservation } from "../src/storage/story-history";
import { prepareStoryRequest } from "../src/storage/story-requests";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { removeWorld } from "../src/storage/worlds";
import type { StoryDispatchCaptureInput, StoryDispatchCapture } from "../src/core/story-dispatch-capture";
import { storyWorld } from "./fixtures/story-worlds";
import { nativeReplyPayload, replyQuery } from "./fixtures/story-native-reply";
import { captureStoryBaselineEffects } from "../src/core/story-baseline-effects";
import type { ChatBinding } from "../src/core/types";

const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dbs.splice(0).map(db => db.delete())); });
function empty() { const db = new DeepRoleDatabase("checkpoint-" + crypto.randomUUID()); dbs.push(db); return { db, repo: new DeepRoleRepository(db) }; }
async function fixture() {
  const { db, repo } = empty(), f = storyWorld("ru"); await repo.mergeRecords(f.records);
  const input: StoryDispatchCaptureInput = { id: replyQuery.requestId, identity: replyQuery.identity, transport: "xhr", worldId: f.world.id, bindingId: f.binding.id, sceneRevision: "legacy-scene-a", originalDraft: "I take the key", proposedContext: "PRIVATE_MEMORY" };
  await prepareDispatchCapture(input, 7, repo); await confirmDispatchCapture({ requestId: input.id, identity: input.identity, transport: "xhr", outgoingText: input.originalDraft }, 7, repo);
  const route = { requestId: input.id, identity: input.identity, transport: "xhr" as const };
  await advanceDispatchCapture({ ...route, phase: "started" }, 7, repo); await advanceDispatchCapture({ ...route, phase: "settled", delivery: { status: "accepted", httpStatus: 200 } }, 7, repo);
  await advanceDispatchCapture({ ...route, phase: "closed", link: replyQuery.link, sawFinish: true, issue: null }, 7, repo);
  const read = readNativeStoryReply(nativeReplyPayload(input.originalDraft), replyQuery); if (read.status !== "read") throw Error("fixture-invalid");
  await recordDispatchReply({ ...read.result, serverSelection: "different" }, 7, repo);
  const scope = { chatId: f.binding.chatId, worldId: f.world.id }, review = await readStoryCheckpoint(scope, 7, repo);
  const choice: StoryCheckpointChoice = { ...scope, bindingId: review.bindingId, requestId: input.id, expectedSceneRevision: review.sceneRevision, expectedSnapshot: review.snapshot };
  return { ...f, db, repo, scope, review, choice, input, before: await repo.rawRecords() };
}
describe("explicit checkpoint from an owned confirmed exchange", () => {
  it("reads without migration, memory/reasoning exposure, model calls or guessed selection", async () => {
    const f = await fixture(); expect(validStoryCheckpointReview(f.review)).toBe(true); expect(validStoryCheckpointChoice(f.choice)).toBe(true);
    expect(f.review).toMatchObject({ worldName: "Мастерская", availableCount: 1, checkpoint: null, candidates: [{ draft: "I take the key", serverSelection: "different" }] });
    expect(JSON.stringify(f.review)).not.toMatch(/PRIVATE_MEMORY|THOUGHTS|FOREIGN|EARLIER|proposedContext|wireUserText/);
    expect(await f.repo.list("story")).toEqual([]); expect(await f.repo.rawRecords()).toEqual(f.before);
    expect((await readStoryCheckpoint(f.scope, 8, f.repo)).candidates).toEqual([]);
  });
  it("freezes the currently reviewed scene and anchors after the exact reply in one transaction", async () => {
    const f = await fixture(), result = await saveStoryCheckpoint(f.choice, 7, f.repo), timeline = await readStoryTimeline(result.branchId, f.repo);
    expect(timeline.baseline).toMatchObject({ historyBeforeBaseline: "unknown", legacyEntryScope: "unclassified", snapshot: f.review.snapshot, origin: { bindingId: f.binding.id, sceneRevision: "legacy-scene-a", nativeAnchor: { nativeMessageKey: key("43"), role: "assistant" } } });
    expect(timeline.branch).toMatchObject({ headRevisionId: null, selectionVersion: 0 }); expect(timeline.projection).toBeNull(); expect(timeline.revisions).toEqual([]); expect(timeline.requests).toEqual([]); expect(timeline.events).toEqual([]);
    expect((await f.repo.rawRecords()).filter(r => r.kind !== "story")).toEqual(f.before); assertStoryGraph(await f.repo.rawRecords());
    expect((await readStoryCheckpoint(f.scope, 7, f.repo)).checkpoint).toMatchObject({ branchId: result.branchId, anchorKey: key("43") });
  });
  it("does not require the send-time scene to equal the reviewed current scene", async () => {
    const f = await fixture(), next = structuredClone(f.binding); next.characterScenes![f.world.id]!.revision = "changed-after-reply"; next.characterScenes![f.world.id]!.states["person-1"]!.condition = "The key is in hand";
    await f.repo.put("binding", next); const review = await readStoryCheckpoint(f.scope, 7, f.repo);
    const result = await saveStoryCheckpoint({ ...f.choice, expectedSceneRevision: review.sceneRevision, expectedSnapshot: review.snapshot }, 7, f.repo);
    expect((await readStoryTimeline(result.branchId, f.repo)).baseline.snapshot.states["person-1"]!.condition).toBe("The key is in hand");
  });
  it("captures the current before-checkpoint photos and metadata atomically, never an image job replay", async () => {
    const f = await fixture(), binding = structuredClone(f.binding), scene = binding.characterScenes![f.world.id]!;
    scene.lastReply = "before-checkpoint"; scene.progress = { status: "changed", rejected: 0 };
    binding.scenePhotos = [{ worldId: f.world.id, entityId: f.entities[0]!.id, messageKey: "before-message", turnKey: "before-turn", categoryId: "generated", imageKey: "before-image", createdAt: 20, generation: { status: "working", scene: "Synthetic old portrait", updatedAt: 30 } }];
    await f.repo.put("binding", binding); const before = await f.repo.rawRecords();
    await expect(saveStoryCheckpoint(f.choice, 7, f.repo, async () => { throw Error("synthetic-scope-changed"); })).rejects.toThrow("synthetic-scope-changed"); expect(await f.repo.rawRecords()).toEqual(before);
    const result = await saveStoryCheckpoint(f.choice, 7, f.repo), baseline = (await readStoryTimeline(result.branchId, f.repo)).baseline;
    expect(baseline.legacyEffects).toEqual(captureStoryBaselineEffects(binding, f.world.id)); expect(await f.repo.get<ChatBinding>("binding", binding.id)).toEqual(binding);
    expect(JSON.stringify(baseline.legacyEffects)).not.toMatch(/working|generation|Synthetic old portrait/);
  });
  it("is idempotent for concurrent repositories and after reload", async () => {
    const f = await fixture(), [a, b] = await Promise.all([saveStoryCheckpoint(f.choice, 7, f.repo), saveStoryCheckpoint(f.choice, 7, new DeepRoleRepository(f.db))]); expect(a).toEqual(b);
    const before = await f.repo.rawRecords(); expect(await saveStoryCheckpoint(f.choice, 7, new DeepRoleRepository(f.db))).toEqual(a); expect(await f.repo.rawRecords()).toEqual(before); expect((await f.repo.list("story")).length).toBe(2);
  });
  it.each(["owner", "binding", "world", "chat", "source", "restored", "missing-reply"])("rejects %s without an orphan starting point", async problem => {
    const f = await fixture(), choice = structuredClone(f.choice);
    if (problem === "binding") choice.bindingId = "foreign-binding";
    if (problem === "world") choice.worldId = "foreign-world";
    if (problem === "chat") choice.chatId = "foreign-chat";
    if (problem === "source") choice.requestId = "foreign-request";
    if (problem === "restored" || problem === "missing-reply") { const c = (await f.repo.get<StoryDispatchCapture>("dispatch", f.input.id))!; if (problem === "restored") c.origin = "restored"; else delete c.reply; await f.repo.put("dispatch", c); }
    const before = await f.repo.rawRecords(); await expect(saveStoryCheckpoint(choice, problem === "owner" ? 8 : 7, f.repo)).rejects.toThrow(); expect(await f.repo.rawRecords()).toEqual(before); expect(await f.repo.list("story")).toEqual([]);
  });
  it.each(["revision", "state", "membership", "name"])("rejects a stale review after changed %s, even if the revision was not updated", async change => {
    const f = await fixture();
    if (change === "name") await f.repo.put("entity", { ...f.entities[0]!, name: "New name" });
    else { const b = structuredClone(f.binding), scene = b.characterScenes![f.world.id]!; if (change === "revision") scene.revision = "changed"; if (change === "state") scene.states["person-1"]!.goal = "New goal"; if (change === "membership") scene.presentIds.reverse(); await f.repo.put("binding", b); }
    const before = await f.repo.rawRecords(); await expect(saveStoryCheckpoint(f.choice, 7, f.repo)).rejects.toThrow("story-manual-conflict"); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("rejects changed world binding and multiple bindings for the same chat", async () => {
    const f = await fixture(); await f.repo.put("binding", { ...f.binding, worldId: null }); await expect(saveStoryCheckpoint(f.choice, 7, f.repo)).rejects.toThrow(); await expect(readStoryCheckpoint(f.scope, 7, f.repo)).rejects.toThrow();
    await f.repo.put("binding", f.binding); await f.repo.put("binding", { ...f.binding, id: "duplicate" }); await expect(saveStoryCheckpoint(f.choice, 7, f.repo)).rejects.toThrow();
    expect(await f.repo.list("story")).toEqual([]);
  });
  it("reuses an untouched legacy checkpoint but never refreshes an older snapshot silently", async () => {
    const f = await fixture(), branch = await ensureLegacyStory({ worldId: f.world.id, bindingId: f.binding.id }, f.repo);
    expect(await saveStoryCheckpoint(f.choice, 7, f.repo)).toEqual({ branchId: branch.id });
    const g = await fixture(); await ensureLegacyStory({ worldId: g.world.id, bindingId: g.binding.id }, g.repo); await g.repo.put("entity", { ...g.entities[0]!, name: "New name" });
    const review = await readStoryCheckpoint(g.scope, 7, g.repo), before = await g.repo.rawRecords();
    await expect(saveStoryCheckpoint({ ...g.choice, expectedSnapshot: review.snapshot }, 7, g.repo)).rejects.toThrow("story-manual-conflict"); expect(await g.repo.rawRecords()).toEqual(before);
  });
  it("cannot move an existing anchor; the same approval stays idempotent after request preparation", async () => {
    const f = await fixture(), result = await saveStoryCheckpoint(f.choice, 7, f.repo), source = (await f.repo.get<StoryDispatchCapture>("dispatch", f.input.id))!;
    const other = structuredClone(source); other.id = "other-request"; other.wire.link!.requestId = other.id; other.wire.link!.assistantMessageKey = key("44"); other.reply!.assistant.identity.nativeMessageKey = key("44"); await f.repo.put("dispatch", other);
    const before = await f.repo.rawRecords(); await expect(saveStoryCheckpoint({ ...f.choice, requestId: other.id }, 7, f.repo)).rejects.toThrow("story-anchor-conflict"); expect(await f.repo.rawRecords()).toEqual(before);
    await prepareStoryRequest(result.branchId, { id: "new-request", purpose: "user-turn", bindingId: f.binding.id, identity: { chatId: f.binding.chatId, nativeParentKey: key("43") }, parentRevisionId: null, expectedHeadRevisionId: null, expectedSelectionVersion: 0, expectedSceneRevision: "legacy-scene-a" }, f.repo);
    expect(await saveStoryCheckpoint(f.choice, 7, f.repo)).toEqual(result); expect((await f.repo.list("story")).length).toBe(3);
  });
  it("cannot add a checkpoint retrospectively to an unanchored history with observations", async () => {
    const f = await fixture(), branch = await ensureLegacyStory({ worldId: f.world.id, bindingId: f.binding.id }, f.repo);
    await recordStoryObservation(branch.id, { id: "old-revision", messageId: "old-message", nativeMessageKey: key("43"), requestId: null, parentRevisionId: null, role: "assistant", completion: "complete", content: "Old unproven sample", events: [] }, f.repo);
    const before = await f.repo.rawRecords(); await expect(saveStoryCheckpoint(f.choice, 7, f.repo)).rejects.toThrow("story-anchor-too-late"); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it.each(["storage", "navigation"])("rolls back both records on %s failure", async failure => {
    const f = await fixture(); if (failure === "storage") vi.spyOn(f.db.records, "bulkPut").mockRejectedValueOnce(Error("synthetic-write-error"));
    await expect(saveStoryCheckpoint(f.choice, 7, f.repo, failure === "navigation" ? async () => { throw Error("story-binding-conflict"); } : undefined)).rejects.toThrow();
    expect(await f.repo.rawRecords()).toEqual(f.before); expect(await f.repo.list("story")).toEqual([]);
    await saveStoryCheckpoint(f.choice, 7, f.repo); expect((await f.repo.list("story")).length).toBe(2);
  });
  it("clones approval before asynchronous reads; locked vault denies both paths", async () => {
    const f = await fixture(), input = structuredClone(f.choice), pending = saveStoryCheckpoint(input, 7, f.repo); input.expectedSnapshot.states["person-1"]!.goal = "Mutated after call";
    const result = await pending; expect((await readStoryTimeline(result.branchId, f.repo)).baseline.snapshot.states["person-1"]!.goal).toBe(f.choice.expectedSnapshot.states["person-1"]!.goal);
    await f.repo.enableVault("synthetic-passphrase"); await f.repo.lockVault(); await expect(readStoryCheckpoint(f.scope, 7, f.repo)).rejects.toThrow(); await expect(saveStoryCheckpoint(f.choice, 7, f.repo)).rejects.toThrow();
  });
  it("protects frozen data with the vault, backup and full-world purge", async () => {
    const f = await fixture(); await saveStoryCheckpoint(f.choice, 7, f.repo); await f.repo.enableVault("synthetic-passphrase"); expect(JSON.stringify(await f.db.records.toArray())).not.toContain("Починить часы");
    const backup = await createBackup("synthetic-passphrase", f.repo), target = empty(); await restoreBackup(await parseBackup(JSON.stringify(backup), "synthetic-passphrase"), "replace", target.repo);
    expect((await target.repo.list<StoryBaseline>("story")).filter(r => r.type === "baseline")[0]!.origin.nativeAnchor).toEqual({ nativeMessageKey: key("43"), role: "assistant" });
    expect((await readStoryCheckpoint(f.scope, 7, target.repo)).candidates).toEqual([]);
    await removeWorld(f.world.id, target.repo, { deleteLore: true }); expect(await target.repo.list("story")).toEqual([]);
  });
  it("limits the review page, not retained sources", async () => {
    const f = await fixture(), source = (await f.repo.get<StoryDispatchCapture>("dispatch", f.input.id))!;
    for (let i = 0; i < 11; i++) { const c = structuredClone(source); c.id = `source-${i}`; c.wire.link!.requestId = c.id; await f.repo.put("dispatch", c); }
    const review = await readStoryCheckpoint(f.scope, 7, f.repo); expect(review.availableCount).toBe(12); expect(review.candidates).toHaveLength(8); expect((await f.repo.list("dispatch")).length).toBe(12);
  });
  it("rejects malformed review/choice structures and duplicate candidates", async () => {
    const f = await fixture(); expect(validStoryCheckpointChoice({ ...f.choice, unexpected: true })).toBe(false); expect(validStoryCheckpointChoice({ ...f.choice, expectedSnapshot: null })).toBe(false);
    expect(validStoryCheckpointReview({ ...f.review, availableCount: 0 })).toBe(false); expect(validStoryCheckpointReview({ ...f.review, candidates: [f.review.candidates[0], f.review.candidates[0]], availableCount: 2 })).toBe(false);
    expect(validStoryCheckpointReview({ ...f.review, checkpoint: { branchId: "b", anchorKey: "raw-id", createdAt: 1 } })).toBe(false);
    await expect(saveStoryCheckpoint({ ...f.choice, expectedSnapshot: null } as any, 7, f.repo)).rejects.toThrow("story-checkpoint-invalid");
  });
});
