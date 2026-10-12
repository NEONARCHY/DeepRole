import { afterEach, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import { characterInChat, characterRevision, EMPTY_STATUS } from "../src/core/characters";
import { nativeStoryMessageKey as key } from "../src/core/story-transport";
import { assertStoryGraph } from "../src/core/story-records";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { runStoryGame } from "../src/storage/story-game";
import { readStoryReview } from "../src/storage/story-review";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { storyWorld } from "./fixtures/story-worlds";
import type { ChatBinding, SceneEntity } from "../src/core/types";
import type { StoryGameSnapshot } from "../src/core/story-game";
const dbs: DeepRoleDatabase[] = []; afterEach(async () => { await Promise.all(dbs.splice(0).map(db => db.delete())); });
// This integration scenario replays several branches, encrypts the full library
// and restores it. Give only this scenario room for the 1000-record workload;
// keep ordinary unit-test and production timeouts unchanged.
it.each([41, 100, 1000])("ordinary selected replies add a person beyond %i, preserve other states and replay without duplicate", async count => {
  const f = storyWorld("en", count), db = new DeepRoleDatabase("large-story-" + crypto.randomUUID()); dbs.push(db); const repo = new DeepRoleRepository(db);
  f.binding.characterScenes![f.world.id]!.states = Object.fromEntries(f.entities.map(e => [e.id, { ...EMPTY_STATUS, goal: `Known plan for ${e.id}` }])); await repo.mergeRecords(f.records);
  const message = (id: string, parent: string | null, role: "user" | "assistant", content: string) => ({ identity: { nativeMessageKey: key(id), nativeParentKey: parent === null ? null : key(parent), role }, completion: "complete" as const, content });
  const snapshot: StoryGameSnapshot = { chatId: f.binding.chatId, selectedNativeKey: key("2"), messages: [message("1", null, "user", "Begin"), message("2", "1", "assistant", "Workshop")] };
  const scene = async () => (await repo.get<ChatBinding>("binding", f.binding.id))!.characterScenes![f.world.id]!;
  const play = async (operation: "start" | "sync" = "sync") => { const people = (await repo.list<SceneEntity>("entity")).filter(e => characterInChat(e, f.binding.chatId)); return runStoryGame({ chatId: f.binding.chatId, worldId: f.world.id, expectedBase: characterRevision(people, await scene()), operation, snapshot, nativeParentKey: null, manual: "stop" }, DEFAULT_SETTINGS, repo); };
  await play("start"); const branch = (await readStoryReview({ chatId: f.binding.chatId, worldId: f.world.id, cursor: null }, repo)).guard!.branchId, late = f.entities.at(-1)!;
  const answer = `A courier arrived in a gray coat.<deeprole_characters>${JSON.stringify({ version: 2, world: f.world.id, chat: f.binding.chatId, branch, present: [f.entities[0]!.id, late.id, "new:Courier"], updates: [{ id: late.id, state: { condition: "At the gate" } }, { id: "new:Courier", name: "Courier", appearance: "Gray coat", state: { condition: "With a sealed letter" } }] })}</deeprole_characters>`;
  snapshot.messages.push(message("3", "2", "user", "Continue"), message("4", "3", "assistant", answer), message("5", "3", "assistant", "Nobody arrived.")); snapshot.selectedNativeKey = key("4"); await play();
  expect(await repo.list("entity")).toHaveLength(count + 1); const courier = (await repo.list<SceneEntity>("entity")).find(e => e.name === "Courier")!; expect((await scene()).states[late.id]).toMatchObject({ condition: "At the gate", goal: `Known plan for ${late.id}` }); const before = await repo.rawRecords(); await play(); expect(await repo.rawRecords()).toEqual(before);
  snapshot.selectedNativeKey = key("5"); await play(); expect(await repo.list("entity")).toHaveLength(count); expect((await scene()).states[late.id]).toMatchObject({ condition: "", goal: `Known plan for ${late.id}` }); snapshot.selectedNativeKey = key("4"); await play(); expect(await repo.list("entity")).toHaveLength(count + 1); expect((await repo.get<SceneEntity>("entity", courier.id))!.characterSheet!.appearance).toBe("Gray coat"); assertStoryGraph(await repo.rawRecords());
  await repo.enableVault("synthetic vault password"); const backup = await createBackup("synthetic backup password", repo), restoredDb = new DeepRoleDatabase("large-story-copy-" + crypto.randomUUID()); dbs.push(restoredDb); const target = new DeepRoleRepository(restoredDb); await restoreBackup(await parseBackup(JSON.stringify(backup), "synthetic backup password"), "replace", target); expect(await target.rawRecords()).toEqual(await repo.rawRecords());
}, 15_000);
