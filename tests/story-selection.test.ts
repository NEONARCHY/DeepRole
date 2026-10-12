import { afterEach, describe, expect, it, vi } from "vitest";
import { createId } from "../src/core/id";
import { validDataRecord } from "../src/core/record-validation";
import { assertStoryGraph, type StoryProjection } from "../src/core/story-records";
import type { BackupPayload, CharacterStatus, ChatBinding, SceneEntity } from "../src/core/types";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository, VaultLockedError } from "../src/storage/repository";
import { ensureLegacyStory, readStoryTimeline, recordStoryObservation, type StoryObservation } from "../src/storage/story-history";
import { planStorySelection, selectStoryRevision, validStorySelection, type StorySelection } from "../src/storage/story-selection";
import { removeEntity, removeWorld } from "../src/storage/worlds";
import { storyVariants } from "./fixtures/story-worlds";

const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dbs.splice(0).map(db => db.delete())); });
function empty() { const db = new DeepRoleDatabase("story-selection-" + crypto.randomUUID()); dbs.push(db); return { db, repo: new DeepRoleRepository(db) }; }
async function setup() {
  const fixture = storyVariants("en").branches, { db, repo } = empty(); await repo.mergeRecords(fixture.records);
  const input = { worldId: fixture.world.id, bindingId: fixture.binding.id }, branch = await ensureLegacyStory(input, repo);
  const initial = structuredClone(fixture.binding.characterScenes![fixture.world.id]!.states[fixture.entities[0]!.id]!);
  async function add(condition: string, before: CharacterStatus = initial, parentRevisionId: string | null = null, messageId = createId("message"), person = fixture.entities[0]!.id) {
    const after = { ...structuredClone(before), condition };
    const observation: StoryObservation = { id: createId("revision"), messageId, nativeMessageKey: messageId, requestId: createId("request"), parentRevisionId, role: "assistant", completion: "complete", content: "The courier delivered the clock key.",
      events: [{ id: createId("event"), label: "Delivery", quote: "delivered the clock key", participantIds: [person], changes: [{ entityId: person, before: structuredClone(before), after }] }] };
    await recordStoryObservation(branch.id, observation, repo); return { observation, eventId: observation.events[0]!.id, after };
  }
  async function choice(headRevisionId: string | null, acceptedEventIds: string[], override: Partial<StorySelection> = {}) {
    const current = (await readStoryTimeline(branch.id, repo)).branch;
    return { headRevisionId, acceptedEventIds, expectedHeadRevisionId: current.headRevisionId, expectedSelectionVersion: current.selectionVersion, ...override };
  }
  return { ...fixture, db, repo, branch, input, initial, add, choice };
}

describe("RP-01 atomic root-line selection, not browser integration", () => {
  it("plans without mutating input records or taking a nested repository lock", async () => {
    const f = await setup(), a = await f.add("A"), all = await f.repo.rawRecords(), before = structuredClone(all), input = await f.choice(a.observation.id, [a.eventId]), copy = structuredClone(input);
    const plan = planStorySelection(all, f.branch.id, input);
    expect(plan.result.status).toBe("selected"); expect(plan.records).toHaveLength(3); expect(plan.removed).toEqual([]);
    expect(all).toEqual(before); expect(input).toEqual(copy); expect(await f.repo.rawRecords()).toEqual(before);
    assertStoryGraph([...all.filter(row => !plan.records.some(change => row.id === change.id && row.kind === change.kind)), ...plan.records]);
  });
  it.each(["partial", "interrupted", "missing"] as const)("never commits a %s head", async problem => {
    const f = await setup(), id = createId("revision");
    if (problem !== "missing") await recordStoryObservation(f.branch.id, { id, messageId: "invalid-head-message", nativeMessageKey: "invalid-head-native", requestId: null, parentRevisionId: null,
      role: "assistant", completion: problem, content: "Synthetic incomplete head", events: [] }, f.repo);
    const before = await f.repo.rawRecords();
    await expect(selectStoryRevision(f.branch.id, await f.choice(id, []), f.repo)).rejects.toThrow(problem === "partial" || problem === "interrupted" ? "story-source-incomplete" : "story-selection-target-invalid"); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("retains completed user prefixes for internal edit/regeneration without inventing answer effects", async () => {
    const f = await setup(), id = createId("revision");
    await recordStoryObservation(f.branch.id, { id, messageId: "user-prefix-message", nativeMessageKey: "user-prefix-native", requestId: null, parentRevisionId: null,
      role: "user", completion: "complete", content: "An edited first user turn", events: [] }, f.repo);
    const result = await selectStoryRevision(f.branch.id, await f.choice(id, []), f.repo);
    expect(result.projection.revisionIds).toEqual([id]); expect(result.projection.appliedEventIds).toEqual([]); expect(result.projection.snapshot.states[f.entities[0]!.id]).toEqual(f.initial);
  });
  it("validates the whole selection envelope, including sparse approvals", async () => {
    const f = await setup(), a = await f.add("A"), input = await f.choice(a.observation.id, [a.eventId]);
    const bad = [null, [], { ...input, extra: true }, { ...input, headRevisionId: undefined }, { ...input, headRevisionId: " " }, { ...input, acceptedEventIds: [7] }, { ...input, acceptedEventIds: ["__proto__"] }, { ...input, acceptedEventIds: new Array(1) }];
    for (const value of bad) { expect(validStorySelection(value)).toBe(false); await expect(selectStoryRevision(f.branch.id, value as StorySelection, f.repo)).rejects.toThrow("story-selection-invalid"); }
    expect(validStorySelection(input)).toBe(true);
  });
  it("restores all three writes if the tab/world guard fails after persistence", async () => {
    const f = await setup(), a = await f.add("A"), input = await f.choice(a.observation.id, [a.eventId]), before = await f.db.records.toArray();
    const guard = vi.fn(async () => { expect((await f.db.records.get(`story:${f.branch.id}`))!.data).toMatchObject({ headRevisionId: a.observation.id }); throw Error("synthetic-tab-changed"); });
    await expect(selectStoryRevision(f.branch.id, input, f.repo, guard)).rejects.toThrow("synthetic-tab-changed");
    expect(guard).toHaveBeenCalledOnce(); expect(await f.db.records.toArray()).toEqual(before);
    expect((await selectStoryRevision(f.branch.id, input, f.repo)).status).toBe("selected");
  });
  it.each(["lastReply", "progress", "relationshipNotice", "portraitCycles", "photo", "queued-photo", "working-photo", "done-photo"] as const)("leaves unowned %s effects untouched rather than performing a partial replay", async effect => {
    const f = await setup(), a = await f.add("A"), binding = (await f.repo.get<ChatBinding>("binding", f.binding.id))!, scene = binding.characterScenes![f.world.id]!;
    if (effect === "lastReply") scene.lastReply = "legacy-turn";
    else if (effect === "progress") scene.progress = { status: "changed", rejected: 0 };
    else if (effect === "relationshipNotice") scene.relationshipNotice = "unverified";
    else if (effect === "portraitCycles") scene.portraitCycles = {};
    else binding.scenePhotos = [{ worldId: f.world.id, entityId: f.entities[0]!.id, messageKey: "legacy-native", turnKey: "legacy-turn", categoryId: "ordinary", imageKey: "legacy-image", createdAt: 30 }];
    // The guard concerns ownership, not whether image generation finished.
    if (effect.includes("-photo")) binding.scenePhotos![0]!.generation = { status: effect === "queued-photo" ? "queued" : effect === "working-photo" ? "working" : "ready", scene: "Synthetic portrait", updatedAt: 30 };
    await f.repo.put("binding", binding); const before = await f.repo.rawRecords();
    await expect(selectStoryRevision(f.branch.id, await f.choice(a.observation.id, [a.eventId]), f.repo)).rejects.toThrow("story-effects-untracked");
    expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("keeps photos from another world and does not treat them as target-world effects", async () => {
    const f = await setup(), a = await f.add("A"), binding = (await f.repo.get<ChatBinding>("binding", f.binding.id))!;
    binding.scenePhotos = [{ worldId: "unrelated-world", entityId: "unrelated-person", messageKey: "unrelated-native", turnKey: "unrelated-turn", categoryId: "ordinary", imageKey: "unrelated-image", createdAt: 30 }];
    await f.repo.put("binding", binding);
    await selectStoryRevision(f.branch.id, await f.choice(a.observation.id, [a.eventId]), f.repo);
    expect((await f.repo.get<ChatBinding>("binding", f.binding.id))!.scenePhotos).toEqual(binding.scenePhotos);
  });
  it("an identical retry preserves a photo added after the earlier selection", async () => {
    const f = await setup(), a = await f.add("A"), input = await f.choice(a.observation.id, [a.eventId]); await selectStoryRevision(f.branch.id, input, f.repo);
    const binding = (await f.repo.get<ChatBinding>("binding", f.binding.id))!;
    binding.scenePhotos = [{ worldId: f.world.id, entityId: f.entities[0]!.id, messageKey: "later-native", turnKey: "later-turn", categoryId: "ordinary", imageKey: "later-image", createdAt: 30 }];
    await f.repo.put("binding", binding); const before = await f.repo.rawRecords();
    expect((await selectStoryRevision(f.branch.id, input, f.repo)).status).toBe("already-selected"); expect(await f.repo.rawRecords()).toEqual(before);
    await expect(selectStoryRevision(f.branch.id, await f.choice(null, [a.eventId]), f.repo)).rejects.toThrow("story-effects-untracked"); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("atomically selects approved consequences and leaves lore, profiles and other chats unchanged", async () => {
    const f = await setup(), a = await f.add("Key delivered"), before = await f.repo.rawRecords();
    const result = await selectStoryRevision(f.branch.id, await f.choice(a.observation.id, [a.eventId]), f.repo);
    expect(result.status).toBe("selected"); expect(result.branch.selectionVersion).toBe(1); expect(result.projection.appliedEventIds).toEqual([a.eventId]);
    const binding = await f.repo.get<ChatBinding>("binding", f.binding.id);
    expect(binding!.characterScenes![f.world.id]!.states[f.entities[0]!.id]).toEqual(a.after);
    expect(binding!.characterScenes![f.world.id]!.revision).toBe(result.projection.bindingRevision);
    expect((await f.repo.rawRecords()).filter(row => row.kind !== "story" && row.id !== f.binding.id)).toEqual(before.filter(row => row.kind !== "story" && row.id !== f.binding.id));
    expect((await f.repo.rawRecords()).every(validDataRecord)).toBe(true); assertStoryGraph(await f.repo.rawRecords());
  });

  it("switches three variants, excludes descendants and can undo back to the baseline", async () => {
    const f = await setup(), messageId = createId("message");
    const a = await f.add("Key delivered", f.initial, null, messageId), b = await f.add("Key retained", f.initial, null, messageId), c = await f.add("Key lost", f.initial, null, messageId);
    const child = await f.add("Clock repaired", a.after, a.observation.id), approved = [a.eventId, b.eventId, c.eventId, child.eventId];
    for (const option of [child, b, c, a]) {
      const result = await selectStoryRevision(f.branch.id, await f.choice(option.observation.id, approved), f.repo);
      expect(result.projection.snapshot.states[f.entities[0]!.id]).toEqual(option.after);
      expect(result.projection.appliedEventIds).toEqual(option === child ? [a.eventId, child.eventId] : [option.eventId]);
    }
    const reset = await selectStoryRevision(f.branch.id, await f.choice(null, approved), f.repo);
    expect(reset.projection.snapshot.states[f.entities[0]!.id]).toEqual(f.initial); expect(reset.projection.appliedEventIds).toEqual([]);
    expect((await readStoryTimeline(f.branch.id, f.repo)).events).toHaveLength(4);
  });

  it("does not double-apply numeric state or its history when returning to a variant", async () => {
    const f = await setup();
    // Add a real legacy local score before creating a new baseline in a fresh scope.
    await f.repo.clear(); const numeric = { ...f.initial, attributes: { values: { patience: 50 }, locked: [], history: [] } };
    const original = { ...f.binding, characterScenes: { [f.world.id]: { ...f.binding.characterScenes![f.world.id]!, states: { [f.entities[0]!.id]: numeric } } } };
    await f.repo.mergeRecords(f.records.filter(row => row.kind !== "binding")); await f.repo.put("binding", original);
    const branch = await ensureLegacyStory(f.input, f.repo);
    const observation: StoryObservation = { id: createId("revision"), messageId: "score-message", nativeMessageKey: "score-native", requestId: "score-request", parentRevisionId: null, role: "assistant", completion: "complete", content: "The courier delivered the clock key.", events: [{ id: createId("event"), label: "Patience", quote: "delivered the clock key", participantIds: [f.entities[0]!.id], changes: [{ entityId: f.entities[0]!.id, before: numeric, after: { ...numeric, attributes: { ...numeric.attributes, values: { patience: 55 }, history: [{ at: 30, source: "scene", before: { patience: 50 }, after: { patience: 55 }, reason: "Synthetic accepted event", quote: "delivered the clock key" }] } } }] }] };
    await recordStoryObservation(branch.id, observation, f.repo);
    for (const target of [observation.id, null, observation.id]) {
      const current = (await readStoryTimeline(branch.id, f.repo)).branch;
      const result = await selectStoryRevision(branch.id, { headRevisionId: target, expectedHeadRevisionId: current.headRevisionId, expectedSelectionVersion: current.selectionVersion, acceptedEventIds: [observation.events[0]!.id] }, f.repo);
      const attributes = result.projection.snapshot.states[f.entities[0]!.id]!.attributes!;
      expect(attributes.values.patience).toBe(target ? 55 : 50); expect(attributes.history).toHaveLength(target ? 1 : 0);
    }
  });

  it("saves the selected chain and approvals across a database reopen", async () => {
    const f = await setup(), a = await f.add("Key delivered"), result = await selectStoryRevision(f.branch.id, await f.choice(a.observation.id, [a.eventId]), f.repo);
    f.db.close(); const reopened = new DeepRoleDatabase(f.db.name); dbs.push(reopened);
    const history = await readStoryTimeline(f.branch.id, new DeepRoleRepository(reopened));
    expect(history.projection).toEqual(result.projection); expect(history.branch).toEqual(result.branch);
  });

  it("accepts simultaneous identical retries once across two repository instances", async () => {
    const f = await setup(), a = await f.add("Key delivered"), input = await f.choice(a.observation.id, [a.eventId]), other = new DeepRoleRepository(f.db);
    const results = await Promise.all([selectStoryRevision(f.branch.id, input, f.repo), selectStoryRevision(f.branch.id, input, other)]);
    expect(results.map(r => r.status).sort()).toEqual(["already-selected", "selected"]);
    expect((await readStoryTimeline(f.branch.id, f.repo)).branch.selectionVersion).toBe(1);
    expect(await f.repo.list<StoryProjection>("story").then(rows => rows.filter(row => row.type === "projection"))).toHaveLength(1);
  });

  it("rejects one of two competing choices without overwriting the winner", async () => {
    const f = await setup(), a = await f.add("A"), b = await f.add("B"), choices = await Promise.all([f.choice(a.observation.id, [a.eventId]), f.choice(b.observation.id, [b.eventId])]);
    const results = await Promise.allSettled(choices.map(choice => selectStoryRevision(f.branch.id, choice, f.repo)));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    const winner = (results.find(r => r.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof selectStoryRevision>>>).value;
    expect((await readStoryTimeline(f.branch.id, f.repo)).projection).toEqual(winner.projection);
  });

  it("rejects an old selection after switching away and back, even if the target now matches", async () => {
    const f = await setup(), a = await f.add("A"), b = await f.add("B"), first = await f.choice(a.observation.id, [a.eventId, b.eventId]);
    await selectStoryRevision(f.branch.id, first, f.repo);
    await selectStoryRevision(f.branch.id, await f.choice(b.observation.id, first.acceptedEventIds), f.repo);
    await selectStoryRevision(f.branch.id, await f.choice(a.observation.id, first.acceptedEventIds), f.repo);
    const before = await f.repo.rawRecords();
    await expect(selectStoryRevision(f.branch.id, first, f.repo)).rejects.toThrow("story-selection-conflict"); expect(await f.repo.rawRecords()).toEqual(before);
  });

  it.each(["before-first", "state", "revision-only"] as const)("preserves a manual %s edit and pauses a new choice", async edit => {
    const f = await setup(), a = await f.add("A"), b = await f.add("B");
    if (edit !== "before-first") await selectStoryRevision(f.branch.id, await f.choice(a.observation.id, [a.eventId, b.eventId]), f.repo);
    const binding = await f.repo.get<ChatBinding>("binding", f.binding.id), scene = binding!.characterScenes![f.world.id]!;
    if (edit !== "revision-only") scene.states[f.entities[0]!.id]!.goal = "A protected manual goal";
    else scene.revision = createId("manual");
    await f.repo.put("binding", binding!); const before = await f.repo.rawRecords();
    await expect(selectStoryRevision(f.branch.id, await f.choice(b.observation.id, [a.eventId, b.eventId]), f.repo)).rejects.toThrow("story-manual-conflict");
    expect(await f.repo.rawRecords()).toEqual(before);
  });

  it("does not overwrite a manual edit when an identical delivery is retried", async () => {
    const f = await setup(), a = await f.add("A"), input = await f.choice(a.observation.id, [a.eventId]); await selectStoryRevision(f.branch.id, input, f.repo);
    const binding = await f.repo.get<ChatBinding>("binding", f.binding.id); binding!.characterScenes![f.world.id]!.states[f.entities[0]!.id]!.goal = "Manual goal"; await f.repo.put("binding", binding!);
    const before = await f.repo.rawRecords(); expect((await selectStoryRevision(f.branch.id, input, f.repo)).status).toBe("already-selected"); expect(await f.repo.rawRecords()).toEqual(before);
  });

  it("keeps independent manual profile and unrelated binding changes", async () => {
    const f = await setup(), a = await f.add("A"), profile = await f.repo.get<SceneEntity>("entity", f.entities[0]!.id);
    const edited = { ...profile!, name: "Renamed manually", description: "Protected imported text", updatedAt: 100 }; await f.repo.put("entity", edited);
    const binding = await f.repo.get<ChatBinding>("binding", f.binding.id); binding!.focusIds = [f.entities[1]!.id]; binding!.messageCountAtAnalysis = 30; await f.repo.put("binding", binding!);
    await selectStoryRevision(f.branch.id, await f.choice(a.observation.id, [a.eventId]), f.repo);
    expect(await f.repo.get("entity", profile!.id)).toEqual(edited); expect(await f.repo.get("binding", f.binding.id)).toMatchObject({ focusIds: [f.entities[1]!.id], messageCountAtAnalysis: 30 });
  });

  it("rolls back the branch, cached projection and scene after even a partial write failure", async () => {
    const f = await setup(), a = await f.add("A"), before = await f.db.records.toArray(), input = await f.choice(a.observation.id, [a.eventId]);
    vi.spyOn(f.db.records, "bulkPut").mockImplementationOnce(rows => f.db.records.put(rows[0]!).then(() => { throw new Error("injected-selection-failure"); }));
    await expect(selectStoryRevision(f.branch.id, input, f.repo)).rejects.toThrow("injected-selection-failure"); expect(await f.db.records.toArray()).toEqual(before);
    expect((await selectStoryRevision(f.branch.id, input, f.repo)).status).toBe("selected");
  });

  it("does not resurrect an already deleted character", async () => {
    const f = await setup(), a = await f.add("A"); await removeEntity(f.entities[0]!.id, f.repo); const before = await f.repo.rawRecords();
    await expect(selectStoryRevision(f.branch.id, await f.choice(a.observation.id, [a.eventId]), f.repo)).rejects.toThrow("story-manual-conflict"); expect(await f.repo.rawRecords()).toEqual(before);
  });

  it("refuses writing a detached history or a chat now bound to another world", async () => {
    const f = await setup(), a = await f.add("A"), binding = await f.repo.get<ChatBinding>("binding", f.binding.id); binding!.worldId = null; await f.repo.put("binding", binding!);
    await expect(selectStoryRevision(f.branch.id, await f.choice(a.observation.id, [a.eventId]), f.repo)).rejects.toThrow("story-binding-conflict");
    await removeWorld(f.world.id, f.repo); const before = await f.repo.rawRecords();
    await expect(selectStoryRevision(f.branch.id, await f.choice(a.observation.id, [a.eventId]), f.repo)).rejects.toThrow("story-scope-invalid"); expect(await f.repo.rawRecords()).toEqual(before);
  });

  it("round-trips the selected projection through a full backup", async () => {
    const f = await setup(), a = await f.add("A"); await selectStoryRevision(f.branch.id, await f.choice(a.observation.id, [a.eventId]), f.repo);
    const payload = await createBackup(undefined, f.repo) as BackupPayload, target = empty();
    await restoreBackup(await parseBackup(JSON.stringify(payload)), "replace", target.repo);
    expect(await target.repo.rawRecords()).toEqual(await f.repo.rawRecords());
  });

  it("preserves a selected projection when detaching its world and purges it on full deletion", async () => {
    const f = await setup(), a = await f.add("A"); await selectStoryRevision(f.branch.id, await f.choice(a.observation.id, [a.eventId]), f.repo);
    const before = (await readStoryTimeline(f.branch.id, f.repo)).projection!;
    const original = await createBackup(undefined, f.repo) as BackupPayload;
    await removeWorld(f.world.id, f.repo);
    const after = (await readStoryTimeline(f.branch.id, f.repo)).projection!;
    expect(after.worldId).toBeNull(); expect(after.snapshot).toEqual(before.snapshot); expect(after.appliedEventIds).toEqual(before.appliedEventIds);
    assertStoryGraph(await f.repo.rawRecords()); expect(await parseBackup(JSON.stringify(await createBackup(undefined, f.repo)))).toBeTruthy();
    await restoreBackup(original, "replace", f.repo); await removeWorld(f.world.id, f.repo, { deleteLore: true });
    expect(await f.repo.list("story")).toEqual([]);
  });

  it("keeps an incompatible dependent choice out of both the scene and selected head", async () => {
    const f = await setup(), a = await f.add("A"), b = await f.add("B", a.after, a.observation.id), before = await f.repo.rawRecords();
    await expect(selectStoryRevision(f.branch.id, await f.choice(b.observation.id, [b.eventId]), f.repo)).rejects.toThrow("story-state-conflict"); expect(await f.repo.rawRecords()).toEqual(before);
  });

  it("does not replace a removed newcomer with a state-only ghost", async () => {
    const f = await setup(), person = f.entities[2]!.id;
    const source: StoryObservation = { id: createId("revision"), messageId: "newcomer-message", nativeMessageKey: "newcomer-native", requestId: "newcomer-request", parentRevisionId: null, role: "assistant", completion: "complete", content: "The courier delivered the clock key.", events: [{ id: createId("event"), label: "Newcomer", quote: "courier", participantIds: [person], changes: [{ entityId: person, before: null, after: f.initial }] }] };
    await recordStoryObservation(f.branch.id, source, f.repo); await removeEntity(person, f.repo);
    const before = await f.repo.rawRecords();
    await expect(selectStoryRevision(f.branch.id, await f.choice(source.id, [source.events[0]!.id]), f.repo)).rejects.toThrow("story-participant-missing"); expect(await f.repo.rawRecords()).toEqual(before);
  });

  it("requires the expected head as well as the version, and rejects invalid approval input", async () => {
    const f = await setup(), a = await f.add("A"), input = await f.choice(a.observation.id, [a.eventId]), before = await f.repo.rawRecords();
    await expect(selectStoryRevision(f.branch.id, { ...input, expectedHeadRevisionId: "wrong-head" }, f.repo)).rejects.toThrow("story-selection-conflict");
    await expect(selectStoryRevision(f.branch.id, { ...input, expectedSelectionVersion: -1 }, f.repo)).rejects.toThrow("story-selection-invalid");
    await expect(selectStoryRevision(f.branch.id, { ...input, acceptedEventIds: [a.eventId, a.eventId] }, f.repo)).rejects.toThrow("story-selection-invalid");
    expect(await f.repo.rawRecords()).toEqual(before);
  });

  it("takes a stable copy before the caller can mutate the queued selection", async () => {
    const f = await setup(), a = await f.add("A"), b = await f.add("B"), input = await f.choice(a.observation.id, [a.eventId]);
    const operation = selectStoryRevision(f.branch.id, input, f.repo);
    input.headRevisionId = b.observation.id; input.acceptedEventIds.push(b.eventId);
    const result = await operation;
    expect(result.projection.headRevisionId).toBe(a.observation.id); expect(result.projection.acceptedEventIds).toEqual([a.eventId]);
  });

  it("keeps the old scene validator's operation limit visible instead of persisting an invalid scene", async () => {
    const f = await setup(), extra = Array.from({ length: 11 }, (_, i) => ({ ...f.entities[2]!, id: `extra-person-${i}` }));
    await f.repo.mergeRecords(extra.map(data => ({ kind: "entity", id: data.id, data })));
    const presentIds = [...f.entities.slice(0, 2).map(e => e.id), ...extra.map(e => e.id)];
    const source: StoryObservation = { id: createId("revision"), messageId: "large-scene-message", nativeMessageKey: "large-scene-native", requestId: "large-scene-request", parentRevisionId: null, role: "assistant", completion: "complete", content: "The courier delivered the clock key.", events: [{ id: createId("event"), label: "Large scene", quote: "courier", participantIds: presentIds, changes: [], sceneChange: { before: { presentIds: f.binding.characterScenes![f.world.id]!.presentIds, partnerIds: [] }, after: { presentIds, partnerIds: [] } } }] };
    await recordStoryObservation(f.branch.id, source, f.repo); const before = await f.repo.rawRecords();
    await expect(selectStoryRevision(f.branch.id, await f.choice(source.id, [source.events[0]!.id]), f.repo)).rejects.toThrow("story-binding-invalid"); expect(await f.repo.rawRecords()).toEqual(before);
  });

  it("applies and undoes scene membership without modifying other world scenes", async () => {
    const f = await setup(), a = await f.add("A"), another = { ...f.world, id: "unrelated-world" }; await f.repo.put("world", another);
    const binding = await f.repo.get<ChatBinding>("binding", f.binding.id); binding!.characterScenes![another.id] = structuredClone(f.binding.characterScenes![f.world.id]!); await f.repo.put("binding", binding!);
    // A second observation has only an explicit scene transition.
    const source: StoryObservation = { ...a.observation, id: createId("revision"), messageId: "membership-message", nativeMessageKey: "membership-native", events: [{ id: createId("event"), label: "Scene participants", quote: "clock key", participantIds: f.entities.slice(0, 2).map(e => e.id), changes: [], sceneChange: { before: { presentIds: [...f.binding.characterScenes![f.world.id]!.presentIds], partnerIds: [] }, after: { presentIds: [f.entities[1]!.id], partnerIds: [f.entities[1]!.id] } } }] };
    await recordStoryObservation(f.branch.id, source, f.repo);
    await selectStoryRevision(f.branch.id, await f.choice(source.id, [source.events[0]!.id]), f.repo);
    expect((await f.repo.get<ChatBinding>("binding", f.binding.id))!.characterScenes![f.world.id]!).toMatchObject({ presentIds: [f.entities[1]!.id], partnerIds: [f.entities[1]!.id], partnerId: f.entities[1]!.id });
    await selectStoryRevision(f.branch.id, await f.choice(null, [source.events[0]!.id]), f.repo);
    const restored = await f.repo.get<ChatBinding>("binding", f.binding.id);
    expect(restored!.characterScenes![f.world.id]!.presentIds).toEqual(f.binding.characterScenes![f.world.id]!.presentIds); expect(restored!.characterScenes![another.id]).toEqual(binding!.characterScenes![another.id]);
  });

  it.each(["state", "lineage", "accepted", "algorithm", "version", "binding", "previous-head"] as const)("rejects a tampered projection %s before restoration", async field => {
    const f = await setup(), a = await f.add("A"); await selectStoryRevision(f.branch.id, await f.choice(a.observation.id, [a.eventId]), f.repo);
    const payload = await createBackup(undefined, f.repo) as BackupPayload, projection = payload.records.find(row => row.kind === "story" && row.id === (payload.records.find(row => row.id === f.branch.id)!.data as { projectionId: string }).projectionId)!.data as StoryProjection;
    if (field === "state") projection.snapshot.states[f.entities[0]!.id]!.goal = "Forged cache";
    if (field === "lineage") projection.revisionIds = [];
    if (field === "accepted") projection.acceptedEventIds = [];
    if (field === "algorithm") (projection as { algorithmVersion: number }).algorithmVersion = 999;
    if (field === "version") projection.selectionVersion++;
    if (field === "binding") projection.bindingId = "unrelated-binding";
    if (field === "previous-head") projection.previousHeadRevisionId = "missing";
    const before = await f.repo.rawRecords(); await expect(parseBackup(JSON.stringify(payload))).rejects.toThrow(); await expect(restoreBackup(payload, "replace", f.repo)).rejects.toThrow(); expect(await f.repo.rawRecords()).toEqual(before);
  });

  it("encrypts the projection and changed scene together and blocks selection in a locked vault", async () => {
    const f = await setup(), a = await f.add("A"), input = await f.choice(a.observation.id, [a.eventId]); await f.repo.enableVault("synthetic password");
    await selectStoryRevision(f.branch.id, input, f.repo);
    expect((await f.db.records.toArray()).every(row => row.data === undefined && !!row.encrypted)).toBe(true);
    await f.repo.lockVault(); const before = await f.db.records.toArray();
    await expect(selectStoryRevision(f.branch.id, input, f.repo)).rejects.toBeInstanceOf(VaultLockedError); expect(await f.db.records.toArray()).toEqual(before);
    await f.repo.unlockVault("synthetic password"); expect((await readStoryTimeline(f.branch.id, f.repo)).projection!.appliedEventIds).toEqual([a.eventId]);
  });
});
