import { afterEach, expect, it, vi } from "vitest";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { activateWorldGame } from "../src/storage/world-game";
import { runStoryGame } from "../src/storage/story-game";
import { captureContinuation, completeContinuation } from "../src/storage/story-continuation";
import { prepareDispatchCapture, confirmDispatchCapture, advanceDispatchCapture } from "../src/storage/story-dispatch-capture";
import { readStoryReview } from "../src/storage/story-review";
import { approveStoryFact } from "../src/storage/story-facts";
import { assertStoryGraph, type StoryBaseline, type StoryRecord } from "../src/core/story-records";
import { characterRevision } from "../src/core/characters";
import { nativeStoryMessageKey as key } from "../src/core/story-transport";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import { GAME_TIME_KEY, createStoryTimeReader } from "../src/core/story-time";
import { createEpisodeReader } from "../src/core/story-episodes";
import { storedRoleReader } from "../src/core/story-role-binding";
import { boundStory } from "../src/core/story-continuation";
import type { StoryFact } from "../src/core/story-update";
import type { ChatBinding, WorldProfile, Locale } from "../src/core/types";
import { storyWorld } from "./fixtures/story-worlds";

const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dbs.splice(0).map(db => db.delete())); });
async function fixture(locale: Locale) {
 const f = storyWorld(locale); f.entities[0]!.name = "Nora"; f.entities[1]!.name = "Mira";
 const db = new DeepRoleDatabase("long-continuation-" + crypto.randomUUID()); dbs.push(db);
 let repo = new DeepRoleRepository(db);
 await repo.mergeRecords(f.records);
 const world = async () => (await repo.get<WorldProfile>("world", f.world.id))!;
 const binding = async (chat = f.binding.chatId) => (await repo.list<ChatBinding>("binding")).find(b => b.chatId === chat)!;
 await activateWorldGame({ chatId: f.binding.chatId, chatUrl: f.binding.chatUrl, worldId: f.world.id, mode: "initialize", expectedRevision: null }, repo);
 const message = (id: number, parent: number | null, role: "user" | "assistant", content: string) => ({ identity: { nativeMessageKey: key(String(id)), nativeParentKey: parent === null ? null : key(String(parent)), role }, completion: "complete" as const, content });
 const native = { chatId: f.binding.chatId, selectedNativeKey: key("2"), messages: [message(1, null, "user", "Start"), message(2, 1, "assistant", "Workshop")] };
 const play = async (operation: "start" | "sync" = "sync") => {
  const b = await binding(); return runStoryGame({ chatId: b.chatId, worldId: f.world.id, operation, expectedBase: characterRevision(f.entities, b.characterScenes?.[f.world.id]), nativeParentKey: null, manual: "stop", snapshot: native }, DEFAULT_SETTINGS, repo);
 };
 await play("start");
 async function send(facts: StoryFact[]) {
  const b = await binding();
  // IDs come from our own synthetic sequence, never a live DeepSeek response.
  const last = native.messages.length, user = last + 1, assistant = last + 2;
  const requestId = crypto.randomUUID(), identity = { chatId: b.chatId, nativeParentKey: key(String(last)) }, route = { requestId, identity, transport: "xhr" as const };
  const proposedContext="<deeprole_context>Current roster</deeprole_context>", outgoingText=proposedContext+"\n\n[User message]\nContinue";
  await prepareDispatchCapture({ id: requestId, worldId: f.world.id, bindingId: b.id, identity, transport: "xhr", sceneRevision: b.characterScenes![f.world.id]!.revision, originalDraft: "Continue", proposedContext }, 7, repo);
  await confirmDispatchCapture({ ...route, outgoingText }, 7, repo);
  await advanceDispatchCapture({ ...route, phase: "started" }, 7, repo);
  await advanceDispatchCapture({ ...route, phase: "settled", delivery: { status: "accepted", httpStatus: 200 } }, 7, repo);
  await advanceDispatchCapture({ ...route, phase: "ready", link: { requestId, chatId: b.chatId, nativeParentKey: identity.nativeParentKey, userMessageKey: key(String(user)), assistantMessageKey: key(String(assistant)) }, sawFinish: false, issue: null }, 7, repo);
  const branch = (await readStoryReview({ chatId: b.chatId, worldId: f.world.id, cursor: null }, repo)).guard!.branchId;
  const answer = facts.map(f => f.quote).join("\n\n") + `<deeprole_characters>${JSON.stringify({ version: 2, world: f.world.id, chat: b.chatId, branch, facts })}</deeprole_characters>`;
  native.messages.push(message(user, last, "user", outgoingText), message(assistant, user, "assistant", answer)); native.selectedNativeKey = key(String(assistant)); await play();
  for (const fact of facts) {
   const review = await readStoryReview({ chatId: b.chatId, worldId: f.world.id, cursor: null }, repo);
   const event = review.facts!.find(row => row.text === fact.text)!; expect(event, fact.text).toBeDefined();
   await approveStoryFact({ chatId: b.chatId, worldId: f.world.id, eventId: event.eventId, guard: review.guard!, text: fact.text, accept: true }, repo);
  }
 }
 const promise = (name: string): StoryFact => ({ kind: "promise", text: `Nora will bring ${name} only after permission.`, quote: `Nora told Mira: “I promise to bring ${name} only after permission.”`, task: { key: name, title: `bring ${name}`, status: "open" } });
 const oldClaim: StoryFact = { kind: "event", text: "The key is in the blue box.", quote: "The key is in the blue box.", claim: { key: "key-location", value: "blue box", scope: "state" } };
 await send([promise("tools"), promise("paper"), promise("paint"), oldClaim]);
 const corrected: StoryFact = { kind: "event", text: "The key is in the red box.", quote: "The key is in the red box.", claim: { ...oldClaim.claim!, value: "red box", transition: "correction" } };
 await send([
  { kind: "event", text: "Nora brought paper.", quote: "Nora brought paper.", task: { key: "paper", title: "bring paper", status: "completed" } },
  { kind: "event", text: "Nora cancelled bringing paint.", quote: "Nora cancelled bringing paint.", task: { key: "paint", title: "bring paint", status: "cancelled" } },
  corrected,
  { kind: "event", text: "Day 12", quote: "Day 12", claim: { key: GAME_TIME_KEY, value: "Day 12", scope: "state", transition: "progress" } },
 ]);
 // Keep an explicit human correction, including its provenance, across transfer.
 const review = await readStoryReview({ chatId: f.binding.chatId, worldId: f.world.id, cursor: null }, repo);
 const event = review.facts!.find(row => row.text === corrected.text)!;
 await approveStoryFact({ chatId: f.binding.chatId, worldId: f.world.id, eventId: event.eventId, guard: review.guard!, text: "The key is in the red box under the bench.", accept: true }, repo);
 for (let n = 0; n < 100; n++) {
  const last = native.messages.length;
  native.messages.push(message(last + 1, last, "user", `Scene ${n}`), message(last + 2, last + 1, "assistant", `ARCHIVED SCENE ${n}. ` + (locale === "ru" ? "В мастерской спокойно. " : "The workshop is quiet. ").repeat(120)));
 }
 native.selectedNativeKey = native.messages.at(-1)!.identity.nativeMessageKey;
 // A stored native alternative must not join the selected game or recap seeds.
 native.messages.push(message(1001, 2, "user", "Choose another route"),message(1002,1001,"assistant","UNSELECTED_ALTERNATIVE: the workshop was abandoned."));
 await play();
 const recap = { title: "Workshop", summary: locale === "ru" ? "День 12. Нора ждёт ответа Миры в мастерской." : "Day 12. Nora awaits Mira's answer in the workshop." };
 const capture = () => captureContinuation({ chatId: f.binding.chatId, chatUrl: f.binding.chatUrl, scene: { worldId: f.world.id, bookId: null, focusIds: [] }, story: boundStory([], "history"), recap, overrides: { includedIds: [], excludedIds: [] } }, repo);
 return { ...f, db, get repo() { return repo; }, getWorld: world, getBinding: binding, recap, capture, reload: async () => { db.close(); await db.open(); repo = new DeepRoleRepository(db); } };
 }
for (const locale of ["ru", "en"] as const) {
 it(`long selected game ${locale}: exact facts, roles, sources, terminal tasks, clock and manual correction survive recap/reload/retry`, async () => {
  const f = await fixture(locale), before = await f.repo.rawRecords(), game = (await f.getWorld()).sharedGame!;
  expect(game.recentStory!.partial).toBe(true); expect(game.episodeSources!.length).toBeGreaterThanOrEqual(200);
  expect(JSON.stringify(game)).not.toContain("UNSELECTED_ALTERNATIVE");
  expect(game.facts.map(f => f.task?.status).filter(Boolean).sort()).toEqual(["cancelled", "completed", "open"]);
  expect(game.facts.find(f => f.claim?.key === "key-location")!.text).toContain("under the bench");
  const initialOpen=game.facts.find(f=>f.task?.status==="open")!;
  expect(storedRoleReader(game.factRoleSeeds!,f.entities,f.world.id)(initialOpen)?.promisor?.id).toBe("person-1");
  const snapshot = await f.capture(); await f.reload();
  await completeContinuation(snapshot, "long-target", f.repo);
  const after = (await f.getWorld()).sharedGame!;
  for (const field of ["id", "facts", "factRoleSeeds", "episodeSources", "profileSeeds", "identitySeeds", "mergeSeeds", "memoryOverrides"] as const) expect(after[field]).toEqual(game[field]);
  expect(after.scene!.states).toEqual(game.scene!.states);
  expect(after.recentStory!.turns).toEqual([{ role: "assistant", text: f.recap.summary }]);
  const base = (await f.repo.list<StoryRecord>("story")).find((r): r is StoryBaseline => r.type === "baseline" && r.origin.bindingId === after.activeBindingId)!;
  expect(base.factSeeds).toEqual(game.facts); expect(base.factRoleSeeds).toEqual(game.factRoleSeeds); expect(base.episodeSourceSeeds).toEqual(game.episodeSources);
  const roles = storedRoleReader(after.factRoleSeeds!, f.entities, f.world.id);
  const open = after.facts.find(f => f.task?.status === "open")!; expect(roles(open)?.promisor?.id).toBe("person-1"); expect(roles(open)?.recipient?.id).toBe("person-2");
  expect(createStoryTimeReader(after.facts, createEpisodeReader(after.factRoleSeeds, after.episodeSources)).anchor!.label).toBe("Day 12");
  for (const row of before.filter(r => ["story", "entry", "entity", "dispatch"].includes(r.kind))) expect(await f.repo.get(row.kind, row.id)).toEqual(row.data);
  const committed = await f.repo.rawRecords(); await f.reload(); await completeContinuation(snapshot, "long-target", f.repo); expect(await f.repo.rawRecords()).toEqual(committed); assertStoryGraph(committed);
 }, 30000);
 it(`long selected game ${locale}: failed commit and competing tabs never lose or overwrite the source`, async () => {
  const f = await fixture(locale), a = await f.capture(), b = await f.capture(), before = await f.repo.rawRecords();
  vi.spyOn(f.db.records, "bulkPut").mockRejectedValueOnce(Error("synthetic-write-failed"));
  await expect(completeContinuation(a, "retry-target", f.repo)).rejects.toThrow("synthetic-write-failed"); expect(await f.repo.rawRecords()).toEqual(before);
  await f.reload();
  const results = await Promise.allSettled([completeContinuation(a, "retry-target", f.repo), completeContinuation(b, "other-target", new DeepRoleRepository(f.db))]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
  expect((await f.repo.list<ChatBinding>("binding")).filter(b => ["retry-target", "other-target"].includes(b.chatId))).toHaveLength(1);
  const active = (await f.getWorld()).sharedGame!.activeChatId;
  expect(active).not.toBe(f.binding.chatId); expect(await f.getBinding()).toEqual(before.find(r=>r.kind==="binding"&&r.id===f.binding.id)!.data);
  expect((await f.getWorld()).sharedGame!.facts).toEqual((before.find(r => r.kind === "world")!.data as WorldProfile).sharedGame!.facts); assertStoryGraph(await f.repo.rawRecords());
 }, 30000);
}
