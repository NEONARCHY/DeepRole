import { afterEach, describe, expect, it, vi } from "vitest";
import { createId } from "../src/core/id";
import { assertStoryGraph, type StoryRequest } from "../src/core/story-records";
import { nativeStoryMessageKey } from "../src/core/story-transport";
import type { ChatBinding } from "../src/core/types";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository, VaultLockedError } from "../src/storage/repository";
import { ensureLegacyStory, readStoryTimeline, recordStoryObservation, type StoryObservation } from "../src/storage/story-history";
import { prepareStoryRequest, settleStoryRequest, recordRequestedStoryObservation, type StoryRequestPreparation } from "../src/storage/story-requests";
import { selectStoryRevision } from "../src/storage/story-selection";
import { removeWorld } from "../src/storage/worlds";
import { storyVariants } from "./fixtures/story-worlds";

const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dbs.splice(0).map(db => db.delete())); });
function empty() { const db = new DeepRoleDatabase("story-requests-" + crypto.randomUUID()); dbs.push(db); return { db, repo: new DeepRoleRepository(db) }; }
async function setup() {
  const fixture = storyVariants("en").branches, { db, repo } = empty(); await repo.mergeRecords(fixture.records);
  const branch = await ensureLegacyStory({ worldId: fixture.world.id, bindingId: fixture.binding.id }, repo);
  const preparation: StoryRequestPreparation = { id: createId("request"), purpose: "user-turn", bindingId: fixture.binding.id, identity: { chatId: fixture.binding.chatId, nativeParentKey: null }, parentRevisionId: null, expectedHeadRevisionId: null, expectedSelectionVersion: 0, expectedSceneRevision: "legacy-scene-a" };
  const observation = (id: string, role: "user" | "assistant", parentRevisionId: string | null, nativeParentKey: string | null): StoryObservation => ({ id: createId("revision"), messageId: createId("message"), nativeMessageKey: nativeStoryMessageKey(id), requestId: preparation.id, parentRevisionId, role, completion: "complete", content: "The courier delivered the clock key.", requestProof: { nativeParentKey }, events: [] });
  return { ...fixture, db, repo, branch, preparation, observation };
}
async function acceptedPair(f: Awaited<ReturnType<typeof setup>>) {
  await prepareStoryRequest(f.branch.id, f.preparation, f.repo);
  await settleStoryRequest(f.preparation.id, { status: "accepted", httpStatus: 200 }, f.repo);
  const user = f.observation("1", "user", null, null); await recordRequestedStoryObservation(f.branch.id, user, f.repo);
  const assistant = f.observation("2", "assistant", user.id, user.nativeMessageKey); await recordRequestedStoryObservation(f.branch.id, assistant, f.repo);
  await selectStoryRevision(f.branch.id, { headRevisionId: assistant.id, expectedHeadRevisionId: null, expectedSelectionVersion: 0, acceptedEventIds: [] }, f.repo);
  return { user, assistant, history: await readStoryTimeline(f.branch.id, f.repo) };
}
describe("persistent local request receipts and proven source routing, not live game integration", () => {
  it("prepares without accepting, changing state, or saving prompts/credentials", async () => {
    const f = await setup(), before = await f.repo.rawRecords();
    const request = await prepareStoryRequest(f.branch.id, f.preparation, f.repo);
    expect(request).toMatchObject({ type: "request", delivery: { status: "prepared" }, selectedHeadRevisionId: null, selectionVersion: 0, parentRevisionId: null });
    expect(Object.keys(request)).not.toContain("content"); expect(Object.keys(request)).not.toContain("prompt");
    expect((await f.repo.rawRecords()).filter(row => row.id !== request.id)).toEqual(before);
    expect((await readStoryTimeline(f.branch.id, f.repo)).requests).toEqual([request]);
  });
  it("retries/concurrent preparations with the same local ID create one receipt", async () => {
    const f = await setup(), other = new DeepRoleRepository(f.db);
    const result = await Promise.all([prepareStoryRequest(f.branch.id, f.preparation, f.repo), prepareStoryRequest(f.branch.id, f.preparation, other)]);
    expect(result[0]).toEqual(result[1]); expect((await readStoryTimeline(f.branch.id, f.repo)).requests).toHaveLength(1);
    await settleStoryRequest(f.preparation.id, { status: "accepted", httpStatus: 201 }, f.repo);
    expect((await prepareStoryRequest(f.branch.id, f.preparation, f.repo)).delivery.status).toBe("accepted");
  });
  it("does not reuse a receipt ID with changed immutable routing", async () => {
    const f = await setup(); await prepareStoryRequest(f.branch.id, f.preparation, f.repo); const before = await f.repo.rawRecords();
    await expect(prepareStoryRequest(f.branch.id, { ...f.preparation, purpose: "assistant-retry" }, f.repo)).rejects.toThrow("story-request-conflict");
    expect(await f.repo.rawRecords()).toEqual(before);
  });
  it.each(["missing-parent", "other-chat", "other-binding", "stale-head", "stale-version", "wrong-root-purpose"] as const)("rejects %s before storing", async problem => {
    const f = await setup(), input = structuredClone(f.preparation), before = await f.repo.rawRecords();
    if (problem === "missing-parent") input.identity.nativeParentKey = nativeStoryMessageKey("missing");
    if (problem === "other-chat") input.identity.chatId = "other-chat";
    if (problem === "other-binding") input.bindingId = "binding:synthetic-b";
    if (problem === "stale-head") input.expectedHeadRevisionId = "missing";
    if (problem === "stale-version") input.expectedSelectionVersion = 1;
    if (problem === "wrong-root-purpose") input.purpose = "assistant-retry";
    await expect(prepareStoryRequest(f.branch.id, input, f.repo)).rejects.toThrow(); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("detects manual state edits even if the revision string was unchanged", async () => {
    const f = await setup(), binding = structuredClone(f.binding); binding.characterScenes![f.world.id]!.states[f.entities[0]!.id]!.condition = "manual";
    await f.repo.put("binding", binding); const before = await f.repo.rawRecords();
    await expect(prepareStoryRequest(f.branch.id, f.preparation, f.repo)).rejects.toThrow("story-manual-conflict"); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("HTTP acceptance is recorded once but never proves a completed reply", async () => {
    const f = await setup(); await prepareStoryRequest(f.branch.id, f.preparation, f.repo);
    const accepted = await settleStoryRequest(f.preparation.id, { status: "accepted", httpStatus: 200 }, f.repo), before = await f.repo.rawRecords();
    expect(accepted.delivery).toMatchObject({ status: "accepted", httpStatus: 200 });
    expect(await settleStoryRequest(f.preparation.id, { status: "accepted", httpStatus: 200 }, f.repo)).toEqual(accepted);
    expect(await f.repo.rawRecords()).toEqual(before); expect((await readStoryTimeline(f.branch.id, f.repo)).branch.headRevisionId).toBeNull();
    await expect(settleStoryRequest(f.preparation.id, { status: "failed", reason: "aborted", httpStatus: null }, f.repo)).rejects.toThrow("story-request-settlement-conflict");
  });
  it.each(["http", "network", "aborted"] as const)("a %s failure cannot become an accepted send on a late callback", async reason => {
    const f = await setup(); await prepareStoryRequest(f.branch.id, f.preparation, f.repo);
    const failure = { status: "failed" as const, reason, httpStatus: reason === "http" ? 503 : null };
    const failed = await settleStoryRequest(f.preparation.id, failure, f.repo); expect(await settleStoryRequest(f.preparation.id, failure, f.repo)).toEqual(failed);
    const before = await f.repo.rawRecords(); await expect(settleStoryRequest(f.preparation.id, { status: "accepted", httpStatus: 200 }, f.repo)).rejects.toThrow("story-request-settlement-conflict"); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("rejects invalid HTTP success and private diagnostic payloads", async () => {
    const f = await setup(); await prepareStoryRequest(f.branch.id, f.preparation, f.repo); const before = await f.repo.rawRecords();
    for (const result of [{ status: "accepted", httpStatus: 503 }, { status: "failed", reason: "http", httpStatus: 200 }, { status: "failed", reason: "secret exception text", httpStatus: null }, { status: "accepted", httpStatus: 200, body: "secret" }, { status: "accepted", httpStatus: 200, at: 1 }]) await expect(settleStoryRequest(f.preparation.id, result as any, f.repo)).rejects.toThrow("story-request-invalid");
    expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("two competing settlements have one winner, without last-write-wins", async () => {
    const f = await setup(); await prepareStoryRequest(f.branch.id, f.preparation, f.repo);
    const results = await Promise.allSettled([settleStoryRequest(f.preparation.id, { status: "accepted", httpStatus: 200 }, f.repo), settleStoryRequest(f.preparation.id, { status: "failed", reason: "network", httpStatus: null }, new DeepRoleRepository(f.db))]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1); expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  });
  it("proven observations require accepted local delivery and the exact native parent", async () => {
    const f = await setup(), user = f.observation("1", "user", null, null); await prepareStoryRequest(f.branch.id, f.preparation, f.repo);
    await expect(recordRequestedStoryObservation(f.branch.id, user, f.repo)).rejects.toThrow("story-request-unaccepted");
    await settleStoryRequest(f.preparation.id, { status: "accepted", httpStatus: 200 }, f.repo);
    expect(await recordRequestedStoryObservation(f.branch.id, user, f.repo)).toBe("recorded"); expect(await recordRequestedStoryObservation(f.branch.id, user, f.repo)).toBe("already-recorded");
    const assistant = f.observation("2", "assistant", user.id, nativeStoryMessageKey("wrong"));
    await expect(recordRequestedStoryObservation(f.branch.id, assistant, f.repo)).rejects.toThrow("story-request-link-invalid");
    await expect(recordRequestedStoryObservation(f.branch.id, { ...assistant, nativeMessageKey: user.nativeMessageKey, requestProof: { nativeParentKey: user.nativeMessageKey } }, f.repo)).rejects.toThrow("story-request-link-invalid");
    assistant.requestProof!.nativeParentKey = user.nativeMessageKey; await recordRequestedStoryObservation(f.branch.id, assistant, f.repo);
    expect((await readStoryTimeline(f.branch.id, f.repo)).revisions).toHaveLength(2); assertStoryGraph(await f.repo.rawRecords());
  });
  it("never upgrades an unproven legacy observation merely because it echoes a request ID", async () => {
    const f = await setup(); await prepareStoryRequest(f.branch.id, f.preparation, f.repo); await settleStoryRequest(f.preparation.id, { status: "accepted", httpStatus: 200 }, f.repo);
    const user = f.observation("1", "user", null, null); delete user.requestProof; await recordStoryObservation(f.branch.id, user, f.repo);
    const assistant = f.observation("2", "assistant", user.id, user.nativeMessageKey);
    await expect(recordRequestedStoryObservation(f.branch.id, assistant, f.repo)).rejects.toThrow("story-request-link-invalid");
    const raw = f.observation("3", "user", null, null); delete raw.requestProof;
    await expect(recordRequestedStoryObservation(f.branch.id, raw, f.repo)).rejects.toThrow("story-request-unproven");
  });
  it("one accepted request cannot be rebound to a different native user or assistant message", async () => {
    const f = await setup(), { user } = await acceptedPair(f), before = await f.repo.rawRecords();
    await expect(recordRequestedStoryObservation(f.branch.id, f.observation("unrelated-user", "user", null, null), f.repo)).rejects.toThrow("story-request-source-conflict");
    await expect(recordRequestedStoryObservation(f.branch.id, f.observation("unrelated-reply", "assistant", user.id, user.nativeMessageKey), f.repo)).rejects.toThrow("story-request-source-conflict");
    expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("two different local sends with identical text remain different sources", async () => {
    const f = await setup(), { assistant, history } = await acceptedPair(f);
    const input = { ...f.preparation, id: createId("request"), parentRevisionId: assistant.id, identity: { chatId: f.binding.chatId, nativeParentKey: assistant.nativeMessageKey }, expectedHeadRevisionId: assistant.id, expectedSelectionVersion: 1, expectedSceneRevision: history.projection!.bindingRevision };
    await prepareStoryRequest(f.branch.id, input, f.repo); await settleStoryRequest(input.id, { status: "accepted", httpStatus: 200 }, f.repo);
    const user = { ...f.observation("3", "user", assistant.id, assistant.nativeMessageKey), requestId: input.id }; await recordRequestedStoryObservation(f.branch.id, user, f.repo);
    expect((await readStoryTimeline(f.branch.id, f.repo)).requests).toHaveLength(2); expect((await readStoryTimeline(f.branch.id, f.repo)).revisions).toHaveLength(3);
  });
  it("routes a retry to a selected user ancestor, not to the previously applied assistant", async () => {
    const f = await setup(), { user, assistant, history } = await acceptedPair(f);
    const request = { ...f.preparation, id: createId("request"), purpose: "assistant-retry" as const, identity: { chatId: f.binding.chatId, nativeParentKey: user.nativeMessageKey }, parentRevisionId: user.id, expectedHeadRevisionId: assistant.id, expectedSelectionVersion: 1, expectedSceneRevision: history.projection!.bindingRevision };
    await prepareStoryRequest(f.branch.id, request, f.repo); await settleStoryRequest(request.id, { status: "accepted", httpStatus: 200 }, f.repo);
    const retry = { ...f.observation("2", "assistant", user.id, user.nativeMessageKey), requestId: request.id, messageId: assistant.messageId, content: "The courier kept the clock key." };
    await recordRequestedStoryObservation(f.branch.id, retry, f.repo);
    const result = await selectStoryRevision(f.branch.id, { headRevisionId: retry.id, expectedHeadRevisionId: assistant.id, expectedSelectionVersion: 1, acceptedEventIds: [] }, f.repo);
    expect(result.projection.revisionIds).toEqual([user.id, retry.id]);
  });
  it("unselected variants, unknown native IDs, wrong roles and restarted roots are not guessed", async () => {
    const f = await setup(), { user, assistant, history } = await acceptedPair(f);
    const alternative = { ...f.observation("2", "assistant", user.id, user.nativeMessageKey), messageId: assistant.messageId, content: "Different ending" }; await recordRequestedStoryObservation(f.branch.id, alternative, f.repo);
    const input = { ...f.preparation, id: createId("request"), parentRevisionId: alternative.id, identity: { chatId: f.binding.chatId, nativeParentKey: alternative.nativeMessageKey }, expectedHeadRevisionId: assistant.id, expectedSelectionVersion: 1, expectedSceneRevision: history.projection!.bindingRevision };
    await expect(prepareStoryRequest(f.branch.id, input, f.repo)).rejects.toThrow("story-request-parent-unselected");
    await expect(prepareStoryRequest(f.branch.id, { ...input, parentRevisionId: assistant.id, identity: { ...input.identity, nativeParentKey: nativeStoryMessageKey("missing") } }, f.repo)).rejects.toThrow("story-request-link-invalid");
    await expect(prepareStoryRequest(f.branch.id, { ...input, parentRevisionId: user.id, identity: { ...input.identity, nativeParentKey: user.nativeMessageKey } }, f.repo)).rejects.toThrow("story-request-link-invalid");
    await expect(prepareStoryRequest(f.branch.id, { ...input, parentRevisionId: null, identity: { ...input.identity, nativeParentKey: null } }, f.repo)).rejects.toThrow("story-request-link-invalid");
  });
  it("interrupted/partial sources are archived but cannot be selected", async () => {
    const f = await setup(); await prepareStoryRequest(f.branch.id, f.preparation, f.repo); await settleStoryRequest(f.preparation.id, { status: "accepted", httpStatus: 200 }, f.repo);
    const user = f.observation("1", "user", null, null); await recordRequestedStoryObservation(f.branch.id, user, f.repo);
    const partial = { ...f.observation("2", "assistant", user.id, user.nativeMessageKey), completion: "interrupted" as const }; await recordRequestedStoryObservation(f.branch.id, partial, f.repo);
    await expect(selectStoryRevision(f.branch.id, { headRevisionId: partial.id, expectedHeadRevisionId: null, expectedSelectionVersion: 0, acceptedEventIds: [] }, f.repo)).rejects.toThrow("story-source-incomplete");
  });
  it("reopens receipts, backs them up, and rejects a tampered source link", async () => {
    const f = await setup(); await acceptedPair(f); f.db.close(); const reopened = new DeepRoleDatabase(f.db.name); dbs.push(reopened); const repo = new DeepRoleRepository(reopened);
    expect((await readStoryTimeline(f.branch.id, repo)).requests[0]!.delivery.status).toBe("accepted");
    const payload = await createBackup(undefined, repo); if (payload.format !== "deeprole-backup") throw new Error("test backup");
    const target = empty(); await restoreBackup(await parseBackup(JSON.stringify(payload)), "replace", target.repo); expect(await target.repo.rawRecords()).toEqual(await repo.rawRecords());
    const row = payload.records.find(row => row.kind === "story" && (row.data as any).type === "request")!; (row.data as StoryRequest).nativeParentKey = nativeStoryMessageKey("invented");
    await expect(parseBackup(JSON.stringify(payload))).rejects.toThrow();
  });
  it.each(["chat", "binding", "parent", "head", "delivery", "time", "proof", "private-field"] as const)("rejects a tampered %s during backup validation", async problem => {
    const f = await setup(); await acceptedPair(f); const payload = await createBackup(undefined, f.repo); if (payload.format !== "deeprole-backup") throw new Error("test backup");
    const request = payload.records.find(row => row.kind === "story" && (row.data as any).type === "request")!.data as StoryRequest;
    if (problem === "chat") request.chatId = "another";
    if (problem === "binding") request.bindingId = "another";
    if (problem === "parent") request.parentRevisionId = "missing";
    if (problem === "head") request.selectedHeadRevisionId = "missing";
    if (problem === "delivery") request.delivery = { status: "prepared" };
    if (problem === "time" && request.delivery.status === "accepted") request.delivery.at = request.updatedAt + 1;
    if (problem === "proof") (payload.records.find(row => row.kind === "story" && (row.data as any).type === "revision")!.data as any).requestProof.nativeParentKey = nativeStoryMessageKey("missing");
    if (problem === "private-field") Object.assign(request, { prompt: "never accepted" });
    const target = empty(); await expect(parseBackup(JSON.stringify(payload))).rejects.toThrow(); expect(await target.repo.rawRecords()).toEqual([]);
  });
  it("rolls back a failed receipt write and succeeds on retry", async () => {
    const f = await setup(), before = await f.db.records.toArray();
    vi.spyOn(f.db.records, "bulkPut").mockImplementationOnce(rows => f.db.records.put(rows[0]!).then(() => { throw new Error("injected-request-failure"); }));
    await expect(prepareStoryRequest(f.branch.id, f.preparation, f.repo)).rejects.toThrow("injected-request-failure"); expect(await f.db.records.toArray()).toEqual(before);
    await prepareStoryRequest(f.branch.id, f.preparation, f.repo);
  });
  it("encrypts the receipt and source proof; locked storage cannot accept the send", async () => {
    const f = await setup(); await prepareStoryRequest(f.branch.id, f.preparation, f.repo); await f.repo.enableVault("synthetic-request-password");
    const stored = (await f.db.records.toArray()).find(row => row.id === f.preparation.id)!; expect(stored.data).toBeUndefined(); expect(stored.encrypted).toBeDefined();
    await f.repo.lockVault(); const before = await f.db.records.toArray(); await expect(settleStoryRequest(f.preparation.id, { status: "accepted", httpStatus: 200 }, f.repo)).rejects.toBeInstanceOf(VaultLockedError); expect(await f.db.records.toArray()).toEqual(before);
    await f.repo.unlockVault("synthetic-request-password"); await settleStoryRequest(f.preparation.id, { status: "accepted", httpStatus: 200 }, f.repo);
    await recordRequestedStoryObservation(f.branch.id, f.observation("1", "user", null, null), f.repo); expect((await f.db.records.toArray()).filter(row => row.kind === "story").every(row => !row.data && !!row.encrypted)).toBe(true);
  });
  it("keeps detached historic receipts but cannot send through them; full deletion removes them", async () => {
    const f = await setup(); await acceptedPair(f); await removeWorld(f.world.id, f.repo);
    const detached = await readStoryTimeline(f.branch.id, f.repo); expect(detached.requests[0]!.worldId).toBeNull();
    await expect(prepareStoryRequest(f.branch.id, { ...f.preparation, id: createId("request") }, f.repo)).rejects.toThrow("story-scope-invalid");
    const g = await setup(); await prepareStoryRequest(g.branch.id, g.preparation, g.repo); await removeWorld(g.world.id, g.repo, { deleteLore: true }); expect(await g.repo.list("story")).toEqual([]);
  });
  it("clones a queued preparation before a caller changes its routing", async () => {
    const f = await setup(), input = structuredClone(f.preparation); const task = prepareStoryRequest(f.branch.id, input, f.repo); input.identity.chatId = "changed";
    expect((await task).chatId).toBe(f.binding.chatId);
  });
  it("a late accepted callback does not replace the branch or its manually edited state", async () => {
    const f = await setup(); await prepareStoryRequest(f.branch.id, f.preparation, f.repo);
    const binding = structuredClone(f.binding); binding.characterScenes![f.world.id]!.revision = "manual-late"; await f.repo.put("binding", binding);
    await settleStoryRequest(f.preparation.id, { status: "accepted", httpStatus: 200 }, f.repo);
    expect(await f.repo.get<ChatBinding>("binding", f.binding.id)).toEqual(binding);
  });
});
