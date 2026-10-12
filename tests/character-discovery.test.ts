import { afterEach, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { IsolatedFieldCoordinator } from "../src/adapters/isolated-field-coordinator";
import { CharacterDiscoveryClient } from "../src/adapters/character-discovery-client";
import { readServiceDiagnostics } from "../src/storage/service-diagnostics";
import { serviceDiagnosticReport } from "../src/core/service-diagnostics";
import { characterInChat, characterInstruction, characterRevision } from "../src/core/characters";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import { parseDiscoveryReply, validCharacterDiscoveryPage } from "../src/core/story-character-discovery";
import { assertStoryGraph, type StoryRevision } from "../src/core/story-records";
import { nativeStoryMessageKey as key } from "../src/core/story-transport";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { runStoryGame, markNonStoryMessage } from "../src/storage/story-game";
import { readCharacterDiscovery, prepareCharacterDiscovery, applyCharacterDiscovery, approveCharacterDiscovery, finishCharacterDiscovery, characterDiscoveryCurrent } from "../src/storage/story-character-discovery";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { prepareDispatchCapture, confirmDispatchCapture, advanceDispatchCapture } from "../src/storage/story-dispatch-capture";
import { storyWorld } from "./fixtures/story-worlds";
import type { ChatBinding, SceneEntity } from "../src/core/types";
const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { await Promise.all(dbs.splice(0).map(db => db.delete())); });
export async function discoveryFixture(prose = "Sergey, the courier, entered with a copper letter.", count = 3) {
  const f = storyWorld("en", count), db = new DeepRoleDatabase("discovery-" + crypto.randomUUID()); dbs.push(db); const repo = new DeepRoleRepository(db); await repo.mergeRecords(f.records);
  const message = (id: string, parent: string | null, role: "user" | "assistant", content: string) => ({ identity: { nativeMessageKey: key(id), nativeParentKey: parent === null ? null : key(parent), role }, completion: "complete" as const, content });
  const snapshot = { chatId: f.binding.chatId, selectedNativeKey: key("2"), messages: [message("1", null, "user", "Before tracking OldPerson existed."), message("2", "1", "assistant", "Before tracking OtherPerson arrived.")] };
  const scope = { chatId: f.binding.chatId, worldId: f.world.id };
  const scene = async () => (await repo.get<ChatBinding>("binding", f.binding.id))!.characterScenes![f.world.id]!;
  const play = async (operation: "start" | "sync" = "sync") => { const people = (await repo.list<SceneEntity>("entity")).filter(p => characterInChat(p, f.binding.chatId)); return runStoryGame({ ...scope, expectedBase: characterRevision(people, await scene()), operation, snapshot, nativeParentKey: null, manual: "stop" }, DEFAULT_SETTINGS, repo); };
  await play("start"); snapshot.messages.push(message("3", "2", "user", "Continue."), message("4", "3", "assistant", prose), message("5", "3", "assistant", "Nobody arrived; Xavier is an unchosen alternative.")); snapshot.selectedNativeKey = key("4"); await play();
  const read = (offset = 0) => readCharacterDiscovery({ ...scope, offset }, repo);
  const prepare = async () => prepareCharacterDiscovery({ ...scope, guard: (await read()).guard }, "discover_" + crypto.randomUUID(), "en", repo);
  return { ...f, repo, scope, snapshot, scene, play, message, read, prepare };
}
it("bounds the native reply and rejects foreign IDs, fabricated quotes and partial-name evidence", () => {
  const sources = [{ id: "s1", text: "Annabelle arrived. Sergey holds a key." }], body = (people: unknown[], more = false) => JSON.stringify({ requestId: "id", people, more });
  expect(parseDiscoveryReply(body([{ source: "s1", name: "Sergey", quote: "Sergey holds a key." }]), "id", sources).people).toHaveLength(1);
  for (const p of [{ source: "foreign", name: "Sergey", quote: "Sergey holds a key." }, { source: "s1", name: "Sergey", quote: "Sergey has a crown." }, { source: "s1", name: "Ann", quote: "Annabelle arrived." }]) expect(() => parseDiscoveryReply(body([p]), "id", sources)).toThrow("invalid-evidence");
  expect(() => parseDiscoveryReply(body(Array(33).fill({ source: "s1", name: "Sergey", quote: "Sergey holds a key." })), "id", sources)).toThrow("invalid-result");
  expect(() => parseDiscoveryReply(body([]), "other", sources)).toThrow("invalid-result"); expect(() => parseDiscoveryReply("x".repeat(64001), "id", sources)).toThrow("invalid-result");
});
it("finds only selected recorded sources, keeps proposals separate, excludes 1000th known alias, and preserves lore", async () => {
  const f = await discoveryFixture("Sergey entered. Copper Courier waited. Resident 1000 smiled.<deeprole_characters>{\"name\":\"HiddenName\"}</deeprole_characters>", 1000);
  const late = (await f.repo.get<SceneEntity>("entity", "person-1000"))!; await f.repo.put("entity", { ...late, aliases: ["Copper Courier"] });
  const before = await f.repo.rawRecords(), brief = await f.prepare(); expect(brief.prompt).not.toMatch(/OldPerson|OtherPerson|Xavier|HiddenName/); expect(brief.prompt).toContain("copper courier"); expect(brief.parts.map(p => p.text).join(" ").length).toBeLessThanOrEqual(12000);
  const source = brief.parts.find(p => p.text.includes("Sergey"))!;
  await applyCharacterDiscovery(brief, JSON.stringify({ requestId: brief.requestId, people: [{ source: source.id, name: "Sergey", quote: "Sergey entered." }, { source: source.id, name: "Copper Courier", quote: "Copper Courier waited." }, { source: source.id, name: "Resident 1000", quote: "Resident 1000 smiled." }], more: false }), f.repo);
  const page = await f.read(); expect(validCharacterDiscoveryPage(page)).toBe(true); expect(page).toMatchObject({ remaining: 0, total: 1 }); expect(page.candidates[0]).toMatchObject({ name: "Sergey", added: false }); expect((await f.repo.rawRecords()).filter(r => r.kind !== "story")).toEqual(before.filter(r => r.kind !== "story")); assertStoryGraph(await f.repo.rawRecords());
}, 15000);
it("approval edits are used in play, alternatives undo/reapply the same identity, backups keep provenance", async () => {
  const f = await discoveryFixture(), brief = await f.prepare(), source = brief.parts.find(p => p.text.includes("Sergey"))!;
  await applyCharacterDiscovery(brief, JSON.stringify({ requestId: brief.requestId, people: [{ source: source.id, name: "Sergey", quote: "Sergey, the courier, entered with a copper letter." }], more: false }), f.repo);
  let page = await f.read(); const event = page.candidates[0]!;
  await approveCharacterDiscovery({ ...f.scope, guard: page.guard, eventId: event.eventId, name: "Sergey the courier", background: "Trusted courier; carries the copper letter.", accept: true }, f.repo);
  const person = (await f.repo.list<SceneEntity>("entity")).find(p => p.name === "Sergey the courier")!; expect(person.aliases).toEqual(["Sergey"]); expect(person.playthroughChatId).toBe(f.binding.chatId); expect(person.characterSheet).toMatchObject({ protagonist: false, background: "Trusted courier; carries the copper letter.", appearance: "", goals: "" }); expect((await f.scene()).presentIds).not.toContain(person.id);
  const prompt = characterInstruction(f.world.id, f.binding.chatId, await f.repo.list("entity"), await f.scene(), ["neutral"], [], "Sergey the courier, come here."); expect(prompt).toContain("Trusted courier");
  const before = await f.repo.rawRecords(); await f.play(); expect(await f.repo.rawRecords()).toEqual(before);
  f.snapshot.selectedNativeKey = key("5"); await f.play(); expect(await f.repo.get("entity", person.id)).toBeNull(); expect((await f.read()).candidates).toHaveLength(0);
  f.snapshot.selectedNativeKey = key("4"); await f.play(); expect((await f.repo.get<SceneEntity>("entity", person.id))!.name).toBe(person.name); expect((await f.read()).candidates[0]!.added).toBe(true);
  await f.repo.enableVault("synthetic vault password"); const payload = await parseBackup(JSON.stringify(await createBackup("synthetic backup password", f.repo)), "synthetic backup password");
  const db = new DeepRoleDatabase("discovery-copy-" + crypto.randomUUID()); dbs.push(db); const copy = new DeepRoleRepository(db); await restoreBackup(payload, "replace", copy); expect(await copy.rawRecords()).toEqual(await f.repo.rawRecords()); assertStoryGraph(await copy.rawRecords());
});
it("rejecting or approving a now-known alias cannot create duplicate profiles", async () => {
  const f = await discoveryFixture(), brief = await f.prepare(), source = brief.parts.find(p => p.text.includes("Sergey"))!;
  await applyCharacterDiscovery(brief, JSON.stringify({ requestId: brief.requestId, people: [{ source: source.id, name: "Sergey", quote: "Sergey, the courier, entered with a copper letter." }], more: false }), f.repo);
  let page = await f.read(); const item = page.candidates[0]!, input = { ...f.scope, guard: page.guard, eventId: item.eventId, name: f.entities[0]!.name, background: "", accept: true };
  const before = await f.repo.rawRecords(); await expect(approveCharacterDiscovery(input, f.repo)).rejects.toThrow("character-discovery-known"); expect(await f.repo.rawRecords()).toEqual(before);
  await approveCharacterDiscovery({ ...input, name: item.name, accept: false }, f.repo); expect((await f.read()).candidates).toHaveLength(0); expect(await f.repo.list("entity")).toHaveLength(3);
});
it("a manual profile edit is not erased when its originating variant is removed", async () => {
  const f = await discoveryFixture(), brief = await f.prepare(), source = brief.parts.find(p => p.text.includes("Sergey"))!;
  await applyCharacterDiscovery(brief, JSON.stringify({ requestId: brief.requestId, people: [{ source: source.id, name: "Sergey", quote: "Sergey, the courier, entered with a copper letter." }], more: false }), f.repo);
  const page = await f.read(); await approveCharacterDiscovery({ ...f.scope, guard: page.guard, eventId: page.candidates[0]!.eventId, name: "Sergey", background: "Courier", accept: true }, f.repo);
  const person = (await f.repo.list<SceneEntity>("entity")).find(p => p.name === "Sergey")!; await f.repo.put("entity", { ...person, description: "Manual author fact" }); const before = await f.repo.rawRecords();
  f.snapshot.selectedNativeKey = key("5"); await expect(f.play()).rejects.toThrow("story-profile-conflict"); expect(await f.repo.rawRecords()).toEqual(before);
});
it("long sources resume with overlap, cancellation does not advance, and new turns do not rescan completed messages", async () => {
  const quote = "BridgeCourier carries a sealed envelope.", prose = "x".repeat(11980) + " " + quote + " " + "x".repeat(14000), f = await discoveryFixture(prose);
  const first = await f.prepare(); expect(first.parts.some(p => p.text.includes(quote))).toBe(false);
  await applyCharacterDiscovery(first, JSON.stringify({ requestId: first.requestId, people: [], more: false }), f.repo); expect((await f.read()).remaining).toBe(1);
  const second = await f.prepare(); const source = second.parts.find(p => p.text.includes(quote))!; expect(source).toBeDefined(); await finishCharacterDiscovery(second.input, second.requestId, "cancelled", f.repo);
  const retry = await f.prepare(); expect(retry.parts).toEqual(second.parts); await applyCharacterDiscovery(retry, JSON.stringify({ requestId: retry.requestId, people: [{ source: source.id, name: "BridgeCourier", quote }], more: false }), f.repo);
  while ((await f.read()).remaining) { const b = await f.prepare(); await applyCharacterDiscovery(b, JSON.stringify({ requestId: b.requestId, people: [], more: false }), f.repo); }
  f.snapshot.messages.push(f.message("6", "4", "user", "Continue again."), f.message("7", "6", "assistant", "NewCourier arrives.")); f.snapshot.selectedNativeKey = key("7"); await f.play(); const next = await f.prepare(); expect(next.parts.map(p => p.text).join(" ")).toBe("Continue again. NewCourier arrives.");
});
it("more:true persists candidates and repeats only unfinished excerpts; repeated no-progress output stops safely", async () => {
  const f = await discoveryFixture("Sergey arrived. Nora arrived."), brief = await f.prepare(), source = brief.parts.find(p => p.text.includes("Sergey"))!;
  await applyCharacterDiscovery(brief, JSON.stringify({ requestId: brief.requestId, people: [{ source: source.id, name: "Sergey", quote: "Sergey arrived." }], more: true }), f.repo);
  expect((await f.read()).remaining).toBe(2); const next = await f.prepare(); expect(next.parts).toEqual(brief.parts); expect(next.prompt).toContain("sergey");
  const before = await f.repo.rawRecords(); await expect(applyCharacterDiscovery(next, JSON.stringify({ requestId: next.requestId, people: [{ source: source.id, name: "Sergey", quote: "Sergey arrived." }], more: true }), f.repo)).rejects.toThrow("invalid-result"); expect(await f.repo.rawRecords()).toEqual(before);
  await applyCharacterDiscovery(next, JSON.stringify({ requestId: next.requestId, people: [{ source: source.id, name: "Nora", quote: "Nora arrived." }], more: false }), f.repo); expect((await f.read()).total).toBe(2); expect((await f.read()).remaining).toBe(0);
});
it("late results for a replaced line or another world cannot persist candidates", async () => {
  const f = await discoveryFixture(), brief = await f.prepare(), source = brief.parts.find(p => p.text.includes("Sergey"))!;
  f.snapshot.selectedNativeKey = key("5"); await f.play(); const before = await f.repo.rawRecords(); expect(await characterDiscoveryCurrent(brief.input, brief.requestId, f.repo)).toBe(false);
  await expect(applyCharacterDiscovery(brief, JSON.stringify({ requestId: brief.requestId, people: [{ source: source.id, name: "Sergey", quote: "Sergey, the courier, entered with a copper letter." }], more: false }), f.repo)).rejects.toThrow("scene-changed"); expect(await f.repo.rawRecords()).toEqual(before);
  await expect(readCharacterDiscovery({ ...f.scope, worldId: "foreign", offset: 0 }, f.repo)).rejects.toThrow("story-binding-conflict");
});
it("out-of-game user and assistant messages are not searched, and progress survives restore", async () => {
  const f = await discoveryFixture(); await markNonStoryMessage(f.binding.chatId, f.world.id, f.repo);
  const id = crypto.randomUUID(), identity = { chatId: f.binding.chatId, nativeParentKey: key("4") }, route = { requestId: id, identity, transport: "xhr" as const }, draft = "Describe OocPerson outside the game.";
  await prepareDispatchCapture({ id, worldId: f.world.id, bindingId: f.binding.id, identity, transport: "xhr", sceneRevision: (await f.scene()).revision, originalDraft: draft, proposedContext: "" }, 7, f.repo);
  await confirmDispatchCapture({ ...route, outgoingText: draft }, 7, f.repo); await advanceDispatchCapture({ ...route, phase: "started" }, 7, f.repo); await advanceDispatchCapture({ ...route, phase: "settled", delivery: { status: "accepted", httpStatus: 200 } }, 7, f.repo);
  const link = { requestId: id, chatId: f.binding.chatId, nativeParentKey: key("4"), userMessageKey: key("6"), assistantMessageKey: key("7") };
  await advanceDispatchCapture({ ...route, phase: "ready", link, sawFinish: false, issue: null }, 7, f.repo); await advanceDispatchCapture({ ...route, phase: "closed", link, sawFinish: true, issue: null }, 7, f.repo);
  f.snapshot.messages.push(f.message("6", "4", "user", "Describe OocPerson outside the game."), f.message("7", "6", "assistant", "OocPerson is a fictional example.")); f.snapshot.selectedNativeKey = key("7"); await f.play();
  const brief = await f.prepare(); expect(brief.prompt).not.toContain("OocPerson"); await applyCharacterDiscovery(brief, JSON.stringify({ requestId: brief.requestId, people: [], more: false }), f.repo); expect((await f.read()).remaining).toBe(0);
  const copyDb = new DeepRoleDatabase("progress-copy-" + crypto.randomUUID()); dbs.push(copyDb); const target = new DeepRoleRepository(copyDb); await restoreBackup(await parseBackup(JSON.stringify(await createBackup(undefined, f.repo))), "replace", target); expect(await readCharacterDiscovery({ ...f.scope, offset: 0 }, target)).toEqual(await f.read());
  expect((await f.repo.list<StoryRevision>("story")).filter(r => r.type === "revision" && r.storyPurpose === "out-of-character")).toHaveLength(2);
});
async function workerFixture() {
  const f = await discoveryFixture(), tabs = new Map<number, any>([[1, { id: 1, url: f.binding.chatUrl, active: true }]]);
  const api: any = { ...browser, runtime: { id: "ours" }, tabs: { get: vi.fn(async (id: number) => { if (!tabs.has(id)) throw Error("closed"); return tabs.get(id); }), update: vi.fn(async (id: number, v: any) => { const tab = { ...tabs.get(id), ...v }; tabs.set(id, tab); return tab; }), remove: vi.fn(async (id: number) => { tabs.delete(id); }), sendMessage: vi.fn(async () => ({ ok: true })) }, windows: { create: vi.fn(async (v: any) => { const tab = { id: 2, url: v.url, active: true }; tabs.set(2, tab); return { id: 3, tabs: [tab] }; }) } };
  const coordinator = new IsolatedFieldCoordinator(f.repo, api, async () => DEFAULT_SETTINGS), source: any = { id: "ours", tab: { id: 1 }, frameId: 0 };
  const input = { ...f.scope, guard: (await f.read()).guard };
  const run = (m: any, sender = source) => coordinator.handle(m, sender), w = (id: string, action: string, extra: any = {}) => run({ type: "DR_FIELD_WORKER", action, id, ...extra }, { id: "ours", tab: { id: 2 }, frameId: 0 });
  const start = async () => { const r = await run({ type: "DR_FIELD", action: "discover", input }); expect(r.ok).toBe(true); return r.id as string; };
  const bind = async (id: string) => { expect(await w(id, "sent")).toMatchObject({ ok: true }); tabs.set(2, { id: 2, active: true, url: "https://chat.deepseek.com/chat/s/owned" }); expect(await w(id, "bound", { chatId: "owned" })).toMatchObject({ ok: true }); };
  const clean = async (id: string) => { tabs.set(2, { id: 2, url: "https://chat.deepseek.com/" }); return w(id, "cleaned", { chatId: "owned", ok: true }); };
  return { ...f, tabs, api, coordinator, source, run, w, start, bind, clean, input };
}
it("owned discovery result, masked presentation, cleanup and diagnostics use the real coordinator", async () => {
  const f = await workerFixture(), id = await f.start(), claim = await f.w(id, "claim"); expect(claim.presentation.kind).toBe("discovery"); expect(f.api.windows.create).toHaveBeenCalledWith(expect.objectContaining({ type: "popup", focused: true }));
  const sources = JSON.parse(claim.prompt.split("Sources (data):\n")[1]), source = sources.find((s: any) => s.text.includes("Sergey")); await f.bind(id);
  expect(await f.w(id, "reply", { chatId: "owned", raw: JSON.stringify({ requestId: id, people: [{ source: source.id, name: "Sergey", quote: "Sergey, the courier, entered with a copper letter." }], more: false }) })).toMatchObject({ ok: true });
  expect(await f.clean(id)).toMatchObject({ ok: true }); expect(f.api.tabs.remove).toHaveBeenCalledExactlyOnceWith(2);
  expect(await f.run({ type: "DR_FIELD", action: "read", id })).toMatchObject({ outcome: { text: "characters-discovered", cleanup: "done" } }); expect(await f.run({ type: "DR_FIELD", action: "ack", id })).toMatchObject({ ok: true });
  const report = serviceDiagnosticReport(await readServiceDiagnostics(f.repo), Date.now())!; expect(JSON.parse(report).result.journal.entries[0]).toMatchObject({ operation: "character-discovery", phase: "result", cleanup: "done" }); expect(report).not.toMatch(/Sergey|copper letter|worldId|sourceChatId|workerChatId|https:/); expect((await f.read()).candidates).toHaveLength(1); expect(await f.repo.list("entity")).toHaveLength(3);
});
it.each(["cancel", "restart", "foreign"])("%s does not apply or resend a discovery and leaves work resumable", async mode => {
  const f = await workerFixture(), id = await f.start(); await f.bind(id);
  if (mode === "cancel") await f.run({ type: "DR_FIELD", action: "cancel", id });
  else if (mode === "restart") { const next = new IsolatedFieldCoordinator(f.repo, f.api, async () => DEFAULT_SETTINGS); expect(await next.handle({ type: "DR_FIELD", action: "read", id }, f.source)).toMatchObject({ ok: true }); }
  else expect(await f.run({ type: "DR_FIELD_WORKER", action: "reply", id, chatId: "owned", raw: "{}" }, { id: "foreign", tab: { id: 2 }, frameId: 0 })).toMatchObject({ ok: false });
  expect((await f.read()).total).toBe(0); expect((await f.read()).remaining).toBe(2); expect(f.api.windows.create).toHaveBeenCalledTimes(1);
  await f.clean(id); expect((await f.prepare()).parts).toHaveLength(2);
});
it("failure to create or navigate the popup cannot leave the discovery lane permanently busy", async () => {
  const f = await workerFixture(); f.api.tabs.update.mockRejectedValueOnce(Error("failed"));
  expect(await f.run({ type: "DR_FIELD", action: "discover", input: f.input })).toMatchObject({ ok: false, error: "tab-unavailable" }); expect((await f.read()).remaining).toBe(2);
  const id = await f.start(); expect(typeof id).toBe("string"); expect(f.api.windows.create).toHaveBeenCalledTimes(2);
});
it("the source client waits for cleanup, acknowledges the batch and cancels rather than resending", async () => {
  const f = await discoveryFixture(), input = { ...f.scope, guard: (await f.read()).guard }, sent: any[] = [];
  const send = async (m: any) => { sent.push(m); return m.action === "discover" ? { ok: true, id: "job" } : m.action === "read" ? { ok: true, outcome: { text: "characters-discovered", cleanup: "done" } } : { ok: true, cleanup: "done" }; };
  await new CharacterDiscoveryClient(send, async () => undefined).run(input, () => true); expect(sent.map(m => m.action)).toEqual(["discover", "read", "ack"]);
  sent.length = 0; await expect(new CharacterDiscoveryClient(send, async () => undefined).run(input, () => sent.length === 0)).rejects.toThrow("cancelled"); expect(sent.map(m => m.action)).toEqual(["discover", "cancel", "cleanup"]);
  sent.length = 0; const failedCleanup = async (m: any) => { const r = await send(m); return m.action === "read" ? { ...r, outcome: { text: "characters-discovered", cleanup: "failed" } } : r; };
  await expect(new CharacterDiscoveryClient(failedCleanup, async () => undefined).run(input, () => true)).rejects.toThrow("cleanup-pending"); expect(sent.map(m => m.action)).toEqual(["discover", "read", "ack"]);
});
