import { afterEach, describe, expect, it, vi } from "vitest";
import { createId } from "../src/core/id";
import { assertStoryGraph, storyRow, type StoryBaseline, type StoryRevision } from "../src/core/story-records";
import { nativeStoryMessageKey as key, validNativeStoryIdentity } from "../src/core/story-transport";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository, VaultLockedError } from "../src/storage/repository";
import { ensureLegacyStory, readStoryTimeline, recordStoryObservation } from "../src/storage/story-history";
import { anchorStoryCheckpoint, observeNativeStoryMessage, type NativeStoryObservation, type StoryCheckpointAnchor } from "../src/storage/story-observer";
import { prepareStoryRequest, settleStoryRequest, type StoryRequestPreparation } from "../src/storage/story-requests";
import { selectStoryRevision } from "../src/storage/story-selection";
import { removeWorld } from "../src/storage/worlds";
import { storyWorld } from "./fixtures/story-worlds";

const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dbs.splice(0).map(db => db.delete())); });
function empty() { const db = new DeepRoleDatabase("story-observer-" + crypto.randomUUID()); dbs.push(db); return { db, repo: new DeepRoleRepository(db) }; }
async function setup() {
  const fixture = storyWorld("ru"), { db, repo } = empty(); await repo.mergeRecords(fixture.records);
  const branch = await ensureLegacyStory({ worldId: fixture.world.id, bindingId: fixture.binding.id }, repo);
  const request: StoryRequestPreparation = { id: createId("request"), purpose: "user-turn", bindingId: fixture.binding.id, identity: { chatId: fixture.binding.chatId, nativeParentKey: null }, parentRevisionId: null, expectedHeadRevisionId: null, expectedSelectionVersion: 0, expectedSceneRevision: "legacy-scene-a" };
  const anchor: StoryCheckpointAnchor = { identity: { chatId: fixture.binding.chatId, nativeParentKey: key("old-assistant") }, role: "assistant", completion: "complete", expectedSceneRevision: "legacy-scene-a" };
  const sample: NativeStoryObservation = { requestId: request.id, parentRevisionId: null, identity: { role: "user", nativeMessageKey: key("1"), nativeParentKey: null }, completion: "complete", content: "Продолжай." };
  return { ...fixture, db, repo, branch, request, anchor, sample };
}
async function accept(f: Awaited<ReturnType<typeof setup>>) {
  await prepareStoryRequest(f.branch.id, f.request, f.repo); await settleStoryRequest(f.request.id, { status: "accepted", httpStatus: 200 }, f.repo);
}
async function pair(f: Awaited<ReturnType<typeof setup>>) {
  await accept(f); const user = await observeNativeStoryMessage(f.branch.id, f.sample, f.repo);
  const sample: NativeStoryObservation = { ...f.sample, identity: { role: "assistant", nativeMessageKey: key("2"), nativeParentKey: key("1") }, parentRevisionId: user.revisionId, content: "Ключ передан мастеру." };
  const assistant = await observeNativeStoryMessage(f.branch.id, sample, f.repo); return { user, assistant, sample };
}

describe("stable native observations inside the real local repository, not a live site observer", () => {
  it("assigns IDs under the lock and never applies a source just by observing it", async () => {
    const f = await setup(); await accept(f); const before = await f.repo.rawRecords();
    const first = await observeNativeStoryMessage(f.branch.id, f.sample, f.repo);
    expect(first.status).toBe("recorded"); expect(first.revisionId).toMatch(/^revision_/); expect(first.messageId).toMatch(/^message_/);
    const history = await readStoryTimeline(f.branch.id, f.repo);
    expect(history.events).toEqual([]); expect(history.branch.headRevisionId).toBeNull(); expect(history.projection).toBeNull();
    expect((await f.repo.rawRecords()).filter(row => row.id !== first.revisionId)).toEqual(before);
  });
  it("repeated scans and concurrent tabs reuse exactly the same IDs", async () => {
    const f = await setup(); await accept(f);
    const results = await Promise.all([observeNativeStoryMessage(f.branch.id, f.sample, f.repo), observeNativeStoryMessage(f.branch.id, f.sample, new DeepRoleRepository(f.db))]);
    expect(results.map(row => row.status).sort()).toEqual(["already-recorded", "recorded"]);
    expect(results[0]!.revisionId).toBe(results[1]!.revisionId); expect(results[0]!.messageId).toBe(results[1]!.messageId);
    const before = await f.repo.rawRecords(); expect((await observeNativeStoryMessage(f.branch.id, f.sample, f.repo)).status).toBe("already-recorded"); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("keeps IDs after reopen and restored backup, including encrypted storage", async () => {
    const f = await setup(); await f.repo.enableVault("synthetic-password"); const { assistant, sample } = await pair(f);
    f.db.close(); const db = new DeepRoleDatabase(f.db.name); dbs.push(db); const repo = new DeepRoleRepository(db); await repo.unlockVault("synthetic-password");
    expect(await observeNativeStoryMessage(f.branch.id, sample, repo)).toEqual({ ...assistant, status: "already-recorded" });
    const payload = await createBackup(undefined, repo), target = empty(); await restoreBackup(await parseBackup(JSON.stringify(payload)), "replace", target.repo);
    expect(await observeNativeStoryMessage(f.branch.id, sample, target.repo)).toEqual({ ...assistant, status: "already-recorded" });
    expect((await db.records.toArray()).filter(row => row.kind === "story").every(row => row.encrypted && !row.data)).toBe(true);
    await repo.lockVault(); await expect(observeNativeStoryMessage(f.branch.id, sample, repo)).rejects.toBeInstanceOf(VaultLockedError);
  });
  it("keeps an interrupted sample immutable; completion is a separate revision of the same message", async () => {
    const f = await setup(); await accept(f); const user = await observeNativeStoryMessage(f.branch.id, f.sample, f.repo);
    const sample: NativeStoryObservation = { ...f.sample, identity: { role: "assistant", nativeMessageKey: key("2"), nativeParentKey: key("1") }, parentRevisionId: user.revisionId, content: "Ключ передан", completion: "interrupted" };
    const partial = await observeNativeStoryMessage(f.branch.id, sample, f.repo), complete = await observeNativeStoryMessage(f.branch.id, { ...sample, completion: "complete" }, f.repo);
    expect(partial.messageId).toBe(complete.messageId); expect(partial.revisionId).not.toBe(complete.revisionId);
    await expect(selectStoryRevision(f.branch.id, { headRevisionId: partial.revisionId, expectedHeadRevisionId: null, expectedSelectionVersion: 0, acceptedEventIds: [] }, f.repo)).rejects.toThrow("story-source-incomplete");
    await selectStoryRevision(f.branch.id, { headRevisionId: complete.revisionId, expectedHeadRevisionId: null, expectedSelectionVersion: 0, acceptedEventIds: [] }, f.repo);
    expect((await readStoryTimeline(f.branch.id, f.repo)).revisions.find(row => row.id === partial.revisionId)!.completion).toBe("interrupted");
  });
  it("retains modified assistant variants, including a return to the exact earlier text", async () => {
    const f = await setup(), { assistant, sample } = await pair(f);
    const modified = await observeNativeStoryMessage(f.branch.id, { ...sample, content: "Мастер отказался брать ключ." }, f.repo);
    expect(modified.messageId).toBe(assistant.messageId); expect(modified.revisionId).not.toBe(assistant.revisionId);
    expect(await observeNativeStoryMessage(f.branch.id, sample, f.repo)).toEqual({ ...assistant, status: "already-recorded" });
    expect((await readStoryTimeline(f.branch.id, f.repo)).revisions).toHaveLength(3);
  });
  it("a new accepted retry with identical text is a distinct delivery but the same native message", async () => {
    const f = await setup(), { user, assistant, sample } = await pair(f);
    const selection = await selectStoryRevision(f.branch.id, { headRevisionId: assistant.revisionId, expectedHeadRevisionId: null, expectedSelectionVersion: 0, acceptedEventIds: [] }, f.repo);
    const request = { ...f.request, id: createId("request"), purpose: "assistant-retry" as const, parentRevisionId: user.revisionId, identity: { chatId: f.binding.chatId, nativeParentKey: key("1") }, expectedHeadRevisionId: assistant.revisionId, expectedSelectionVersion: 1, expectedSceneRevision: selection.projection.bindingRevision };
    await prepareStoryRequest(f.branch.id, request, f.repo); await settleStoryRequest(request.id, { status: "accepted", httpStatus: 200 }, f.repo);
    const retry = await observeNativeStoryMessage(f.branch.id, { ...sample, requestId: request.id }, f.repo);
    expect(retry.messageId).toBe(assistant.messageId); expect(retry.revisionId).not.toBe(assistant.revisionId);
  });
  it("the same text in different native messages is never an identity match", async () => {
    const f = await setup(), { assistant, sample } = await pair(f), before = await f.repo.rawRecords();
    await expect(observeNativeStoryMessage(f.branch.id, { ...sample, identity: { ...sample.identity, nativeMessageKey: key("another") } }, f.repo)).rejects.toThrow("story-request-source-conflict");
    expect(await f.repo.rawRecords()).toEqual(before); expect(assistant.messageId).toBeTruthy();
  });
  it("does not silently edit a user source from the same accepted delivery", async () => {
    const f = await setup(); await accept(f); await observeNativeStoryMessage(f.branch.id, f.sample, f.repo); const before = await f.repo.rawRecords();
    await expect(observeNativeStoryMessage(f.branch.id, { ...f.sample, content: "Ранняя правка." }, f.repo)).rejects.toThrow("story-request-source-conflict"); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("a repeat preserves existing candidate events and does not duplicate them", async () => {
    const f = await setup(), { assistant, sample } = await pair(f);
    const raw = await f.repo.rawRecords(), revision = raw.find(row => row.id === assistant.revisionId)!.data as StoryRevision;
    await f.repo.mergeRecords([storyRow({ format: revision.format, contractVersion: 1, worldId: revision.worldId, playthroughId: revision.playthroughId, branchId: revision.branchId, createdAt: revision.createdAt, updatedAt: revision.updatedAt,
      type: "event", id: "candidate", revisionId: revision.id, ordinal: 0, disposition: "candidate", label: "Передан ключ", quote: sample.content, participantIds: [], changes: [] })]);
    const before = await f.repo.rawRecords(); expect((await observeNativeStoryMessage(f.branch.id, sample, f.repo)).status).toBe("already-recorded"); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("an unproven legacy match stays unproven, with a separate proven record", async () => {
    const f = await setup(); await accept(f);
    await recordStoryObservation(f.branch.id, { id: "legacy", messageId: "message-legacy", nativeMessageKey: f.sample.identity.nativeMessageKey, requestId: f.request.id, parentRevisionId: null, role: "user", completion: "complete", content: f.sample.content, events: [] }, f.repo);
    const result = await observeNativeStoryMessage(f.branch.id, f.sample, f.repo);
    expect(result.revisionId).not.toBe("legacy"); expect(result.messageId).toBe("message-legacy");
    expect((await readStoryTimeline(f.branch.id, f.repo)).revisions.find(row => row.id === "legacy")!.requestProof).toBeUndefined();
  });
  it("pauses on ambiguous old local message IDs instead of merging", async () => {
    const f = await setup(); await accept(f);
    for (const id of ["a", "b"]) await recordStoryObservation(f.branch.id, { id, messageId: "message-" + id, nativeMessageKey: f.sample.identity.nativeMessageKey, requestId: null, parentRevisionId: null, role: "user", completion: "complete", content: f.sample.content, events: [] }, f.repo);
    const before = await f.repo.rawRecords(); await expect(observeNativeStoryMessage(f.branch.id, f.sample, f.repo)).rejects.toThrow("story-native-message-ambiguous"); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it.each(["missing-receipt", "unaccepted", "wrong-parent", "wrong-role", "self-parent", "virtual-key", "unknown-key", "empty", "too-long", "streaming-user"] as const)("rejects %s without writing", async problem => {
    const f = await setup(); await accept(f); const sample = structuredClone(f.sample);
    if (problem === "missing-receipt") sample.requestId = "missing";
    if (problem === "unaccepted") { sample.requestId = createId("request"); await prepareStoryRequest(f.branch.id, { ...f.request, id: sample.requestId }, f.repo); }
    if (problem === "wrong-parent") sample.identity.nativeParentKey = key("wrong");
    if (problem === "wrong-role") sample.identity.role = "assistant";
    if (problem === "self-parent") sample.identity.nativeParentKey = sample.identity.nativeMessageKey;
    if (problem === "virtual-key") sample.identity.nativeMessageKey = '["virtual","1"]';
    if (problem === "unknown-key") sample.identity.nativeMessageKey = "";
    if (problem === "empty") sample.content = "  ";
    if (problem === "too-long") sample.content = "a".repeat(250001);
    if (problem === "streaming-user") sample.completion = "partial";
    const before = await f.repo.rawRecords(); await expect(observeNativeStoryMessage(f.branch.id, sample, f.repo)).rejects.toThrow(); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("takes a defensive snapshot before the queued write", async () => {
    const f = await setup(); await accept(f); const sample = structuredClone(f.sample), pending = observeNativeStoryMessage(f.branch.id, sample, f.repo); sample.content = "Changed"; sample.identity.nativeMessageKey = key("other");
    const result = await pending; expect((await readStoryTimeline(f.branch.id, f.repo)).revisions.find(row => row.id === result.revisionId)!.content).toBe("Продолжай.");
  });
  it("rolls back a failed native-source write and can retry safely", async () => {
    const f = await setup(); await accept(f); const before = await f.repo.rawRecords();
    const spy = vi.spyOn(f.db.records, "bulkPut").mockImplementationOnce(rows => f.db.records.put(rows[0]!).then(() => { throw new Error("synthetic-write-failure"); }));
    await expect(observeNativeStoryMessage(f.branch.id, f.sample, f.repo)).rejects.toThrow("synthetic-write-failure"); expect(await f.repo.rawRecords()).toEqual(before); spy.mockRestore();
    expect((await observeNativeStoryMessage(f.branch.id, f.sample, f.repo)).status).toBe("recorded");
  });
  it("never writes observations into an archived/purged world", async () => {
    const f = await setup(); await pair(f); await removeWorld(f.world.id, f.repo); const before = await f.repo.rawRecords();
    await expect(observeNativeStoryMessage(f.branch.id, f.sample, f.repo)).rejects.toThrow("story-scope-invalid"); expect(await f.repo.rawRecords()).toEqual(before);
  });
});

describe("explicit native checkpoint anchoring, without imagined earlier history", () => {
  it("anchors only origin metadata, preserving the saved snapshot, lore and live scene", async () => {
    const f = await setup(), before = await f.repo.rawRecords(); const baseline = await anchorStoryCheckpoint(f.branch.id, f.anchor, f.repo);
    expect(baseline.origin.nativeAnchor).toEqual({ nativeMessageKey: key("old-assistant"), role: "assistant" }); expect(baseline.historyBeforeBaseline).toBe("unknown");
    expect((await f.repo.rawRecords()).filter(row => row.id !== baseline.id)).toEqual(before.filter(row => row.id !== baseline.id));
    expect(baseline.snapshot).toEqual((before.find(row => row.id === baseline.id)!.data as StoryBaseline).snapshot);
    const history = await readStoryTimeline(f.branch.id, f.repo); expect(history.revisions).toEqual([]); expect(history.events).toEqual([]);
  });
  it("supports an explicitly confirmed root separately from an unknown parent", async () => {
    const f = await setup(); const anchor = { ...f.anchor, identity: { ...f.anchor.identity, nativeParentKey: null }, role: null };
    const baseline = await anchorStoryCheckpoint(f.branch.id, anchor, f.repo); expect(baseline.origin.nativeAnchor).toEqual({ nativeMessageKey: null, role: null });
    await pair(f); assertStoryGraph(await f.repo.rawRecords());
  });
  it("continues after the checkpoint without creating a fake parent revision", async () => {
    const f = await setup(); await anchorStoryCheckpoint(f.branch.id, f.anchor, f.repo);
    f.request.identity.nativeParentKey = f.anchor.identity.nativeParentKey; f.sample.identity.nativeParentKey = f.anchor.identity.nativeParentKey;
    const { assistant } = await pair(f);
    const selected = await selectStoryRevision(f.branch.id, { headRevisionId: assistant.revisionId, expectedHeadRevisionId: null, expectedSelectionVersion: 0, acceptedEventIds: [] }, f.repo);
    expect(selected.projection.revisionIds).toHaveLength(2); expect(selected.projection.snapshot).toEqual((await readStoryTimeline(f.branch.id, f.repo)).baseline.snapshot);
    const backup = await createBackup(undefined, f.repo), target = empty(); await restoreBackup(await parseBackup(JSON.stringify(backup)), "replace", target.repo);
    expect((await readStoryTimeline(f.branch.id, target.repo)).baseline.origin.nativeAnchor).toEqual({ nativeMessageKey: key("old-assistant"), role: "assistant" });
  });
  it("repeated/concurrent anchor calls do not overwrite a later manual state", async () => {
    const f = await setup(); const results = await Promise.all([anchorStoryCheckpoint(f.branch.id, f.anchor, f.repo), anchorStoryCheckpoint(f.branch.id, f.anchor, new DeepRoleRepository(f.db))]); expect(results[0]).toEqual(results[1]);
    const binding = structuredClone(f.binding); binding.characterScenes![f.world.id]!.states[f.entities[0]!.id]!.condition = "Ручное состояние"; await f.repo.put("binding", binding);
    const before = await f.repo.rawRecords(); expect(await anchorStoryCheckpoint(f.branch.id, f.anchor, f.repo)).toEqual(results[0]); expect(await f.repo.rawRecords()).toEqual(before);
    await expect(anchorStoryCheckpoint(f.branch.id, { ...f.anchor, identity: { ...f.anchor.identity, nativeParentKey: key("another") } }, f.repo)).rejects.toThrow("story-anchor-conflict");
  });
  it.each(["other-chat", "unknown-parent", "user-parent", "interrupted", "stale-scene", "manual-state", "prepared", "observed"] as const)("rejects %s before anchoring", async problem => {
    const f = await setup(), input = structuredClone(f.anchor);
    if (problem === "other-chat") input.identity.chatId = "other";
    if (problem === "unknown-parent") delete (input.identity as any).nativeParentKey;
    if (problem === "user-parent") (input as any).role = "user";
    if (problem === "interrupted") (input as any).completion = "interrupted";
    if (problem === "stale-scene") input.expectedSceneRevision = "stale";
    if (problem === "manual-state") { const binding = structuredClone(f.binding); binding.characterScenes![f.world.id]!.states[f.entities[0]!.id]!.condition = "manual"; await f.repo.put("binding", binding); }
    if (problem === "prepared") await prepareStoryRequest(f.branch.id, f.request, f.repo);
    if (problem === "observed") await pair(f);
    const before = await f.repo.rawRecords(); await expect(anchorStoryCheckpoint(f.branch.id, input, f.repo)).rejects.toThrow(); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("does not allow retrying or editing behind a checkpoint whose earlier state is unknown", async () => {
    const f = await setup(); await anchorStoryCheckpoint(f.branch.id, f.anchor, f.repo);
    const before = await f.repo.rawRecords();
    for (const input of [{ ...f.request, identity: { ...f.request.identity, nativeParentKey: null } }, { ...f.request, purpose: "assistant-retry" as const, identity: f.anchor.identity }]) await expect(prepareStoryRequest(f.branch.id, input, f.repo)).rejects.toThrow("story-request-link-invalid");
    expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("rejects malformed anchors in backups and stops self-anchored proven sources", async () => {
    const f = await setup(); await anchorStoryCheckpoint(f.branch.id, f.anchor, f.repo);
    f.request.identity.nativeParentKey = f.anchor.identity.nativeParentKey; f.sample.identity.nativeParentKey = f.anchor.identity.nativeParentKey;
    await accept(f); await expect(observeNativeStoryMessage(f.branch.id, { ...f.sample, identity: { ...f.sample.identity, nativeMessageKey: key("old-assistant") } }, f.repo)).rejects.toThrow();
    const payload = await createBackup(undefined, f.repo); if (payload.format !== "deeprole-backup") throw new Error("test backup");
    (payload.records.find(row => row.kind === "story" && (row.data as any).type === "baseline")!.data as StoryBaseline).origin.nativeAnchor!.role = null;
    await expect(parseBackup(JSON.stringify(payload))).rejects.toThrow();
  });
  it("includes anchor metadata in the vault and blocks reattachment after world removal", async () => {
    const f = await setup(); await f.repo.enableVault("synthetic-password"); await anchorStoryCheckpoint(f.branch.id, f.anchor, f.repo);
    const rows = await f.db.records.toArray(); expect(JSON.stringify(rows)).not.toContain("old-assistant"); await f.repo.lockVault(); await expect(anchorStoryCheckpoint(f.branch.id, f.anchor, f.repo)).rejects.toBeInstanceOf(VaultLockedError);
    await f.repo.unlockVault("synthetic-password"); await removeWorld(f.world.id, f.repo); await expect(anchorStoryCheckpoint(f.branch.id, f.anchor, f.repo)).rejects.toThrow("story-scope-invalid");
    const purge = await setup(); await anchorStoryCheckpoint(purge.branch.id, purge.anchor, purge.repo);
    await removeWorld(purge.world.id, purge.repo, { deleteLore: true }); expect((await purge.repo.rawRecords()).filter(row => row.kind === "story")).toEqual([]);
  });
  it("strict identity validation rejects extra fields, unknown roles and self-parenting", () => {
    const identity = { role: "assistant", nativeMessageKey: key("2"), nativeParentKey: key("1") };
    expect(validNativeStoryIdentity(identity)).toBe(true);
    for (const invalid of [null, {}, { ...identity, token: "private" }, { ...identity, role: "system" }, { ...identity, nativeParentKey: undefined }, { ...identity, nativeParentKey: identity.nativeMessageKey }]) expect(validNativeStoryIdentity(invalid)).toBe(false);
  });
});
