import { afterEach, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import { characterInChat, characterInstruction, characterRevision } from "../src/core/characters";
import { currentStoryProfileEntities, storyProfileRecords } from "../src/core/story-profile-view";
import { identityCanonical, identityOwners, storyIdentityEntities, uniqueIdentityReferences, validIdentitySeeds, validStoryCharacterIdentity } from "../src/core/story-character-identity";
import { validCharacterDiscoveryPage, parseDiscoveryReply } from "../src/core/story-character-discovery";
import { assertStoryGraph, type StoryEvent, type StoryRecord } from "../src/core/story-records";
import { nativeStoryMessageKey as key } from "../src/core/story-transport";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { runStoryGame } from "../src/storage/story-game";
import { readCharacterDiscovery, prepareCharacterDiscovery, applyCharacterDiscovery, approveCharacterDiscovery } from "../src/storage/story-character-discovery";
import { prepareDiscoveryProfile } from "../src/storage/discovery-profile";
import { prepareProfileSupplement } from "../src/storage/profile-supplements";
import { readStoryIdentities, approveStoryIdentity } from "../src/storage/story-identity-management";
import { prepareStoryRequest } from "../src/storage/story-requests";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { storyWorld } from "./fixtures/story-worlds";
import type { ChatBinding, SceneEntity } from "../src/core/types";
const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { await Promise.all(dbs.splice(0).map(db => db.delete())); });
async function fixture(prose = "Copper Courier brought a sealed letter.", count = 3) {
 const f = storyWorld("en", count), db = new DeepRoleDatabase("identity-" + crypto.randomUUID()); dbs.push(db); const repo = new DeepRoleRepository(db); await repo.mergeRecords(f.records);
 const message = (id: string, parent: string | null, role: "user" | "assistant", content: string) => ({ identity: { nativeMessageKey: key(id), nativeParentKey: parent === null ? null : key(parent), role }, completion: "complete" as const, content });
 const snapshot = { chatId: f.binding.chatId, selectedNativeKey: key("2"), messages: [message("1", null, "user", "Before."), message("2", "1", "assistant", "Starting point.")] };
 const scope = { chatId: f.binding.chatId, worldId: f.world.id };
 const binding = async () => (await repo.list<ChatBinding>("binding")).find(b => b.chatId === scope.chatId)!;
 const scene = async () => (await binding()).characterScenes![scope.worldId]!;
 const play = async (operation: "start" | "sync" | "restart" = "sync") => { const people = (await repo.list<SceneEntity>("entity")).filter(p => characterInChat(p, scope.chatId)); return runStoryGame({ ...scope, expectedBase: characterRevision(people, await scene()), operation, snapshot, nativeParentKey: null, manual: "stop" }, DEFAULT_SETTINGS, repo); };
 await play("start"); snapshot.messages.push(message("3", "2", "user", "Continue."), message("4", "3", "assistant", prose), message("5", "3", "assistant", "Alternative: nobody arrived.")); snapshot.selectedNativeKey = key("4"); await play();
 const read = () => readCharacterDiscovery({ ...scope, offset: 0 }, repo);
 const discover = async (name = "Copper Courier", quote = prose, distinct?: true) => { const brief = await prepareCharacterDiscovery({ ...scope, guard: (await read()).guard }, "discover_" + crypto.randomUUID(), "en", repo), source = brief.parts.find(s => s.text.includes(quote))!; await applyCharacterDiscovery(brief, JSON.stringify({ requestId: brief.requestId, people: [{ source: source.id, name, quote, ...(distinct ? { distinct } : {}) }], more: false }), repo); return (await read()).candidates[0]!; };
 const visible = async () => currentStoryProfileEntities(await repo.list("entity"), (await repo.list<StoryRecord>("story")), scope.worldId, scope.chatId, (await binding()).id);
 const link = async (eventId: string, person = f.entities[0]!) => approveCharacterDiscovery({ ...scope, guard: (await read()).guard, eventId, name: "Copper Courier", background: "", accept: true, identity: { entityId: person.id, updatedAt: person.updatedAt } }, repo);
 return { ...f, repo, scope, snapshot, message, play, read, discover, visible, link, scene };
}
it("normalises aliases, detects every owner and rejects malformed identity contracts", () => {
 const people = [{ id: "a", name: "Алекс", aliases: [" Copper   Courier "] }, { id: "b", name: "ＡＬＥＸ", aliases: ["copper courier"] }];
 expect(identityOwners(people, "COPPER courier").map(p => p.id)).toEqual(["a", "b"]); expect(uniqueIdentityReferences(people, ["Copper Courier", "New Name"])).toEqual(["New Name"]);
 expect(validIdentitySeeds({ a: { canonical: { name: "Alex", aliases: [] }, aliases: ["Courier"] } })).toBe(true);
 for (const v of [{ entityId: "a", alias: "", canonical: { name: "Alex", aliases: [] } }, { entityId: "a", alias: "Courier", canonical: { name: "Alex", aliases: [] }, scores: {} }]) expect(validStoryCharacterIdentity(v)).toBe(false);
 expect(validIdentitySeeds(JSON.parse('{"__proto__":{"canonical":{"name":"Alex","aliases":[]},"aliases":["Courier"]}}'))).toBe(false);
 expect(() => parseDiscoveryReply(JSON.stringify({ requestId: "id", people: [{ source: "s", name: "Alex", quote: "Alex arrived.", distinct: false }], more: false }), "id", [{ id: "s", text: "Alex arrived." }])).toThrow("invalid-result");
});
it("links explicitly, keeps raw profiles/states/lore unchanged and supplies the unique alias to future requests", async () => {
 const f = await fixture(), candidate = await f.discover(), before = await f.repo.rawRecords();
 const page = await f.read(), lookup = await readCharacterDiscovery({ ...f.scope, offset: 0, guard: page.guard, identity: { eventId: candidate.eventId, query: f.entities[0]!.name, offset: 0 } }, f.repo);
 expect(validCharacterDiscoveryPage(lookup)).toBe(true); expect(lookup.identity!.people).toHaveLength(1);
 await f.link(candidate.eventId); const visible = await f.visible(), person = visible.find(p => p.id === f.entities[0]!.id)!;
 expect(person.aliases).toContain("Copper Courier"); expect((await f.read()).candidates[0]).toMatchObject({ identityName: person.name, added: true });
 expect((await f.repo.rawRecords()).filter(r => r.kind !== "story" && r.kind !== "binding")).toEqual(before.filter(r => r.kind !== "story" && r.kind !== "binding")); expect((await f.scene()).states).toEqual((before.find(r => r.kind === "binding")!.data as ChatBinding).characterScenes![f.world.id]!.states);
 const prompt = characterInstruction(f.world.id, f.scope.chatId, visible, await f.scene(), ["neutral"], [], "Copper Courier, wait.");
 expect(prompt).toContain('"aliases":["Copper Courier"]'); expect(await f.repo.list("entity")).toHaveLength(3); assertStoryGraph(await f.repo.rawRecords());
 const supplement = await prepareProfileSupplement({ ...f.scope, guard: (await f.read()).guard, entityId: person.id }, "field_" + crypto.randomUUID(), "en", f.repo);
 expect(supplement.draft.reference.aliases).toContain("Copper Courier"); expect(supplement.sources.some(s => s.text.includes(candidate.quote))).toBe(true);
});
it("pages through all saved profiles and rejects unguarded, foreign and stale lookups", async () => {
 const f = await fixture(undefined, 85), candidate = await f.discover(), page = await f.read(), input = { ...f.scope, offset: 0, guard: page.guard, identity: { eventId: candidate.eventId, query: "", offset: 40 } };
 const lookup = await readCharacterDiscovery(input, f.repo); expect(lookup.identity).toMatchObject({ total: 85, offset: 40, next: 80 }); expect(lookup.identity!.people).toHaveLength(40);
 expect(validCharacterDiscoveryPage(lookup)).toBe(true); expect(lookup.identity!.people.map(p => p.summary.length).every(n => n <= 240)).toBe(true);
 await expect(readCharacterDiscovery({ ...input, guard: undefined }, f.repo)).rejects.toThrow("story-review-invalid");
 await expect(readCharacterDiscovery({ ...input, identity: { ...input.identity, eventId: "foreign" } }, f.repo)).rejects.toThrow("story-review-stale");
 await expect(readCharacterDiscovery({ ...input, guard: { ...page.guard, selectionVersion: 99 } }, f.repo)).rejects.toThrow("story-review-stale");
});
it("the compact content runtime view retains identity events and applies their alias without loading full revision bodies", async () => {
 const f = await fixture(), candidate = await f.discover(); await f.link(candidate.eventId);
 const raw = await f.repo.rawRecords(), records = storyProfileRecords(raw), binding = (await f.repo.list<ChatBinding>("binding")).find(b => b.chatId === f.scope.chatId)!;
 expect(records.some(e => e.type === "event" && e.characterIdentity?.alias === "Copper Courier")).toBe(true); expect(records.some(e => e.type === "revision")).toBe(false);
 expect(currentStoryProfileEntities(await f.repo.list("entity"), records, f.world.id, f.scope.chatId, binding.id).find(p => p.id === f.entities[0]!.id)!.aliases).toContain("Copper Courier");
});
it("checks target edits, ownership and final atomic guard without rewiring or copying values", async () => {
 const f = await fixture(), candidate = await f.discover(), person = f.entities[0]!;
 await f.repo.put("entity", { ...person, updatedAt: person.updatedAt + 1, description: "Manual author edit" }); let before = await f.repo.rawRecords();
 await expect(f.link(candidate.eventId)).rejects.toThrow("story-review-stale"); expect(await f.repo.rawRecords()).toEqual(before);
 await expect(f.link(candidate.eventId, { ...person, id: "foreign" })).rejects.toThrow("story-review-stale");
 const current = (await f.repo.get<SceneEntity>("entity", person.id))!, input = { ...f.scope, guard: (await f.read()).guard, eventId: candidate.eventId, name: candidate.name, background: "", accept: true, identity: { entityId: person.id, updatedAt: current.updatedAt } };
 await expect(approveCharacterDiscovery({ ...input, values: { appearance: "", personality: "", goals: "", background: "" } }, f.repo)).rejects.toThrow("story-review-invalid");
 await expect(approveCharacterDiscovery(input, f.repo, async () => { throw Error("scene-changed"); })).rejects.toThrow("scene-changed"); expect(await f.repo.rawRecords()).toEqual(before);
});
it("later approval belongs to that moment, alternatives remove and restore the same link; removal preserves the original candidate", async () => {
 const f = await fixture(), candidate = await f.discover();
 f.snapshot.messages.push(f.message("6", "4", "user", "Again."), f.message("7", "6", "assistant", "The courier waits."), f.message("8", "6", "assistant", "An alternative ending.")); f.snapshot.selectedNativeKey = key("7"); await f.play(); await f.link(candidate.eventId);
 expect((await f.visible())[0]!.aliases).toContain("Copper Courier");
 f.snapshot.selectedNativeKey = key("4"); await f.play(); expect((await f.visible())[0]!.aliases).not.toContain("Copper Courier");
 f.snapshot.selectedNativeKey = key("8"); await f.play(); expect((await f.visible())[0]!.aliases).not.toContain("Copper Courier");
 f.snapshot.selectedNativeKey = key("7"); await f.play(); expect((await f.visible())[0]!.aliases).toContain("Copper Courier");
 await approveCharacterDiscovery({ ...f.scope, guard: (await f.read()).guard, eventId: candidate.eventId, name: candidate.name, background: "", accept: false }, f.repo);
 expect((await f.visible())[0]!.aliases).not.toContain("Copper Courier"); expect((await f.read()).candidates[0]).toMatchObject({ added: false, name: candidate.name }); assertStoryGraph(await f.repo.rawRecords());
});
it("author name edits and later alias collisions invalidate only borrowed aliases, never the saved author fields", async () => {
 const f = await fixture(), candidate = await f.discover(); await f.link(candidate.eventId);
 const other = f.entities[1]!; await f.repo.put("entity", { ...other, aliases: ["Copper Courier"], updatedAt: other.updatedAt + 1 });
 expect((await f.visible()).find(p => p.id === f.entities[0]!.id)!.aliases).not.toContain("Copper Courier"); expect((await f.visible()).find(p => p.id === other.id)!.aliases).toContain("Copper Courier");
 await f.repo.put("entity", { ...f.entities[0]!, name: "Author renamed this person", updatedAt: f.entities[0]!.updatedAt + 1 }); expect((await f.visible()).find(p => p.id === f.entities[0]!.id)!.name).toBe("Author renamed this person"); expect((await f.visible()).find(p => p.id === f.entities[0]!.id)!.aliases).not.toContain("Copper Courier");
});
it("refuses a shared alias and does not silently merge two known cards", async () => {
 const f = await fixture(), candidate = await f.discover(), other = f.entities[1]!; await f.repo.put("entity", { ...other, aliases: [candidate.name], updatedAt: other.updatedAt + 1 });
 const before = await f.repo.rawRecords(); await expect(f.link(candidate.eventId)).rejects.toThrow("identity-ambiguous"); expect(await f.repo.rawRecords()).toEqual(before);
});
it("a distinct known name remains a proposal and the profile uses only its distinguishing seed quote", async () => {
 const quote = "Resident 1, a different courier, brought a letter.", f = await fixture(quote + " Resident 1 the original resident has blue eyes.");
 const candidate = await f.discover("Resident 1", quote, true); expect(candidate).toMatchObject({ distinct: true, added: false });
 const page = await f.read(), input = { ...f.scope, guard: page.guard, eventId: candidate.eventId, name: "Resident 1 the courier", values: { appearance: "", personality: "", goals: "", background: quote } };
 const brief = await prepareDiscoveryProfile(input, "field_" + crypto.randomUUID(), "en", f.repo); expect(brief.sources).toHaveLength(1); expect(brief.sources[0]!.text).toBe(quote); expect(brief.prompt).not.toContain("blue eyes"); expect(brief.partial).toBe(true);
 await approveCharacterDiscovery({ ...input, background: quote, accept: true }, f.repo);
 const separate = (await f.repo.list<SceneEntity>("entity")).find(p => p.name === input.name)!; expect(separate.aliases).toEqual([]); expect(separate.id).not.toBe(f.entities[0]!.id); assertStoryGraph(await f.repo.rawRecords());
});
it("fresh checkpoints inherit the explicit alias as a local seed, not world canon, and encrypted backup preserves it", async () => {
 const f = await fixture(), candidate = await f.discover(); await f.link(candidate.eventId); await f.play("restart"); expect((await f.visible())[0]!.aliases).toContain("Copper Courier"); expect((await f.repo.get<SceneEntity>("entity", f.entities[0]!.id))!.aliases).not.toContain("Copper Courier");
 await f.repo.enableVault("synthetic identity vault"); const payload = await parseBackup(JSON.stringify(await createBackup("synthetic identity backup", f.repo)), "synthetic identity backup");
 const db = new DeepRoleDatabase("identity-copy-" + crypto.randomUUID()); dbs.push(db); const copy = new DeepRoleRepository(db); await restoreBackup(payload, "replace", copy); expect(await copy.rawRecords()).toEqual(await f.repo.rawRecords()); assertStoryGraph(await copy.rawRecords());
});
it("controls inherited names before a new turn without changing world aliases or frozen requests", async () => {
 const f = await fixture(), candidate = await f.discover(); await f.link(candidate.eventId); await f.play("restart");
 const page = await readStoryIdentities({ ...f.scope, offset: 0 }, f.repo), row = page.rows[0]!, binding = (await f.repo.list<ChatBinding>("binding")).find(b => b.chatId === f.scope.chatId)!;
 expect(row).toMatchObject({ inherited: true, status: "active" });
 const request = await prepareStoryRequest(page.guard.branchId, { id: "frozen-identity", purpose: "user-turn", bindingId: binding.id, identity: { chatId: f.scope.chatId, nativeParentKey: f.snapshot.selectedNativeKey }, parentRevisionId: null, expectedHeadRevisionId: null, expectedSelectionVersion: page.guard.selectionVersion, expectedSceneRevision: binding.characterScenes![f.world.id]!.revision }, f.repo);
 await approveStoryIdentity({ ...f.scope, offset: 0, guard: page.guard, reference: row.reference, expectedUpdatedAt: row.updatedAt, enabled: false }, f.repo);
 expect((await f.visible()).find(p => p.id === row.reference.entityId)!.aliases).not.toContain(row.reference.alias);
 expect(await f.repo.get("story", request.id)).toEqual(request); assertStoryGraph(await f.repo.rawRecords());
 const updated = await readStoryIdentities({ ...f.scope, offset: 0 }, f.repo);
 await expect(approveStoryIdentity({ ...f.scope, offset: 0, guard: page.guard, reference: row.reference, expectedUpdatedAt: row.updatedAt, enabled: true }, f.repo)).rejects.toThrow("story-review-stale");
 await approveStoryIdentity({ ...f.scope, offset: 0, guard: updated.guard, reference: row.reference, expectedUpdatedAt: row.updatedAt, enabled: true }, f.repo);
 expect((await f.visible()).find(p => p.id === row.reference.entityId)!.aliases).toContain(row.reference.alias);
});
it("overlays do not cross worlds/chats or choose the first claimant when two imported links collide", async () => {
 const f = storyWorld("en", 3), first = f.entities[0]!, second = f.entities[1]!;
 const make = (p: SceneEntity, id: string): StoryEvent => ({ format: "deeprole-story", contractVersion: 1, type: "event", id, worldId: f.world.id, playthroughId: "play", branchId: "branch", createdAt: 1, updatedAt: 1, revisionId: "reply", ordinal: 0, disposition: "candidate", label: "Identity", quote: "Courier arrived.", participantIds: [], changes: [], characterIdentity: { entityId: p.id, alias: "Courier", canonical: identityCanonical(p) } });
 const events = [make(first, "link-a"), make(second, "link-b")], visible = storyIdentityEntities(f.entities, events, ["link-a", "link-b"], f.world.id, f.binding.chatId);
 expect(visible.every(p => !p.aliases.includes("Courier"))).toBe(true);
 expect(storyIdentityEntities(f.entities, [events[0]!], ["link-a"], "foreign", f.binding.chatId)).toEqual(f.entities);
 const local = { ...first, playthroughChatId: "other-chat" }; expect(storyIdentityEntities([local], [events[0]!], ["link-a"], f.world.id, f.binding.chatId)).toEqual([local]);
});
