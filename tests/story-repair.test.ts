import { afterEach, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { IsolatedFieldCoordinator } from "../src/adapters/isolated-field-coordinator";
import { readServiceDiagnostics } from "../src/storage/service-diagnostics";
import { serviceDiagnosticReport } from "../src/core/service-diagnostics";
import { storyWorld } from "./fixtures/story-worlds";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import { characterRevision } from "../src/core/characters";
import { nativeStoryMessageKey as key } from "../src/core/story-transport";
import { runStoryGame } from "../src/storage/story-game";
import { readStoryReview } from "../src/storage/story-review";
import { prepareStoryRepair, applyStoryRepair, finishStoryRepair, storyRepairCurrent } from "../src/storage/story-repair";
import { approveStoryFact } from "../src/storage/story-facts";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import type { ChatBinding } from "../src/core/types";
import type { StoryRevision } from "../src/core/story-records";
const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { await Promise.all(dbs.splice(0).map(db => db.delete())); });
async function setup(missing = false) {
  const f = storyWorld(), db = new DeepRoleDatabase("repair-" + crypto.randomUUID()); dbs.push(db); const repo = new DeepRoleRepository(db); await repo.mergeRecords(f.records);
  const message = (id: string, parent: string | null, role: "user" | "assistant", content: string) => ({ identity: { nativeMessageKey: key(id), nativeParentKey: parent === null ? null : key(parent), role }, completion: "complete" as const, content });
  const snapshot = { chatId: f.binding.chatId, selectedNativeKey: key("2"), messages: [message("1", null, "user", "Begin"), message("2", "1", "assistant", "Workshop")] };
  const play = async (operation: "start" | "sync" = "sync") => { const binding = (await repo.get<ChatBinding>("binding", f.binding.id))!; return runStoryGame({ chatId: binding.chatId, worldId: f.world.id, expectedBase: characterRevision(f.entities, binding.characterScenes![f.world.id]), operation, snapshot, nativeParentKey: null, manual: "stop" }, DEFAULT_SETTINGS, repo); };
  await play("start"); const branch = (await readStoryReview({ chatId: f.binding.chatId, worldId: f.world.id, cursor: null }, repo)).guard!.branchId;
  const prose = "Мира у ворот.\n\nЕё цель — найти медный ключ.";
  const content = prose + (missing ? "" : `<deeprole_characters>${JSON.stringify({ version: 2, world: f.world.id, chat: f.binding.chatId, branch, updates: [{ id: "person-1", state: { condition: "At the gate", goal: 22 } }] })}</deeprole_characters>`);
  snapshot.messages.push(message("3", "2", "user", "Act"), message("4", "3", "assistant", content), message("5", "3", "assistant", "A different scene")); snapshot.selectedNativeKey = key("4"); await play();
  const page = await readStoryReview({ chatId: f.binding.chatId, worldId: f.world.id, cursor: null }, repo), input = { chatId: f.binding.chatId, worldId: f.world.id, guard: page.guard!, revisionId: page.currentRevisionId! }, requestId = "repair_" + crypto.randomUUID();
  const prepare = () => prepareStoryRepair(input, requestId, repo);
  const body = (data: Record<string, unknown>) => JSON.stringify({ requestId, data: { version: 2, world: f.world.id, chat: f.binding.chatId, branch, ...data } });
  const scene = async () => (await repo.get<ChatBinding>("binding", f.binding.id))!.characterScenes![f.world.id]!;
  return { ...f, repo, snapshot, content, input, requestId, prepare, body, scene, play };
}
it("corrects only invalid fields, keeps accepted prose/state and cannot repeat rewards or images", async () => {
  const f = await setup(), brief = await f.prepare();
  await applyStoryRepair(brief, f.body({ updates: [{ id: "person-1", state: { condition: "Overwrite accepted", goal: { op: "set", value: "Find copper key" } } }], selfies: [], attributes: [] }), DEFAULT_SETTINGS, f.repo);
  expect((await f.scene()).states["person-1"]).toMatchObject({ condition: "At the gate", goal: "Find copper key" });
  const source = (await f.repo.get<StoryRevision>("story", f.input.revisionId))!; expect(source.content).toBe(f.content); expect(source.metadataRepair?.status).toBe("done");
  await expect(f.prepare()).rejects.toThrow("stale-step"); const before = await f.repo.rawRecords(); await f.play(); expect(await f.repo.rawRecords()).toEqual(before);
  f.snapshot.selectedNativeKey = key("5"); await f.play(); expect((await f.scene()).states["person-1"]!.goal).toBe(f.binding.characterScenes![f.world.id]!.states["person-1"]!.goal); f.snapshot.selectedNativeKey = key("4"); await f.play(); expect((await f.scene()).states["person-1"]!.goal).toBe("Find copper key");
});
it.each(["world", "chat", "branch"])("a correction for another %s cannot change any valid independent data", async property => {
  const f = await setup(), brief = await f.prepare(), before = await f.repo.rawRecords();
  await expect(applyStoryRepair(brief, f.body({ [property]: "foreign", updates: [{ id: "person-1", state: { goal: "Bad" } }] }), DEFAULT_SETTINGS, f.repo)).rejects.toThrow("invalid-result"); expect(await f.repo.rawRecords()).toEqual(before);
});
it("a manual edit stops a late correction", async () => {
  const f = await setup(), brief = await f.prepare(); const binding = (await f.repo.get<ChatBinding>("binding", f.binding.id))!;
  binding.characterScenes![f.world.id]!.states["person-1"]!.goal = "Manual"; binding.characterScenes![f.world.id]!.revision = "manual"; await f.repo.put("binding", binding); const before = await f.repo.rawRecords();
  await expect(applyStoryRepair(brief, f.body({ updates: [{ id: "person-1", state: { goal: "Bad" } }] }), DEFAULT_SETTINGS, f.repo)).rejects.toThrow("scene-changed"); expect(await f.repo.rawRecords()).toEqual(before);
  await finishStoryRepair(f.input, f.requestId, "cancelled", f.repo); expect((await f.repo.get<StoryRevision>("story", f.input.revisionId))!.metadataRepair?.status).toBe("cancelled");
});
it("a selected alternative stops a late correction", async () => {
  const f = await setup(), brief = await f.prepare(); f.snapshot.selectedNativeKey = key("5"); await f.play(); const before = await f.repo.rawRecords();
  await expect(applyStoryRepair(brief, f.body({ updates: [{ id: "person-1", state: { goal: "Late" } }] }), DEFAULT_SETTINGS, f.repo)).rejects.toThrow("scene-changed"); expect(await f.repo.rawRecords()).toEqual(before); expect(await storyRepairCurrent(f.input, f.requestId, f.repo)).toBe(false);
  f.snapshot.selectedNativeKey = key("4"); await f.play(); await expect(applyStoryRepair(brief, f.body({}), DEFAULT_SETTINGS, f.repo)).rejects.toThrow("scene-changed");
});
it("completed ancestor delivery never authorizes applying a correction again", async () => {
  const f = await setup(), brief = await f.prepare(); await applyStoryRepair(brief, f.body({ updates: [{ id: "person-1", state: { goal: "Find copper key" } }] }), DEFAULT_SETTINGS, f.repo);
  const identity = { nativeMessageKey: key("6"), nativeParentKey: key("4"), role: "user" as const }; f.snapshot.messages.push({ identity, completion: "complete", content: "Continue" }, { identity: { nativeMessageKey: key("7"), nativeParentKey: key("6"), role: "assistant" }, completion: "complete", content: "A later scene" }); f.snapshot.selectedNativeKey = key("7"); await f.play();
  expect(await storyRepairCurrent(f.input, f.requestId, f.repo)).toBe(true); const after = await f.repo.rawRecords(); await expect(applyStoryRepair(brief, f.body({}), DEFAULT_SETTINGS, f.repo)).rejects.toThrow("scene-changed"); expect(await f.repo.rawRecords()).toEqual(after);
});
it("edited approved facts and correction proofs survive encrypted backup, restore and alternatives", async () => {
  const f = await setup(true), brief = await f.prepare(); await applyStoryRepair(brief, f.body({ facts: [{ text: "Мира ищет ключ", kind: "plan", quote: "Её цель — найти медный ключ." }] }), DEFAULT_SETTINGS, f.repo);
  const page = await readStoryReview({ chatId: f.binding.chatId, worldId: f.world.id, cursor: null }, f.repo); await approveStoryFact({ chatId: f.binding.chatId, worldId: f.world.id, guard: page.guard!, eventId: page.facts![0]!.eventId, text: "Мира планирует найти медный ключ", accept: true }, f.repo);
  await f.repo.enableVault("synthetic vault password"); const encrypted = await createBackup("synthetic backup password", f.repo); expect(encrypted.format).toBe("deeprole-encrypted"); expect(JSON.stringify(encrypted)).not.toContain("Мира");
  const db = new DeepRoleDatabase("repair-restore-" + crypto.randomUUID()); dbs.push(db); const target = new DeepRoleRepository(db); await restoreBackup(await parseBackup(JSON.stringify(encrypted), "synthetic backup password"), "replace", target);
  expect(await target.rawRecords()).toEqual(await f.repo.rawRecords()); expect(await readStoryReview({ chatId: f.binding.chatId, worldId: f.world.id, cursor: null }, target)).toMatchObject({ repair: { status: "done" }, facts: [{ accepted: true, edited: true, kind: "plan", text: "Мира планирует найти медный ключ" }] });
  f.snapshot.selectedNativeKey = key("5"); await f.play(); expect((await readStoryReview({ chatId: f.binding.chatId, worldId: f.world.id, cursor: null }, f.repo)).facts).toEqual([]);
});
it("missing metadata can propose exact-quoted facts but cannot create an untracked half-scene", async () => {
  const f = await setup(true), brief = await f.prepare(); const previous = (await f.scene()).presentIds;
  await applyStoryRepair(brief, f.body({ updates: [{ id: "new:Visitor", name: "Visitor", state: { condition: "Here" } }], present: ["new:Visitor"], facts: [{ text: "Мира ищет медный ключ", kind: "plan", quote: "Её цель — найти медный ключ." }] }), DEFAULT_SETTINGS, f.repo);
  expect((await f.scene()).presentIds).toEqual(previous); expect(await f.repo.list("entity")).toHaveLength(f.entities.length);
  const page = await readStoryReview({ chatId: f.binding.chatId, worldId: f.world.id, cursor: null }, f.repo); expect(page.facts).toHaveLength(1); expect(page.facts![0]!.accepted).toBe(false);
});
it("cancellation is durable and never authorizes a new model attempt", async () => {
  const f = await setup(); await f.prepare(); await finishStoryRepair(f.input, f.requestId, "failed", f.repo);
  await expect(f.prepare()).rejects.toThrow("stale-step");
});
async function coordinator() {
  const f = await setup(), tabs = new Map<number, any>([[1, { id: 1, active: true, url: f.binding.chatUrl }]]);
  const api: any = { runtime: { id: "ours" }, storage: browser.storage, windows: { create: vi.fn(async () => { tabs.set(2, { id: 2, url: "about:blank", active: true }); return { id: 4, tabs: [tabs.get(2)] }; }) }, tabs: { get: vi.fn(async (id: number) => { if (!tabs.has(id)) throw Error("closed"); return tabs.get(id); }), query: vi.fn(async () => [tabs.get(2)]), update: vi.fn(async (id: number, value: any) => { tabs.set(id, { ...tabs.get(id), ...value }); return tabs.get(id); }), remove: vi.fn(async (id: number) => { tabs.delete(id); }), sendMessage: vi.fn(async () => ({ ok: true })) } };
  const c = new IsolatedFieldCoordinator(f.repo, api, async () => DEFAULT_SETTINGS);
  const source = (m: any) => c.handle(m, { id: "ours", tab: { id: 1 }, frameId: 0 } as any), worker = (id: string, action: string, extra: any = {}) => c.handle({ type: "DR_FIELD_WORKER", id, action, ...extra } as any, { id: "ours", tab: { id: 2 }, frameId: 0 } as any);
  return { ...f, api, tabs, c, source, worker };
}
it("the real coordinator uses one owned visible popup, applies correction and audits cleanup without lore", async () => {
  const f = await coordinator(), start = await f.source({ type: "DR_FIELD", action: "repair", input: f.input }); expect(start.ok).toBe(true);
  const id = start.id; expect((await f.worker(id, "claim")).presentation.kind).toBe("repair"); expect(f.api.windows.create).toHaveBeenCalledWith(expect.objectContaining({ type: "popup", focused: true }));
  expect((await f.worker(id, "sent")).ok).toBe(true); f.tabs.set(2, { id: 2, url: "https://chat.deepseek.com/chat/s/owned" }); expect((await f.worker(id, "bound", { chatId: "owned" })).ok).toBe(true);
  const raw = JSON.stringify({ requestId: id, data: { world: f.world.id, chat: f.binding.chatId, branch: f.input.guard.branchId, version: 2, updates: [{ id: "person-1", state: { goal: "Find copper key" } }] } });
  expect(await f.worker(id, "reply", { chatId: "owned", raw })).toMatchObject({ ok: true }); expect((await f.scene()).states["person-1"]!.goal).toBe("Find copper key");
  f.tabs.set(2, { id: 2, url: "https://chat.deepseek.com/" }); expect((await f.worker(id, "cleaned", { chatId: "owned", ok: true })).ok).toBe(true);
  expect(await f.source({ type: "DR_FIELD", action: "read", id })).toMatchObject({ ok: true, outcome: { text: "metadata-corrected", cleanup: "done" } }); await f.source({ type: "DR_FIELD", action: "ack", id });
  expect(f.api.tabs.remove).toHaveBeenCalledExactlyOnceWith(2); const report = serviceDiagnosticReport(await readServiceDiagnostics(f.repo), 5)!; expect(report).toContain('"operation": "story-repair"'); expect(report).not.toMatch(/Мира|copper|worldId|chatId|quote/);
  expect(await readStoryReview({ chatId: f.binding.chatId, worldId: f.world.id, cursor: null }, f.repo)).toMatchObject({ repair: { status: "done", cleanup: "done" } });
});
it("coordinator cancellation and a second attempt never open another popup", async () => {
  const f = await coordinator(), first = await f.source({ type: "DR_FIELD", action: "repair", input: f.input }); await f.source({ type: "DR_FIELD", action: "cancel", id: first.id });
  expect((await f.repo.get<StoryRevision>("story", f.input.revisionId))!.metadataRepair?.status).toBe("cancelled");
  f.tabs.set(2, { id: 2, url: "https://chat.deepseek.com/" }); await f.worker(first.id, "cleaned", { ok: true });
  expect(await f.source({ type: "DR_FIELD", action: "repair", input: f.input })).toMatchObject({ ok: false }); expect(f.api.windows.create).toHaveBeenCalledTimes(1);
});
