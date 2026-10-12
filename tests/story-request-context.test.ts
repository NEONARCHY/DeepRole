import { afterEach, describe, expect, it, vi } from "vitest";
import { characterInstruction } from "../src/core/characters";
import { createId } from "../src/core/id";
import { assertStoryGraph, type StoryRequest } from "../src/core/story-records";
import { projectStoryRequestContext, storyRequestCharacterScene } from "../src/core/story-request-context";
import { nativeStoryMessageKey as key } from "../src/core/story-transport";
import type { CharacterStatus, ChatBinding } from "../src/core/types";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository, VaultLockedError } from "../src/storage/repository";
import { ensureLegacyStory, readStoryTimeline, recordStoryObservation, type StoryObservation } from "../src/storage/story-history";
import { anchorStoryCheckpoint, observeNativeStoryMessage } from "../src/storage/story-observer";
import { prepareStoryRequest, readStoryRequestContext, settleStoryRequest, type StoryRequestPreparation } from "../src/storage/story-requests";
import { selectStoryRevision } from "../src/storage/story-selection";
import { removeWorld } from "../src/storage/worlds";
import { storyWorld } from "./fixtures/story-worlds";

const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dbs.splice(0).map(db => db.delete())); });
function empty() { const db = new DeepRoleDatabase("story-request-context-" + crypto.randomUUID()); dbs.push(db); return { db, repo: new DeepRoleRepository(db) }; }
async function setup(anchor: "root" | "assistant" | null = null) {
  const f = storyWorld("en"), { db, repo } = empty(), hero = f.entities[0]!.id;
  f.binding.characterScenes![f.world.id]!.states[hero]!.attributes = { values: { patience: 50 }, locked: [], history: [] };
  await repo.mergeRecords(f.records); const branch = await ensureLegacyStory({ worldId: f.world.id, bindingId: f.binding.id }, repo);
  const initial = structuredClone(f.binding.characterScenes![f.world.id]!.states[hero]!);
  if (anchor) await anchorStoryCheckpoint(branch.id, { identity: { chatId: f.binding.chatId, nativeParentKey: anchor === "root" ? null : key("checkpoint") }, role: anchor === "root" ? null : "assistant", completion: "complete", expectedSceneRevision: "legacy-scene-a" }, repo);
  async function source(nativeId: string, role: "user" | "assistant", parent: StoryObservation | null, condition?: string, before = initial, sceneChange?: StoryObservation["events"][number]["sceneChange"], completion: StoryObservation["completion"] = "complete", messageId?: string) {
    const after: CharacterStatus = { ...structuredClone(before), ...(condition ? { condition, attributes: { ...before.attributes!, values: { patience: before.attributes!.values.patience! + 5 }, history: [...before.attributes!.history, { at: 30, source: "scene", before: { patience: before.attributes!.values.patience! }, after: { patience: before.attributes!.values.patience! + 5 }, reason: "Synthetic event", quote: "The clock story continues." }] } } : {}) };
    const observation: StoryObservation = { id: createId("revision"), messageId: messageId ?? createId("message"), nativeMessageKey: key(nativeId), requestId: null, parentRevisionId: parent?.id ?? null, role, completion, content: "The clock story continues.",
      events: condition ? [{ id: createId("event"), label: "Synthetic event", quote: "The clock story continues.", participantIds: sceneChange ? [hero, f.entities[1]!.id] : [hero], changes: [{ entityId: hero, before: structuredClone(before), after }], ...(sceneChange ? { sceneChange } : {}) }] : [] };
    await recordStoryObservation(branch.id, observation, repo); return { observation, after, eventId: observation.events[0]?.id };
  }
  async function select(head: string | null, approved: string[]) {
    const current = (await readStoryTimeline(branch.id, repo)).branch;
    return selectStoryRevision(branch.id, { headRevisionId: head, expectedHeadRevisionId: current.headRevisionId, expectedSelectionVersion: current.selectionVersion, acceptedEventIds: approved }, repo);
  }
  async function preparation(parent: StoryObservation | null, purpose: StoryRequest["purpose"] = "user-turn"): Promise<StoryRequestPreparation> {
    const history = await readStoryTimeline(branch.id, repo);
    return { id: createId("request"), purpose, bindingId: f.binding.id, identity: { chatId: f.binding.chatId, nativeParentKey: parent?.nativeMessageKey ?? (anchor === "assistant" ? key("checkpoint") : null) },
      parentRevisionId: parent?.id ?? null, expectedHeadRevisionId: history.branch.headRevisionId, expectedSelectionVersion: history.branch.selectionVersion, expectedSceneRevision: history.projection?.bindingRevision ?? "legacy-scene-a" };
  }
  async function history() {
    const u1 = await source("1", "user", null), a1 = await source("2", "assistant", u1.observation, "Key delivered");
    const u2 = await source("3", "user", a1.observation), a2 = await source("4", "assistant", u2.observation, "Clock repaired", a1.after,
      { before: { presentIds: [hero, f.entities[1]!.id], partnerIds: [] }, after: { presentIds: [hero], partnerIds: [] } });
    const u3 = await source("5", "user", a2.observation), a3 = await source("6", "assistant", u3.observation, "Workshop abandoned", a2.after);
    const approved = [a1.eventId!, a2.eventId!, a3.eventId!]; await select(a3.observation.id, approved);
    return { u1, a1, u2, a2, u3, a3, approved };
  }
  return { ...f, db, repo, branch, hero, initial, source, select, preparation, history };
}

describe("frozen request memory up to its exact parent, not the latest mutable scene", () => {
  it("captures baseline-only context without changing any live data", async () => {
    const f = await setup(), input = await f.preparation(null), before = await f.repo.rawRecords();
    const request = await prepareStoryRequest(f.branch.id, input, f.repo), context = await readStoryRequestContext(f.branch.id, request.id, f.repo);
    expect(request.context).toEqual({ algorithmVersion: 1, acceptedEventIds: [] }); expect(context.revisionIds).toEqual([]); expect(context.appliedEventIds).toEqual([]); expect(context.snapshot.states[f.hero]).toEqual(f.initial);
    expect((await f.repo.rawRecords()).filter(row => row.id !== request.id)).toEqual(before);
    expect(Object.keys(request.context!)).toEqual(["algorithmVersion", "acceptedEventIds"]);
  });
  it("a normal new turn includes the parent consequences and numeric history once", async () => {
    const f = await setup(), h = await f.history(), input = await f.preparation(h.a3.observation);
    const request = await prepareStoryRequest(f.branch.id, input, f.repo), context = await readStoryRequestContext(f.branch.id, request.id, f.repo);
    expect(context.revisionIds).toEqual([h.u1, h.a1, h.u2, h.a2, h.u3, h.a3].map(item => item.observation.id)); expect(context.appliedEventIds).toEqual(h.approved);
    expect(context.snapshot.states[f.hero]).toEqual(h.a3.after); expect(context.snapshot.states[f.hero]!.attributes!.values.patience).toBe(65); expect(context.snapshot.states[f.hero]!.attributes!.history).toHaveLength(3);
  });
  it("a retry excludes the old reply, all descendants, their numbers and scene membership", async () => {
    const f = await setup(), h = await f.history(), request = await prepareStoryRequest(f.branch.id, await f.preparation(h.u2.observation, "assistant-retry"), f.repo);
    const before = await f.repo.rawRecords(), context = await readStoryRequestContext(f.branch.id, request.id, f.repo);
    expect(context.parentRevisionId).toBe(h.u2.observation.id); expect(context.revisionIds).toEqual([h.u1, h.a1, h.u2].map(item => item.observation.id)); expect(context.appliedEventIds).toEqual([h.a1.eventId]);
    expect(context.snapshot.states[f.hero]).toEqual(h.a1.after); expect(context.snapshot.presentIds).toEqual([f.hero, f.entities[1]!.id]); expect(context.snapshot.states[f.hero]!.attributes!.values.patience).toBe(55);
    expect(request.context!.acceptedEventIds).toEqual([h.a1.eventId]); expect(request.selectedHeadRevisionId).toBe(h.a3.observation.id); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("an early user edit receives only state before that user message", async () => {
    const f = await setup(), h = await f.history(), request = await prepareStoryRequest(f.branch.id, await f.preparation(h.a1.observation), f.repo), context = await readStoryRequestContext(f.branch.id, request.id, f.repo);
    expect(context.revisionIds).toEqual([h.u1.observation.id, h.a1.observation.id]); expect(context.snapshot.states[f.hero]).toEqual(h.a1.after); expect(context.appliedEventIds).toEqual([h.a1.eventId]);
  });
  it.each(["root", "assistant"] as const)("first post-checkpoint user edit returns the %s checkpoint, not later effects", async anchor => {
    const f = await setup(anchor), h = await f.history(), request = await prepareStoryRequest(f.branch.id, await f.preparation(null), f.repo);
    const context = await readStoryRequestContext(f.branch.id, request.id, f.repo); expect(context.snapshot.states[f.hero]).toEqual(f.initial); expect(context.revisionIds).toEqual([]);
    await settleStoryRequest(request.id, { status: "accepted", httpStatus: 200 }, f.repo);
    const edited = await observeNativeStoryMessage(f.branch.id, { requestId: request.id, parentRevisionId: null, identity: { role: "user", nativeMessageKey: h.u1.observation.nativeMessageKey, nativeParentKey: request.nativeParentKey }, completion: "complete", content: "A different first turn." }, f.repo);
    const result = await f.select(edited.revisionId, []); expect(result.projection.snapshot.states[f.hero]).toEqual(f.initial); expect(result.projection.revisionIds).toEqual([edited.revisionId]);
  });
  it("does not declare an unanchored old chat root during an early edit", async () => {
    const f = await setup(); await f.history(); const before = await f.repo.rawRecords(); await expect(prepareStoryRequest(f.branch.id, await f.preparation(null), f.repo)).rejects.toThrow("story-request-link-invalid"); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("unselected alternative approvals are not frozen into the request", async () => {
    const f = await setup(), h = await f.history(), alternative = await f.source("4", "assistant", h.u2.observation, "Different ending", h.a1.after, undefined, "complete", h.a2.observation.messageId);
    await f.select(h.a3.observation.id, [...h.approved, alternative.eventId!]);
    const request = await prepareStoryRequest(f.branch.id, await f.preparation(h.a3.observation), f.repo); expect(request.context!.acceptedEventIds).not.toContain(alternative.eventId);
    expect((await readStoryRequestContext(f.branch.id, request.id, f.repo)).snapshot.states[f.hero]).toEqual(h.a3.after);
  });
  it("a later variant switch and changed approval policy never rewrite prepared context", async () => {
    const f = await setup(), h = await f.history(), input = await f.preparation(h.a2.observation), request = await prepareStoryRequest(f.branch.id, input, f.repo), expected = await readStoryRequestContext(f.branch.id, request.id, f.repo);
    await f.select(h.a3.observation.id, [h.a1.eventId!]);
    expect(await readStoryRequestContext(f.branch.id, request.id, f.repo)).toEqual(expected);
    const before = await f.repo.rawRecords(); expect(await prepareStoryRequest(f.branch.id, input, f.repo)).toEqual(request); expect(await f.repo.rawRecords()).toEqual(before);
    const alternative = await f.source("4", "assistant", h.u2.observation, "Other ending", h.a1.after, undefined, "complete", h.a2.observation.messageId); await f.select(alternative.observation.id, [h.a1.eventId!, alternative.eventId!]);
    expect(await readStoryRequestContext(f.branch.id, request.id, f.repo)).toEqual(expected);
  });
  it("unapproved candidates are not added by future approval changes", async () => {
    const f = await setup(), h = await f.history(); await f.select(h.a3.observation.id, []);
    const request = await prepareStoryRequest(f.branch.id, await f.preparation(h.a3.observation), f.repo); expect(request.context!.acceptedEventIds).toEqual([]);
    await f.select(h.a3.observation.id, h.approved); expect((await readStoryRequestContext(f.branch.id, request.id, f.repo)).snapshot.states[f.hero]).toEqual(f.initial);
  });
  it("late HTTP success or failure changes delivery only, not the frozen memory", async () => {
    const f = await setup(), h = await f.history(), input = await f.preparation(h.u2.observation, "assistant-retry"), request = await prepareStoryRequest(f.branch.id, input, f.repo), expected = await readStoryRequestContext(f.branch.id, request.id, f.repo);
    await settleStoryRequest(request.id, { status: "accepted", httpStatus: 200 }, f.repo); expect(await readStoryRequestContext(f.branch.id, request.id, f.repo)).toEqual(expected);
    const second = await prepareStoryRequest(f.branch.id, { ...input, id: createId("request") }, f.repo); await settleStoryRequest(second.id, { status: "failed", reason: "http", httpStatus: 503 }, f.repo);
    expect((await readStoryRequestContext(f.branch.id, second.id, f.repo)).snapshot).toEqual(expected.snapshot);
  });
  it("reconstructs read-only historical context after a manual live-state edit", async () => {
    const f = await setup(), h = await f.history(), request = await prepareStoryRequest(f.branch.id, await f.preparation(h.u2.observation, "assistant-retry"), f.repo), expected = await readStoryRequestContext(f.branch.id, request.id, f.repo);
    const binding = (await f.repo.get<ChatBinding>("binding", f.binding.id))!; binding.characterScenes![f.world.id]!.states[f.hero]!.condition = "Manual latest edit"; await f.repo.put("binding", binding);
    const before = await f.repo.rawRecords(); expect(await readStoryRequestContext(f.branch.id, request.id, f.repo)).toEqual(expected); expect(await f.repo.rawRecords()).toEqual(before);
    await expect(prepareStoryRequest(f.branch.id, await f.preparation(h.a3.observation), f.repo)).rejects.toThrow("story-manual-conflict");
  });
  it("isolates caller mutations and concurrent equivalent preparations", async () => {
    const f = await setup(), h = await f.history(), input = await f.preparation(h.a2.observation), request = await prepareStoryRequest(f.branch.id, input, f.repo);
    const [a, b] = await Promise.all([readStoryRequestContext(f.branch.id, request.id, f.repo), readStoryRequestContext(f.branch.id, request.id, new DeepRoleRepository(f.db))]); expect(a).toEqual(b);
    a.snapshot.states[f.hero]!.condition = "External mutation"; a.snapshot.presentIds.length = 0; a.revisionIds.length = 0;
    expect(await readStoryRequestContext(f.branch.id, request.id, f.repo)).toEqual(b);
    const input2 = await f.preparation(h.a2.observation), requests = await Promise.all([prepareStoryRequest(f.branch.id, input2, f.repo), prepareStoryRequest(f.branch.id, input2, new DeepRoleRepository(f.db))]); expect(requests[0]).toEqual(requests[1]);
  });
  it("makes a detached character prompt with no later scene or derived UI fields", async () => {
    const f = await setup(), h = await f.history(), request = await prepareStoryRequest(f.branch.id, await f.preparation(h.u2.observation, "assistant-retry"), f.repo), context = await readStoryRequestContext(f.branch.id, request.id, f.repo);
    const scene = storyRequestCharacterScene(context), prompt = characterInstruction(f.world.id, f.binding.chatId, f.entities, scene, ["neutral"], [], "Resident 1", request.id);
    expect(prompt).toContain("Key delivered"); expect(prompt).not.toContain("Clock repaired"); expect(prompt).not.toContain("Workshop abandoned");
    expect(scene.revision).toBe(request.id); expect(scene.updatedAt).toBe(request.createdAt); expect(Object.keys(scene).sort()).toEqual(["revision", "updatedAt", "states", "presentIds", "partnerIds", "partnerId"].sort());
    scene.states[f.hero]!.condition = "mutated"; expect(context.snapshot.states[f.hero]!.condition).toBe("Key delivered"); expect(context.snapshot.states[f.hero]!.attributes!.history).toHaveLength(1);
  });
  it("preserves frozen approvals after encrypted reopen and backup restore", async () => {
    const f = await setup(), h = await f.history(), request = await prepareStoryRequest(f.branch.id, await f.preparation(h.u2.observation, "assistant-retry"), f.repo), expected = await readStoryRequestContext(f.branch.id, request.id, f.repo);
    await f.repo.enableVault("synthetic-password"); f.db.close(); const db = new DeepRoleDatabase(f.db.name); dbs.push(db); const repo = new DeepRoleRepository(db); await repo.unlockVault("synthetic-password");
    expect(await readStoryRequestContext(f.branch.id, request.id, repo)).toEqual(expected); expect((await db.records.toArray()).every(row => row.data === undefined && !!row.encrypted)).toBe(true);
    const payload = await createBackup(undefined, repo), target = empty(); await restoreBackup(await parseBackup(JSON.stringify(payload)), "replace", target.repo); expect(await readStoryRequestContext(f.branch.id, request.id, target.repo)).toEqual(expected);
    await repo.lockVault(); await expect(readStoryRequestContext(f.branch.id, request.id, repo)).rejects.toBeInstanceOf(VaultLockedError);
  });
  it("old receipts remain readable, but missing context is not invented on retry", async () => {
    const f = await setup(), request = await prepareStoryRequest(f.branch.id, await f.preparation(null), f.repo); delete request.context; await f.repo.put("story", request); assertStoryGraph(await f.repo.rawRecords());
    const before = await f.repo.rawRecords(); await expect(readStoryRequestContext(f.branch.id, request.id, f.repo)).rejects.toThrow("story-request-context-missing");
    const input = await f.preparation(null); input.id = request.id; expect(await prepareStoryRequest(f.branch.id, input, f.repo)).toEqual(request); expect(await f.repo.rawRecords()).toEqual(before);
    const payload = await createBackup(undefined, f.repo); await expect(parseBackup(JSON.stringify(payload))).resolves.toBeTruthy();
  });
  it.each(["missing", "wrong-branch", "revision-id"] as const)("refuses %s scoped context without changing data", async problem => {
    const f = await setup(), h = await f.history(), request = await prepareStoryRequest(f.branch.id, await f.preparation(h.a2.observation), f.repo), before = await f.repo.rawRecords();
    await expect(readStoryRequestContext(problem === "wrong-branch" ? "other" : f.branch.id, problem === "missing" ? "missing" : problem === "revision-id" ? h.a1.observation.id : request.id, f.repo)).rejects.toThrow("story-request-missing"); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it.each(["future-event", "alternative-event", "source-instead-of-event", "missing-event", "duplicate", "unknown-version", "extra-private-field", "omit-required-event"] as const)("rejects a tampered %s context before backup restoration", async problem => {
    const f = await setup(), h = await f.history(), request = await prepareStoryRequest(f.branch.id, await f.preparation(h.u2.observation, "assistant-retry"), f.repo);
    if (problem === "omit-required-event") { const newer = await prepareStoryRequest(f.branch.id, await f.preparation(h.a2.observation), f.repo); request.id = newer.id; }
    const alternative = await f.source("4", "assistant", h.u2.observation, "Alternative", h.a1.after, undefined, "complete", h.a2.observation.messageId);
    const payload = await createBackup(undefined, f.repo); if (payload.format !== "deeprole-backup") throw new Error("test backup"); const row = payload.records.find(row => row.kind === "story" && row.id === request.id)!.data as StoryRequest;
    if (problem === "future-event") row.context!.acceptedEventIds = [h.a1.eventId!, h.a2.eventId!].sort();
    if (problem === "alternative-event") row.context!.acceptedEventIds = [alternative.eventId!];
    if (problem === "source-instead-of-event") row.context!.acceptedEventIds = [h.a1.observation.id];
    if (problem === "missing-event") row.context!.acceptedEventIds = ["missing"];
    if (problem === "duplicate") row.context!.acceptedEventIds = [h.a1.eventId!, h.a1.eventId!];
    if (problem === "unknown-version") (row.context as any).algorithmVersion = 2;
    if (problem === "extra-private-field") Object.assign(row.context!, { prompt: "private" });
    if (problem === "omit-required-event") row.context!.acceptedEventIds = [h.a2.eventId!];
    const target = empty(); await expect(parseBackup(JSON.stringify(payload))).rejects.toThrow(); expect(await target.repo.rawRecords()).toEqual([]);
  });
  it("rolls back the receipt and frozen approvals together on write failure", async () => {
    const f = await setup(), h = await f.history(), input = await f.preparation(h.u2.observation, "assistant-retry"), before = await f.repo.rawRecords();
    vi.spyOn(f.db.records, "bulkPut").mockImplementationOnce(rows => f.db.records.put(rows[0]!).then(() => { throw new Error("synthetic-context-failure"); }));
    await expect(prepareStoryRequest(f.branch.id, input, f.repo)).rejects.toThrow("synthetic-context-failure"); expect(await f.repo.rawRecords()).toEqual(before);
    const request = await prepareStoryRequest(f.branch.id, input, f.repo); expect(request.context!.acceptedEventIds).toEqual([h.a1.eventId]);
  });
  it("archived world context remains read-only; full purge removes the receipt", async () => {
    const f = await setup(), h = await f.history(), request = await prepareStoryRequest(f.branch.id, await f.preparation(h.u2.observation, "assistant-retry"), f.repo), expected = await readStoryRequestContext(f.branch.id, request.id, f.repo);
    await removeWorld(f.world.id, f.repo); expect(await readStoryRequestContext(f.branch.id, request.id, f.repo)).toEqual(expected);
    const purge = await setup(), root = await prepareStoryRequest(purge.branch.id, await purge.preparation(null), purge.repo); await removeWorld(purge.world.id, purge.repo, { deleteLore: true });
    await expect(readStoryRequestContext(purge.branch.id, root.id, purge.repo)).rejects.toThrow("story-request-missing");
  });
  it("pure context replay rejects unused off-chain approvals even without the graph wrapper", async () => {
    const f = await setup(), h = await f.history(), request = await prepareStoryRequest(f.branch.id, await f.preparation(h.u2.observation, "assistant-retry"), f.repo), history = await readStoryTimeline(f.branch.id, f.repo);
    const records = [history.baseline, history.branch, ...history.revisions, ...history.events, ...history.requests, history.projection!];
    const changed = records.find((row): row is StoryRequest => row.id === request.id && row.type === "request")!;
    changed.context = { algorithmVersion: 1, acceptedEventIds: [h.a2.eventId!] };
    await expect(() => projectStoryRequestContext(records, f.branch.id, request.id)).toThrow("story-request-context-invalid");
  });
  it("captures addressees before a canceled departure, without leaking the later partner list", async () => {
    const f = await setup(), second = f.entities[1]!.id, presentIds = [f.hero, second];
    const u1 = await f.source("1", "user", null), a1 = await f.source("2", "assistant", u1.observation, "Talking to resident", f.initial,
      { before: { presentIds, partnerIds: [] }, after: { presentIds, partnerIds: [second] } });
    const u2 = await f.source("3", "user", a1.observation), a2 = await f.source("4", "assistant", u2.observation, "Resident left", a1.after,
      { before: { presentIds, partnerIds: [second] }, after: { presentIds: [f.hero], partnerIds: [] } });
    await f.select(a2.observation.id, [a1.eventId!, a2.eventId!]);
    const request = await prepareStoryRequest(f.branch.id, await f.preparation(u2.observation, "assistant-retry"), f.repo), context = await readStoryRequestContext(f.branch.id, request.id, f.repo), scene = storyRequestCharacterScene(context);
    expect(scene.presentIds).toEqual(presentIds); expect(scene.partnerIds).toEqual([second]); expect(scene.partnerId).toBe(second);
    scene.partnerIds!.length = 0; expect(context.snapshot.partnerIds).toEqual([second]);
  });
  it("a baseline selection retains archived approvals without sending their effects", async () => {
    const f = await setup(), h = await f.history(); await f.select(null, h.approved);
    const request = await prepareStoryRequest(f.branch.id, await f.preparation(null), f.repo), context = await readStoryRequestContext(f.branch.id, request.id, f.repo);
    expect(request.context!.acceptedEventIds).toEqual([]); expect(context.snapshot.states[f.hero]).toEqual(f.initial); expect(context.appliedEventIds).toEqual([]);
  });
  it("frozen request fields returned to callers are detached from the stored receipt", async () => {
    const f = await setup(), h = await f.history(), input = await f.preparation(h.u2.observation, "assistant-retry"), request = await prepareStoryRequest(f.branch.id, input, f.repo);
    request.context!.acceptedEventIds.length = 0; request.parentRevisionId = h.a3.observation.id;
    expect((await readStoryRequestContext(f.branch.id, request.id, f.repo)).appliedEventIds).toEqual([h.a1.eventId]);
  });
  it("cache reuse never skips the parent-chain check for another receipt", async () => {
    const f = await setup(), h = await f.history(); const latest = await prepareStoryRequest(f.branch.id, await f.preparation(h.a3.observation), f.repo);
    const earlier = await prepareStoryRequest(f.branch.id, await f.preparation(h.u2.observation, "assistant-retry"), f.repo);
    const payload = await createBackup(undefined, f.repo); if (payload.format !== "deeprole-backup") throw new Error("test backup");
    (payload.records.find(row => row.id === earlier.id)!.data as StoryRequest).context = latest.context;
    await expect(parseBackup(JSON.stringify(payload))).rejects.toThrow();
  });
  it("does not accept a foreign chat's event in frozen approvals", async () => {
    const f = await setup(), h = await f.history(), binding: ChatBinding = { ...structuredClone(f.binding), id: "binding:other-chat", chatId: "other-chat", chatUrl: "https://chat.deepseek.com/chat/s/other-chat" };
    await f.repo.put("binding", binding); const other = await ensureLegacyStory({ worldId: f.world.id, bindingId: binding.id }, f.repo);
    await recordStoryObservation(other.id, { id: "foreign-revision", messageId: "foreign-message", nativeMessageKey: key("foreign"), role: "assistant", requestId: null, parentRevisionId: null, completion: "complete", content: "Foreign event.", events: [{ id: "foreign-event", label: "Foreign event", quote: "Foreign event.", participantIds: [], changes: [] }] }, f.repo);
    const request = await prepareStoryRequest(f.branch.id, await f.preparation(h.a3.observation), f.repo), payload = await createBackup(undefined, f.repo); if (payload.format !== "deeprole-backup") throw new Error("test backup");
    (payload.records.find(row => row.id === request.id)!.data as StoryRequest).context!.acceptedEventIds = ["foreign-event"];
    await expect(parseBackup(JSON.stringify(payload))).rejects.toThrow();
  });
});
