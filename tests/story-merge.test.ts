import { afterEach, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import { characterInChat, characterRevision } from "../src/core/characters";
import { storyProfileRecords, currentStoryProfileEntities } from "../src/core/story-profile-view";
import { assertStoryGraph } from "../src/core/story-records";
import { nativeStoryMessageKey as key } from "../src/core/story-transport";
import { validMergePage, type MergeChoices } from "../src/core/story-character-merge";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { runStoryGame } from "../src/storage/story-game";
import { readStoryMerge, approveStoryMerge, undoStoryMerge } from "../src/storage/story-character-merge";
import { readStoryIdentities, approveStoryIdentity } from "../src/storage/story-identity-management";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { storyWorld } from "./fixtures/story-worlds";
import type { ChatBinding, SceneEntity } from "../src/core/types";
const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { await Promise.all(dbs.splice(0).map(db => db.delete())); });
async function fixture(customize?: (f: ReturnType<typeof storyWorld>) => void) {
 const f = storyWorld("en", 3), db = new DeepRoleDatabase("merge-" + crypto.randomUUID()); dbs.push(db); const repo = new DeepRoleRepository(db);
 f.entities[0]!.characterSheet!.appearance = "Profile A"; f.entities[1]!.characterSheet!.appearance = "Profile B";
 f.binding.characterScenes![f.world.id]!.states["person-1"]!.condition = "State A"; f.binding.characterScenes![f.world.id]!.states["person-2"]!.condition = "State B";
 customize?.(f); await repo.mergeRecords(f.records);
 const scope = { chatId: f.binding.chatId, worldId: f.world.id };
 const binding = async () => (await repo.list<ChatBinding>("binding")).find(b => b.chatId === scope.chatId)!;
 const scene = async () => (await binding()).characterScenes![scope.worldId]!;
 const message = (id: string, parent: string | null, role: "user" | "assistant", content: string) => ({ identity: { nativeMessageKey: key(id), nativeParentKey: parent === null ? null : key(parent), role }, completion: "complete" as const, content });
 const snapshot = { chatId: scope.chatId, selectedNativeKey: key("2"), messages: [message("1", null, "user", "Before."), message("2", "1", "assistant", "Starting point.")] };
 const play = async (operation: "start" | "sync" | "restart" = "sync") => runStoryGame({ ...scope, expectedBase: characterRevision((await repo.list<SceneEntity>("entity")).filter(p => characterInChat(p, scope.chatId)), await scene()), operation, snapshot, nativeParentKey: null, manual: "stop" }, DEFAULT_SETTINGS, repo);
 await play("start");
 const read = (pair: [string, string] | null = ["person-1", "person-2"]) => readStoryMerge({ ...scope, query: "", offset: 0, pair }, repo);
 const merge = async () => { const page = await read(); return approveStoryMerge({ ...scope, query: "", offset: 0, pair: page.pair, guard: page.guard, versions: [page.preview!.a.updatedAt, page.preview!.b.updatedAt], choices: { profile: "a", state: "b", incoming: "a", name: "Merged resident", aliases: ["Resident 1", "Resident 2"], protagonist: true } }, repo); };
 const visible = async () => currentStoryProfileEntities(await repo.list("entity"), storyProfileRecords(await repo.rawRecords()), scope.worldId, scope.chatId, (await binding()).id);
 return { ...f, repo, scope, binding, scene, read, merge, visible, snapshot, message, play };
}
it("creates a local card with explicit sources; originals, lore and the other chat are unchanged", async () => {
 const f = await fixture(), before = await f.repo.rawRecords(), page = await f.merge(); expect(validMergePage(page)).toBe(true); expect(page.merges).toHaveLength(1);
 const visible = await f.visible(), merged = visible.find(p => p.playthroughChatId)!;
 expect(visible.map(p => p.id).sort()).toEqual(["person-3", merged.id].sort()); expect(merged.characterSheet!.appearance).toBe("Profile A"); expect((await f.scene()).states[merged.id]!.condition).toBe("State B");
 expect((await f.scene()).states["person-1"]!.condition).toBe("State A"); expect((await f.scene()).presentIds).toEqual([merged.id]);
 expect((await f.repo.rawRecords()).filter(r => ["world", "entry"].includes(r.kind) || r.kind === "entity" && !((r.data as SceneEntity).playthroughChatId))).toEqual(before.filter(r => ["world", "entry", "entity"].includes(r.kind)));
 expect(currentStoryProfileEntities((await f.repo.list<SceneEntity>("entity")).filter(p => characterInChat(p, "another-chat")), storyProfileRecords(await f.repo.rawRecords()), f.world.id, "another-chat")).toHaveLength(3);
 assertStoryGraph(await f.repo.rawRecords());
});
it("undo restores the originals and drops only the local merged card", async () => {
 const f = await fixture(), page = await f.merge();
 await undoStoryMerge({ ...f.scope, query: "", offset: 0, guard: page.guard, eventId: page.merges[0]!.id }, f.repo);
 expect(await f.repo.list("entity")).toHaveLength(3); expect(await f.visible()).toHaveLength(3); expect((await f.scene()).presentIds).toEqual(["person-1", "person-2"]); assertStoryGraph(await f.repo.rawRecords());
});
it("merge aliases can be turned off at the checkpoint and turned back on", async () => {
 const f = await fixture(); await f.merge();
 const p = await readStoryIdentities({ ...f.scope, offset: 0 }, f.repo), row = p.rows.find(r => r.reference.alias === "Resident 2")!;
 expect(row.status).toBe("active");
 await approveStoryIdentity({ ...f.scope, offset: 0, guard: p.guard, reference: row.reference, expectedUpdatedAt: row.updatedAt, enabled: false }, f.repo);
 expect((await f.visible()).find(p => p.playthroughChatId)!.aliases).not.toContain("Resident 2");
 const next = await readStoryIdentities({ ...f.scope, offset: 0 }, f.repo);
 await approveStoryIdentity({ ...f.scope, offset: 0, guard: next.guard, reference: row.reference, expectedUpdatedAt: row.updatedAt, enabled: true }, f.repo);
 expect((await f.visible()).find(p => p.playthroughChatId)!.aliases).toContain("Resident 2"); assertStoryGraph(await f.repo.rawRecords());
});
it("rejects stale sources, cancelled commits and collisions atomically", async () => {
 const f = await fixture(), p = await f.read(), input = { ...f.scope, query: "", offset: 0, pair: p.pair, guard: p.guard, versions: [p.preview!.a.updatedAt, p.preview!.b.updatedAt] as [number, number], choices: { profile: "a", state: "a", incoming: "a", name: "Merged", aliases: [], protagonist: true } as MergeChoices }, before = await f.repo.rawRecords();
 await expect(approveStoryMerge({ ...input, versions: [0, 0] }, f.repo)).rejects.toThrow("story-review-stale");
 await expect(approveStoryMerge(input, f.repo, async () => { throw Error("scene-changed"); })).rejects.toThrow("scene-changed");
 await expect(approveStoryMerge({ ...input, choices: { ...input.choices, name: "Resident 3" } }, f.repo)).rejects.toThrow("identity-ambiguous");
 expect(await f.repo.rawRecords()).toEqual(before);
});
it("carries the merge into a new checkpoint and keeps it through backup", async () => {
 const f = await fixture(); await f.merge(); const merged = (await f.visible()).find(p => p.playthroughChatId)!;
 await f.play("restart"); expect((await f.read(null)).merges[0]!.inherited).toBe(true); expect((await f.visible()).map(p => p.id).sort()).toEqual(["person-3", merged.id].sort());
 const backup = await parseBackup(JSON.stringify(await createBackup(undefined, f.repo))); await restoreBackup(backup, "replace", f.repo);
 expect((await f.visible()).map(p => p.id).sort()).toEqual(["person-3", merged.id].sort()); assertStoryGraph(await f.repo.rawRecords());
});
it("disabled merge aliases remain disabled after a checkpoint and can be enabled there", async () => {
 const f = await fixture(); await f.merge(); const p = await readStoryIdentities({ ...f.scope, offset: 0 }, f.repo), row = p.rows[0]!;
 await approveStoryIdentity({ ...f.scope, offset: 0, guard: p.guard, reference: row.reference, expectedUpdatedAt: row.updatedAt, enabled: false }, f.repo);
 await f.play("restart"); const next = await readStoryIdentities({ ...f.scope, offset: 0 }, f.repo), carried = next.rows.find(r => r.reference.alias === row.reference.alias)!;
 expect(carried).toMatchObject({ inherited: true, status: "disabled" });
 await approveStoryIdentity({ ...f.scope, offset: 0, guard: next.guard, reference: carried.reference, expectedUpdatedAt: carried.updatedAt, enabled: true }, f.repo);
 expect((await f.visible()).find(p => p.playthroughChatId)!.aliases).toContain(row.reference.alias); assertStoryGraph(await f.repo.rawRecords());
});
it("undo after later scenes pauses at the merge scene; edited merged profiles are protected", async () => {
 const f = await fixture(); await f.merge();
 f.snapshot.messages.push(f.message("3", "2", "user", "Continue."), f.message("4", "3", "assistant", "The merged resident waits.")); f.snapshot.selectedNativeKey = key("4"); await f.play();
 const page = await f.read(null); expect(page.merges[0]!.dropsLaterScenes).toBe(true);
 await undoStoryMerge({ ...f.scope, query: "", offset: 0, guard: page.guard, eventId: page.merges[0]!.id }, f.repo);
 expect((await f.read(null)).paused).toBe(true); expect(await f.visible()).toHaveLength(3); await expect(f.play()).rejects.toThrow("story-game-paused"); expect((await f.read(null)).paused).toBe(true);
 const g = await fixture(), p = await g.merge(), merged = (await g.visible()).find(p => p.playthroughChatId)!;
 await g.repo.put("entity", { ...merged, description: "Author edit", updatedAt: merged.updatedAt + 1 }); const before = await g.repo.rawRecords();
 await expect(undoStoryMerge({ ...g.scope, query: "", offset: 0, guard: p.guard, eventId: p.merges[0]!.id }, g.repo)).rejects.toThrow("story-profile-conflict"); expect(await g.repo.rawRecords()).toEqual(before);
});
it("merges chains and undo restores the earlier merged card", async () => {
 const f = await fixture(); await f.merge(); const first = (await f.visible()).find(p => p.playthroughChatId)!;
 const p = await f.read([first.id, "person-3"]); const next = await approveStoryMerge({ ...f.scope, query: "", offset: 0, pair: p.pair, guard: p.guard, versions: [p.preview!.a.updatedAt, p.preview!.b.updatedAt], choices: { profile: "a", state: "a", incoming: "a", name: "Second merge", aliases: first.aliases, protagonist: true } }, f.repo);
 expect(await f.visible()).toHaveLength(1);
 await undoStoryMerge({ ...f.scope, query: "", offset: 0, guard: next.guard, eventId: next.merges.at(-1)!.id }, f.repo);
 expect((await f.visible()).map(p => p.id).sort()).toEqual([first.id, "person-3"].sort()); assertStoryGraph(await f.repo.rawRecords());
});
it("keeps exact incoming scores from the chosen card and rejects incompatible state schemas", async () => {
 const bond = (trust: number, affinity: number) => ({ trust, affinity, locked: true, completed: [], history: [] });
 const f = await fixture(f => { f.binding.characterScenes![f.world.id]!.states["person-3"] = { ...f.binding.characterScenes![f.world.id]!.states["person-1"]!, bonds: { "person-1": bond(10, 80), "person-2": bond(95, 15) } }; });
 const p = await f.read(); expect(p.preview!.incomingConflicts).toBe(1);
 const merged = await approveStoryMerge({ ...f.scope, query: "", offset: 0, pair: p.pair, guard: p.guard, versions: [p.preview!.a.updatedAt, p.preview!.b.updatedAt], choices: { profile: "a", state: "a", incoming: "b", name: "Merged", aliases: [], protagonist: true } }, f.repo);
 const id = (await f.visible()).find(p => p.playthroughChatId)!.id, scene = await f.scene();
 expect(scene.states["person-3"]!.bonds).toEqual({ [id]: bond(95, 15) });
 await undoStoryMerge({ ...f.scope, query: "", offset: 0, guard: merged.guard, eventId: merged.merges[0]!.id }, f.repo);
 expect((await f.scene()).states["person-3"]!.bonds).toEqual({ "person-1": bond(10, 80), "person-2": bond(95, 15) });
 const g = await fixture(f => { f.entities[0]!.characterSheet!.attributes = [{ id: "energy", label: "Energy", initial: 50, low: "", high: "", cap: 2 }]; });
 const before = await g.repo.rawRecords(); await expect(g.merge()).rejects.toThrow("merge-state-incompatible"); expect(await g.repo.rawRecords()).toEqual(before);
});
