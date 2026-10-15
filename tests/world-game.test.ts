import { afterEach, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import { characterRevision, characterInChat } from "../src/core/characters";
import { validWorldGame, worldGameBinding, worldGamePeople } from "../src/core/world-game";
import { oldChatNotice } from "../src/core/old-chat-notice";
import { validDataRecord } from "../src/core/record-validation";
import { assertStoryGraph } from "../src/core/story-records";
import { nativeStoryMessageKey as key } from "../src/core/story-transport";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { activateWorldGame } from "../src/storage/world-game";
import { runStoryGame } from "../src/storage/story-game";
import { readStoryMerge, approveStoryMerge } from "../src/storage/story-character-merge";
import { readStoryIdentities, approveStoryIdentity } from "../src/storage/story-identity-management";
import { captureContinuation, completeContinuation } from "../src/storage/story-continuation";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { exportWorld, cloneWorldPackage, parseWorldPackage } from "../src/storage/worlds";
import { storyWorld } from "./fixtures/story-worlds";
import type { ChatBinding, SceneEntity, WorldProfile } from "../src/core/types";
const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { await Promise.all(dbs.splice(0).map(db => db.delete())); });
async function fixture() {
 const f = storyWorld("en", 3), db = new DeepRoleDatabase("shared-game-" + crypto.randomUUID()); dbs.push(db); const repo = new DeepRoleRepository(db); await repo.mergeRecords(f.records);
 const binding = async (chat = f.binding.chatId) => (await repo.list<ChatBinding>("binding")).find(b => b.chatId === chat)!;
 const world = () => repo.get<WorldProfile>("world", f.world.id).then(w => w!);
 const activate = async (chat = f.binding.chatId, mode: "initialize" | "attach" | "resume" = "initialize") => activateWorldGame({ chatId: chat, chatUrl: (await binding(chat)).chatUrl, worldId: f.world.id, expectedRevision: (await world()).sharedGame?.revision ?? null, mode }, repo);
 const message = (id: string, parent: string | null, role: "user" | "assistant", content: string) => ({ identity: { nativeMessageKey: key(id), nativeParentKey: parent === null ? null : key(parent), role }, completion: "complete" as const, content });
 const play = async (chat = f.binding.chatId, operation: "start" | "sync" | "reset" | "restore" = "start") => { const b = await binding(chat); return runStoryGame({ chatId: chat, worldId: f.world.id, operation, expectedBase: characterRevision((await repo.list<SceneEntity>("entity")).filter(p => characterInChat(p, chat)), b.characterScenes?.[f.world.id]), nativeParentKey: null, manual: "stop", snapshot: { chatId: chat, selectedNativeKey: key("2"), messages: [message("1", null, "user", "Before."), message("2", "1", "assistant", "Starting point.")] } }, DEFAULT_SETTINGS, repo); };
 const addChat = async (chat: string) => { const b: ChatBinding = { id: "binding:" + chat, chatId: chat, chatUrl: "https://chat.deepseek.com/a/chat/s/" + chat, worldId: f.world.id, bookId: null, focusIds: [], messageCountAtAnalysis: 0, createdAt: 20, updatedAt: 20 }; await repo.put("binding", b); return b; };
 await activate(); await play(); return { ...f, repo, getBinding: binding, getWorld: world, activate, play, addChat };
}
it("attaches a manually created chat to the same game with scores, attributes and memory; old segment stays intact", async () => {
 const f = await fixture(), before = await f.getBinding();
 await f.repo.updateRecords(all => { const b = all.find(r => r.kind === "binding" && r.id === before.id)!.data as ChatBinding; const next = structuredClone(b); next.memoryOverrides = { includedIds: [f.entry.id], excludedIds: [] }; next.characterScenes![f.world.id]!.states["person-1"]!.condition = "Progress saved"; next.characterScenes![f.world.id]!.revision = "manual-progress"; return { records: [{ kind: "binding", id: next.id, data: next }], removed: [], result: null }; });
 const old = await f.getBinding(), gameId = (await f.getWorld()).sharedGame!.id; await f.addChat("manual-b"); await f.activate("manual-b", "attach"); await f.play("manual-b");
 const next = await f.getBinding("manual-b"), world = await f.getWorld(); expect(world.sharedGame!.id).toBe(gameId); expect(world.sharedGame!.activeChatId).toBe("manual-b"); expect(next.characterScenes![f.world.id]!.states).toEqual(old.characterScenes![f.world.id]!.states); expect(next.memoryOverrides).toEqual(old.memoryOverrides); expect(await f.getBinding()).toEqual(old); expect(worldGameBinding(old, world)!.characterScenes![f.world.id]!.states).toEqual(next.characterScenes![f.world.id]!.states); assertStoryGraph(await f.repo.rawRecords());
});
it("retains a merged roster and disabled aliases across native checkpoints without changing original lore", async () => {
 const f = await fixture(), scope = { worldId: f.world.id, chatId: f.binding.chatId, query: "", offset: 0, pair: ["person-1", "person-2"] as [string,string] };
 const page = await readStoryMerge(scope, f.repo); await approveStoryMerge({ ...scope, guard: page.guard, versions: [page.preview!.a.updatedAt,page.preview!.b.updatedAt], choices: { profile: "a", state: "b", incoming: "a", name: "One resident", aliases: ["Resident 1", "Resident 2"], protagonist: true } }, f.repo);
 const names = await readStoryIdentities({ worldId: scope.worldId, chatId: scope.chatId, offset: 0 }, f.repo), alias = names.rows.find(r => r.reference.alias === "Resident 2")!;
 await approveStoryIdentity({ worldId: scope.worldId, chatId: scope.chatId, offset: 0, guard: names.guard, reference: alias.reference, expectedUpdatedAt: alias.updatedAt, enabled: false }, f.repo);
 const original = await f.repo.get<SceneEntity>("entity", "person-1"); await f.addChat("merge-b"); await f.activate("merge-b", "attach"); await f.play("merge-b");
 const people = worldGamePeople(await f.repo.list<SceneEntity>("entity"), await f.getWorld()); expect(people).toHaveLength(2); const merged = people.find(p => p.name === "One resident")!; expect(merged.aliases).not.toContain("Resident 2"); expect(characterInChat(merged,"merge-b")).toBe(true); expect(await f.repo.get("entity","person-1")).toEqual(original); expect((await readStoryMerge({ ...scope, chatId: "merge-b", pair: null }, f.repo)).merges[0]!.inherited).toBe(true); assertStoryGraph(await f.repo.rawRecords());
 const pack = parseWorldPackage(JSON.stringify(await exportWorld(f.world.id,f.repo))); expect(pack.records.filter(r=>r.kind==="entity")).toHaveLength(2); expect((pack.records.find(r=>r.kind==="entry")!.data as any).entityIds).toEqual([merged.id]); expect((cloneWorldPackage(pack).find(r=>r.kind==="world")!.data as WorldProfile).sharedGame).toBeUndefined();
 await f.play("merge-b","reset"); expect(worldGamePeople(await f.repo.list<SceneEntity>("entity"),await f.getWorld(),(await f.repo.list<any>("story")))).not.toContainEqual(expect.objectContaining({id:merged.id}));
});
it("rejects late writes and parallel activation against a stale shared revision", async () => {
 const f = await fixture(), a = await f.getBinding(), revision = (await f.getWorld()).sharedGame!.revision; await f.addChat("b"); await f.activate("b","attach");
 await expect(f.repo.updateRecords(() => { const next = structuredClone(a); next.characterScenes![f.world.id]!.revision = "late"; return { records: [{ kind: "binding", id: next.id, data: next }], removed: [], result: null }; })).rejects.toThrow("story-game-inactive");
 await expect(f.repo.putIfUnchanged("binding", { ...a, memoryOverrides: { includedIds: [f.entry.id], excludedIds: [] } }, a)).rejects.toThrow("story-game-inactive");
 await expect(activateWorldGame({ chatId: a.chatId, chatUrl: a.chatUrl, worldId: f.world.id, mode: "resume", expectedRevision: revision }, f.repo)).rejects.toThrow("story-game-stale");
 expect((await f.getWorld()).sharedGame!.activeChatId).toBe("b");
});
it("resumes an old chat from latest progress with a fresh anchor, never its obsolete scene", async () => {
 const f = await fixture(), old = await f.getBinding(); await f.addChat("b"); await f.activate("b","attach"); await f.play("b");
 await f.repo.updateRecords(all => { const b = all.find(r => r.kind === "binding" && (r.data as ChatBinding).chatId === "b")!.data as ChatBinding; const next = structuredClone(b); next.characterScenes![f.world.id]!.states["person-1"]!.condition = "Latest condition"; next.characterScenes![f.world.id]!.revision = "latest-progress"; return { records: [{ kind: "binding", id: next.id, data: next }], removed: [], result: null }; });
 await f.activate(old.chatId,"resume"); const returned = await f.getBinding(); expect(returned.id).not.toBe(old.id); expect(returned.characterScenes![f.world.id]!.states["person-1"]!.condition).toBe("Latest condition"); await f.play(); expect(oldChatNotice(await f.getBinding("b"),[],[],[await f.getWorld()])!.targetChatId).toBe(old.chatId); assertStoryGraph(await f.repo.rawRecords());
});
it("commits continuation and shared ownership once, rejects recap made stale by later play", async () => {
 const f = await fixture(); const input = { chatId: f.binding.chatId, chatUrl: f.binding.chatUrl, scene: { worldId: f.world.id, focusIds: [], bookId: null }, story: { version: 1 as const, turns: [{ role: "assistant" as const, text: "The clock waits." }], source: "history" as const, partial: false, omittedTurns: 0 }, overrides: { includedIds: [], excludedIds: [] }, recap: { title: "Clock", summary: "The clock waits." } };
 const snapshot = await captureContinuation(input,f.repo); await completeContinuation(snapshot,"continued",f.repo); const saved = await f.getWorld(); await completeContinuation(snapshot,"continued",f.repo); expect(await f.getWorld()).toEqual(saved); expect(saved.sharedGame!.activeChatId).toBe("continued");
 await f.play("continued"); const b = await f.getBinding("continued"), stale = await captureContinuation({ ...input, chatId: b.chatId, chatUrl: b.chatUrl },f.repo);
 await f.repo.updateRecords(all => { const row = all.find(r => r.kind === "binding" && r.id === b.id)!; const next = structuredClone(row.data as ChatBinding); next.characterScenes![f.world.id]!.revision = "after-recap"; return { records: [{ ...row, data: next }], removed: [], result: null }; });
 await expect(completeContinuation(stale,"stale-destination",f.repo)).rejects.toThrow("handoff-conflict"); expect((await f.getWorld()).sharedGame!.activeChatId).toBe("continued");
});
it("survives full backup and protects the saved game from a cancelled commit; portable lore has no native owner", async () => {
 const f = await fixture(); expect(validWorldGame((await f.getWorld()).sharedGame)).toBe(true); const before = await f.repo.rawRecords(); await f.addChat("cancelled");
 await expect(activateWorldGame({ chatId: "cancelled", chatUrl: (await f.getBinding("cancelled")).chatUrl, worldId: f.world.id, mode: "attach", expectedRevision: (await f.getWorld()).sharedGame!.revision },f.repo,async () => { throw Error("navigated"); })).rejects.toThrow("navigated"); expect((await f.getWorld()).sharedGame!.activeChatId).toBe(f.binding.chatId);
 const backup = await parseBackup(JSON.stringify(await createBackup(undefined,f.repo))); expect(backup.records.every(validDataRecord)).toBe(true); await restoreBackup(backup,"replace",f.repo); expect((await f.getWorld()).sharedGame).toEqual((before.find(r => r.kind === "world")!.data as WorldProfile).sharedGame);
 const portable = await exportWorld(f.world.id,f.repo); expect((portable.records.find(r=>r.kind === "world")!.data as WorldProfile).sharedGame).toBeUndefined();
});
it("explicit reset archives the whole game and starts clean, leaving lore, portraits and old sources intact", async () => {
 const f = await fixture(), before = await f.getWorld(), records = await f.repo.rawRecords(); await f.play(f.binding.chatId,"reset"); const after = await f.getWorld();
 expect(after.sharedGame!.id).not.toBe(before.sharedGame!.id); expect(after.sharedGameArchives).toEqual([before.sharedGame]); expect(after.sharedGame!.scene!.states).toEqual({}); expect(after.sharedGame!.restartPending).toBe(true); expect((await f.repo.rawRecords()).filter(r => ["entry","entity"].includes(r.kind))).toEqual(records.filter(r => ["entry","entity"].includes(r.kind))); assertStoryGraph(await f.repo.rawRecords()); expect((await parseBackup(JSON.stringify(await createBackup(undefined,f.repo)))).records.every(validDataRecord)).toBe(true);
});
it("carries approved facts as checkpoint seeds and clears them only on explicit game reset", async () => {
 const f = await fixture(), fact = { text: "The key is with the hero.", kind: "event" as const, quote: "The key is with the hero." };
 await f.repo.updateRecords(all => { const baseline = all.find(r => r.kind === "story" && (r.data as any).type === "baseline")!; return { records: [{ ...baseline, data: { ...baseline.data, factSeeds: [fact] } }], removed: [], result: null }; });
 expect((await f.getWorld()).sharedGame!.facts).toEqual([fact]); await f.addChat("facts-b"); await f.activate("facts-b","attach"); await f.play("facts-b"); expect((await f.getWorld()).sharedGame!.facts).toEqual([fact]); await f.play("facts-b","reset"); expect((await f.getWorld()).sharedGame!.facts).toEqual([]);
});
it("continues with the compact recap instead of seeding the old long transcript again",async()=>{
 const f=await fixture();
 await f.repo.updateRecords(all=>{const row=all.find(r=>r.kind==="story"&&(r.data as any).type==="baseline")!;return {records:[{...row,data:{...row.data,storySeeds:{version:1,source:"history",partial:false,omittedTurns:0,turns:Array.from({length:100},(_,n)=>({role:"assistant",text:`Old scene ${n}: `+"The clock ticks. ".repeat(100)}))},storySourceChatId:f.binding.chatId}}],removed:[],result:null};});
 const before=await f.repo.rawRecords(),game=(await f.getWorld()).sharedGame!;
 const recap={title:"Final moment",summary:"The artisan waits for the answer. Do not repeat the delivery."};
 const snapshot=await captureContinuation({chatId:f.binding.chatId,chatUrl:f.binding.chatUrl,scene:{worldId:f.world.id,bookId:null,focusIds:[]},story:{version:1,source:"history",turns:[],partial:false,omittedTurns:0},recap,overrides:{includedIds:[],excludedIds:[]}},f.repo);
 await completeContinuation(snapshot,"compact-target",f.repo);
 const next=(await f.getWorld()).sharedGame!;
 expect(next.recentStory!.turns).toEqual([{role:"assistant",text:recap.summary}]);expect(next.recentStory!.partial).toBe(true);
 expect(next.facts).toEqual(game.facts);expect(next.episodeSources).toEqual(game.episodeSources);expect(next.scene!.states).toEqual(game.scene!.states);
 for(const row of before.filter(r=>r.kind==="story"))expect(await f.repo.get(row.kind,row.id)).toEqual(row.data);
 assertStoryGraph(await f.repo.rawRecords());
});
it("keeps a bounded recent excerpt across manual continuation and clears it on a fresh game", async () => {
 const f = await fixture(), recent = { version: 1 as const, turns: [{ role: "assistant" as const, text: "The clock stopped at midnight." }], source: "history" as const, partial: false, omittedTurns: 0 };
 await f.repo.updateRecords(all => { const baseline = all.find(r => r.kind === "story" && (r.data as any).type === "baseline")!; return { records: [{ ...baseline, data: { ...baseline.data, storySeeds: recent, storySourceChatId: f.binding.chatId } }], removed: [], result: null }; });
 expect((await f.getWorld()).sharedGame!.recentStory!.turns).toEqual(recent.turns); expect(validWorldGame((await f.getWorld()).sharedGame)).toBe(true);
 await f.addChat("excerpt-b"); await f.activate("excerpt-b", "attach"); await f.play("excerpt-b"); expect((await f.getWorld()).sharedGame!.recentChatId).toBe(f.binding.chatId); expect((await f.getWorld()).sharedGame!.recentStory!.turns).toEqual(recent.turns);
 await f.play("excerpt-b", "reset"); expect((await f.getWorld()).sharedGame!.recentStory).toBeUndefined(); await f.play("excerpt-b", "restore"); expect((await f.getWorld()).sharedGame!.recentStory!.turns).toEqual(recent.turns); assertStoryGraph(await f.repo.rawRecords());
});
it("can undo a fresh reset without losing the previous game, but refuses after manual progress", async () => {
 const f = await fixture(), previous = (await f.getWorld()).sharedGame!; await f.play(f.binding.chatId,"reset"); await f.play(f.binding.chatId,"restore"); expect((await f.getWorld()).sharedGame!.id).toBe(previous.id); expect((await f.getWorld()).sharedGame!.scene!.states).toEqual(previous.scene!.states); expect((await f.getWorld()).sharedGameArchives).toHaveLength(0);
 await f.play(f.binding.chatId,"reset"); await f.repo.updateRecords(all => { const b = all.find(r => r.kind === "binding" && (r.data as ChatBinding).chatId === f.binding.chatId)!; const next = structuredClone(b.data as ChatBinding); next.characterScenes![f.world.id]!.states["person-1"] = structuredClone(f.binding.characterScenes![f.world.id]!.states["person-1"]!); return { records: [{ ...b, data: next }], removed: [], result: null }; }); await expect(f.play(f.binding.chatId,"restore")).rejects.toThrow("story-game-reset-changed"); assertStoryGraph(await f.repo.rawRecords());
});
