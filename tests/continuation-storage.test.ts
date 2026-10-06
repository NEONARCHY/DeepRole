import { afterEach, describe, expect, it } from "vitest";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { captureContinuation, completeContinuation } from "../src/storage/story-continuation";
import { withHandoffCharacters } from "../src/core/relationship-handoff";
import { boundStory } from "../src/core/story-continuation";
import { EMPTY_STATUS } from "../src/core/characters";
import { DEFAULT_RELATIONSHIP, relationshipState } from "../src/core/relationships";
import type { ChatBinding, HandoffSnapshot, WorldProfile } from "../src/core/types";

const world: WorldProfile = { id: "w", name: "Harbor", description: "Exact world canon", contextBudget: 2000, relevanceThreshold: 6, color: "#aaa", createdAt: 1, updatedAt: 1 };
const binding: ChatBinding = { id: "binding:a", chatId: "a", chatUrl: "https://chat.deepseek.com/a/chat/s/a", worldId: "w", bookId: null, focusIds: ["mira"], createdAt: 1, updatedAt: 1, messageCountAtAnalysis: 1,
  memoryOverrides: { includedIds: ["promise"], excludedIds: ["old"] },
  characterScenes: { w: { revision: "fresh", presentIds: ["mira"], partnerIds: ["mira"], lastReply: "source-reply", updatedAt: 2, states: { mira: { ...EMPTY_STATUS, emotion: "happy", condition: "Reached the harbor", bonds: { hero: { ...relationshipState(DEFAULT_RELATIONSHIP), trust: 87, affinity: 63, locked: true, completed: ["oath"] } }, attributes: { values: { energy: 34 }, locked: ["energy"], history: [] } } } } } };
const input = { chatId: "a", chatUrl: binding.chatUrl, scene: { worldId: "w", bookId: null, focusIds: ["mira"] }, overrides: { includedIds: [], excludedIds: [] }, story: boundStory([{ role: "assistant", text: "Mira has reached the harbor." }], "history") };
describe("atomic continuation capture", () => {
  const databases: DeepRoleDatabase[] = [];
  afterEach(async () => { await Promise.all(databases.map(db => db.delete())); databases.length = 0; });
  async function setup() {
    const db = new DeepRoleDatabase(`continuation-${crypto.randomUUID()}`); databases.push(db);
    const repo = new DeepRoleRepository(db);
    await repo.put("world", world); await repo.put("binding", structuredClone(binding));
    return { db, repo };
  }
  it("copies exact current progress, focus and overrides without writing the source or lore", async () => {
    const { repo } = await setup(); const before = await repo.rawRecords();
    const snapshot = await captureContinuation(input, repo);
    expect(snapshot.characterScene).toEqual(binding.characterScenes!.w);
    expect(snapshot.memoryOverrides).toEqual(binding.memoryOverrides); expect(snapshot.focusIds).toEqual(["mira"]);
    expect((await repo.rawRecords()).filter(r => r.kind !== "snapshot")).toEqual(before);
    const destination = withHandoffCharacters({ ...binding, id: "binding:b", chatId: "b", characterScenes: undefined, memoryOverrides: undefined }, snapshot);
    expect(destination.characterScenes!.w!.states).toEqual(binding.characterScenes!.w!.states);
    expect(destination.characterScenes!.w!.lastReply).toBeUndefined();
    expect(destination.memoryOverrides).toEqual(binding.memoryOverrides); expect(destination.continuationSnapshotId).toBe(snapshot.id);
  });
  it("captures the latest committed character edit rather than an old UI baseline", async () => {
    const { repo } = await setup();
    const live = structuredClone(binding); live.characterScenes!.w!.states.mira!.bonds!.hero!.trust = 91;
    await repo.put("binding", live); expect((await captureContinuation(input, repo)).characterScene!.states.mira!.bonds!.hero!.trust).toBe(91);
  });
  it("rejects a deleted or changed world without saving half a checkpoint", async () => {
    const { repo } = await setup(); await repo.delete("world", "w");
    await expect(captureContinuation(input, repo)).rejects.toThrow("handoff-scope"); expect(await repo.list("snapshot")).toEqual([]);
  });
  it("rejects changed scene focus or invalid history", async () => {
    const { repo } = await setup();
    await expect(captureContinuation({ ...input, scene: { ...input.scene, focusIds: [] } }, repo)).rejects.toThrow("handoff-scope");
    await expect(captureContinuation({ ...input, story: { ...input.story, turns: [] } }, repo)).rejects.toThrow("handoff-invalid");
  });
  it("continues a chain with earlier context while preserving the latest branch scores", async () => {
    const { repo } = await setup();
    const previous: HandoffSnapshot = { id: "prior", title: "Prior", summary: "An old oath still matters.", sourceChatId: "older", sourceChatUrl: "https://chat.deepseek.com/a/chat/s/older", worldId: "w", bookId: null, createdAt: 1, continuation: boundStory([{ role: "assistant", text: "The oath was made." }], "history") };
    await repo.put("snapshot", previous); await repo.put("binding", { ...binding, continuationSnapshotId: previous.id });
    const next = await captureContinuation(input, repo); expect(next.summary).toBe(previous.summary);
    expect(next.continuation!.turns.map(t => t.text)).toEqual(["The oath was made.", "Mira has reached the harbor."]);
    expect(next.characterScene!.states.mira!.bonds!.hero!.trust).toBe(87);
  });
  it("does not overwrite an existing played branch or the source itself", async () => {
    const { repo } = await setup(), snapshot = await captureContinuation(input, repo);
    expect(withHandoffCharacters(binding, snapshot)).toBe(binding);
    const played = { ...binding, id: "binding:b", chatId: "b" };
    expect(withHandoffCharacters(played, snapshot)).toBe(played);
    expect(withHandoffCharacters({ ...played, worldId: "other" }, snapshot)).toBeTruthy();
  });
  it("commits the destination's exact progress and checkpoint receipt in one transaction", async () => {
    const { repo } = await setup(), snapshot = await captureContinuation(input, repo);
    await completeContinuation(snapshot, "b", repo);
    expect((await repo.get<ChatBinding>("binding", "binding:b"))!.characterScenes!.w!.states).toEqual(binding.characterScenes!.w!.states);
    expect((await repo.get<HandoffSnapshot>("snapshot", snapshot.id))!.appliedAt).toBeTruthy();
    expect(await repo.get("binding", binding.id)).toEqual(binding);
  });
  it("never applies a changed checkpoint or leaves a target behind on conflict", async () => {
    const { repo } = await setup(), snapshot = await captureContinuation(input, repo);
    await repo.put("snapshot", { ...snapshot, summary: "Newer version" });
    await expect(completeContinuation(snapshot, "b", repo)).rejects.toThrow("handoff-conflict");
    expect(await repo.get("binding", "binding:b")).toBeNull();
    expect((await repo.get<HandoffSnapshot>("snapshot", snapshot.id))!.appliedAt).toBeUndefined();
  });
  it("acknowledges an explicitly applied recap without replacing existing played progress", async () => {
    const { repo } = await setup(), snapshot = await captureContinuation(input, repo);
    const played = { ...structuredClone(binding), id: "binding:b", chatId: "b" };
    played.characterScenes!.w!.states.mira!.bonds!.hero!.trust = 92;
    await repo.put("binding", played); await completeContinuation(snapshot, "b", repo);
    expect(await repo.get("binding", played.id)).toEqual(played);
    expect((await repo.get<HandoffSnapshot>("snapshot", snapshot.id))!.appliedAt).toBeTruthy();
  });
  it("honors the vault lock and encrypts the entire local story checkpoint", async () => {
    const { db, repo } = await setup(); await repo.enableVault("test-only-password");
    const snapshot = await captureContinuation(input, repo);
    expect(JSON.stringify(await db.records.toArray())).not.toContain("Mira has reached");
    expect((await repo.get<HandoffSnapshot>("snapshot", snapshot.id))!.continuation).toEqual(snapshot.continuation);
    await repo.lockVault(); await expect(captureContinuation(input, repo)).rejects.toThrow();
  });
});
