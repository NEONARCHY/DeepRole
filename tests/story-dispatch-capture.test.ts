import { afterEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { captureDispatchPacket, captureDispatchSource, confirmedDispatchText, validStoryDispatchCapture, validStoryDispatchSource, type StoryDispatchCapture, type StoryDispatchCaptureInput } from "../src/core/story-dispatch-capture";
import { nativeStoryMessageKey as key } from "../src/core/story-transport";
import { validDataRecord } from "../src/core/record-validation";
import { prepareDispatchCapture, confirmDispatchCapture, advanceDispatchCapture } from "../src/storage/story-dispatch-capture";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository, VaultLockedError } from "../src/storage/repository";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { removeWorld, exportWorld } from "../src/storage/worlds";
import { storyWorld } from "./fixtures/story-worlds";
import type { NativeStoryStreamPacket } from "../src/core/story-native-stream";
import type { StoryDispatchPacket } from "../src/core/story-dispatch";

const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dbs.splice(0).map(db => db.delete())); });
function empty() { const db = new DeepRoleDatabase("dispatch-capture-" + crypto.randomUUID()); dbs.push(db); return { db, repo: new DeepRoleRepository(db) }; }
async function setup() {
  const fixture = storyWorld("ru"), { db, repo } = empty(); await repo.mergeRecords(fixture.records);
  const initialRecords = await repo.rawRecords();
  const input: StoryDispatchCaptureInput = { id: crypto.randomUUID(), worldId: fixture.world.id, bindingId: fixture.binding.id, identity: { chatId: fixture.binding.chatId, nativeParentKey: key("41") }, transport: "xhr", sceneRevision: "legacy-scene-a", originalDraft: "*Я беру ключ.*\n[User message]\nЭто часть моей реплики.", proposedContext: "<deeprole_context>PRIVATE_MEMORY</deeprole_context>" };
  await prepareDispatchCapture(input, 7, repo);
  const source = { requestId: input.id, identity: input.identity, transport: input.transport, outgoingText: `${input.proposedContext}\n\n[User message]\n${input.originalDraft}` };
  const route = { requestId: input.id, identity: input.identity, transport: input.transport };
  const started: StoryDispatchPacket = { ...route, phase: "started" }, accepted: StoryDispatchPacket = { ...route, phase: "settled", delivery: { status: "accepted", httpStatus: 200 } };
  const link = { requestId: input.id, chatId: input.identity.chatId, nativeParentKey: key("41"), userMessageKey: key("42"), assistantMessageKey: key("43") };
  const ready: NativeStoryStreamPacket = { ...route, transport: "xhr", phase: "ready", link, sawFinish: false, issue: null };
  return { ...fixture, initialRecords, db, repo, input, source, started, accepted, ready, read: () => repo.get<StoryDispatchCapture>("dispatch", input.id) };
}
async function sent(f: Awaited<ReturnType<typeof setup>>) {
  await confirmDispatchCapture(f.source, 7, f.repo); await advanceDispatchCapture(f.started, 7, f.repo); await advanceDispatchCapture(f.accepted, 7, f.repo); await advanceDispatchCapture(f.ready, 7, f.repo);
}
describe("durable native outgoing journal, not story-event acceptance", () => {
  it("freezes sources before sending without changing lore, bindings or creating a chronicle", async () => {
    const f = await setup(), capture = (await f.read())!;
    expect(capture.injection).toBe("unconfirmed"); expect(capture.started).toBe(false); expect(capture.delivery).toBeNull(); expect(capture.wire.phase).toBe("waiting");
    expect(capture.originalDraft).toBe(f.input.originalDraft); expect(confirmedDispatchText(capture)).toBeNull(); expect(await f.repo.list("story")).toEqual([]);
    expect((await f.repo.rawRecords()).filter(row => row.kind !== "dispatch")).toEqual(f.initialRecords); expect(validDataRecord({ kind: "dispatch", id: capture.id, data: capture })).toBe(true);
  });
  it("confirms the entire actual text and never splits custom user markers", async () => {
    const f = await setup(); await sent(f); const capture = (await f.read())!;
    expect(confirmedDispatchText(capture)).toBe(f.source.outgoingText); expect(capture.originalDraft).toBe(f.input.originalDraft); expect(capture.injection).toBe("context");
    expect(capture.delivery).toEqual({ status: "accepted", httpStatus: 200 }); expect(capture.wire).toEqual({ phase: "ready", link: f.ready.link, sawFinish: false, issue: null });
  });
  it("records a non-injected draft literally, even with existing protocol-like text", async () => {
    const f = await setup(); await confirmDispatchCapture({ ...f.source, outgoingText: f.input.originalDraft }, 7, f.repo);
    expect((await f.read())?.injection).toBe("none"); expect(confirmedDispatchText((await f.read())!)).toBe(f.input.originalDraft);
  });
  it.each(["text", "parent", "chat", "transport", "request"] as const)("rejects mismatched confirmed %s without changing the stored source", async problem => {
    const f = await setup(), source = structuredClone(f.source), before = await f.read();
    if (problem === "text") source.outgoingText = "PRIVATE_MEMORY\n" + f.input.originalDraft;
    if (problem === "parent") source.identity.nativeParentKey = key("999");
    if (problem === "chat") source.identity.chatId = "foreign-chat";
    if (problem === "transport") source.transport = "fetch";
    if (problem === "request") source.requestId = crypto.randomUUID();
    await expect(confirmDispatchCapture(source, 7, f.repo)).rejects.toThrow(); expect(await f.read()).toEqual(before);
  });
  it("keeps repeated preparation/confirmation/delivery and two repository instances idempotent", async () => {
    const f = await setup(); await Promise.all([prepareDispatchCapture(f.input, 7, f.repo), prepareDispatchCapture(f.input, 7, new DeepRoleRepository(f.db))]); await sent(f);
    const before = await f.read(); await sent(f); expect(await f.read()).toEqual(before); expect(await f.repo.list("dispatch")).toHaveLength(1);
    expect((await new DeepRoleRepository(f.db).get<StoryDispatchCapture>("dispatch", f.input.id))?.wire.link).toEqual(f.ready.link);
  });
  it.each(["owner", "world", "chat", "scene", "draft"] as const)("rejects changed preparation %s without overwriting a capture", async problem => {
    const f = await setup(), input = structuredClone(f.input), before = await f.read();
    if (problem === "world") input.worldId = "other-world";
    if (problem === "chat") input.identity.chatId = "other-chat";
    if (problem === "scene") input.sceneRevision = "later-scene";
    if (problem === "draft") input.originalDraft += "!";
    await expect(prepareDispatchCapture(input, problem === "owner" ? 8 : 7, f.repo)).rejects.toThrow(); expect(await f.read()).toEqual(before);
  });
  it("rejects unconfirmed, unstarted or unaccepted reply packets", async () => {
    const f = await setup(); await expect(advanceDispatchCapture(f.started, 7, f.repo)).rejects.toThrow(); await confirmDispatchCapture(f.source, 7, f.repo);
    await expect(advanceDispatchCapture(f.accepted, 7, f.repo)).rejects.toThrow(); await advanceDispatchCapture(f.started, 7, f.repo);
    await expect(advanceDispatchCapture(f.ready, 7, f.repo)).rejects.toThrow(); expect((await f.read())?.wire.phase).toBe("waiting");
  });
  it("keeps HTTP acceptance separate from a later wire cancellation", async () => {
    const f = await setup(); await sent(f); await advanceDispatchCapture({ ...f.ready, phase: "failed", issue: "aborted" }, 7, f.repo);
    expect((await f.read())?.delivery?.status).toBe("accepted"); expect((await f.read())?.wire.phase).toBe("failed"); expect(await f.repo.list("story")).toEqual([]);
  });
  it("keeps close without finish distinct and does not accept a story event", async () => {
    const f = await setup(); await sent(f); await advanceDispatchCapture({ ...f.ready, phase: "closed" }, 7, f.repo);
    const closed = await f.read(); expect(closed?.wire.sawFinish).toBe(false); await advanceDispatchCapture(f.ready, 7, f.repo); expect(await f.read()).toEqual(closed);
    expect((await f.repo.rawRecords()).filter(row => row.kind !== "dispatch")).toEqual(f.initialRecords);
  });
  it("cannot replace a native pair, reopen a finished wire or rewrite HTTP success", async () => {
    const f = await setup(); await sent(f); const before = await f.read();
    await expect(advanceDispatchCapture({ ...f.ready, link: { ...f.ready.link!, assistantMessageKey: key("99") } }, 7, f.repo)).rejects.toThrow();
    await expect(advanceDispatchCapture({ ...f.accepted, phase: "settled", delivery: { status: "failed", code: "network" } }, 7, f.repo)).rejects.toThrow(); expect(await f.read()).toEqual(before);
    await advanceDispatchCapture({ ...f.ready, phase: "finish", sawFinish: true }, 7, f.repo); await advanceDispatchCapture({ ...f.ready, phase: "closed", sawFinish: true }, 7, f.repo);
    const closed = await f.read(); await advanceDispatchCapture(f.ready, 7, f.repo); expect(await f.read()).toEqual(closed);
  });
  it("rejects another tab or a switched binding but does not erase the historical capture", async () => {
    const f = await setup(); await expect(confirmDispatchCapture(f.source, 8, f.repo)).rejects.toThrow("dispatch-owner-conflict");
    await f.repo.put("binding", { ...f.binding, worldId: null }); await expect(confirmDispatchCapture(f.source, 7, f.repo)).rejects.toThrow("dispatch-scope-conflict"); expect(await f.read()).not.toBeNull();
  });
  it("does not announce journal writes as lore edits", async () => {
    const f = await setup(), set = vi.spyOn(browser.storage.local, "set"); set.mockClear(); await sent(f); expect(set).not.toHaveBeenCalled();
  });
  it("rolls back a failed durable write, preserving source and current game state", async () => {
    const f = await setup(), before = await f.repo.rawRecords(); vi.spyOn(f.db.records, "bulkPut").mockRejectedValueOnce(Error("synthetic-write-error"));
    await expect(confirmDispatchCapture(f.source, 7, f.repo)).rejects.toThrow("synthetic-write-error"); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("round-trips backup v4 as history, not resumable local authority", async () => {
    const f = await setup(); await sent(f); const backup = await createBackup(undefined, f.repo); expect(backup.format).toBe("deeprole-backup"); if (backup.format !== "deeprole-backup") throw Error(); expect(backup.version).toBe(4);
    const target = empty(); await restoreBackup(await parseBackup(JSON.stringify(backup)), "replace", target.repo);
    const restored = await target.repo.get<StoryDispatchCapture>("dispatch", f.input.id); expect(restored).toEqual({ ...(await f.read()), origin: "restored" });
    await expect(advanceDispatchCapture(f.ready, 7, target.repo)).rejects.toThrow("dispatch-owner-conflict"); await restoreBackup(await parseBackup(JSON.stringify(backup)), "merge", target.repo);
    expect(await target.repo.list("dispatch")).toHaveLength(1);
    const changed = structuredClone(backup); (changed.records.find(row => row.kind === "dispatch")!.data as StoryDispatchCapture).originalDraft += "changed";
    await expect(restoreBackup(changed, "merge", target.repo)).rejects.toThrow("dispatch-merge-conflict");
  });
  it.each([1, 2, 3])("does not import capture records under older envelope v%s", async version => {
    const f = await setup(), backup = await createBackup(undefined, f.repo); await expect(parseBackup(JSON.stringify({ ...backup, version }))).rejects.toThrow();
  });
  it("encrypts sources at rest and in exported copies and forbids locked writes", async () => {
    const f = await setup(); await f.repo.enableVault("synthetic capture vault"); await sent(f);
    const rows = await f.db.records.where("kind").equals("dispatch").toArray(); expect(rows.every(row => !row.data && !!row.encrypted)).toBe(true); expect(JSON.stringify(rows)).not.toContain("PRIVATE_MEMORY");
    const backup = await createBackup("synthetic backup", f.repo); expect(backup.format).toBe("deeprole-encrypted"); expect(JSON.stringify(backup)).not.toContain(f.input.originalDraft);
    await f.repo.lockVault(); await expect(confirmDispatchCapture(f.source, 7, f.repo)).rejects.toBeInstanceOf(VaultLockedError);
    await f.repo.unlockVault("synthetic capture vault"); expect((await f.read())?.originalDraft).toBe(f.input.originalDraft);
    expect((await parseBackup(JSON.stringify(backup), "synthetic backup")).version).toBe(4);
  });
  it.each([false, true])("world removal deleteLore=%s detaches or purges captures, never leaks into a world package", async deleteLore => {
    const f = await setup(); expect((await exportWorld(f.world.id, f.repo)).records.some(row => row.kind === "dispatch")).toBe(false); await removeWorld(f.world.id, f.repo, { deleteLore });
    const capture = await f.read(); expect(deleteLore ? capture === null : capture?.worldId === null).toBe(true);
    if (!deleteLore) { expect(capture?.originalDraft).toBe(f.input.originalDraft); await expect(confirmDispatchCapture(f.source, 7, f.repo)).rejects.toThrow("dispatch-scope-conflict"); }
  });
  it("rejects extra fields, oversized content and impossible saved states", async () => {
    const f = await setup(), capture = (await f.read())!;
    expect(validStoryDispatchCapture({ ...capture, token: "SECRET" })).toBe(false); expect(validStoryDispatchSource({ ...f.source, token: "SECRET" })).toBe(false);
    expect(validStoryDispatchCapture({ ...capture, originalDraft: "x".repeat(100_001) })).toBe(false);
    expect(validStoryDispatchCapture({ ...capture, started: true })).toBe(false); expect(validStoryDispatchCapture({ ...capture, wire: { ...capture.wire, phase: "ready" } })).toBe(false);
    expect(() => captureDispatchSource(capture, { ...f.source, outgoingText: f.source.outgoingText + " " })).toThrow();
    expect(() => captureDispatchPacket(capture, f.started)).toThrow();
  });
});
