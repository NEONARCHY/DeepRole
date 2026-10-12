import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import { EMPTY_STATUS, characterRevision, characterInChat } from "../src/core/characters";
import { nativeStoryMessageKey as key } from "../src/core/story-transport";
import { assertStoryGraph, type StoryBranch, type StoryRecord } from "../src/core/story-records";
import type { StoryGameSnapshot } from "../src/core/story-game";
import type { ChatBinding, SceneEntity } from "../src/core/types";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { runStoryGame, markNonStoryMessage } from "../src/storage/story-game";
import { readStoryReview } from "../src/storage/story-review";
import { planLegacyStory } from "../src/storage/story-history";
import type { StoryDispatchCapture } from "../src/core/story-dispatch-capture";
import { prepareDispatchCapture, confirmDispatchCapture, advanceDispatchCapture } from "../src/storage/story-dispatch-capture";
import { archiveStoryPhoto } from "../src/storage/story-effect-replay";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { exportWorld } from "../src/storage/worlds";
import { storyWorld } from "./fixtures/story-worlds";
const databases: DeepRoleDatabase[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(databases.splice(0).map(d => d.delete())); });
async function setup() {
  const f = storyWorld(), db = new DeepRoleDatabase("game-" + crypto.randomUUID()); databases.push(db);
  const repo = new DeepRoleRepository(db); await repo.mergeRecords(f.records);
  const message = (id: string, parent: string | null, role: "user" | "assistant", content: string) => ({ identity: { role, nativeMessageKey: key(id), nativeParentKey: parent === null ? null : key(parent) }, completion: "complete" as const, content });
  const snapshot: StoryGameSnapshot = { chatId: f.binding.chatId, selectedNativeKey: key("2"), messages: [message("1", null, "user", "Start"), message("2", "1", "assistant", "The workshop opens.")] };
  const play = async (operation: import("../src/core/story-game").StoryGameInput["operation"] = "sync", parent: string | null = null, manual: "stop" | "keep" = "stop") => {
    const current = (await repo.list<ChatBinding>("binding")).find(b => b.chatId === f.binding.chatId)!, persons = (await repo.list<SceneEntity>("entity")).filter(p => characterInChat(p, f.binding.chatId));
    return runStoryGame({ chatId: f.binding.chatId, worldId: f.world.id, expectedBase: characterRevision(persons, current.characterScenes?.[f.world.id]), snapshot, operation, nativeParentKey: parent, manual }, DEFAULT_SETTINGS, repo);
  };
  const answer = (id: string, user: string, condition: string, create = false, chatId = f.binding.chatId) => {
    const updates = [{ id: "person-1", state: { ...EMPTY_STATUS, condition } }, ...(create ? [{ id: "new:Visitor", name: "Visitor", state: { ...EMPTY_STATUS, condition: "At the door" } }] : [])];
    return message(id, user, "assistant", `${condition}.\n<deeprole_characters>${JSON.stringify({ world: f.world.id, chat: chatId, base: "unused", present: ["person-1", ...(create ? ["new:Visitor"] : [])], updates })}</deeprole_characters>`);
  };
  const scene = async () => (await repo.list<ChatBinding>("binding")).find(b => b.chatId === f.binding.chatId)!.characterScenes![f.world.id]!;
  return { ...f, repo, db, snapshot, message, play, answer, scene };
}
describe("working selected story", () => {
  it("starts explicitly, follows two consecutive turns, reloads and is idempotent", async () => {
    const f = await setup(); await f.play("start");
    f.snapshot.messages.push(f.message("3", "2", "user", "Give the key"), f.answer("4", "3", "Key delivered")); f.snapshot.selectedNativeKey = key("4");
    await f.play(); expect((await f.scene()).states["person-1"]!.condition).toBe("Key delivered");
    f.snapshot.messages.push(f.message("5", "4", "user", "Open the gate"), f.answer("6", "5", "Gate open")); f.snapshot.selectedNativeKey = key("6");
    await f.play(); expect((await f.scene()).states["person-1"]!.condition).toBe("Gate open");
    const before = await f.repo.rawRecords(); await f.play(); expect(await f.repo.rawRecords()).toEqual(before); assertStoryGraph(before);
    f.db.close(); await f.db.open(); await f.play(); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("three alternatives, early edit and return remove dependent states and created profiles", async () => {
    const f = await setup(); await f.play("start");
    f.snapshot.messages.push(f.message("3", "2", "user", "Choose"), f.answer("4", "3", "A", true), f.answer("5", "3", "B"), f.answer("6", "3", "C"));
    f.snapshot.selectedNativeKey = key("4"); await f.play(); const visitor = (await f.repo.list<SceneEntity>("entity")).find(e => e.name === "Visitor")!; expect(visitor).toBeDefined();
    f.snapshot.messages.push(f.message("7", "4", "user", "Next"), f.answer("8", "7", "Later")); f.snapshot.selectedNativeKey = key("8"); await f.play();
    for (const id of ["5", "6", "4"]) { f.snapshot.selectedNativeKey = key(id); await f.play(); expect((await f.scene()).states["person-1"]!.condition).toBe(id === "5" ? "B" : id === "6" ? "C" : "A"); }
    expect(await f.repo.get("entity", visitor.id)).toEqual(visitor);
    f.snapshot.messages.push(f.message("9", "2", "user", "Edited choice"), f.answer("10", "9", "Edited")); f.snapshot.selectedNativeKey = key("10"); await f.play();
    expect((await f.scene()).states["person-1"]!.condition).toBe("Edited"); expect(await f.repo.get("entity", visitor.id)).toBeNull();
    f.snapshot.selectedNativeKey = key("8"); await f.play(); expect((await f.scene()).states["person-1"]!.condition).toBe("Later"); expect(await f.repo.get("entity", visitor.id)).toEqual(visitor);
  });
  it("prepares state before a parent, not the cancelled future", async () => {
    const f = await setup(); await f.play("start"); f.snapshot.messages.push(f.message("3", "2", "user", "Act"), f.answer("4", "3", "Future")); f.snapshot.selectedNativeKey = key("4"); await f.play();
    await f.play("parent", key("2")); expect((await f.scene()).states["person-1"]!.condition).toBe("In the workshop.");
    await f.play(); expect((await f.scene()).states["person-1"]!.condition).toBe("Future");
  });
  it("pauses without writes for unknown ancestry and incomplete selected reply", async () => {
    const f = await setup(); await f.play("start"); const before = await f.repo.rawRecords();
    f.snapshot.messages.push(f.message("3", "missing", "user", "Unknown"), f.answer("4", "3", "Bad")); f.snapshot.selectedNativeKey = key("4");
    await expect(f.play()).rejects.toThrow("story-native-line-unavailable"); expect(await f.repo.rawRecords()).toEqual(before);
    f.snapshot.messages[2]!.identity.nativeParentKey = key("2"); f.snapshot.messages[3]!.completion = "interrupted";
    await expect(f.play()).rejects.toThrow("story-source-incomplete"); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("keeps sources without a character block, without inventing changes", async () => {
    const f = await setup(); await f.play("start"); f.snapshot.messages.push(f.message("3", "2", "user", "Question"), f.message("4", "3", "assistant", "Plain reply")); f.snapshot.selectedNativeKey = key("4"); await f.play();
    expect((await f.scene()).states["person-1"]!.condition).toBe("In the workshop."); const story = await f.repo.list<StoryRecord>("story"); expect(story.filter(r => r.type === "event")).toHaveLength(0); expect((story.find(r => r.type === "branch") as StoryBranch).headRevisionId).not.toBeNull();
  });
  it("a new reply cannot update sheets when the user has disabled that feature", async () => {
    const f = await setup(); await f.play("start"); f.snapshot.messages.push(f.message("3", "2", "user", "Act"), f.answer("4", "3", "Must not apply")); f.snapshot.selectedNativeKey = key("4");
    await runStoryGame({ chatId: f.binding.chatId, worldId: f.world.id, expectedBase: characterRevision(f.entities, await f.scene()), operation: "sync", snapshot: f.snapshot, nativeParentKey: null, manual: "stop" }, { ...DEFAULT_SETTINGS, characterSheetsEnabled: false }, f.repo);
    expect((await f.scene()).states["person-1"]!.condition).toBe("In the workshop.");
    const story = await f.repo.list<StoryRecord>("story"); expect(story.filter(r => r.type === "revision")).toHaveLength(2); expect(story.filter(r => r.type === "event")).toHaveLength(0);
  });
  it("pauses for a manual edit and preserves only its delta after explicit confirmation", async () => {
    const f = await setup(); await f.play("start"); f.snapshot.messages.push(f.message("3", "2", "user", "Act"), f.answer("4", "3", "A"), f.answer("5", "3", "B")); f.snapshot.selectedNativeKey = key("4"); await f.play();
    const binding = (await f.repo.list<ChatBinding>("binding"))[0]!;
    binding.characterScenes![f.world.id]!.states["person-1"]!.goal = "My custom goal"; binding.characterScenes![f.world.id]!.revision = "manual-revision"; await f.repo.put("binding", binding);
    const before = await f.repo.rawRecords(); f.snapshot.selectedNativeKey = key("5");
    await expect(f.play()).rejects.toThrow("story-manual-conflict"); expect(await f.repo.rawRecords()).toEqual(before);
    await f.play("sync", null, "keep"); expect((await f.scene()).states["person-1"]).toMatchObject({ condition: "B", goal: "My custom goal" });
    const once = await f.repo.rawRecords(); await f.play(); expect(await f.repo.rawRecords()).toEqual(once);
  });
  it("undo survives a rescan/reload and resumes only explicitly", async () => {
    const f = await setup(); await f.play("start"); f.snapshot.messages.push(f.message("3", "2", "user", "Act"), f.answer("4", "3", "A")); f.snapshot.selectedNativeKey = key("4"); await f.play();
    await f.play("undo"); expect((await f.scene()).states["person-1"]!.condition).toBe("In the workshop.");
    const before = await f.repo.rawRecords(); f.db.close(); await f.db.open(); await expect(f.play()).rejects.toThrow("story-game-paused"); expect(await f.repo.rawRecords()).toEqual(before);
    expect((await readStoryReview({ chatId: f.binding.chatId, worldId: f.world.id, cursor: null }, f.repo)).paused).toBe(true);
    await f.play("resume"); expect((await f.scene()).states["person-1"]!.condition).toBe("A"); await f.play();
    expect((await f.repo.list<StoryRecord>("story")).filter(r => r.type === "event")).toHaveLength(1);
  });
  it("an edit prepares the exact user's parent, not the latest descendant", async () => {
    const f = await setup(); await f.play("start"); f.snapshot.messages.push(f.message("3", "2", "user", "Act"), f.answer("4", "3", "A"), f.message("5", "4", "user", "Again"), f.answer("6", "5", "Future")); f.snapshot.selectedNativeKey = key("6"); await f.play();
    await f.play("edit", key("3")); expect((await f.scene()).states["person-1"]!.condition).toBe("In the workshop.");
    await f.play(); expect((await f.scene()).states["person-1"]!.condition).toBe("Future");
  });
  it("two tabs cannot write through a stale base and navigation rolls back the transaction", async () => {
    const f = await setup(); await f.play("start"); f.snapshot.messages.push(f.message("3", "2", "user", "Act"), f.answer("4", "3", "A")); f.snapshot.selectedNativeKey = key("4");
    const binding = (await f.repo.list<ChatBinding>("binding"))[0]!;
    const input = { chatId: binding.chatId, worldId: f.world.id, expectedBase: characterRevision(f.entities, await f.scene()), snapshot: f.snapshot, operation: "sync" as const, nativeParentKey: null, manual: "stop" as const };
    const results = await Promise.allSettled([runStoryGame(input, DEFAULT_SETTINGS, f.repo), runStoryGame(input, DEFAULT_SETTINGS, new DeepRoleRepository(f.db))]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect((await f.repo.list<StoryRecord>("story")).filter(r => r.type === "event")).toHaveLength(1);
    const before = await f.repo.rawRecords(); f.snapshot.messages.push(f.message("5", "4", "user", "Next"), f.answer("6", "5", "B")); f.snapshot.selectedNativeKey = key("6");
    await expect(runStoryGame({ ...input, expectedBase: characterRevision(f.entities, await f.scene()), snapshot: f.snapshot }, DEFAULT_SETTINGS, f.repo, async () => { throw Error("navigated"); })).rejects.toThrow("navigated"); expect(await f.repo.rawRecords()).toEqual(before);
  });
  it("starts from today's scene without overwriting an older inert checkpoint", async () => {
    const f = await setup(); const checkpoint = planLegacyStory(await f.repo.rawRecords(), { worldId: f.world.id, bindingId: f.binding.id }); await f.repo.mergeRecords(checkpoint.records);
    const binding = (await f.repo.list<ChatBinding>("binding"))[0]!; binding.characterScenes![f.world.id]!.states["person-1"]!.condition = "Today"; binding.characterScenes![f.world.id]!.revision = "today"; await f.repo.put("binding", binding);
    await f.play("start"); expect((await f.scene()).states["person-1"]!.condition).toBe("Today");
    const story = await f.repo.list<StoryRecord>("story"); expect(story.filter(r => r.type === "baseline")).toHaveLength(2); for (const row of checkpoint.records) expect(await f.repo.get("story", row.id)).toEqual(row.data);
    await f.play("restart"); expect((await f.repo.list<StoryRecord>("story")).filter(r => r.type === "baseline")).toHaveLength(3);
  });
  it("new profiles stay in their playthrough and review hides the technical JSON", async () => {
    const f = await setup(); await f.play("start"); f.snapshot.messages.push(f.message("3", "2", "user", "Act"), f.answer("4", "3", "A", true)); f.snapshot.selectedNativeKey = key("4"); await f.play();
    const visitor = (await f.repo.list<SceneEntity>("entity")).find(p => p.name === "Visitor")!; expect(characterInChat(visitor, f.binding.chatId)).toBe(true); expect(characterInChat(visitor, "another-chat")).toBe(false);
    const review = await readStoryReview({ chatId: f.binding.chatId, worldId: f.world.id, cursor: null }, f.repo); expect(review.entries.find(e => e.role === "assistant")!.content).toBe("A.");
    expect((await f.repo.list<StoryRecord>("story")).filter(r => r.type === "revision").some(r => r.type === "revision" && r.content.includes("<deeprole_characters>"))).toBe(true);
    const marked = await markNonStoryMessage(f.binding.chatId, f.world.id, f.repo); expect(marked.marked).toBe(true); expect((await readStoryReview({ chatId: f.binding.chatId, worldId: f.world.id, cursor: null }, f.repo)).nextOutOfCharacter).toBe(true);
    expect((await markNonStoryMessage(f.binding.chatId, f.world.id, f.repo)).marked).toBe(false);
  });
  it("unknown old statuses do not block a new starting point", async () => {
    const f = await setup(); f.snapshot.messages[0]!.completion = "interrupted"; await f.play("start");
    f.snapshot.messages.push(f.message("3", "2", "user", "Act"), f.answer("4", "3", "A")); f.snapshot.selectedNativeKey = key("4"); await f.play(); expect((await f.scene()).states["person-1"]!.condition).toBe("A");
  });
  it("the explicitly marked off-topic exchange is saved but never changes the scene", async () => {
    const f = await setup(); await f.play("start"); await markNonStoryMessage(f.binding.chatId, f.world.id, f.repo);
    const binding = (await f.repo.list<ChatBinding>("binding"))[0]!, id = crypto.randomUUID();
    const identity = { chatId: binding.chatId, nativeParentKey: key("2") }, route = { requestId: id, identity, transport: "xhr" as const };
    await prepareDispatchCapture({ id, worldId: f.world.id, bindingId: binding.id, identity, transport: "xhr", sceneRevision: (await f.scene()).revision, originalDraft: "Explain the rules", proposedContext: "PRIVATE_CONTEXT" }, 7, f.repo);
    const wireText = "PRIVATE_CONTEXT\n\n[User message]\nExplain the rules";
    await confirmDispatchCapture({ ...route, outgoingText: wireText }, 7, f.repo); await advanceDispatchCapture({ ...route, phase: "started" }, 7, f.repo); await advanceDispatchCapture({ ...route, phase: "settled", delivery: { status: "accepted", httpStatus: 200 } }, 7, f.repo);
    const link = { requestId: id, chatId: binding.chatId, nativeParentKey: key("2"), userMessageKey: key("3"), assistantMessageKey: key("4") };
    await advanceDispatchCapture({ ...route, phase: "ready", link, sawFinish: false, issue: null }, 7, f.repo); await advanceDispatchCapture({ ...route, phase: "closed", link, sawFinish: true, issue: null }, 7, f.repo);
    f.snapshot.messages.push(f.message("3", "2", "user", wireText), f.answer("4", "3", "NOT STORY")); f.snapshot.selectedNativeKey = key("4"); await f.play();
    expect((await f.scene()).states["person-1"]!.condition).toBe("In the workshop."); expect((await f.repo.list<StoryRecord>("story")).filter(r => r.type === "event")).toHaveLength(0);
    expect((await f.repo.list<StoryRecord>("story")).filter(r => r.type === "revision").map(r => r.type === "revision" ? r.storyPurpose : null)).toEqual(["out-of-character", "out-of-character"]);
    expect((await f.repo.get<ChatBinding>("binding", binding.id))!.nextStoryMessageMode).toBeUndefined();
  });
  it("only a fresh native send can queue a paid photo, and replay never queues it again", async () => {
    const f = await setup(); await f.play("start"); const binding = (await f.repo.list<ChatBinding>("binding"))[0]!, id = crypto.randomUUID(), now = Date.now();
    const capture: StoryDispatchCapture = { format: "deeprole-story-dispatch", contractVersion: 1, id, bindingId: binding.id, worldId: f.world.id, ownerTabId: 7, origin: "local", purpose: "user-turn", transport: "xhr", sceneRevision: (await f.scene()).revision, identity: { chatId: binding.chatId, nativeParentKey: key("2") }, originalDraft: "Send me a selfie", proposedContext: "", injection: "none", started: true, delivery: { status: "accepted", httpStatus: 200 }, wire: { phase: "closed", link: { requestId: id, chatId: binding.chatId, nativeParentKey: key("2"), userMessageKey: key("3"), assistantMessageKey: key("4") }, sawFinish: true, issue: null }, createdAt: now, updatedAt: now };
    await f.repo.put("dispatch", capture);
    const text = 'Resident sent a selfie.\n<deeprole_characters>' + JSON.stringify({ world: f.world.id, chat: binding.chatId, base: "ignored", request: id, present: ["person-1", "person-2"], updates: [], selfies: [{ id: "person-2", category: "generated", quote: "Resident sent a selfie.", scene: "Adult resident in a gray coat in the workshop." }] }) + '</deeprole_characters>';
    f.snapshot.messages.push(f.message("3", "2", "user", capture.originalDraft), f.message("4", "3", "assistant", text)); f.snapshot.selectedNativeKey = key("4");
    const permission = { ownerTabId: 7, enabled: true, receipt: { id, worldId: f.world.id, chatId: binding.chatId, base: characterRevision(f.entities, await f.scene()), createdAt: now, accepted: true, generatedSelfiesEnabled: true } };
    await runStoryGame({ chatId: binding.chatId, worldId: f.world.id, expectedBase: characterRevision(f.entities, await f.scene()), snapshot: f.snapshot, operation: "sync", nativeParentKey: null, manual: "stop" }, DEFAULT_SETTINGS, f.repo, undefined, permission);
    const queued = (await f.repo.list<ChatBinding>("binding"))[0]!.scenePhotos![0]!; expect(queued.generation!.status).toBe("queued");
    await f.play("undo"); expect((await f.repo.list<ChatBinding>("binding"))[0]!.scenePhotos).toEqual([]);
    await f.play("resume"); const expired = (await f.repo.list<ChatBinding>("binding"))[0]!.scenePhotos![0]!; expect(expired.generation!.status).toBe("failed"); expect(expired.generation!.error).toBe("expired");
    const ready = { ...expired, generation: { ...expired.generation!, status: "ready" as const, illustrationId: "synthetic-ready-photo" } };
    const current = (await f.repo.list<ChatBinding>("binding"))[0]!; current.scenePhotos = [ready]; await f.repo.put("binding", current); await f.repo.mergeRecords(archiveStoryPhoto(await f.repo.rawRecords(), ready));
    await f.play("undo"); await f.play("resume"); expect((await f.repo.list<ChatBinding>("binding"))[0]!.scenePhotos![0]!.generation!.status).toBe("ready");
  });
  it("restores a full playable backup and a portable world does not keep an old chat restriction", async () => {
    const f = await setup(); await f.play("start"); f.snapshot.messages.push(f.message("3", "2", "user", "Act"), f.answer("4", "3", "A", true)); f.snapshot.selectedNativeKey = key("4"); await f.play();
    const saved = await createBackup("test-password", f.repo), restored = await parseBackup(JSON.stringify(saved), "test-password");
    const db = new DeepRoleDatabase("game-restored-" + crypto.randomUUID()); databases.push(db); const repo = new DeepRoleRepository(db); await restoreBackup(restored, "replace", repo);
    assertStoryGraph(await repo.rawRecords()); expect((await repo.list<ChatBinding>("binding"))[0]!.characterScenes![f.world.id]!.states["person-1"]!.condition).toBe("A");
    const portable = await exportWorld(f.world.id, f.repo); expect(portable.records.filter(r => r.kind === "entity").every(r => !(r.data as SceneEntity).playthroughChatId)).toBe(true);
  });
  it("two chats of the same world keep independent scenes and generated people", async () => {
    const f = await setup(); await f.play("start"); f.snapshot.messages.push(f.message("3", "2", "user", "A"), f.answer("4", "3", "Scene A", true)); f.snapshot.selectedNativeKey = key("4"); await f.play();
    const binding: ChatBinding = { ...structuredClone(f.binding), id: "binding-b", chatId: "synthetic-b", chatUrl: "https://chat.deepseek.com/chat/s/synthetic-b" }; await f.repo.put("binding", binding);
    const snapshot = { chatId: binding.chatId, selectedNativeKey: key("2"), messages: [f.message("1", null, "user", "Begin B"), f.message("2", "1", "assistant", "Workshop B")] };
    const playB = async (operation: "start" | "sync") => { const current = (await f.repo.get<ChatBinding>("binding", binding.id))!; const persons = (await f.repo.list<SceneEntity>("entity")).filter(p => characterInChat(p, binding.chatId)); return runStoryGame({ chatId: binding.chatId, worldId: f.world.id, expectedBase: characterRevision(persons, current.characterScenes![f.world.id]), operation, snapshot, nativeParentKey: null, manual: "stop" }, DEFAULT_SETTINGS, f.repo); };
    await playB("start"); snapshot.messages.push(f.message("3", "2", "user", "B"), f.answer("4", "3", "Scene B", false, binding.chatId)); snapshot.selectedNativeKey = key("4"); await playB("sync");
    expect((await f.repo.get<ChatBinding>("binding", f.binding.id))!.characterScenes![f.world.id]!.states["person-1"]!.condition).toBe("Scene A"); expect((await f.repo.get<ChatBinding>("binding", binding.id))!.characterScenes![f.world.id]!.states["person-1"]!.condition).toBe("Scene B");
    await f.play("undo"); expect((await f.repo.get<ChatBinding>("binding", binding.id))!.characterScenes![f.world.id]!.states["person-1"]!.condition).toBe("Scene B");
  });
});
