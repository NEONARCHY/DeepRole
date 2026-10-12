import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_STATUS } from "../src/core/characters";
import { validDataRecord } from "../src/core/record-validation";
import { assertStoryGraph, type StoryBaseline, type StoryBranch, type StoryEvent, type StoryRevision } from "../src/core/story-records";
import { createId } from "../src/core/id";
import type { ChatBinding, SceneEntity } from "../src/core/types";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { ensureLegacyStory, recordStoryObservation, readStoryTimeline } from "../src/storage/story-history";
import { storyVariants, storyWorld } from "./fixtures/story-worlds";

const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dbs.map(db => db.delete())); dbs.length = 0; });
async function setup() {
  const fixture = storyVariants("en").branches;
  const db = new DeepRoleDatabase("story-storage-" + crypto.randomUUID()); dbs.push(db);
  const repo = new DeepRoleRepository(db); await repo.mergeRecords(fixture.records);
  const input = { worldId: fixture.world.id, bindingId: fixture.binding.id };
  return { ...fixture, db, repo, input };
}
const observation = (parentRevisionId: string | null = null) => ({ id: createId("revision"), messageId: createId("message"), nativeMessageKey: "native-message-1", requestId: "request-synthetic-001", parentRevisionId, role: "assistant" as const, completion: "complete" as const, content: "The courier delivered the clock key.", events: [] as { id: string; label: string; quote: string; participantIds: string[]; changes: { entityId: string; before: typeof EMPTY_STATUS | null; after: typeof EMPTY_STATUS | null }[] }[] });

describe("RP-01 real chronicle storage, not live automatic tracking", () => {
  it("captures the legacy state without changing old records or inventing revisions/events", async () => {
    const { repo, input, binding, world } = await setup(); const before = await repo.rawRecords();
    const branch = await ensureLegacyStory(input, repo);
    const history = await readStoryTimeline(branch.id, repo);
    expect(history.branch).toEqual(branch); expect(history.revisions).toEqual([]); expect(history.events).toEqual([]);
    expect(history.baseline).toMatchObject({ type: "baseline", historyBeforeBaseline: "unknown", legacyEntryScope: "unclassified", origin: { bindingId: binding.id, chatId: binding.chatId, worldId: world.id, sceneRevision: "legacy-scene-a" } });
    expect(history.baseline.snapshot.states).toEqual(binding.characterScenes![world.id]!.states);
    expect(branch.headRevisionId).toBeNull();
    expect((await repo.rawRecords()).filter(r => r.kind !== "story")).toEqual(before);
    expect((await repo.rawRecords()).every(validDataRecord)).toBe(true);
    assertStoryGraph(await repo.rawRecords());
  });

  it("creates one baseline under repeated/concurrent calls and retains it after manual edits", async () => {
    const { repo, input, binding, world } = await setup();
    const branches = await Promise.all([ensureLegacyStory(input, repo), ensureLegacyStory(input, repo)]);
    expect(branches[0]).toEqual(branches[1]);
    const old = await readStoryTimeline(branches[0]!.id, repo);
    await repo.put("binding", { ...binding, characterScenes: { [world.id]: { ...binding.characterScenes![world.id]!, revision: "manual-new", states: {} } } });
    expect(await ensureLegacyStory(input, repo)).toEqual(branches[0]);
    expect((await readStoryTimeline(branches[0]!.id, repo)).baseline).toEqual(old.baseline);
    expect(await repo.list("story")).toHaveLength(2);
  });

  it("does not leave half a baseline behind if its transaction fails", async () => {
    const { repo, db, input } = await setup(), before = await db.records.toArray();
    vi.spyOn(db.records, "bulkPut").mockImplementationOnce(rows => db.records.put(rows[0]!).then(() => {
      throw new Error("injected-baseline-failure");
    }));
    await expect(ensureLegacyStory(input, repo)).rejects.toThrow("injected-baseline-failure");
    expect(await db.records.toArray()).toEqual(before);
    const branch = await ensureLegacyStory(input, repo);
    expect((await readStoryTimeline(branch.id, repo)).events).toEqual([]);
    expect(await repo.list("story")).toHaveLength(2);
  });

  it("does not merge different chats merely because they share a world", async () => {
    const { repo, input } = await setup();
    const a = await ensureLegacyStory(input, repo), b = await ensureLegacyStory({ ...input, bindingId: "binding:synthetic-b" }, repo);
    expect(a.playthroughId).not.toBe(b.playthroughId); expect(a.baselineId).not.toBe(b.baselineId);
    expect((await readStoryTimeline(a.id, repo)).baseline.snapshot.states).not.toEqual((await readStoryTimeline(b.id, repo)).baseline.snapshot.states);
  });

  it("records a source revision and candidate events atomically, without applying them to the scene", async () => {
    const { repo, input, binding, entities } = await setup();
    const branch = await ensureLegacyStory(input, repo), turn = observation();
    const currentBinding = await repo.get<ChatBinding>("binding", binding.id);
    turn.events.push({ id: createId("event"), label: "Clock key delivered", quote: "delivered the clock key", participantIds: [entities[0]!.id], changes: [{ entityId: entities[0]!.id, before: EMPTY_STATUS, after: { ...EMPTY_STATUS, goal: "Repair the clock" } }] });
    await recordStoryObservation(branch.id, turn, repo);
    const history = await readStoryTimeline(branch.id, repo);
    expect(history.revisions).toHaveLength(1); expect(history.events).toHaveLength(1);
    expect(history.events[0]).toMatchObject({ disposition: "candidate", revisionId: turn.id });
    expect(history.branch.headRevisionId).toBeNull();
    expect(await repo.get("binding", binding.id)).toEqual(currentBinding);
    expect(await recordStoryObservation(branch.id, turn, repo)).toBe("already-recorded");
    expect((await readStoryTimeline(branch.id, repo)).events).toHaveLength(1);
  });

  it("rejects a reused revision identity with different text or effects instead of overwriting history", async () => {
    const { repo, input } = await setup(); const branch = await ensureLegacyStory(input, repo), turn = observation();
    await recordStoryObservation(branch.id, turn, repo); const before = await repo.rawRecords();
    await expect(recordStoryObservation(branch.id, { ...turn, content: "The key was lost." }, repo)).rejects.toThrow("story-revision-conflict");
    expect(await repo.rawRecords()).toEqual(before);
  });

  it("serializes retry delivery from two repository instances without a duplicate", async () => {
    const { repo, db, input } = await setup(), other = new DeepRoleRepository(db);
    const branch = await ensureLegacyStory(input, repo), turn = observation();
    turn.events.push({ id: createId("event"), label: "Observed", quote: "courier", participantIds: [], changes: [] });
    const results = await Promise.all([recordStoryObservation(branch.id, turn, repo), recordStoryObservation(branch.id, turn, other)]);
    expect(results.sort()).toEqual(["already-recorded", "recorded"]);
    const history = await readStoryTimeline(branch.id, other);
    expect(history.revisions).toHaveLength(1); expect(history.events).toHaveLength(1);
  });

  it("freezes the delivered payload before a caller can mutate it while storage is queued", async () => {
    const { repo, input } = await setup(), branch = await ensureLegacyStory(input, repo), turn = observation();
    const original = turn.content, recording = recordStoryObservation(branch.id, turn, repo);
    turn.content = "A later caller mutation, not the observed source.";
    turn.events.push({ id: createId("event"), label: "Not delivered", quote: "not observed", participantIds: [], changes: [] });
    await recording;
    const history = await readStoryTimeline(branch.id, repo);
    expect(history.revisions[0]!.content).toBe(original); expect(history.events).toEqual([]);
  });

  it("stores alternative revisions without selecting or mixing their candidate consequences", async () => {
    const { repo, input } = await setup(); const branch = await ensureLegacyStory(input, repo);
    const first = observation(); await recordStoryObservation(branch.id, first, repo);
    const child = observation(first.id); child.nativeMessageKey = "native-message-2"; await recordStoryObservation(branch.id, child, repo);
    const alternate = { ...child, id: createId("revision"), content: "The courier kept the clock key." };
    await recordStoryObservation(branch.id, alternate, repo);
    const history = await readStoryTimeline(branch.id, repo);
    expect(history.revisions).toHaveLength(3); expect(history.branch.headRevisionId).toBeNull();
    expect(history.revisions.filter(r => r.parentRevisionId === first.id)).toHaveLength(2);
  });

  it("keeps more than 20 chronicle entries and survives reopening", async () => {
    const { repo, input, db } = await setup(); const branch = await ensureLegacyStory(input, repo);
    let parent: string | null = null;
    for (let index = 0; index < 25; index++) {
      const turn = observation(parent); turn.nativeMessageKey = `native-${index}`;
      turn.events.push({ id: createId("event"), label: `Observed step ${index}`, quote: "courier", participantIds: [], changes: [] });
      await recordStoryObservation(branch.id, turn, repo); parent = turn.id;
    }
    db.close(); const reopened = new DeepRoleDatabase(db.name); dbs.push(reopened);
    const history = await readStoryTimeline(branch.id, new DeepRoleRepository(reopened));
    expect(history.events).toHaveLength(25); expect(history.revisions).toHaveLength(25);
    expect(new Set(history.events.map(e => e.id)).size).toBe(25);
  });

  it("guards parent scope, participants and exact quotes without leaving a partial record", async () => {
    const { repo, input } = await setup(); const a = await ensureLegacyStory(input, repo), b = await ensureLegacyStory({ ...input, bindingId: "binding:synthetic-b" }, repo);
    const parent = observation(); await recordStoryObservation(a.id, parent, repo);
    const before = await repo.rawRecords();
    await expect(recordStoryObservation(b.id, observation(parent.id), repo)).rejects.toThrow("story-link-invalid");
    const badQuote = observation(); badQuote.events.push({ id: createId("event"), label: "Invented", quote: "never happened", participantIds: [], changes: [] });
    await expect(recordStoryObservation(a.id, badQuote, repo)).rejects.toThrow("story-evidence-invalid");
    const badPerson = observation(); badPerson.events.push({ id: createId("event"), label: "Unknown", quote: "courier", participantIds: ["unknown-person"], changes: [] });
    await expect(recordStoryObservation(a.id, badPerson, repo)).rejects.toThrow("story-participant-invalid");
    expect(await repo.rawRecords()).toEqual(before);
  });

  it("rolls back even a partial transaction write when the storage fails", async () => {
    const { repo, input, db } = await setup(); const branch = await ensureLegacyStory(input, repo), turn = observation();
    turn.events.push({ id: createId("event"), label: "Observed", quote: "courier", participantIds: [], changes: [] });
    const before = await db.records.toArray();
    vi.spyOn(db.records, "bulkPut").mockImplementationOnce(rows => db.records.put(rows[0]!).then(() => {
      throw new Error("injected-storage-failure");
    }));
    await expect(recordStoryObservation(branch.id, turn, repo)).rejects.toThrow("injected-storage-failure");
    expect(await db.records.toArray()).toEqual(before);
  });

  it("does not invent states or impose a global cast limit when capturing a large empty scene", async () => {
    const fixture = storyWorld("en", 1000), { repo } = await setup();
    await repo.replaceRecords(fixture.records);
    const branch = await ensureLegacyStory({ worldId: fixture.world.id, bindingId: fixture.binding.id }, repo);
    expect((await readStoryTimeline(branch.id, repo)).baseline.snapshot.states).toEqual(fixture.binding.characterScenes![fixture.world.id]!.states);
    expect(await repo.list<SceneEntity>("entity")).toHaveLength(1000);
  });
});

describe("story record integrity", () => {
  it("rejects broken links and cycles in an otherwise valid imported graph", async () => {
    const { repo, input } = await setup(); const branch = await ensureLegacyStory(input, repo), turn = observation();
    await recordStoryObservation(branch.id, turn, repo);
    const records = await repo.rawRecords();
    const broken = structuredClone(records), revision = broken.find(r => r.kind === "story" && r.id === turn.id)!.data as StoryRevision;
    revision.parentRevisionId = revision.id;
    expect(() => assertStoryGraph(broken)).toThrow("story-cycle");
    revision.parentRevisionId = "missing-parent";
    expect(() => assertStoryGraph(broken)).toThrow("story-link-invalid");
    const baseline = records.find(r => r.kind === "story" && (r.data as StoryBaseline).type === "baseline")!;
    expect(validDataRecord({ ...baseline, data: { ...baseline.data, contractVersion: 999 } })).toBe(false);
    const extraRoot = { ...branch, id: "extra-root", branchId: "extra-root" };
    expect(() => assertStoryGraph([...records, { kind: "story", id: extraRoot.id, data: extraRoot }])).toThrow("story-link-invalid");
  });

  it("rejects event order collisions and incomplete graphs", async () => {
    const { repo, input } = await setup(); const branch = await ensureLegacyStory(input, repo), turn = observation();
    turn.events.push({ id: createId("event"), label: "Observed", quote: "courier", participantIds: [], changes: [] });
    await recordStoryObservation(branch.id, turn, repo);
    const records = await repo.rawRecords(), event = records.find(r => r.kind === "story" && (r.data as StoryEvent).type === "event")!;
    expect(() => assertStoryGraph([...records, { ...event, id: "duplicate-event", data: { ...event.data, id: "duplicate-event" } }])).toThrow("story-order-conflict");
    expect(() => assertStoryGraph(records.filter(r => r.id !== (branch as StoryBranch).baselineId))).toThrow("story-link-invalid");
  });
});
