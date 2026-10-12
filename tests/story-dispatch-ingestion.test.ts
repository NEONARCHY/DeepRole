import { afterEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { nativeStoryMessageKey as key } from "../src/core/story-transport";
import { validStoryDispatchCapture, type StoryDispatchCapture, type StoryDispatchCaptureInput } from "../src/core/story-dispatch-capture";
import { type StoryRequest } from "../src/core/story-records";
import type { ChatBinding } from "../src/core/types";
import { readNativeStoryReply, type NativeStoryReplyResult } from "../src/core/story-native-reply";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { ensureLegacyStory, readStoryTimeline } from "../src/storage/story-history";
import { anchorStoryCheckpoint } from "../src/storage/story-observer";
import { prepareDispatchCapture, confirmDispatchCapture, advanceDispatchCapture } from "../src/storage/story-dispatch-capture";
import { recordDispatchReply, pendingDispatchReplies } from "../src/storage/story-dispatch-reply";
import { selectStoryRevision } from "../src/storage/story-selection";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { removeWorld } from "../src/storage/worlds";
import { nativeReplyPayload, replyQuery } from "./fixtures/story-native-reply";
import { storyWorld } from "./fixtures/story-worlds";

const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dbs.splice(0).map(db => db.delete())); });
function empty() { const db = new DeepRoleDatabase("dispatch-ingestion-" + crypto.randomUUID()); dbs.push(db); return { db, repo: new DeepRoleRepository(db) }; }
async function setup(anchor = true) {
  const f = storyWorld(), { db, repo } = empty(); await repo.mergeRecords(f.records);
  const input: StoryDispatchCaptureInput = { id: replyQuery.requestId, identity: replyQuery.identity, transport: "xhr", worldId: f.world.id, bindingId: f.binding.id, sceneRevision: "legacy-scene-a", originalDraft: "I take the key. [User message] is literal.", proposedContext: "PRIVATE_MEMORY" };
  const branch = anchor ? await ensureLegacyStory({ worldId: f.world.id, bindingId: f.binding.id }, repo) : null;
  if (branch) await anchorStoryCheckpoint(branch.id, { identity: input.identity, role: "assistant", completion: "complete", expectedSceneRevision: input.sceneRevision }, repo);
  return { ...f, db, repo, input, branch, read: () => repo.get<StoryDispatchCapture>("dispatch", input.id) };
}
async function wire(f: Awaited<ReturnType<typeof setup>>) {
  const { input, repo } = f, route = { requestId: input.id, identity: input.identity, transport: input.transport };
  const outgoingText = `${input.proposedContext}\n\n[User message]\n${input.originalDraft}`;
  await confirmDispatchCapture({ ...route, outgoingText }, 7, repo); await advanceDispatchCapture({ ...route, phase: "started" }, 7, repo);
  await advanceDispatchCapture({ ...route, phase: "settled", delivery: { status: "accepted", httpStatus: 200 } }, 7, repo);
  await advanceDispatchCapture({ ...route, transport: "xhr", phase: "closed", link: { ...replyQuery.link, requestId: input.id, nativeParentKey: input.identity.nativeParentKey }, sawFinish: true, issue: null }, 7, repo);
  const result = readNativeStoryReply(nativeReplyPayload(outgoingText), { ...replyQuery, requestId: input.id, identity: input.identity });
  if (result.status !== "read") throw Error("synthetic-invalid");
  return result.result;
}
async function complete() {
  const f = await setup(); await prepareDispatchCapture(f.input, 7, f.repo); const result = await wire(f); return { ...f, result };
}
describe("pre-send checkpoint route into atomic observed chronicle", () => {
  it("prepares source and story request together, before confirmation or HTTP delivery", async () => {
    const f = await setup(), before = (await f.repo.rawRecords()).filter(r => r.kind !== "story"); await prepareDispatchCapture(f.input, 7, f.repo);
    expect(await f.read()).toMatchObject({ storyBranchId: f.branch!.id, injection: "unconfirmed", started: false, delivery: null });
    expect(await f.repo.get("story", f.input.id)).toMatchObject({ type: "request", branchId: f.branch!.id, delivery: { status: "prepared" }, nativeParentKey: key("41"), context: { acceptedEventIds: [] } });
    expect((await f.repo.rawRecords()).filter(r => !["story", "dispatch"].includes(r.kind))).toEqual(before);
    expect((await readStoryTimeline(f.branch!.id, f.repo)).revisions).toEqual([]);
  });
  it("records the exact user and final assistant as one unselected pair; pointer is not local choice", async () => {
    const f = await complete(), before = (await f.repo.rawRecords()).filter(r => !["story", "dispatch"].includes(r.kind));
    await recordDispatchReply({ ...f.result, serverSelection: "different" }, 7, f.repo);
    const timeline = await readStoryTimeline(f.branch!.id, f.repo);
    expect(timeline.requests[0]).toMatchObject({ delivery: { status: "accepted", httpStatus: 200 } });
    expect(timeline.revisions).toHaveLength(2); const user = timeline.revisions.find(r => r.role === "user")!, assistant = timeline.revisions.find(r => r.role === "assistant")!;
    expect(user.content).toBe(f.input.originalDraft); expect(user.parentRevisionId).toBeNull(); expect(assistant.parentRevisionId).toBe(user.id); expect(assistant.content).toBe(f.result.assistant.content);
    expect(assistant.completion).toBe("complete"); expect(user.requestId).toBe(f.input.id); expect(assistant.requestProof).toEqual({ nativeParentKey: key("42") });
    expect(timeline.branch.headRevisionId).toBeNull(); expect(timeline.branch.selectionVersion).toBe(0); expect(timeline.projection).toBeNull(); expect(timeline.events).toEqual([]);
    expect(JSON.stringify(timeline.revisions)).not.toMatch(/PRIVATE_MEMORY|THOUGHTS|FOREIGN_BRANCH/);
    expect((await f.repo.rawRecords()).filter(r => !["story", "dispatch"].includes(r.kind))).toEqual(before);
  });
  it("does not broadcast any journal/receipt/revision as a scene or lore edit", async () => {
    const f = await setup(), set = vi.spyOn(browser.storage.local, "set"); set.mockClear();
    await prepareDispatchCapture(f.input, 7, f.repo); await recordDispatchReply(await wire(f), 7, f.repo); expect(set).not.toHaveBeenCalled();
    const t = await readStoryTimeline(f.branch!.id, f.repo), answer = t.revisions.find(r => r.role === "assistant")!;
    await selectStoryRevision(f.branch!.id, { headRevisionId: answer.id, expectedHeadRevisionId: null, expectedSelectionVersion: 0, acceptedEventIds: [] }, f.repo);
    expect(set).toHaveBeenCalled(); // Binding/projection selection still informs live readers.
  });
  it("deduplicates two writers, repeats and a repository reopen without changing the first pointer", async () => {
    const f = await complete(); await Promise.all([recordDispatchReply(f.result, 7, f.repo), recordDispatchReply(f.result, 7, new DeepRoleRepository(f.db))]);
    const before = await f.repo.rawRecords(); await recordDispatchReply({ ...f.result, serverSelection: "different" }, 7, f.repo); await prepareDispatchCapture(f.input, 7, f.repo);
    expect(await f.repo.rawRecords()).toEqual(before); expect((await readStoryTimeline(f.branch!.id, new DeepRoleRepository(f.db))).revisions).toHaveLength(2);
  });
  it.each(["no-checkpoint", "unanchored", "different-parent", "fetch", "manual-revision", "manual-state", "duplicate-binding"])("keeps %s in the source journal without inventing authority", async mode => {
    const f = await setup(mode !== "no-checkpoint" && mode !== "unanchored");
    if (mode === "unanchored") await ensureLegacyStory({ worldId: f.world.id, bindingId: f.binding.id }, f.repo);
    if (mode === "different-parent") f.input.identity = { ...f.input.identity, nativeParentKey: key("999") };
    if (mode === "fetch") f.input.transport = "fetch";
    if (mode === "manual-revision" || mode === "manual-state") {
      const binding = structuredClone(f.binding), scene = binding.characterScenes![f.world.id]!;
      if (mode === "manual-revision") scene.revision = f.input.sceneRevision = "manual-later";
      else scene.states[f.entities[0]!.id]!.goal = "My manually chosen goal.";
      await f.repo.put("binding", binding);
    }
    if (mode === "duplicate-binding") await f.repo.put("binding", { ...f.binding, id: "duplicate-binding" });
    await prepareDispatchCapture(f.input, 7, f.repo); expect((await f.read())?.storyBranchId).toBeUndefined(); expect(await f.repo.get("story", f.input.id)).toBeNull();
  });
  it("cannot retrofit an old capture after a later checkpoint, even on repeated preparation", async () => {
    const f = await setup(false); await prepareDispatchCapture(f.input, 7, f.repo);
    const branch = await ensureLegacyStory({ worldId: f.world.id, bindingId: f.binding.id }, f.repo);
    await anchorStoryCheckpoint(branch.id, { identity: f.input.identity, role: "assistant", completion: "complete", expectedSceneRevision: f.input.sceneRevision }, f.repo);
    await prepareDispatchCapture(f.input, 7, f.repo); await recordDispatchReply(await wire(f), 7, f.repo);
    expect((await f.read())?.storyBranchId).toBeUndefined(); expect((await readStoryTimeline(branch.id, f.repo)).requests).toEqual([]); expect((await readStoryTimeline(branch.id, f.repo)).revisions).toEqual([]);
  });
  it.each(["network", "aborted", "http", "redirected", "unavailable", "superseded"] as const)("settles delivery %s conservatively and never records an answer", async code => {
    const f = await setup(); await prepareDispatchCapture(f.input, 7, f.repo); const route = { requestId: f.input.id, identity: f.input.identity, transport: "xhr" as const };
    await confirmDispatchCapture({ ...route, outgoingText: f.input.originalDraft }, 7, f.repo); await advanceDispatchCapture({ ...route, phase: "started" }, 7, f.repo);
    const delivery = { status: "failed" as const, code, ...(code === "http" ? { httpStatus: 503 } : {}) };
    await advanceDispatchCapture({ ...route, phase: "settled", delivery }, 7, f.repo);
    const request = (await f.repo.get<StoryRequest>("story", f.input.id))!;
    expect(request.delivery.status).toBe(["network", "aborted", "http"].includes(code) ? "failed" : "prepared");
    expect((await f.read())?.delivery).toEqual(delivery); expect(await pendingDispatchReplies(f.binding.chatId, 7, f.repo)).toEqual([]); expect((await readStoryTimeline(f.branch!.id, f.repo)).revisions).toEqual([]);
  });
  it.each(["prepare", "delivery", "answer"])("rolls back all halves of a failed %s write and retries exactly once", async stage => {
    const f = await setup(); let result: NativeStoryReplyResult | null = null;
    if (stage !== "prepare") await prepareDispatchCapture(f.input, 7, f.repo);
    const route = { requestId: f.input.id, identity: f.input.identity, transport: "xhr" as const };
    if (stage === "delivery") { await confirmDispatchCapture({ ...route, outgoingText: f.input.originalDraft }, 7, f.repo); await advanceDispatchCapture({ ...route, phase: "started" }, 7, f.repo); }
    if (stage === "answer") result = await wire(f);
    const before = await f.repo.rawRecords(); const write = () => stage === "prepare" ? prepareDispatchCapture(f.input, 7, f.repo) : stage === "delivery"
      ? advanceDispatchCapture({ ...route, phase: "settled", delivery: { status: "accepted", httpStatus: 200 } }, 7, f.repo) : recordDispatchReply(result!, 7, f.repo);
    vi.spyOn(f.db.records, "bulkPut").mockRejectedValueOnce(Error("synthetic-write-error")); await expect(write()).rejects.toThrow(); expect(await f.repo.rawRecords()).toEqual(before);
    await write(); expect(stage === "answer" ? (await readStoryTimeline(f.branch!.id, f.repo)).revisions.length : (await f.repo.get<StoryRequest>("story", f.input.id))?.delivery.status).toBe(stage === "answer" ? 2 : stage === "prepare" ? "prepared" : "accepted");
  });
  it("requires an explicit selection before the following parent can acquire a receipt", async () => {
    const f = await complete(); await recordDispatchReply(f.result, 7, f.repo);
    const next = { ...f.input, id: "unselected-next", identity: { ...f.input.identity, nativeParentKey: key("43") } };
    await prepareDispatchCapture(next, 7, f.repo); expect((await f.repo.get<StoryDispatchCapture>("dispatch", next.id))?.storyBranchId).toBeUndefined();
    const t = await readStoryTimeline(f.branch!.id, f.repo), head = t.revisions.find(r => r.role === "assistant")!;
    await selectStoryRevision(f.branch!.id, { headRevisionId: head.id, expectedHeadRevisionId: null, expectedSelectionVersion: 0, acceptedEventIds: [] }, f.repo);
    const binding = (await f.repo.get<ChatBinding>("binding", f.binding.id))!;
    await prepareDispatchCapture({ ...next, id: "selected-next", sceneRevision: binding.characterScenes![f.world.id]!.revision ?? null }, 7, f.repo);
    expect(await f.repo.get("story", "selected-next")).toMatchObject({ parentRevisionId: head.id, selectedHeadRevisionId: head.id, selectionVersion: 1, context: { acceptedEventIds: [] } });
    // Earlier unselected work remains unselected even after the branch choice changes.
    expect(await f.repo.get("story", "unselected-next")).toBeNull();
  });
  it("preserves a manual edit made while the answer was being generated", async () => {
    const f = await complete(), binding = structuredClone(f.binding); binding.characterScenes![f.world.id]!.states[f.entities[0]!.id]!.goal = "My edit during generation.";
    await f.repo.put("binding", binding); await recordDispatchReply(f.result, 7, f.repo); expect(await f.repo.get("binding", binding.id)).toEqual(binding);
    expect((await readStoryTimeline(f.branch!.id, f.repo)).revisions).toHaveLength(2);
  });
  it("freezes reply input before asynchronous hashing", async () => {
    const f = await complete(), input = structuredClone(f.result);
    const task = recordDispatchReply(input, 7, f.repo); input.assistant.content = "changed while hashing"; input.wireUserText = "changed request"; await task;
    expect((await f.read())?.reply?.assistant.content).toBe(f.result.assistant.content);
    expect((await readStoryTimeline(f.branch!.id, f.repo)).revisions.find(r => r.role === "assistant")?.content).toBe(f.result.assistant.content);
  });
  it("does not interpret a source-only service reply as a played exchange", async () => {
    const f = await setup(); f.input.originalDraft = "[DeepRole Service]\nGenerate an appearance.";
    await prepareDispatchCapture(f.input, 7, f.repo); await recordDispatchReply(await wire(f), 7, f.repo);
    expect((await f.read())?.storyBranchId).toBeUndefined(); expect(await f.repo.get("story", f.input.id)).toBeNull();
    expect((await f.read())?.reply).toBeDefined(); expect((await readStoryTimeline(f.branch!.id, f.repo)).revisions).toEqual([]);
    expect((await readStoryTimeline(f.branch!.id, f.repo)).events).toEqual([]);
  });
  it.each(["owner", "source", "changed-answer", "scope", "locked"])("rejects %s without source or revision changes", async mode => {
    const f = await complete(), result = structuredClone(f.result);
    if (mode === "source") result.wireUserText = "not the exact sent prompt";
    if (mode === "changed-answer") { await recordDispatchReply(result, 7, f.repo); result.assistant.content = "A changed answer."; }
    if (mode === "scope") await f.repo.put("binding", { ...f.binding, worldId: null });
    if (mode === "locked") { await f.repo.enableVault("synthetic-pass"); await f.repo.lockVault(); }
    const before = await f.db.records.toArray(); await expect(recordDispatchReply(result, mode === "owner" ? 8 : 7, f.repo)).rejects.toThrow(); expect(await f.db.records.toArray()).toEqual(before);
  });
  it("backs up references and observations without executing restored captures", async () => {
    const f = await complete(); await recordDispatchReply(f.result, 7, f.repo); const backup = await createBackup(undefined, f.repo), target = empty();
    await restoreBackup(await parseBackup(JSON.stringify(backup)), "replace", target.repo);
    const restored = (await target.repo.get<StoryDispatchCapture>("dispatch", f.input.id))!;
    expect(restored.storyBranchId).toBe(f.branch!.id); expect(restored.origin).toBe("restored"); expect(validStoryDispatchCapture(restored)).toBe(true);
    await expect(recordDispatchReply(f.result, 7, target.repo)).rejects.toThrow(); expect((await readStoryTimeline(f.branch!.id, target.repo)).revisions).toHaveLength(2);
    const invalid = structuredClone(backup); if (invalid.format !== "deeprole-backup") throw Error(); (invalid.records.find(r => r.kind === "dispatch")!.data as StoryDispatchCapture).storyBranchId = "nonexistent-branch";
    await expect(parseBackup(JSON.stringify(invalid))).rejects.toThrow();
  });
  it.each([false, true])("world removal purge=%s preserves detached history or deletes it together", async purge => {
    const f = await complete(); await recordDispatchReply(f.result, 7, f.repo); await removeWorld(f.world.id, f.repo, { deleteLore: purge });
    const capture = await f.read(); expect(purge ? capture === null : capture?.worldId === null).toBe(true);
    expect((await f.repo.list("story")).length).toBe(purge ? 0 : 5);
    await parseBackup(JSON.stringify(await createBackup(undefined, f.repo)));
  });
  it("rejects fake optional-route shapes while retaining old capture compatibility", async () => {
    const f = await setup(false); await prepareDispatchCapture(f.input, 7, f.repo); const capture = (await f.read())!;
    expect(validStoryDispatchCapture(capture)).toBe(true); expect(validStoryDispatchCapture({ ...capture, storyBranchId: null })).toBe(false);
    expect(validStoryDispatchCapture({ ...capture, storyBranchId: "" })).toBe(false); expect(validStoryDispatchCapture({ ...capture, storyBranchId: "branch", transport: "fetch" })).toBe(false);
  });
});
