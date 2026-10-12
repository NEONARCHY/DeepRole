import { afterEach, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { storyWorld } from "./fixtures/story-worlds";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import { characterInChat, characterRevision } from "../src/core/characters";
import { nativeStoryMessageKey as key } from "../src/core/story-transport";
import { assertStoryGraph, type StoryEvent } from "../src/core/story-records";
import { runStoryGame } from "../src/storage/story-game";
import { readCharacterDiscovery, prepareCharacterDiscovery, applyCharacterDiscovery } from "../src/storage/story-character-discovery";
import { prepareDiscoveryProfile, applyDiscoveryProfile, type DiscoveryProfileBrief } from "../src/storage/discovery-profile";
import { editDiscoveryQueue, failDiscoveryProfileTask } from "../src/storage/discovery-profile-queue";
import { validDiscoveryQueueInput, validDiscoveryProfileTask, type DiscoveryQueueInput } from "../src/core/discovery-profile-queue";
import { validCharacterDiscoveryPage } from "../src/core/story-character-discovery";
import { runDiscoveryProfileQueue } from "../src/adapters/discovery-profile-queue";
import { IsolatedFieldCoordinator } from "../src/adapters/isolated-field-coordinator";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import type { ChatBinding, SceneEntity } from "../src/core/types";
const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dbs.splice(0).map(d => d.delete())); });
async function fixture(count = 2) {
  const f = storyWorld("en", 41), db = new DeepRoleDatabase("discovery-queue-" + crypto.randomUUID()); dbs.push(db); const repo = new DeepRoleRepository(db); await repo.mergeRecords(f.records);
  const message = (id: string, parent: string | null, role: "user" | "assistant", content: string) => ({ identity: { nativeMessageKey: key(id), nativeParentKey: parent === null ? null : key(parent), role }, completion: "complete" as const, content });
  const snapshot = { chatId: f.binding.chatId, selectedNativeKey: key("2"), messages: [message("1", null, "user", "Begin"), message("2", "1", "assistant", "Workshop")] }, scope = { chatId: f.binding.chatId, worldId: f.world.id };
  const play = async (operation: "start" | "sync" = "sync") => { const scene = (await repo.get<ChatBinding>("binding", f.binding.id))!.characterScenes![f.world.id]!; return runStoryGame({ ...scope, expectedBase: characterRevision((await repo.list<SceneEntity>("entity")).filter(e => characterInChat(e, scope.chatId)), scene), snapshot, nativeParentKey: null, operation, manual: "stop" }, DEFAULT_SETTINGS, repo); };
  const people = Array.from({ length: count }, (_, i) => ({ name: i === 0 ? "Ash" : i === 1 ? "Rowan" : "Courier " + i, quote: i === 0 ? "Ash wears a red coat." : i === 1 ? "Rowan works as a courier." : `Courier ${i} delivered a letter.` }));
  await play("start"); snapshot.messages.push(message("3", "2", "user", "Continue"), message("4", "3", "assistant", people.map(p => p.quote).join(" ")), message("5", "3", "assistant", "Nobody arrived.")); snapshot.selectedNativeKey = key("4"); await play();
  const read = () => readCharacterDiscovery({ ...scope, offset: 0 }, repo), brief = await prepareCharacterDiscovery({ ...scope, guard: (await read()).guard }, "discover_" + crypto.randomUUID(), "en", repo);
  const source = brief.parts.find(s => s.text.includes("Ash"))!;
  await applyCharacterDiscovery(brief, JSON.stringify({ requestId: brief.requestId, people: people.slice(0, 32).map(p => ({ ...p, source: source.id })), more: count > 32 }), repo);
  if (count > 32) { const second = await prepareCharacterDiscovery({ ...scope, guard: (await read()).guard }, "discover_" + crypto.randomUUID(), "en", repo), source = second.parts.find(s => s.text.includes("Courier 32"))!; await applyCharacterDiscovery(second, JSON.stringify({ requestId: second.requestId, people: people.slice(32).map(p => ({ ...p, source: source.id })), more: false }), repo); }
  const enqueue = async () => { const p = await read(); return { ...scope, guard: p.guard, operation: "enqueue" as const, items: p.candidates.map(c => ({ eventId: c.eventId, name: c.name, values: { appearance: "", personality: "", goals: "", background: "Author draft: " + c.name } })) }; };
  const commands: string[] = [];
  const prepare = async (input: NonNullable<Awaited<ReturnType<typeof read>>["queue"]>["next"]) => { const b = await prepareDiscoveryProfile(input!, "field_" + crypto.randomUUID(), "en", repo); commands.push(b.input.name); await applyDiscoveryProfile(b, raw(b), repo); };
  const ports = { current: () => true, read, edit: (input: DiscoveryQueueInput) => editDiscoveryQueue(input, repo), prepare };
  return { ...f, repo, scope, snapshot, play, read, enqueue, commands, ports, prepare };
}
function raw(b: DiscoveryProfileBrief) { return JSON.stringify({ requestId: b.requestId, field: "character-profile", fields: Object.fromEntries(["appearance", "personality", "goals", "background"].map(k => [k, { status: "not-found", text: "", evidence: [] }])) }); }
it("queues two draft snapshots, prepares sequentially and never adds entities or regenerates ready proposals", async () => {
  const f = await fixture(), before = await f.repo.rawRecords(), input = await f.enqueue(); expect(validDiscoveryQueueInput(input)).toBe(true);
  const p = await runDiscoveryProfileQueue(input, f.ports); expect(p.queue).toMatchObject({ total: 2, ready: 2, pending: 0, next: null }); expect(validCharacterDiscoveryPage(p)).toBe(true); expect(f.commands).toEqual(["Ash", "Rowan"]);
  expect(p.candidates.map(c => c.profile!.values.background)).toEqual(["Author draft: Ash", "Author draft: Rowan"]); expect(p.candidates.every(c => !c.added && validDiscoveryProfileTask(c.task))).toBe(true);
  await runDiscoveryProfileQueue({ ...input, operation: "resume", items: [] }, f.ports); await runDiscoveryProfileQueue(input, f.ports); expect(f.commands).toEqual(["Ash", "Rowan"]);
  expect((await f.repo.rawRecords()).filter(r => r.kind !== "story")).toEqual(before.filter(r => r.kind !== "story")); assertStoryGraph(await f.repo.rawRecords());
});
it("stops on one failed request, retains completed proposals and resumes only unfinished work", async () => {
  const f = await fixture(), input = await f.enqueue(); let failedId = "";
  await expect(runDiscoveryProfileQueue(input, { ...f.ports, prepare: async next => { if (next.name === "Ash") return f.prepare(next); const b = await prepareDiscoveryProfile(next, "field_" + crypto.randomUUID(), "en", f.repo); failedId = b.requestId; await failDiscoveryProfileTask(b.input, b.requestId, f.repo); throw Error("reply-timeout"); } })).rejects.toThrow("reply-timeout");
  expect((await f.read()).queue).toMatchObject({ ready: 1, pending: 1 }); const event = (await f.read()).candidates[1]!; expect(event.task).toMatchObject({ status: "failed", requestId: failedId }); expect(event.profile).toBeUndefined();
  await runDiscoveryProfileQueue({ ...input, operation: "resume", items: [] }, f.ports); expect(f.commands).toEqual(["Ash", "Rowan"]);
});
it("accumulates several bounded pages without a total queue cap", async () => {
  const f = await fixture(48), input = await f.enqueue(); await editDiscoveryQueue(input, f.repo);
  for (const offset of [20, 40]) { const page = await readCharacterDiscovery({ ...f.scope, offset, guard: input.guard }, f.repo); await editDiscoveryQueue({ ...input, items: page.candidates.map(c => ({ eventId: c.eventId, name: c.name, values: { appearance: "", personality: "", goals: "", background: c.background } })) }, f.repo); }
  expect((await f.read()).queue).toMatchObject({ total: 48, pending: 48, ready: 0 }); expect((await f.repo.list("entity")).length).toBe(41); assertStoryGraph(await f.repo.rawRecords());
});
it("rejects a new known alias introduced after enqueue without a model request", async () => {
  const f = await fixture(), input = await f.enqueue(); await editDiscoveryQueue(input, f.repo); const next = (await f.read()).queue!.next!, person = (await f.repo.list<SceneEntity>("entity"))[0]!;
  await f.repo.put("entity", { ...person, aliases: [next.name] }); await expect(prepareDiscoveryProfile(next, "field_" + crypto.randomUUID(), "en", f.repo)).rejects.toThrow("scene-changed"); expect((await f.read()).candidates[0]!.task!.status).toBe("pending");
});
it("stores an interrupted claim, requires explicit resume and rejects late replies from its old request", async () => {
  const f = await fixture(), input = await f.enqueue(); await editDiscoveryQueue(input, f.repo); const next = (await f.read()).queue!.next!, old = await prepareDiscoveryProfile(next, "field_" + crypto.randomUUID(), "en", f.repo);
  expect((await f.read()).candidates[0]!.task!.status).toBe("preparing"); await expect(prepareDiscoveryProfile(next, "field_" + crypto.randomUUID(), "en", f.repo)).rejects.toThrow("busy");
  await editDiscoveryQueue({ ...input, operation: "resume", items: [] }, f.repo); const fresh = await prepareDiscoveryProfile((await f.read()).queue!.next!, "field_" + crypto.randomUUID(), "en", f.repo);
  await expect(applyDiscoveryProfile(old, raw(old), f.repo)).rejects.toThrow("scene-changed"); await failDiscoveryProfileTask(old.input, old.requestId, f.repo); expect((await f.read()).candidates[0]!.task!.requestId).toBe(fresh.requestId); await applyDiscoveryProfile(fresh, raw(fresh), f.repo);
});
it("stops between characters when the game or draft changes; saved ready work remains", async () => {
  const f = await fixture(), input = await f.enqueue(); let current = true;
  await expect(runDiscoveryProfileQueue(input, { ...f.ports, current: () => current, prepare: async next => { await f.prepare(next); current = false; } })).rejects.toThrow("cancelled"); expect(f.commands).toEqual(["Ash"]); expect((await f.read()).queue).toMatchObject({ ready: 1, pending: 1 });
});
it("rejects stale resume, hides other variants, and clearing work never deletes a saved proposal", async () => {
  const f = await fixture(), input = await f.enqueue(); await editDiscoveryQueue(input, f.repo); await f.prepare((await f.read()).queue!.next!);
  f.snapshot.selectedNativeKey = key("5"); await f.play(); expect((await f.read()).queue!.total).toBe(0);
  f.snapshot.selectedNativeKey = key("4"); await f.play(); const page = await f.read(); expect(page.queue!.stale).toBe(1); await expect(editDiscoveryQueue({ ...input, guard: page.guard, operation: "resume", items: [] }, f.repo)).rejects.toThrow("story-review-stale");
  await editDiscoveryQueue({ ...input, guard: page.guard, operation: "clear", items: [] }, f.repo); expect((await f.read()).queue!.total).toBe(0); expect((await f.read()).candidates[0]!.profile).toBeDefined();
});
it("refuses invalid candidates, duplicate/known names and malformed input atomically", async () => {
  const f = await fixture(), input = await f.enqueue(), before = await f.repo.rawRecords(), known = (await f.repo.list<SceneEntity>("entity"))[0]!.name;
  for (const i of [{ ...input, items: [input.items[0]!, { ...input.items[1]!, eventId: "foreign" }] }, { ...input, items: input.items.map(i => ({ ...i, name: "Same" })) }, { ...input, items: [input.items[0]!, { ...input.items[1]!, name: known }] }]) await expect(editDiscoveryQueue(i, f.repo)).rejects.toThrow();
  expect(validDiscoveryQueueInput({ ...input, items: Array(21).fill(input.items[0]) })).toBe(false); expect(validDiscoveryQueueInput({ ...input, operation: "resume" })).toBe(false); expect(await f.repo.rawRecords()).toEqual(before);
});
it("rolls back queue changes when the final sender/vault guard rejects", async () => {
  const f = await fixture(), input = await f.enqueue(), before = await f.repo.rawRecords(); let calls = 0;
  await expect(editDiscoveryQueue(input, f.repo, async () => { if (++calls === 2) throw Error("scene-changed"); })).rejects.toThrow("scene-changed"); expect(await f.repo.rawRecords()).toEqual(before);
});
it("encrypted backup restores pending work and completed profiles with strict branch linkage", async () => {
  const f = await fixture(), input = await f.enqueue(); await editDiscoveryQueue(input, f.repo); await f.prepare((await f.read()).queue!.next!); await f.repo.enableVault("synthetic vault password");
  const backup = await parseBackup(JSON.stringify(await createBackup("synthetic backup password", f.repo)), "synthetic backup password"), db = new DeepRoleDatabase("queue-restored-" + crypto.randomUUID()); dbs.push(db); const copy = new DeepRoleRepository(db); await restoreBackup(backup, "replace", copy);
  expect(await copy.rawRecords()).toEqual(await f.repo.rawRecords()); expect((await readCharacterDiscovery({ ...f.scope, offset: 0 }, copy)).queue).toMatchObject({ ready: 1, pending: 1 });
  const corrupted = structuredClone(await copy.rawRecords()), event = corrupted.find(r => (r.data as StoryEvent).characterProfileTask)!.data as StoryEvent; event.characterProfileTask!.guard.branchId = "foreign"; expect(() => assertStoryGraph(corrupted)).toThrow("story-link-invalid");
}, 15000);
it("rejects transport success without durable progress instead of looping or retrying", async () => {
  const f = await fixture(); await expect(runDiscoveryProfileQueue(await f.enqueue(), { ...f.ports, prepare: async () => undefined })).rejects.toThrow("invalid-result"); expect(f.commands).toEqual([]);
});
it("does not start another request after cleanup failure, even when the first proposal was saved", async () => {
  const f = await fixture(), input = await f.enqueue(); await expect(runDiscoveryProfileQueue(input, { ...f.ports, prepare: async next => { await f.prepare(next); throw Error("cleanup-pending"); } })).rejects.toThrow("cleanup-pending"); expect(f.commands).toEqual(["Ash"]); expect((await f.read()).queue).toMatchObject({ ready: 1, pending: 1 });
});
it("coordinator reconciles lost workers before resume and blocks active/failed cleanup and inactive senders", async () => {
  const f = await fixture(), input = await f.enqueue(), tabs = new Map<number, any>([[1, { id: 1, active: true, url: f.binding.chatUrl }], [2, { id: 2, active: true, url: "about:blank" }]]), session: Record<string, any> = {};
  const api = { runtime: { id: "extension" }, tabs: { get: vi.fn(async (id: number) => tabs.get(id)), update: vi.fn(async (id: number, p: any) => Object.assign(tabs.get(id), p)), remove: vi.fn(async (id: number) => tabs.delete(id)), sendMessage: vi.fn(async () => undefined) }, windows: { create: vi.fn(async () => ({ tabs: [tabs.get(2)] })) }, storage: { session: { get: vi.fn(async (k: string) => ({ [k]: session[k] })), set: vi.fn(async (v: any) => Object.assign(session, structuredClone(v))) }, local: browser.storage.local } } as any;
  const c = new IsolatedFieldCoordinator(f.repo, api, async () => DEFAULT_SETTINGS), sender = () => ({ id: "extension", frameId: 0, tab: tabs.get(1) });
  tabs.get(1).active = false; expect(await c.handle({ type: "DR_FIELD", action: "discovery-queue", input }, sender())).toMatchObject({ ok: false }); tabs.get(1).active = true;
  expect(await c.handle({ type: "DR_FIELD", action: "discovery-queue", input }, sender())).toMatchObject({ ok: true }); const next = (await f.read()).queue!.next!;
  expect(await c.handle({ type: "DR_FIELD", action: "discovery-profile", input: next }, sender())).toMatchObject({ ok: true }); const resume = { ...input, operation: "resume" as const, items: [] };
  expect(await c.handle({ type: "DR_FIELD", action: "discovery-queue", input: resume }, sender())).toMatchObject({ ok: false, error: "busy" }); expect(api.windows.create).toHaveBeenCalledTimes(1);
  const restarted = new IsolatedFieldCoordinator(f.repo, api, async () => DEFAULT_SETTINGS); expect(await restarted.handle({ type: "DR_FIELD", action: "discovery-queue", input: resume }, sender())).toMatchObject({ ok: false, error: "busy" }); expect((await f.read()).candidates[0]!.task!.status).toBe("failed"); expect(api.tabs.sendMessage).toHaveBeenCalled();
  session.deeprole_field_owners[0].cleanup = "failed"; expect(await restarted.handle({ type: "DR_FIELD", action: "discovery-queue", input: resume }, sender())).toMatchObject({ ok: false, error: "cleanup-required" });
  session.deeprole_field_owners[0].cleanup = "done"; expect(await restarted.handle({ type: "DR_FIELD", action: "discovery-queue", input: resume }, sender())).toMatchObject({ ok: true }); expect((await f.read()).queue!.pending).toBe(2); expect(api.windows.create).toHaveBeenCalledTimes(1);
});
