import { afterEach, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import { characterInChat, characterRevision } from "../src/core/characters";
import { nativeStoryMessageKey as key } from "../src/core/story-transport";
import { assertStoryGraph, type StoryRecord, type StoryRevision } from "../src/core/story-records";
import { validStoryDispatchCapture, type StoryDispatchCapture } from "../src/core/story-dispatch-capture";
import type { ChatBinding, SceneEntity, WorldProfile } from "../src/core/types";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { activateWorldGame } from "../src/storage/world-game";
import { runStoryGame } from "../src/storage/story-game";
import { prepareDispatchCapture, confirmDispatchCapture, advanceDispatchCapture } from "../src/storage/story-dispatch-capture";
import { approveStoryFact } from "../src/storage/story-facts";
import { readStoryReview } from "../src/storage/story-review";
import { storyWorld } from "./fixtures/story-worlds";
import { createBackup, parseBackup } from "../src/storage/backup";

const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { await Promise.all(dbs.splice(0).map(db => db.delete())); });
async function fixture() {
  const f = storyWorld("en", 3); f.entities[0]!.name = "Nora"; f.entities[1]!.name = "Mira";
  const db = new DeepRoleDatabase("dispatch-roles-" + crypto.randomUUID()); dbs.push(db);
  const repo = new DeepRoleRepository(db); await repo.mergeRecords(f.records);
  const binding = () => repo.get<ChatBinding>("binding", f.binding.id).then(b => b!);
  const world = () => repo.get<WorldProfile>("world", f.world.id).then(w => w!);
  const message = (id: string, parent: string | null, role: "user" | "assistant", content: string) => ({ identity: { nativeMessageKey: key(id), nativeParentKey: parent === null ? null : key(parent), role }, completion: "complete" as const, content });
  const snapshot = { chatId: f.binding.chatId, selectedNativeKey: key("2"), messages: [message("1", null, "user", "Start"), message("2", "1", "assistant", "Workshop")] };
  const play = async (operation: "start" | "sync" = "sync") => {
    const b = await binding(), people = (await repo.list<SceneEntity>("entity")).filter(p => characterInChat(p, b.chatId));
    return runStoryGame({ chatId: b.chatId, worldId: f.world.id, operation, expectedBase: characterRevision(people, b.characterScenes?.[f.world.id]), nativeParentKey: null, manual: "stop", snapshot }, DEFAULT_SETTINGS, repo);
  };
  await activateWorldGame({ chatId: f.binding.chatId, chatUrl: f.binding.chatUrl, worldId: f.world.id, expectedRevision: null, mode: "initialize" }, repo); await play("start");
  const context = "<deeprole_context>Frozen roster</deeprole_context>", outgoingText = context + "\n\n[User message]\nAct";
  let serial = 0;
  const prepare = async (parent = "2") => {
    const b = await binding(), requestId = `capture-${String(serial++).padStart(3, "0")}-${crypto.randomUUID()}`, route = { requestId, identity: { chatId: b.chatId, nativeParentKey: key(parent) }, transport: "xhr" as const };
    await prepareDispatchCapture({ id: requestId, worldId: f.world.id, bindingId: b.id, identity: route.identity, transport: route.transport, sceneRevision: b.characterScenes![f.world.id]!.revision, originalDraft: "Act", proposedContext: context }, 7, repo);
    return route;
  };
  const accept = async (route: Awaited<ReturnType<typeof prepare>>) => {
    await confirmDispatchCapture({ ...route, outgoingText }, 7, repo); await advanceDispatchCapture({ ...route, phase: "started" }, 7, repo);
    await advanceDispatchCapture({ ...route, phase: "settled", delivery: { status: "accepted", httpStatus: 200 } }, 7, repo);
  };
  const ready = (route: Awaited<ReturnType<typeof prepare>>, assistant = "4", user = "3") => advanceDispatchCapture({ ...route, phase: "ready", link: { ...route.identity, requestId: route.requestId, userMessageKey: key(user), assistantMessageKey: key(assistant) }, sawFinish: false, issue: null }, 7, repo);
  const fact = { kind: "promise" as const, text: "Bring tools if the road opens.", quote: 'Nora told Mira: “I promise to bring tools if the road opens.”' };
  const observe = async (wireBody = outgoingText, approve = true) => {
    const review = await readStoryReview({ chatId: f.binding.chatId, worldId: f.world.id, cursor: null }, repo);
    const answer = fact.quote + `<deeprole_characters>${JSON.stringify({ version: 2, world: f.world.id, chat: f.binding.chatId, branch: review.guard!.branchId, facts: [fact] })}</deeprole_characters>`;
    snapshot.messages.push(message("3", "2", "user", wireBody), message("4", "3", "assistant", answer)); snapshot.selectedNativeKey = key("4"); await play();
    if (!approve) return;
    const pending = await readStoryReview({ chatId: f.binding.chatId, worldId: f.world.id, cursor: null }, repo), candidate = pending.facts![0]!;
    await approveStoryFact({ chatId: f.binding.chatId, worldId: f.world.id, eventId: candidate.eventId, guard: pending.guard!, text: fact.text, accept: true }, repo);
  };
  const source = async () => (await repo.list<StoryRecord>("story")).find((s): s is StoryRevision => s.type === "revision" && s.nativeMessageKey === key("4"))!;
  const rename = async () => { const p = (await repo.get<SceneEntity>("entity", "person-1"))!; await repo.put("entity", { ...p, name: "Eva", updatedAt: Date.now() }); };
  return { ...f, metaWorld: f.world, metaBinding: f.binding, repo, db, play, world, binding, prepare, accept, ready, observe, source, rename, outgoingText, snapshot, message, fact };
}
it("matches the exact assistant instead of the first retry sharing its user key", async () => {
  const f = await fixture(), earlier = await f.prepare(); await f.accept(earlier); await f.ready(earlier, "99");
  const actual = await f.prepare(); await f.accept(actual); await f.ready(actual); await f.observe();
  expect((await f.source()).roleRosterRequestId).toBe(actual.requestId);
  expect((await f.world()).sharedGame!.factRoleSeeds![0]!.binding.roles.promisor?.id).toBe("person-1");
});
it.each(["restored", "no-context", "fetch", "failed"])("retains source evidence without inventing roles for %s capture", async mode => {
  const f = await fixture(), route = await f.prepare(); await f.accept(route); await f.ready(route);
  const c = (await f.repo.get<StoryDispatchCapture>("dispatch", route.requestId))!;
  if (mode === "restored") c.origin = "restored";
  if (mode === "no-context") c.injection = "none";
  if (mode === "fetch" || mode === "failed") c.wire = { phase: "waiting", link: null, sawFinish: false, issue: null };
  if (mode === "fetch") c.transport = "fetch";
  if (mode === "failed") c.delivery = { status: "failed", code: "aborted" };
  expect(validStoryDispatchCapture(c)).toBe(true); await f.repo.put("dispatch", c);
  await f.observe(mode === "no-context" ? "Act" : f.outgoingText);
  expect((await f.source()).roleRoster).toEqual([]); expect((await f.source()).roleRosterRequestId).toBeUndefined();
  expect((await f.world()).sharedGame!.facts).toEqual([f.fact]); expect((await f.world()).sharedGame!.factRoleSeeds![0]!.binding.roles).toEqual({});
});
it("does not turn out-of-character transport into accepted game memory", async () => {
  const f = await fixture(), route = await f.prepare(); await f.accept(route); await f.ready(route);
  const c = (await f.repo.get<StoryDispatchCapture>("dispatch", route.requestId))!; c.purpose = "out-of-character"; delete c.roleRoster; await f.repo.put("dispatch", c);
  await f.observe(f.outgoingText, false);
  expect((await f.source()).storyPurpose).toBe("out-of-character"); expect((await f.source()).roleRosterRequestId).toBeUndefined();
  expect((await f.world()).sharedGame!.facts).toEqual([]);
});
it("checks the previous native assistant for later turns, not only the baseline anchor", async () => {
  const f = await fixture(), first = await f.prepare(); await f.accept(first); await f.ready(first); await f.observe();
  const second = await f.prepare("4"); await f.accept(second); await f.ready(second, "6", "5");
  const current = await readStoryReview({ chatId: f.metaBinding.chatId, worldId: f.metaWorld.id, cursor: null }, f.repo);
  const quote = "Nora promised to return at dawn.", answer = quote + `<deeprole_characters>${JSON.stringify({ version: 2, world: f.metaWorld.id, chat: f.metaBinding.chatId, branch: current.guard!.branchId, facts: [{ kind: "promise", text: "Return at dawn.", quote }] })}</deeprole_characters>`;
  f.snapshot.messages.push(f.message("5", "4", "user", f.outgoingText), f.message("6", "5", "assistant", answer)); f.snapshot.selectedNativeKey = key("6"); await f.play();
  const source = (await f.repo.list<StoryRecord>("story")).find((s): s is StoryRevision => s.type === "revision" && s.nativeMessageKey === key("6"))!;
  expect(source.roleRosterRequestId).toBe(second.requestId); assertStoryGraph(await f.repo.rawRecords());
  const all = await f.repo.rawRecords(), c = all.find(r => r.kind === "dispatch" && r.id === second.requestId)!.data as StoryDispatchCapture;
  c.identity.nativeParentKey = key("2"); c.wire.link!.nativeParentKey = key("2"); expect(validStoryDispatchCapture(c)).toBe(true);
  expect(() => assertStoryGraph(all)).toThrow("story-evidence-invalid");
});
it("still records a real native edit after late confirmation", async () => {
  const f = await fixture(), route = await f.prepare(); await f.observe(); await f.accept(route); await f.ready(route);
  expect((await f.play()).changed).toBe(false); f.snapshot.messages[2]!.content = "An actually edited user message.";
  expect((await f.play()).changed).toBe(true);
  const users = (await f.repo.list<StoryRecord>("story")).filter((s): s is StoryRevision => s.type === "revision" && s.nativeMessageKey === key("3"));
  expect(users.map(s => s.content).sort()).toEqual(["An actually edited user message.", f.outgoingText].sort());
});
it("keeps the selected user version when an earlier raw observation also matches", async () => {
  const f = await fixture(), route = await f.prepare(); await f.accept(route); await f.ready(route); await f.observe();
  const user = (await f.repo.list<StoryRecord>("story")).find((s): s is StoryRevision => s.type === "revision" && s.nativeMessageKey === key("3"))!;
  await f.repo.put("story", { ...user, id: "aaa-earlier-raw", content: f.outgoingText });
  assertStoryGraph(await f.repo.rawRecords());
  expect((await f.play()).changed).toBe(false);
  expect((await f.world()).sharedGame!.facts).toEqual([f.fact]);
  expect((await f.source()).roleRosterRequestId).toBe(route.requestId);
});
it("round-trips late unknown evidence in a full backup without backfilling names", async () => {
  const f = await fixture(), route = await f.prepare(); await f.observe(); await f.accept(route); await f.ready(route); await f.rename(); await f.play();
  const before = await f.repo.rawRecords(), parsed = await parseBackup(JSON.stringify(await createBackup(undefined, f.repo)));
  assertStoryGraph(parsed.records);
  const game = (parsed.records.find(r => r.kind === "world")!.data as WorldProfile).sharedGame!;
  expect(game.facts).toEqual([f.fact]); expect(game.factRoleSeeds![0]!.binding.roles).toEqual({});
  expect(parsed.records.filter(r => r.kind === "story").map(r => r.data)).toEqual(before.filter(r => r.kind === "story").map(r => r.data));
});
it.each([false, true])("does not pick the first competing exact pair (different roster=%s)", async different => {
  const f = await fixture(), a = await f.prepare(); await f.accept(a); await f.ready(a);
  if (different) { await f.rename(); const p = (await f.repo.get<SceneEntity>("entity", "person-3"))!; await f.repo.put("entity", { ...p, name: "Nora", updatedAt: Date.now() }); }
  const b = await f.prepare(); await f.accept(b); await f.ready(b); await f.observe();
  expect((await f.source()).roleRoster).toEqual([]); expect((await f.source()).roleRosterRequestId).toBeUndefined();
  expect((await f.world()).sharedGame!.factRoleSeeds![0]!.binding.roles).toEqual({});
});
it.each(["unconfirmed", "accepted-no-link"])("keeps accepted memory stable when %s evidence arrives late", async stage => {
  const f = await fixture(), route = await f.prepare(); if (stage === "accepted-no-link") await f.accept(route);
  await f.observe(); const source = await f.source(), facts = structuredClone((await f.world()).sharedGame!.facts);
  const revisions = (await f.repo.list<StoryRecord>("story")).filter(s => s.type === "revision").map(s => s.id);
  await f.rename(); if (stage === "unconfirmed") await f.accept(route); await f.ready(route);
  expect((await f.play()).changed).toBe(false);
  expect((await f.world()).sharedGame!.facts).toEqual(facts); expect((await f.source()).id).toBe(source.id);
  expect((await f.repo.list<StoryRecord>("story")).filter(s => s.type === "revision").map(s => s.id)).toEqual(revisions);
  expect((await f.source()).roleRoster).toEqual([]); expect((await f.source()).roleRosterRequestId).toBeUndefined();
  expect((await f.repo.list<StoryRecord>("story")).find(s => s.type === "revision" && s.nativeMessageKey === key("3"))).toMatchObject({ content: f.outgoingText });
  expect((await f.play()).changed).toBe(false); assertStoryGraph(await f.repo.rawRecords());
});
it.each(["wrong-anchor", "wrong-parent"])("rejects a source proof with a coherent but %s receipt", async mode => {
  const f = await fixture(), route = await f.prepare(); await f.accept(route); await f.ready(route); await f.observe();
  const all = await f.repo.rawRecords(), capture = all.find(r => r.kind === "dispatch" && r.id === route.requestId)!.data as StoryDispatchCapture;
  capture.identity.nativeParentKey = mode === "wrong-anchor" ? null : key("77"); capture.wire.link!.nativeParentKey = capture.identity.nativeParentKey;
  expect(validStoryDispatchCapture(capture)).toBe(true); expect(() => assertStoryGraph(all)).toThrow("story-evidence-invalid");
});
