import { afterEach, expect, it } from "vitest";
import { characterRevision, characterText, type CharacterTurn } from "../src/core/characters";
import { assertStoryGraph, storyRow, type StoryRevision, type StoryRecord } from "../src/core/story-records";
import { projectStoryBranch } from "../src/core/story-projection";
import type { ChatBinding, SceneEntity } from "../src/core/types";
import { applyCharacterTurn, saveCharacter } from "../src/storage/characters";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository, VaultLockedError } from "../src/storage/repository";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { selectStoryRevision } from "../src/storage/story-selection";
import { prepareStoryRequest } from "../src/storage/story-requests";
import { storySceneOwner } from "../src/storage/story-scene-owner";
import { ownedStoryScene } from "./fixtures/story-scene-owner";

const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { await Promise.all(dbs.splice(0).map(db => db.delete())); });
async function setup(selected = true) {
  const f = ownedStoryScene("en", selected), db = new DeepRoleDatabase("scene-owner-" + crypto.randomUUID()); dbs.push(db); const repo = new DeepRoleRepository(db); await repo.mergeRecords(f.records);
  const scope = { worldId: f.world.id, chatId: f.binding.chatId, chatUrl: f.binding.chatUrl!, base: characterRevision(f.entities, f.binding.characterScenes![f.world.id]) };
  const turn: CharacterTurn = { world: scope.worldId, chat: scope.chatId, base: scope.base, present: [f.entities[0]!.id], updates: [{ id: f.entities[0]!.id, state: { ...f.binding.characterScenes![f.world.id]!.states[f.entities[0]!.id]!, condition: "Legacy change must not overwrite selected history" } }] };
  return { ...f, db, repo, scope, turn };
}
it("blocks the legacy writer before states, new profiles, photos or image approvals can be persisted", async () => {
  const f = await setup(), before = await f.repo.rawRecords();
  await expect(applyCharacterTurn(f.scope, f.turn, undefined, f.repo)).rejects.toThrow("character-story-managed"); expect(await f.repo.rawRecords()).toEqual(before);
  const newcomer = { ...f.turn, present: ["new:Visitor"], updates: [{ id: "new:Visitor", name: "Visitor", state: f.turn.updates[0]!.state }] };
  await expect(applyCharacterTurn(f.scope, newcomer, undefined, f.repo)).rejects.toThrow("character-story-managed"); expect(await f.repo.rawRecords()).toEqual(before);
});
it("does not disable ordinary roleplay just because an unselected checkpoint exists", async () => {
  const f = await setup(false); expect(storySceneOwner(await f.repo.rawRecords(), f.binding, f.world.id)).toBeNull();
  await applyCharacterTurn(f.scope, f.turn, undefined, f.repo);
  expect((await f.repo.get<ChatBinding>("binding", f.binding.id))!.characterScenes![f.world.id]!.states[f.entities[0]!.id]!.condition).toBe(f.turn.updates[0]!.state.condition);
});
it("allows manual edits in a replay-owned scene without erasing its owner", async () => {
  const f = await setup(), e = f.entities[0]!;
  await saveCharacter({ ...f.scope, entityId: e.id, name: e.name, sheet: { ...e.characterSheet!, appearance: "Hand-edited blue coat" }, state: { ...f.turn.updates[0]!.state, goal: "Manual protected goal" }, present: true }, f.repo);
  expect((await f.repo.get<SceneEntity>("entity", e.id))!.characterSheet!.appearance).toBe("Hand-edited blue coat");
  expect(storySceneOwner(await f.repo.rawRecords(), (await f.repo.get<ChatBinding>("binding", f.binding.id))!, f.world.id)!.id).toBe(f.projection.id);
  await expect(selectStoryRevision(f.branch.id, { headRevisionId: null, expectedHeadRevisionId: null, expectedSelectionVersion: 1, acceptedEventIds: ["not-a-stored-event"] }, f.repo)).rejects.toThrow("story-manual-conflict");
});
it("retains writer ownership through a full backup restore", async () => {
  const f = await setup(), target = await setup(false);
  await restoreBackup(await parseBackup(JSON.stringify(await createBackup(undefined, f.repo))), "replace", target.repo);
  const before = await target.repo.rawRecords();
  await expect(applyCharacterTurn(f.scope, f.turn, undefined, target.repo)).rejects.toThrow("character-story-managed"); expect(await target.repo.rawRecords()).toEqual(before);
});
it("protects encrypted scene ownership after reopening and while the vault is locked", async () => {
  const f = await setup(); await f.repo.enableVault("synthetic-owner-password"); f.db.close(); const reopened = new DeepRoleDatabase(f.db.name); dbs.push(reopened); const repo = new DeepRoleRepository(reopened); await repo.unlockVault("synthetic-owner-password");
  const before = await reopened.records.toArray(); expect(before.every(row => row.encrypted && !row.data)).toBe(true);
  await expect(applyCharacterTurn(f.scope, f.turn, undefined, repo)).rejects.toThrow("character-story-managed"); expect(await reopened.records.toArray()).toEqual(before);
  await repo.lockVault(); await expect(applyCharacterTurn(f.scope, f.turn, undefined, repo)).rejects.toBeInstanceOf(VaultLockedError); expect(await reopened.records.toArray()).toEqual(before);
});
it("does not let a stale legacy update win after an atomic first selection", async () => {
  const f = await setup(false), selection = { headRevisionId: null, expectedHeadRevisionId: null, expectedSelectionVersion: 0, acceptedEventIds: [] };
  const results = await Promise.allSettled([selectStoryRevision(f.branch.id, selection, f.repo), applyCharacterTurn(f.scope, f.turn, undefined, new DeepRoleRepository(f.db))]);
  expect(results[0]!.status).toBe("fulfilled"); expect(results[1]!.status).toBe("rejected");
  const all = await f.repo.rawRecords(); assertStoryGraph(all); expect(storySceneOwner(all, (await f.repo.get<ChatBinding>("binding", f.binding.id))!, f.world.id)).not.toBeNull();
});
it("does not let a first selection overwrite an already committed legacy update", async () => {
  const f = await setup(false), selection = { headRevisionId: null, expectedHeadRevisionId: null, expectedSelectionVersion: 0, acceptedEventIds: [] };
  const results = await Promise.allSettled([applyCharacterTurn(f.scope, f.turn, undefined, f.repo), selectStoryRevision(f.branch.id, selection, new DeepRoleRepository(f.db))]);
  expect(results[0]!.status).toBe("fulfilled"); expect(results[1]!.status).toBe("rejected");
  expect(storySceneOwner(await f.repo.rawRecords(), (await f.repo.get<ChatBinding>("binding", f.binding.id))!, f.world.id)).toBeNull();
});
it("limits ownership to its exact world, chat and binding", async () => {
  const f = await setup(), binding = { ...f.binding, id: "binding:synthetic-b", chatId: "synthetic-b", chatUrl: "https://chat.deepseek.com/chat/s/synthetic-b" }; await f.repo.put("binding", binding);
  expect(storySceneOwner(await f.repo.rawRecords(), binding, f.world.id)).toBeNull();
  await applyCharacterTurn({ ...f.scope, chatId: binding.chatId, chatUrl: binding.chatUrl }, { ...f.turn, chat: binding.chatId }, undefined, f.repo);
  expect((await f.repo.get<ChatBinding>("binding", f.binding.id))!.characterScenes).toEqual(f.binding.characterScenes);
});
it("rejects another branch writer without mutating the persisted scene", async () => {
  const f = await setup(), before = await f.repo.rawRecords();
  expect(() => storySceneOwner(before, f.binding, f.world.id, "other-branch")).toThrow("story-scene-ownership-conflict"); expect(await f.repo.rawRecords()).toEqual(before);
});
it("refuses two otherwise valid projection writers for the same live scene", async () => {
  const f = await setup(), branch = { ...f.branch, id: "other-branch", branchId: "other-branch", parentBranchId: f.branch.id, forkRevisionId: "synthetic-fork", projectionId: "other-projection" };
  const revision: StoryRevision = { format: "deeprole-story", contractVersion: 1, type: "revision", id: branch.forkRevisionId, branchId: f.branch.id, playthroughId: f.branch.playthroughId, worldId: f.world.id,
    messageId: "synthetic-fork-message", nativeMessageKey: "synthetic-fork-native", requestId: null, parentRevisionId: null, role: "assistant", completion: "complete", content: "Synthetic fork", createdAt: 32, updatedAt: 32 };
  const stored = (await f.repo.rawRecords()).filter(r => r.kind === "story").map(r => r.data as StoryRecord);
  const projection = { ...f.projection, ...projectStoryBranch([...stored, revision, branch], branch.id, null, []), id: branch.projectionId!, branchId: branch.id };
  const all = [...await f.repo.rawRecords(), ...[revision, branch, projection].map(storyRow)]; assertStoryGraph(all);
  await f.repo.mergeRecords(all); const before = await f.repo.rawRecords();
  expect(() => storySceneOwner(before, f.binding, f.world.id)).toThrow("story-scene-ownership-conflict");
  await expect(selectStoryRevision(f.branch.id, { headRevisionId: null, expectedHeadRevisionId: null, expectedSelectionVersion: 1, acceptedEventIds: ["unknown-event"] }, f.repo)).rejects.toThrow("story-scene-ownership-conflict");
  expect(await f.repo.rawRecords()).toEqual(before);
});
it("does not let another world's archived projection disable the active world's legacy writer", async () => {
  const f = await setup(), other = { ...f.world, id: "other-world" }, binding = { ...f.binding, worldId: other.id, characterScenes: { ...f.binding.characterScenes, [other.id]: structuredClone(f.binding.characterScenes![f.world.id]!) } };
  const people = f.entities.map(e => ({ ...e, worldId: other.id })); await f.repo.put("world", other); await f.repo.mergeRecords(people.map(data => ({ kind: "entity", id: data.id, data }))); await f.repo.put("binding", binding);
  expect(storySceneOwner(await f.repo.rawRecords(), binding, other.id)).toBeNull();
  await applyCharacterTurn({ ...f.scope, worldId: other.id }, { ...f.turn, world: other.id }, undefined, f.repo);
  expect((await f.repo.get<ChatBinding>("binding", binding.id))!.characterScenes![f.world.id]).toEqual(f.binding.characterScenes![f.world.id]);
});
it.each(["legacy", "selection", "request"] as const)("rejects ambiguous chat bindings for %s", async mode => {
  const f = await setup(false); await f.repo.put("binding", { ...f.binding, id: "binding:duplicate" }); const before = await f.repo.rawRecords();
  const run = mode === "legacy" ? applyCharacterTurn(f.scope, f.turn, undefined, f.repo)
    : mode === "selection" ? selectStoryRevision(f.branch.id, { headRevisionId: null, expectedHeadRevisionId: null, expectedSelectionVersion: 0, acceptedEventIds: [] }, f.repo)
    : prepareStoryRequest(f.branch.id, { id: "synthetic-request", purpose: "user-turn", bindingId: f.binding.id, identity: { chatId: f.binding.chatId, nativeParentKey: null }, parentRevisionId: null, expectedHeadRevisionId: null, expectedSelectionVersion: 0, expectedSceneRevision: "legacy-scene-a" }, f.repo);
  await expect(run).rejects.toThrow(mode === "legacy" ? "character-scope" : "story-binding-conflict"); expect(await f.repo.rawRecords()).toEqual(before);
});
it.each(["ru", "en"] as const)("explains a skipped legacy update in %s without internal IDs", locale => {
  const text = characterText(locale, "historyManaged"); expect(text.length).toBeGreaterThan(40); expect(text).not.toMatch(/entity_|projection|requestId|character-story-managed/);
  expect(text).toContain(locale === "ru" ? "не изменены" : "unchanged");
});
