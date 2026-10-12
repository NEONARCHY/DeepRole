import { afterEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { nativeStoryMessageKey as key } from "../src/core/story-transport";
import { validStoryDispatchCapture, type StoryDispatchCapture, type StoryDispatchCaptureInput } from "../src/core/story-dispatch-capture";
import { readNativeStoryReply } from "../src/core/story-native-reply";
import { prepareDispatchCapture, confirmDispatchCapture, advanceDispatchCapture } from "../src/storage/story-dispatch-capture";
import { pendingDispatchReplies, recordDispatchReply, dispatchReplyExchange } from "../src/storage/story-dispatch-reply";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { removeWorld } from "../src/storage/worlds";
import { ensureLegacyStory, readStoryTimeline } from "../src/storage/story-history";
import { anchorStoryCheckpoint } from "../src/storage/story-observer";
import { prepareStoryRequest, settleStoryRequest } from "../src/storage/story-requests";
import { observeNativeStoryExchange } from "../src/storage/story-exchange";
import { nativeReplyPayload, replyQuery } from "./fixtures/story-native-reply";
import { storyWorld } from "./fixtures/story-worlds";

const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dbs.splice(0).map(db => db.delete())); });
function empty() { const db = new DeepRoleDatabase("dispatch-reply-" + crypto.randomUUID()); dbs.push(db); return { db, repo: new DeepRoleRepository(db) }; }
async function setup() {
  const { db, repo } = empty(), fixture = storyWorld("ru"); await repo.mergeRecords(fixture.records);
  const before = await repo.rawRecords();
  const input: StoryDispatchCaptureInput = { id: replyQuery.requestId, identity: replyQuery.identity, transport: "xhr", worldId: fixture.world.id, bindingId: fixture.binding.id, sceneRevision: "legacy-scene-a", originalDraft: "I take the key. [User message] stays literal.", proposedContext: "PRIVATE_MEMORY" };
  const outgoingText = `${input.proposedContext}\n\n[User message]\n${input.originalDraft}`;
  await prepareDispatchCapture(input, 7, repo); await confirmDispatchCapture({ requestId: input.id, identity: input.identity, transport: "xhr", outgoingText }, 7, repo);
  const route = { requestId: input.id, identity: input.identity, transport: "xhr" as const };
  await advanceDispatchCapture({ ...route, phase: "started" }, 7, repo); await advanceDispatchCapture({ ...route, phase: "settled", delivery: { status: "accepted", httpStatus: 200 } }, 7, repo);
  await advanceDispatchCapture({ ...route, phase: "closed", link: replyQuery.link, sawFinish: true, issue: null }, 7, repo);
  const read = readNativeStoryReply(nativeReplyPayload(outgoingText), replyQuery); if (read.status !== "read") throw Error("fixture-invalid");
  return { ...fixture, db, repo, input, before, result: read.result, read: () => repo.get<StoryDispatchCapture>("dispatch", input.id) };
}
describe("durable exact response source without selected story effects", () => {
  it("stores only the final associated reply, leaving source, lore and current scene intact", async () => {
    const f = await setup(), source = (await f.read())!; expect(await pendingDispatchReplies("synthetic-a", 7, f.repo)).toEqual([replyQuery]);
    const announce = vi.spyOn(browser.storage.local, "set"); announce.mockClear(); await recordDispatchReply(f.result, 7, f.repo);
    const saved = (await f.read())!; expect(saved.reply?.assistant).toEqual(f.result.assistant); expect(saved.originalDraft).toBe(f.input.originalDraft);
    expect(saved.proposedContext).toBe(source.proposedContext); expect(validStoryDispatchCapture(saved)).toBe(true); expect(await pendingDispatchReplies("synthetic-a", 7, f.repo)).toEqual([]);
    expect(JSON.stringify(saved)).not.toMatch(/THOUGHTS|FOREIGN|EARLIER|wireUserText/); expect(announce).not.toHaveBeenCalled();
    expect((await f.repo.rawRecords()).filter(r => r.kind !== "dispatch")).toEqual(f.before); expect(await f.repo.list("story")).toEqual([]);
  });
  it("is idempotent for two repositories and reopens, with historical pointer observations frozen", async () => {
    const f = await setup(); await Promise.all([recordDispatchReply(f.result, 7, f.repo), recordDispatchReply(f.result, 7, new DeepRoleRepository(f.db))]);
    const saved = await f.read(); await recordDispatchReply({ ...f.result, serverSelection: "different" }, 7, f.repo); expect(await f.read()).toEqual(saved);
    expect(await new DeepRoleRepository(f.db).get("dispatch", f.input.id)).toEqual(saved);
    await expect(recordDispatchReply({ ...f.result, assistant: { ...f.result.assistant, content: "A changed revision" } }, 7, f.repo)).rejects.toThrow("dispatch-reply-conflict"); expect(await f.read()).toEqual(saved);
  });
  it.each(["owner", "request", "chat", "parent", "link", "source", "scope"])("rejects wrong %s without writing either half", async problem => {
    const f = await setup(), result = structuredClone(f.result);
    if (problem === "request") result.requestId = "other-request";
    if (problem === "chat") result.identity.chatId = "other-chat";
    if (problem === "parent") result.identity.nativeParentKey = key("99");
    if (problem === "link") result.link.userMessageKey = key("98");
    if (problem === "source") result.wireUserText = f.input.originalDraft;
    if (problem === "scope") await f.repo.put("binding", { ...f.binding, worldId: null });
    const before = await f.repo.rawRecords(); await expect(recordDispatchReply(result, problem === "owner" ? 8 : 7, f.repo)).rejects.toThrow(); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("rejects an unconfirmed/unfinished wire, but keeps the old optional-reply format valid", async () => {
    const f = await setup(), stored = (await f.read())!; expect(validStoryDispatchCapture(stored)).toBe(true);
    await f.repo.put("dispatch", { ...stored, wire: { ...stored.wire, sawFinish: false } }); await expect(recordDispatchReply(f.result, 7, f.repo)).rejects.toThrow();
    expect(await pendingDispatchReplies("synthetic-a", 7, f.repo)).toEqual([]); expect(await pendingDispatchReplies("foreign-chat", 7, f.repo)).toEqual([]);
    expect(validStoryDispatchCapture({ ...stored, reply: null })).toBe(false);
  });
  it("rejects restored, another-tab, switched-world and locked recovery", async () => {
    const f = await setup(); expect(await pendingDispatchReplies("synthetic-a", 8, f.repo)).toEqual([]);
    const source = (await f.read())!; await f.repo.put("dispatch", { ...source, origin: "restored" }); expect(await pendingDispatchReplies("synthetic-a", 7, f.repo)).toEqual([]);
    await expect(recordDispatchReply(f.result, 7, f.repo)).rejects.toThrow(); await f.repo.put("dispatch", source);
    await f.repo.put("binding", { ...f.binding, worldId: null }); expect(await pendingDispatchReplies("synthetic-a", 7, f.repo)).toEqual([]);
    await f.repo.enableVault("synthetic-passphrase"); await f.repo.lockVault(); await expect(recordDispatchReply(f.result, 7, f.repo)).rejects.toThrow(); await expect(pendingDispatchReplies("synthetic-a", 7, f.repo)).rejects.toThrow();
  });
  it("backs up and restores the observed reply without executing it; full lore deletion removes it", async () => {
    const f = await setup(); await recordDispatchReply(f.result, 7, f.repo); const backup = await createBackup("synthetic-passphrase", f.repo);
    const parsed = await parseBackup(JSON.stringify(backup), "synthetic-passphrase"), target = empty(); await restoreBackup(parsed, "replace", target.repo);
    expect((await target.repo.get<StoryDispatchCapture>("dispatch", f.input.id))?.reply).toEqual((await f.read())?.reply); expect(await pendingDispatchReplies("synthetic-a", 7, target.repo)).toEqual([]);
    await removeWorld(f.world.id, f.repo, { deleteLore: true }); expect(await f.read()).toBeNull();
  });
  it("rolls back the entire failed write, then can record from the same frozen result", async () => {
    const f = await setup(), before = await f.read(); vi.spyOn(f.db.records, "bulkPut").mockRejectedValueOnce(Error("synthetic-write-error"));
    await expect(recordDispatchReply(f.result, 7, f.repo)).rejects.toThrow("synthetic-write-error"); expect(await f.read()).toEqual(before);
    await recordDispatchReply(f.result, 7, f.repo); expect((await f.read())?.reply).toBeDefined();
  });
  it("recovers the newest eight by preparation time, not arbitrary UUID or native-ID order", async () => {
    const f = await setup(), capture = (await f.read())!;
    for (let i = 0; i < 10; i++) { const id = `request-${10 - i}`; await f.repo.put("dispatch", { ...capture, id, createdAt: i, updatedAt: i, wire: { ...capture.wire, link: { ...capture.wire.link!, requestId: id } } }); }
    const queries = await pendingDispatchReplies("synthetic-a", 7, f.repo);
    expect(queries).toHaveLength(8); expect(queries.map(q => q.requestId)).toEqual(["request-7", "request-6", "request-5", "request-4", "request-3", "request-2", "request-1", capture.id]);
    expect(await f.repo.list("dispatch")).toHaveLength(11);
  });
  it("encrypts final reply text at rest, and preserves reply when only the world organization is removed", async () => {
    const f = await setup(); await f.repo.enableVault("synthetic-passphrase"); await recordDispatchReply(f.result, 7, f.repo);
    const rows = await f.db.records.where("kind").equals("dispatch").toArray(); expect(JSON.stringify(rows)).not.toContain("delivered the key"); expect(rows.every(r => !!r.encrypted && !r.data)).toBe(true);
    await removeWorld(f.world.id, f.repo); const detached = (await f.read())!; expect(detached.worldId).toBeNull(); expect(detached.reply?.assistant.content).toBe(f.result.assistant.content);
    expect(validStoryDispatchCapture(detached)).toBe(true); await expect(recordDispatchReply(f.result, 7, f.repo)).rejects.toThrow();
  });
  it("feeds the existing anchored atomic exchange gate, never selecting or applying events", async () => {
    const f = await setup(); await recordDispatchReply(f.result, 7, f.repo); const exchange = (await dispatchReplyExchange((await f.read())!))!;
    expect(exchange.user?.content).toBe(f.input.originalDraft); expect(exchange.user?.content).not.toContain("PRIVATE_MEMORY");
    const branch = await ensureLegacyStory({ worldId: f.world.id, bindingId: f.binding.id }, f.repo);
    expect(await observeNativeStoryExchange(branch.id, exchange, f.repo)).toMatchObject({ status: "paused", issue: { code: "request-missing" } });
    await anchorStoryCheckpoint(branch.id, { identity: f.input.identity, role: "assistant", completion: "complete", expectedSceneRevision: "legacy-scene-a" }, f.repo);
    await prepareStoryRequest(branch.id, { id: f.input.id, purpose: "user-turn", bindingId: f.binding.id, identity: f.input.identity, parentRevisionId: null, expectedHeadRevisionId: null, expectedSelectionVersion: 0, expectedSceneRevision: "legacy-scene-a" }, f.repo);
    await settleStoryRequest(f.input.id, { status: "accepted", httpStatus: 200 }, f.repo);
    expect(await observeNativeStoryExchange(branch.id, exchange, f.repo)).toMatchObject({ status: "recorded" });
    expect(await observeNativeStoryExchange(branch.id, exchange, f.repo)).toMatchObject({ status: "already-recorded" });
    const timeline = await readStoryTimeline(branch.id, f.repo); expect(timeline.revisions).toHaveLength(2); expect(timeline.events).toEqual([]); expect(timeline.branch.headRevisionId).toBeNull();
  });
  it("freezes the source before asynchronous digest computation", async () => {
    const f = await setup(); await recordDispatchReply(f.result, 7, f.repo); const capture = (await f.read())!;
    const task = dispatchReplyExchange(capture); capture.id = "changed-during-hash"; capture.identity.chatId = "foreign-chat"; capture.originalDraft = "changed";
    const exchange = (await task)!; expect(exchange.requestId).toBe(f.input.id); expect(exchange.chatId).toBe("synthetic-a"); expect(exchange.user?.content).toBe(f.input.originalDraft);
  });
});
