import { afterEach, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { storyWorld } from "./fixtures/story-worlds";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import { characterInChat, characterRevision, characterInstruction } from "../src/core/characters";
import { nativeStoryMessageKey as key } from "../src/core/story-transport";
import { assertStoryGraph, type StoryEvent } from "../src/core/story-records";
import { runStoryGame } from "../src/storage/story-game";
import { readCharacterDiscovery, prepareCharacterDiscovery, applyCharacterDiscovery, approveCharacterDiscovery } from "../src/storage/story-character-discovery";
import { prepareDiscoveryProfile, applyDiscoveryProfile, discoveryProfileCurrent, type DiscoveryProfileBrief } from "../src/storage/discovery-profile";
import { validDiscoveryProfile } from "../src/core/discovery-profile";
import { validCharacterDiscoveryApproval, validCharacterDiscoveryPage } from "../src/core/story-character-discovery";
import type { ProfileValues } from "../src/core/character-profile";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { IsolatedFieldCoordinator } from "../src/adapters/isolated-field-coordinator";
import { CharacterDiscoveryClient } from "../src/adapters/character-discovery-client";
import type { ChatBinding, SceneEntity } from "../src/core/types";
const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dbs.splice(0).map(d => d.delete())); });
const empty = (): ProfileValues => ({ appearance: "", personality: "", goals: "", background: "Author says he is a courier." });
async function fixture() {
  const f = storyWorld("en", 41), db = new DeepRoleDatabase("profile-discovery-" + crypto.randomUUID()); dbs.push(db); const repo = new DeepRoleRepository(db); await repo.mergeRecords(f.records);
  const message = (id: string, parent: string | null, role: "user" | "assistant", content: string) => ({ identity: { nativeMessageKey: key(id), nativeParentKey: parent === null ? null : key(parent), role }, completion: "complete" as const, content });
  const snapshot = { chatId: f.binding.chatId, selectedNativeKey: key("2"), messages: [message("1", null, "user", "OldPerson"), message("2", "1", "assistant", "Old descriptions")] }, scope = { chatId: f.binding.chatId, worldId: f.world.id };
  const scene = async () => (await repo.get<ChatBinding>("binding", f.binding.id))!.characterScenes![f.world.id]!;
  const play = async (operation: "start" | "sync" = "sync") => runStoryGame({ ...scope, expectedBase: characterRevision((await repo.list<SceneEntity>("entity")).filter(e => characterInChat(e, scope.chatId)), await scene()), snapshot, nativeParentKey: null, operation, manual: "stop" }, DEFAULT_SETTINGS, repo);
  await play("start"); snapshot.messages.push(message("3", "2", "user", "Continue."), message("4", "3", "assistant", "Sergey arrived with a letter.")); snapshot.selectedNativeKey = key("4"); await play();
  const read = () => readCharacterDiscovery({ ...scope, offset: 0 }, repo), b = await prepareCharacterDiscovery({ ...scope, guard: (await read()).guard }, "discover_" + crypto.randomUUID(), "en", repo), s = b.parts.find(s => s.text.includes("Sergey"))!;
  await applyCharacterDiscovery(b, JSON.stringify({ requestId: b.requestId, people: [{ source: s.id, name: "Sergey", quote: "Sergey arrived with a letter." }], more: false }), repo);
  snapshot.messages.push(message("6", "4", "user", "Describe Sergey."), message("7", "6", "assistant", "Sergey wears a red coat. Sergey patiently waits."), message("8", "6", "assistant", "Sergey wears a gold crown.")); snapshot.selectedNativeKey = key("7"); await play();
  snapshot.selectedNativeKey = key("8"); await play(); snapshot.selectedNativeKey = key("7"); await play();
  const input = async (values = empty()) => ({ ...scope, guard: (await read()).guard, eventId: (await read()).candidates[0]!.eventId, name: "Sergey North", values });
  const prepare = async (values = empty()) => prepareDiscoveryProfile(await input(values), "field_" + crypto.randomUUID(), "en", repo);
  return { ...f, repo, scope, snapshot, message, scene, play, read, input, prepare };
}
function raw(b: DiscoveryProfileBrief, change?: (fields: any) => void) {
  const source = b.sources.find(s => s.text.includes("Sergey wears a red coat."))!;
  const fields = { appearance: { status: "found", text: "Wears a red coat.", evidence: [{ source: source.id, quote: "Sergey wears a red coat." }] }, personality: { status: "found", text: "Patient.", evidence: [{ source: source.id, quote: "Sergey patiently waits." }] }, goals: { status: "not-found", text: "", evidence: [] }, background: { status: "not-found", text: "", evidence: [] } };
  change?.(fields); return JSON.stringify({ requestId: b.requestId, field: "character-profile", fields });
}
it("retrieves one name from only recorded chosen prose, stores a verified proposal without adding an entity", async () => {
  const f = await fixture(), before = await f.repo.rawRecords(), b = await f.prepare(); expect(b.prompt).not.toMatch(/OldPerson|gold crown|Resident 41|data:image/); expect(b.prompt).toContain("Author says he is a courier."); expect(b.sources.reduce((n, s) => n + s.text.length, 0)).toBeLessThanOrEqual(12000);
  await applyDiscoveryProfile(b, raw(b), f.repo); const page = await f.read(), p = page.candidates[0]!.profile!;
  expect(validDiscoveryProfile(p)).toBe(true); expect(validCharacterDiscoveryPage(page)).toBe(true); expect(p.values.background).toBe(empty().background); expect(p.proposal.goals).toMatchObject({ status: "not-found", text: "" }); expect(p.proofs).toHaveLength(2);
  expect((await f.repo.rawRecords()).filter(r => r.kind !== "story")).toEqual(before.filter(r => r.kind !== "story")); assertStoryGraph(await f.repo.rawRecords());
  const changed = structuredClone(p); changed.proposal.appearance!.status = "suggested"; expect(validDiscoveryProfile(changed)).toBe(false);
});
it("rejects fabricated/foreign citations and mismatched envelopes without any partial writes", async () => {
  const f = await fixture(), b = await f.prepare(), before = await f.repo.rawRecords();
  for (const body of [raw(b, fields => fields.appearance.evidence[0].quote = "Sergey wears a silver coat."), raw(b, fields => fields.appearance.evidence[0].source = "alien"), raw(b, fields => fields.goals = { status: "suggested", text: "Become king.", evidence: [] }), raw(b).replace(b.requestId, "field_foreign")]) await expect(applyDiscoveryProfile(b, body, f.repo)).rejects.toThrow();
  expect(await f.repo.rawRecords()).toEqual(before);
});
it("bounds encoded sources for long histories, keeps recent mentions and excludes OOC and metadata prose", async () => {
  const f = await fixture();
  for (let i = 0; i < 12; i++) { const parent = i ? String(101 + (i - 1) * 2) : "7", user = String(100 + i * 2), assistant = String(101 + i * 2); f.snapshot.messages.push(f.message(user, parent, "user", "Continue."), f.message(assistant, user, "assistant", "Sergey watches. " + "Other scenery. ".repeat(240) + " Sergey wears a green cloak.<deeprole_characters>{\"hidden\":\"Sergey secret metadata\"}</deeprole_characters>")); f.snapshot.selectedNativeKey = key(assistant); }
  await f.play();
  const user = (await f.repo.list<any>("story")).find(r => r.type === "revision" && r.nativeMessageKey === key("6")); await f.repo.put("story", { ...user, content: "Sergey OOC costume request.", storyPurpose: "out-of-character" });
  const b = await f.prepare(); expect(b.sources.length).toBeLessThanOrEqual(16); expect(JSON.stringify(b.sources.map(({ id, text }) => ({ id, text }))).length).toBeLessThanOrEqual(12000); expect(b.partial).toBe(true); expect(b.prompt).toContain("green cloak"); expect(b.prompt).not.toMatch(/secret metadata|OOC costume request|gold crown/);
});
it("approves editable fields at the current turn, never leaks later profile facts backwards, and reuses identity", async () => {
  const f = await fixture(), b = await f.prepare(); await applyDiscoveryProfile(b, raw(b), f.repo); const page = await f.read(), values = { ...empty(), appearance: "Author edited: a blue coat.", personality: "Patient." };
  await approveCharacterDiscovery({ ...f.scope, guard: page.guard, eventId: page.candidates[0]!.eventId, name: "Sergey North", background: values.background, values, accept: true }, f.repo);
  const person = (await f.repo.list<SceneEntity>("entity")).find(p => p.name === "Sergey North")!;
  expect(person.characterSheet).toMatchObject({ ...values, protagonist: false }); expect(person.aliases).toEqual(["Sergey"]); expect(person.playthroughChatId).toBe(f.scope.chatId); expect((await f.scene()).presentIds).not.toContain(person.id);
  const event = (await f.repo.get<StoryEvent>("story", page.candidates[0]!.eventId))!; expect(event.revisionId).toBe(page.guard.headRevisionId); expect(event.characterSourceRevisionId).not.toBe(event.revisionId); assertStoryGraph(await f.repo.rawRecords());
  expect(characterInstruction(f.scope.worldId, f.scope.chatId, await f.repo.list("entity"), await f.scene(), ["neutral"], [], "Sergey, come.")).toContain("a blue coat");
  f.snapshot.selectedNativeKey = key("4"); await f.play(); expect(await f.repo.get("entity", person.id)).toBeNull();
  f.snapshot.selectedNativeKey = key("8"); await f.play(); expect(await f.repo.get("entity", person.id)).toBeNull();
  f.snapshot.selectedNativeKey = key("7"); await f.play(); expect(await f.repo.get("entity", person.id)).toEqual(person); await f.play(); expect((await f.repo.list<SceneEntity>("entity")).filter(p => p.name === person.name)).toHaveLength(1);
  await f.repo.enableVault("synthetic vault password"); const backup = await parseBackup(JSON.stringify(await createBackup("synthetic backup password", f.repo)), "synthetic backup password"); const db = new DeepRoleDatabase("profile-copy-" + crypto.randomUUID()); dbs.push(db); const copy = new DeepRoleRepository(db); await restoreBackup(backup, "replace", copy); expect(await copy.rawRecords()).toEqual(await f.repo.rawRecords()); assertStoryGraph(await copy.rawRecords());
}, 15000);
it("blocks stale generation/approval after the chosen story advances but keeps the saved draft", async () => {
  const f = await fixture(), b = await f.prepare(); await applyDiscoveryProfile(b, raw(b), f.repo);
  f.snapshot.messages.push(f.message("9", "7", "user", "Continue."), f.message("10", "9", "assistant", "Sergey leaves.")); f.snapshot.selectedNativeKey = key("10"); await f.play();
  expect(await discoveryProfileCurrent(b.input, f.repo)).toBe(false); await expect(applyDiscoveryProfile(b, raw(b), f.repo)).rejects.toThrow("story-review-stale");
  const page = await f.read(); await expect(approveCharacterDiscovery({ ...f.scope, guard: page.guard, eventId: b.input.eventId, name: b.input.name, background: empty().background, values: empty(), accept: true }, f.repo)).rejects.toThrow("story-review-stale"); expect(page.candidates[0]!.profile).toBeDefined(); expect((await f.repo.list("entity")).length).toBe(41);
});
it("validates proof ancestry, forbidding citations from alternate answers or OOC/metadata", async () => {
  const f = await fixture(), b = await f.prepare(); await applyDiscoveryProfile(b, raw(b), f.repo); const rows = await f.repo.rawRecords(), event = rows.find(r => r.id === b.input.eventId)!.data as StoryEvent, alternative = rows.find(r => r.kind === "story" && (r.data as any).nativeMessageKey === key("8"))!.id;
  const corrupted = structuredClone(rows), profile = (corrupted.find(r => r.id === event.id)!.data as StoryEvent).characterProfile!; profile.proofs[0] = { revisionId: alternative, quote: "Sergey wears a red coat." }; expect(() => assertStoryGraph(corrupted)).toThrow("story-evidence-invalid");
  expect(validCharacterDiscoveryApproval({ ...b.input, background: "different", accept: true })).toBe(false);
});
it("manual profile additions are preserved without requiring a model call and cannot erase subsequent edits", async () => {
  const f = await fixture(), page = await f.read(), values = { ...empty(), appearance: "Written by the author." };
  await approveCharacterDiscovery({ ...f.scope, guard: page.guard, eventId: page.candidates[0]!.eventId, name: "Sergey", values, background: values.background, accept: true }, f.repo);
  const person = (await f.repo.list<SceneEntity>("entity")).find(p => p.name === "Sergey")!; expect(person.characterSheet!.appearance).toBe(values.appearance); await f.repo.put("entity", { ...person, characterSheet: { ...person.characterSheet!, goals: "Manual later edit" } }); f.snapshot.selectedNativeKey = key("4"); await expect(f.play()).rejects.toThrow("story-profile-conflict"); expect((await f.repo.get<SceneEntity>("entity", person.id))!.characterSheet!.goals).toBe("Manual later edit");
});
it("uses the existing service client with no resending, correct marker and cleanup acknowledgement", async () => {
  const f = await fixture(), input = await f.input(), calls: any[] = [], send = async (m: any) => { calls.push(m); return m.action === "discovery-profile" ? { ok: true, id: "job" } : m.action === "read" ? { ok: true, outcome: { text: "profile-prepared", cleanup: "done" } } : { ok: true }; };
  await new CharacterDiscoveryClient(send, async () => undefined).run(input, () => true); expect(calls.map(c => c.action)).toEqual(["discovery-profile", "read", "ack"]);
});
it("runs preparation in a masked owned popup, clears raw job data, cleans it and never stores draft prose in ownership", async () => {
  const f = await fixture(), input = await f.input();
  const tabs = new Map<number, any>([[1, { id: 1, active: true, url: f.binding.chatUrl }], [2, { id: 2, active: true, url: "about:blank" }]]), session: Record<string, any> = {};
  const api = { runtime: { id: "extension" }, tabs: { get: vi.fn(async (id: number) => tabs.get(id)), update: vi.fn(async (id: number, p: any) => { Object.assign(tabs.get(id), p); }), remove: vi.fn(async (id: number) => tabs.delete(id)), sendMessage: vi.fn(async () => undefined) }, windows: { create: vi.fn(async () => ({ tabs: [tabs.get(2)] })) }, storage: { session: { get: vi.fn(async (k: string) => ({ [k]: session[k] })), set: vi.fn(async (v: any) => Object.assign(session, structuredClone(v))) }, local: browser.storage.local } } as any;
  const c = new IsolatedFieldCoordinator(f.repo, api, async () => DEFAULT_SETTINGS), sender = (id: number) => ({ id: "extension", frameId: 0, tab: tabs.get(id) });
  const start = await c.handle({ type: "DR_FIELD", action: "discovery-profile", input }, sender(1)); expect(start.ok).toBe(true); expect(api.windows.create).toHaveBeenCalledWith(expect.objectContaining({ focused: true, type: "popup" })); expect(JSON.stringify(session)).not.toContain(input.values.background);
  const claim = await c.handle({ type: "DR_FIELD_WORKER", action: "claim", id: start.id }, sender(2)); expect(claim.presentation).toMatchObject({ kind: "profile", characterName: input.name });
  const b = await prepareDiscoveryProfile(input, start.id, "en", f.repo); expect(await c.handle({ type: "DR_FIELD_WORKER", action: "sent", id: start.id }, sender(2))).toMatchObject({ ok: true }); tabs.get(2).url = "https://chat.deepseek.com/chat/s/owned-profile"; await c.handle({ type: "DR_FIELD_WORKER", action: "bound", id: start.id, chatId: "owned-profile" }, sender(2));
  expect(await c.handle({ type: "DR_FIELD_WORKER", action: "reply", id: start.id, chatId: "owned-profile", raw: raw(b) }, sender(2))).toMatchObject({ ok: true }); expect((await f.read()).candidates[0]!.profile).toBeDefined(); expect((await f.repo.list("entity")).length).toBe(41);
  await c.handle({ type: "DR_FIELD", action: "cancel", id: start.id }, sender(1)); expect(session.deeprole_field_owners[0].phase).toBe("result"); expect(session.deeprole_field_owners[0].error).toBeUndefined();
  tabs.get(2).url = "https://chat.deepseek.com/"; await c.handle({ type: "DR_FIELD_WORKER", action: "cleaned", id: start.id, chatId: "owned-profile", ok: true }, sender(2)); const result = await c.handle({ type: "DR_FIELD", action: "read", id: start.id }, sender(1)); expect(result.outcome).toMatchObject({ text: "profile-prepared", cleanup: "done" }); expect(tabs.has(2)).toBe(false); await c.handle({ type: "DR_FIELD", action: "ack", id: start.id }, sender(1));
});
