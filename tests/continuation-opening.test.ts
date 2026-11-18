import { afterEach, expect, it } from "vitest";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { completeContinuation, savedMemoryContinuation } from "../src/storage/story-continuation";
import { captureWorldGame } from "../src/storage/world-game";
import { storyWorld } from "./fixtures/story-worlds";
import { automationMarker, captureStoryAutomation } from "../src/core/story-automation";
import { continuationPromptDigest } from "../src/core/continuation-recovery";
import { assembledPrompt } from "../src/core/request-injection";
import { formatMemoryContext } from "../src/core/context";
import { boundStory } from "../src/core/story-continuation";
import { handoffLocationHistory, handoffLocationReference } from "../src/core/handoff-location";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import { characterRevision } from "../src/core/characters";
import { runStoryGame } from "../src/storage/story-game";
import { readAutomationReview, resolveAutomationReview } from "../src/storage/story-automation-review";
import { nativeStoryMessageKey as key } from "../src/core/story-transport";
import type { StoryGameSnapshot } from "../src/core/story-game";
import { assertStoryGraph, validStoryRecord, type StoryRecord, type StoryRevision } from "../src/core/story-records";
import type { ChatBinding, WorldProfile } from "../src/core/types";

const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { await Promise.all(dbs.map(db => db.delete())); dbs.length = 0; });
const fact = "Mira stored the blue key in the metal drawer.";
const uncertain = "If the bell rings, Mira may lend the lantern.";
async function setup(mode: "automatic" | "review" = "automatic", initialFact = fact, initialScene?: string) {
  const f = storyWorld(); f.world.storyAutomation = { mode, revision: "policy" };
  f.world.sharedGame = captureWorldGame(f.records, f.world, f.binding);
  if (initialScene) f.world.sharedGame.recentStory = boundStory([{role: "assistant", text: initialScene}], "history");
  const db = new DeepRoleDatabase("opening-" + crypto.randomUUID()); dbs.push(db);
  const repo = new DeepRoleRepository(db);
  await repo.updateRecords(() => ({ records: f.records, removed: [], result: undefined }));
  const input = { worldId: f.world.id, chatId: f.binding.chatId, chatUrl: f.binding.chatUrl };
  const { preview } = await savedMemoryContinuation(input, undefined, repo);
  const { snapshot } = await savedMemoryContinuation(input, preview.version, repo);
  const original = "  I ask about the key.\n";
  const sceneContext = initialScene ? formatMemoryContext({entries: [], estimatedTokens: 0, omittedCount: 0}, snapshot) + "\n" : "";
  const prompt = assembledPrompt(original, sceneContext + "<deeprole_context>" + automationMarker(f.world) + "</deeprole_context>");
  const draft = { snapshotId: snapshot!.id, snapshotToken: "token", targetChatId: "target", requestId: "request", draft: original, promptDigest: await continuationPromptDigest(prompt), automation: captureStoryAutomation(f.world, f.entities) };
  const reply = initialFact + "\n" + uncertain + "\n<deeprole_characters>" + JSON.stringify({ version: 2, world: f.world.id, chat: "target", facts: [{ text: initialFact, quote: initialFact, kind: "event", risk: "ordinary" }, { text: uncertain, quote: uncertain, kind: "plan", risk: "uncertain" }] }) + "</deeprole_characters>";
  const history: StoryGameSnapshot = { chatId: "target", selectedNativeKey: key("2"), messages: [
    { identity: { role: "user", nativeMessageKey: key("1"), nativeParentKey: null }, content: prompt, completion: "complete" },
    { identity: { role: "assistant", nativeMessageKey: key("2"), nativeParentKey: key("1") }, content: reply, completion: "complete" },
  ] };
  return { f, db, repo, snapshot: snapshot!, draft, history, original, reply, opening: { draft, history, settings: DEFAULT_SETTINGS } };
}

it("recovers a pre-journal placement only from a delivered local checkpoint on the selected game lineage", async () => {
  const move = "Mira placed the lens in the velvet pouch.";
  const scene = "— I think she placed the lens on the bench.";
  const f = await setup("automatic", scene, move);
  await completeContinuation(f.snapshot, "target", f.repo, f.opening);
  const world = (await f.repo.get<WorldProfile>("world", f.f.world.id))!;
  const fromHome = {fromHome: true as const, worldId: world.id};
  const {preview} = await savedMemoryContinuation(fromHome, undefined, f.repo);
  const {snapshot} = await savedMemoryContinuation(fromHome, preview.version, f.repo);
  const records = await f.repo.list<StoryRecord>("story");
  const saved = (await f.repo.list<typeof f.snapshot>("snapshot")).find(s => s.id === f.snapshot.id)!;
  const query = "Where is the lens?";
  const found = handoffLocationHistory(records, [saved], world, snapshot);
  expect(found.map(p => p.text)).toEqual([move]);
  const reference = handoffLocationReference(scene, query, found);
  expect(reference.indexOf(move)).toBeGreaterThan(reference.indexOf(scene));
  const fullScene = "The light in the workshop is warm. ".repeat(50) + "\n\nThe evening is quiet.";
  const bounded = handoffLocationReference(fullScene, query, found);
  expect(bounded).toContain(move);
  expect(bounded).toContain("The evening is quiet.");
  expect(bounded.length).toBeLessThanOrEqual(1600);
  expect(handoffLocationReference(scene, "Where is the atlas?", found)).toBe(scene);
  for (const checkpoint of [{...saved, appliedAt: undefined}, {...saved, targetChatId: "other"}, {...saved, summary: scene}, {...saved, savedMemory: undefined}]) {
    expect(handoffLocationHistory(records, [checkpoint], world, snapshot)).toEqual([]);
  }
  expect(handoffLocationHistory(records, [saved], world, {...snapshot!, sharedGameRevision: "stale"})).toEqual([]);
  expect(handoffLocationHistory(records, [saved], {...world, sharedGame: {...world.sharedGame!, id: "other-game"}}, snapshot)).toEqual([]);
});

it.each(["automatic", "review"] as const)("atomically records a recovered first pair once in %s mode", async mode => {
  const f = await setup(mode);
  await completeContinuation(f.snapshot, "target", f.repo, f.opening);
  const story = await f.repo.list<StoryRecord>("story");
  expect(story.filter(r => r.type === "revision").map(r => r.content).sort()).toEqual([f.original, f.reply].sort());
  const game = (await f.repo.get<WorldProfile>("world", f.f.world.id))!.sharedGame!;
  expect(game.facts.map(f => f.text)).toEqual(mode === "automatic" ? [fact] : []);
  expect(game.pendingReviewIds).toHaveLength(mode === "automatic" ? 1 : 2);
  expect((await f.repo.get("snapshot", f.snapshot.id)) as any).toHaveProperty("appliedAt");
  const saved = await f.repo.rawRecords();
  await completeContinuation(f.snapshot, "target", f.repo, f.opening);
  expect(await f.repo.rawRecords()).toEqual(saved);
  const binding = (await f.repo.get<ChatBinding>("binding", "binding:target"))!;
  await runStoryGame({ operation: "sync", chatId: "target", worldId: f.f.world.id,
    expectedBase: characterRevision(f.f.entities, binding.characterScenes?.[f.f.world.id]),
    snapshot: f.history, nativeParentKey: null, manual: "stop" }, DEFAULT_SETTINGS, f.repo);
  expect(await f.repo.rawRecords()).toEqual(saved);
});
it("commits pending memory choices with the accepted turn without rewriting lore or the source binding", async () => {
  const f = await setup(), before = await f.repo.rawRecords(), choice = { includedIds: [], excludedIds: [f.f.entry.id] };
  const stale = { ...f.snapshot, sharedGameRevision: "wrong" };
  await expect(completeContinuation(stale, "target", f.repo, f.opening, undefined, choice)).rejects.toThrow("handoff-conflict");
  expect(await f.repo.rawRecords()).toEqual(before);
  await completeContinuation(f.snapshot, "target", f.repo, f.opening, undefined, choice);
  expect((await f.repo.get<WorldProfile>("world", f.f.world.id))!.sharedGame!.memoryOverrides).toEqual(choice);
  expect((await f.repo.get<ChatBinding>("binding", "binding:target"))!.memoryOverrides).toEqual(choice);
  const protectedRows = (rows: typeof before) => rows.filter(r => r.kind === "entry" || r.kind === "entity" || r.kind === "binding" && r.id === f.f.binding.id);
  expect(protectedRows(await f.repo.rawRecords())).toEqual(protectedRows(before));
  const saved = await f.repo.rawRecords();
  await completeContinuation(f.snapshot, "target", f.repo, f.opening, undefined, { includedIds: [], excludedIds: [] });
  expect(await f.repo.rawRecords()).toEqual(saved);
});
it("accepts the exact saved snapshot after extension messaging reorders its keys", async () => {
  const f = await setup();
  const reordered = { ...Object.fromEntries(Object.entries(f.snapshot).reverse()) } as typeof f.snapshot;
  await expect(completeContinuation({ ...reordered, summary: "different scene" }, "target", f.repo, f.opening)).rejects.toThrow("handoff-conflict");
  await completeContinuation(reordered, "target", f.repo, f.opening);
  expect(await f.repo.get("binding", "binding:target")).toBeDefined();
});
it.each(["automatic", "review"] as const)("keeps first-segment facts and review while saving a second continuation in %s", async mode => {
  const sourceFact = "Nora placed the wooden seal inside the green drawer.";
  const f = await setup(mode, sourceFact);
  await completeContinuation(f.snapshot, "target", f.repo, f.opening);
  const world = (await f.repo.get<WorldProfile>("world", f.f.world.id))!, before = world.sharedGame!;
  const firstRecords = await f.repo.list<StoryRecord>("story");
  const input = { worldId: world.id, chatId: "target", chatUrl: "https://chat.deepseek.com/a/chat/s/target" };
  const { preview } = await savedMemoryContinuation(input, undefined, f.repo);
  expect(preview.scene).toBe(sourceFact + "\n" + uncertain);
  const { snapshot } = await savedMemoryContinuation(input, preview.version, f.repo);
  const nextFact = "Nora placed the blue ribbon inside the brass casket.", original = "I ask about the blue ribbon.";
  const prompt = assembledPrompt(original, "<deeprole_context>" + automationMarker(world) + "</deeprole_context>");
  const reply = nextFact + "\n<deeprole_characters>" + JSON.stringify({ version: 2, world: world.id, chat: "third", facts: [{ text: nextFact, quote: nextFact, kind: "event", risk: "ordinary" }] }) + "</deeprole_characters>";
  const draft = { ...f.draft, snapshotId: snapshot!.id, snapshotToken: "token-3", targetChatId: "third", requestId: "request-3", draft: original, promptDigest: await continuationPromptDigest(prompt) };
  const history = structuredClone(f.history); history.chatId = "third"; history.messages[0]!.content = prompt; history.messages[1]!.content = reply;
  await completeContinuation(snapshot!, "third", f.repo, { draft, history, settings: DEFAULT_SETTINGS });
  const after = (await f.repo.get<WorldProfile>("world", world.id))!.sharedGame!, review = await readAutomationReview({ worldId: world.id, chatId: "third", query: "" }, f.repo);
  expect(after.id).toBe(before.id); expect(after.activeChatId).toBe("third");
  expect(after.facts.map(f => f.text).sort(), JSON.stringify(review.items)).toEqual(mode === "automatic" ? [sourceFact, nextFact].sort() : []);
  expect(after.pendingReviewIds).toHaveLength(mode === "automatic" ? 1 : 3);
  for (const id of before.pendingReviewIds!) expect(after.pendingReviewIds).toContain(id);
  const story = await f.repo.list<StoryRecord>("story");
  for (const r of firstRecords.filter(r => r.type === "revision")) expect(story).toContainEqual(r);
  expect(story.filter(r => r.type === "revision")).toHaveLength(4); assertStoryGraph(await f.repo.rawRecords());
  const saved = await f.repo.rawRecords(); await completeContinuation(snapshot!, "third", f.repo, { draft, history, settings: DEFAULT_SETTINGS });
  expect(await f.repo.rawRecords()).toEqual(saved);
});
async function inheritedReview() {
  const f = await setup(); await completeContinuation(f.snapshot, "target", f.repo, f.opening);
  const oldPage = await readAutomationReview({ worldId: f.f.world.id, chatId: "target", query: "" }, f.repo);
  const input = { worldId: f.f.world.id, chatId: "target", chatUrl: "https://chat.deepseek.com/a/chat/s/target" };
  const { preview } = await savedMemoryContinuation(input, undefined, f.repo);
  const { snapshot } = await savedMemoryContinuation(input, preview.version, f.repo);
  const original = "I return to the workshop.", prompt = assembledPrompt(original, "<deeprole_context>" + automationMarker(f.f.world) + "</deeprole_context>");
  const draft = { ...f.draft, snapshotId: snapshot!.id, snapshotToken: "third-token", targetChatId: "third", requestId: "third-request", draft: original, promptDigest: await continuationPromptDigest(prompt) };
  const history = structuredClone(f.history); history.chatId = "third"; history.messages[0]!.content = prompt; history.messages[1]!.content = "Mira waits at the workshop.";
  await completeContinuation(snapshot!, "third", f.repo, { draft, history, settings: DEFAULT_SETTINGS });
  const page = await readAutomationReview({ worldId: f.f.world.id, chatId: "third", query: "" }, f.repo);
  expect(page.total).toBe(1); expect(page.items[0]!.id).toBe(oldPage.items[0]!.id);
  const decision = { chatId: "third", worldId: f.f.world.id, guard: page.guard, gameRevision: page.gameRevision, eventId: page.items[0]!.id, fields: [], entityId: null, name: "" };
  return { ...f, page, oldPage, decision, thirdHistory: history };
}
for (const accept of [true, false]) for (const fail of [false, true]) it(`inherited review ${accept ? "accept" : "dismiss"} ${fail ? "write failure and retry" : "direct"} stays resolved after replay`, async () => {
  const f = await inheritedReview(), before = await f.repo.rawRecords(), input = { ...f.decision, accept };
  const origin = (await f.repo.list<StoryRecord>("story")).find(r => r.id === input.eventId);
  if (fail) {
    const put = f.db.records.bulkPut.bind(f.db.records);
    (f.db.records as any).bulkPut = async (...args: any[]) => { await (put as any)(...args); throw Error("synthetic-review-write"); };
    try { await expect(resolveAutomationReview(input, f.repo)).rejects.toThrow("synthetic-review-write"); }
    finally { f.db.records.bulkPut = put; }
    expect(await f.repo.rawRecords()).toEqual(before);
    expect((await readAutomationReview({ worldId: input.worldId, chatId: input.chatId, query: "" }, f.repo)).items).toEqual(f.page.items);
  }
  await resolveAutomationReview(input, f.repo);
  const game = (await f.repo.get<WorldProfile>("world", input.worldId))!.sharedGame!;
  expect(game.facts.map(f => f.text).sort()).toEqual((accept ? [fact, uncertain] : [fact]).sort());
  expect(game.pendingReviewIds ?? []).toEqual([]); expect(game.reviewResolutions?.[input.eventId]).toBe(accept ? "saved" : "dismissed");
  const records = await f.repo.list<StoryRecord>("story"), resolutions = records.filter(r => r.type === "event" && r.originEventId === input.eventId);
  expect(resolutions).toHaveLength(1); expect(records.find(r => r.id === input.eventId)).toEqual(origin);
  expect(records.filter(r => r.type === "revision")).toHaveLength(4); assertStoryGraph(await f.repo.rawRecords());
  const saved = await f.repo.rawRecords();
  for (const staleAccept of [accept, !accept]) await expect(resolveAutomationReview({ ...input, accept: staleAccept }, f.repo)).rejects.toThrow("story-review-stale");
  expect(await f.repo.rawRecords()).toEqual(saved);
  f.db.close(); await f.db.open();
  const binding = (await f.repo.get<ChatBinding>("binding", "binding:third"))!;
  await runStoryGame({ operation: "sync", worldId: input.worldId, chatId: "third", snapshot: f.thirdHistory,
    expectedBase: characterRevision(f.f.entities, binding.characterScenes?.[input.worldId]), nativeParentKey: null, manual: "stop" }, DEFAULT_SETTINGS, f.repo);
  expect(await f.repo.rawRecords()).toEqual(saved);
});
it("inherited review cannot be resolved from the previous chat", async () => {
  const f = await inheritedReview(), before = await f.repo.rawRecords();
  await expect(resolveAutomationReview({ ...f.decision, chatId: "target", guard: f.oldPage.guard, gameRevision: f.oldPage.gameRevision, accept: true }, f.repo)).rejects.toThrow("story-game-inactive");
  expect(await f.repo.rawRecords()).toEqual(before);
});
it("concurrent inherited review decisions commit only once", async () => {
  const f = await inheritedReview();
  const outcomes = await Promise.allSettled([resolveAutomationReview({ ...f.decision, accept: true }, f.repo), resolveAutomationReview({ ...f.decision, accept: false }, f.repo)]);
  expect(outcomes.filter(x => x.status === "fulfilled")).toHaveLength(1);
  const rejected = outcomes.find(x => x.status === "rejected"); expect(rejected?.status === "rejected" && rejected.reason.message).toBe("story-review-stale");
  const events = (await f.repo.list<StoryRecord>("story")).filter(r => r.type === "event" && r.originEventId === f.decision.eventId);
  expect(events).toHaveLength(1); assertStoryGraph(await f.repo.rawRecords());
});
it.each(["partial", "wrong-text", "wrong-chat", "wrong-parent"])("rejects %s without a partial transfer or journal", async kind => {
  const f = await setup(), before = await f.repo.rawRecords();
  if (kind === "partial") f.history.messages[1]!.completion = "partial";
  if (kind === "wrong-text") f.history.messages[0]!.content += "x";
  if (kind === "wrong-chat") f.history.chatId = "other";
  if (kind === "wrong-parent") f.history.messages[1]!.identity.nativeParentKey = key("99");
  await expect(completeContinuation(f.snapshot, "target", f.repo, f.opening)).rejects.toThrow("handoff-opening-conflict");
  expect(await f.repo.rawRecords()).toEqual(before);
});
it("does not upgrade an old send when automation policy changes", async () => {
  const f = await setup();
  await f.repo.put("world", { ...f.f.world, storyAutomation: { mode: "automatic", revision: "new-policy" } });
  await completeContinuation(f.snapshot, "target", f.repo, f.opening);
  const game = (await f.repo.get<WorldProfile>("world", f.f.world.id))!.sharedGame!;
  expect(game.facts).toEqual([]); expect(game.pendingReviewIds).toHaveLength(2);
});
it("honors recording being paused while waiting", async () => {
  const f = await setup();
  await f.repo.put("world", { ...f.f.world, storyAutomation: { mode: "off", revision: "paused" } });
  await completeContinuation(f.snapshot, "target", f.repo, f.opening);
  expect((await f.repo.list<StoryRecord>("story")).filter(r => r.type === "revision")).toHaveLength(0);
});
it("rolls back transfer if the journal cannot be written, then retries exactly once", async () => {
  const f = await setup(), before = await f.repo.rawRecords();
  const fail = (_key: unknown, value: any) => { if (value.kind === "story" && value.data?.type === "revision") throw Error("journal-full"); };
  f.db.records.hook("creating", fail);
  await expect(completeContinuation(f.snapshot, "target", f.repo, f.opening)).rejects.toThrow("journal-full");
  expect(await f.repo.rawRecords()).toEqual(before);
  f.db.records.hook("creating").unsubscribe(fail);
  await completeContinuation(f.snapshot, "target", f.repo, f.opening);
  expect((await f.repo.list<StoryRecord>("story")).filter(r => r.type === "revision")).toHaveLength(2);
});
it("does not grant automation to legacy drafts without the pre-send policy", async () => {
  const f = await setup();
  delete f.draft.automation;
  await completeContinuation(f.snapshot, "target", f.repo, f.opening);
  const game = (await f.repo.get<WorldProfile>("world", f.f.world.id))!.sharedGame!;
  expect(game.facts).toEqual([]); expect(game.pendingReviewIds).toHaveLength(2);
});
it("keeps the native mapping valid through serialization but rejects changed scope or suffix", async () => {
  const f = await setup();
  await completeContinuation(f.snapshot, "target", f.repo, f.opening);
  const serialized = JSON.parse(JSON.stringify(await f.repo.rawRecords()));
  expect(() => assertStoryGraph(serialized)).not.toThrow();
  const user = (await f.repo.list<StoryRecord>("story")).find(r => r.type === "revision" && r.role === "user") as StoryRevision;
  expect(user.content).toBe(f.original);
  expect(user.continuationNativeContent).toBe(f.history.messages[0]!.content);
  expect(validStoryRecord({ ...user, role: "assistant" })).toBe(false);
  expect(validStoryRecord({ ...user, parentRevisionId: "parent" })).toBe(false);
  expect(validStoryRecord({ ...user, continuationNativeContent: user.continuationNativeContent + "changed" })).toBe(false);
  expect(validStoryRecord({ ...user, continuationNativeContent: "x".repeat(250_001) + "\n\n[User message]\n" + user.content })).toBe(false);
});
it("does not reuse the original draft or its automatic approvals for an edited native send", async () => {
  const f = await setup();
  await completeContinuation(f.snapshot, "target", f.repo, f.opening);
  f.history.messages[0]!.content = "Edited context\n" + f.history.messages[0]!.content;
  const binding = (await f.repo.get<ChatBinding>("binding", "binding:target"))!;
  await runStoryGame({ operation: "sync", chatId: "target", worldId: f.f.world.id,
    expectedBase: characterRevision(f.f.entities, binding.characterScenes?.[f.f.world.id]),
    snapshot: f.history, nativeParentKey: null, manual: "stop" }, DEFAULT_SETTINGS, f.repo);
  const revisions = (await f.repo.list<StoryRecord>("story")).filter(r => r.type === "revision");
  expect(revisions).toHaveLength(4);
  expect(revisions.some(r => r.content === f.history.messages[0]!.content && r.continuationNativeContent === undefined)).toBe(true);
  expect((await f.repo.get<WorldProfile>("world", f.f.world.id))!.sharedGame!.facts).toEqual([]);
});
it("rolls back if the destination changes before the final commit", async () => {
  const f = await setup(), before = await f.repo.rawRecords();
  await expect(completeContinuation(f.snapshot, "target", f.repo, f.opening, async () => { throw Error("navigated"); })).rejects.toThrow("navigated");
  expect(await f.repo.rawRecords()).toEqual(before);
});
it.each([true, false])("keeps the sent purpose when bracket mode changes (was OOC=%s)", async wasOoc => {
  const f = await setup();
  f.draft.draft = "[Where is the token?]";
  Object.assign(f.draft, { purpose: wasOoc ? "out-of-character" : "user-turn" });
  f.history.messages[0]!.content = assembledPrompt(f.draft.draft, "<deeprole_context>" + automationMarker(f.f.world) + "</deeprole_context>");
  f.draft.promptDigest = await continuationPromptDigest(f.history.messages[0]!.content);
  await f.repo.put("world", { ...f.f.world, bracketedOoc: !wasOoc });
  await completeContinuation(f.snapshot, "target", f.repo, f.opening);
  expect((await f.repo.list<StoryRecord>("story")).filter(r => r.type === "revision").map(r => r.storyPurpose)).toEqual([wasOoc ? "out-of-character" : "game", wasOoc ? "out-of-character" : "game"]);
  const game = (await f.repo.get<WorldProfile>("world", f.f.world.id))!.sharedGame!;
  expect(game.facts.map(f => f.text)).toEqual(wasOoc ? [] : [fact]);
  expect(game.pendingReviewIds ?? []).toHaveLength(wasOoc ? 0 : 1);
});
