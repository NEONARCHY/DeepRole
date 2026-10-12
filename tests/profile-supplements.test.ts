import { afterEach, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { profileFixture, supplementReply } from "./fixtures/profile-supplements";
import { applyProfileSupplement, approveProfileSupplement, prepareProfileSupplement, profileSupplementCurrent } from "../src/storage/profile-supplements";
import { validSupplementPage, validSupplementInput, appendProfileText } from "../src/core/profile-supplements";
import { currentStoryProfileEntities, validProfileVersions } from "../src/core/story-profile-view";
import { assertStoryGraph, type StoryEvent } from "../src/core/story-records";
import { nativeStoryMessageKey as key } from "../src/core/story-transport";
import { characterInstruction, characterRevision } from "../src/core/characters";
import { characterEditBaseline } from "../src/core/character-edit";
import { profileField, profileValues } from "../src/core/character-profile";
import { characterTextRequest } from "../src/core/character-text";
import { isolatedFieldPrompt } from "../src/core/isolated-character-text";
import { saveCharacter } from "../src/storage/characters";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import { IsolatedFieldCoordinator } from "../src/adapters/isolated-field-coordinator";
import { CharacterDiscoveryClient } from "../src/adapters/character-discovery-client";
import { serviceDiagnosticReport } from "../src/core/service-diagnostics";
import { readServiceDiagnostics } from "../src/storage/service-diagnostics";
import type { SceneEntity } from "../src/core/types";
const dbs: DeepRoleDatabase[] = []; afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dbs.splice(0).map(db => db.delete())); });
const setup = async (count?: number) => { const f = await profileFixture(count); dbs.push(f.db); return f; };
const approve = async (f: Awaited<ReturnType<typeof setup>>, b: Awaited<ReturnType<typeof f.prepare>>, additions = { appearance: "A scar above her left eyebrow.", background: "Grew up by the harbor." }) => approveProfileSupplement({ ...f.scope, guard: (await f.read()).guard, eventId: b.requestId, additions, accept: true }, f.repo);
it("preserves the raw world, stores one source-backed proposal and appends only after approval", async () => {
 const f = await setup(), before = await f.repo.rawRecords(), b = await f.prepare(); expect(b.prompt).not.toMatch(/Old Mira costume|data:image|portraitLibrary/); expect(b.prompt).toContain("SUPPLEMENT JOB"); expect(b.prompt).toContain("Author: green coat."); expect(b.sources.length).toBeLessThanOrEqual(16);
 await applyProfileSupplement(b, supplementReply(b), f.repo); await applyProfileSupplement(b, supplementReply(b), f.repo); const page = await f.read(); expect(validSupplementPage(page)).toBe(true); expect(page.target!.suggestions).toHaveLength(1); expect(page.target!.values.appearance).toBe("Author: green coat.");
 expect((await f.repo.rawRecords()).filter(r => r.kind !== "story")).toEqual(before.filter(r => r.kind !== "story")); expect(await approve(f, b)).toMatchObject({ applied: 2, skipped: [] });
 const visible = (await f.visible()).find(e => e.id === f.actor.id)!; expect(visible.characterSheet).toMatchObject({ appearance: "Author: green coat.\nA scar above her left eyebrow.", background: "Grew up by the harbor.", personality: "Patient.", goals: "" }); expect(await f.repo.get("entity", f.actor.id)).toEqual(f.actor); expect((await f.visible(f.other.chatId)).find(e => e.id === f.actor.id)).toEqual(f.actor);
 expect(await approve(f, b)).toMatchObject({ applied: 0 }); expect((await f.read()).target!.suggestions[0]!.accepted).toBe(true); assertStoryGraph(await f.repo.rawRecords());
});
it("selected variants undo/reapply supplements without changing entity identity, photos or numeric state", async () => {
 const f = await setup(), b = await f.prepare(); await applyProfileSupplement(b, supplementReply(b), f.repo); const before = await f.scene(); await approve(f, b); expect((await f.scene()).states).toEqual(before.states); expect((await f.scene()).presentIds).toEqual(before.presentIds);
 f.snapshot.selectedNativeKey = key("2"); await f.play(); expect((await f.visible()).find(e => e.id === f.actor.id)).toEqual(f.actor);
 f.snapshot.selectedNativeKey = key("5"); await f.play(); expect((await f.visible()).find(e => e.id === f.actor.id)).toEqual(f.actor);
 f.snapshot.selectedNativeKey = key("4"); await f.play(); expect((await f.visible()).find(e => e.id === f.actor.id)!.characterSheet!.appearance).toContain("left eyebrow"); await f.play(); expect((await f.repo.list("entity")).length).toBe(3);
 await approveProfileSupplement({ ...f.scope, guard: (await f.read()).guard, eventId: b.requestId, additions: {}, accept: false }, f.repo); expect((await f.visible()).find(e => e.id === f.actor.id)).toEqual(f.actor);
});
it("profile additions enter game and wand context, but never a different chat's context", async () => {
 const f = await setup(), b = await f.prepare(); await applyProfileSupplement(b, supplementReply(b), f.repo); await approve(f, b);
 const people = await f.visible(), p = people.find(e => e.id === f.actor.id)!; expect(characterInstruction(f.world.id, f.scope.chatId, people, await f.scene(), ["neutral"], [p.id], "Mira, continue.")).toContain("left eyebrow");
 const draft = characterTextRequest(profileField("en", "history"), JSON.stringify(profileValues(p.characterSheet!)), p.name, p, p.characterSheet!, (await f.scene()).states[p.id]!);
 const input = { scope: { ...f.scope, chatUrl: f.binding.chatUrl, bookId: null }, locale: "en" as const, draft, sceneReference: "" };
 expect(isolatedFieldPrompt(input, await f.repo.rawRecords(), DEFAULT_SETTINGS, "field_next").prompt).toContain("left eyebrow");
 const otherInput = { ...input, scope: { ...input.scope, chatId: f.other.chatId, chatUrl: f.other.chatUrl }, draft: characterTextRequest(profileField("en", "history"), JSON.stringify(profileValues(f.actor.characterSheet!)), p.name, f.actor, f.actor.characterSheet!, (await f.scene()).states[p.id]!) };
 expect(isolatedFieldPrompt(otherInput, await f.repo.rawRecords(), DEFAULT_SETTINGS, "field_next").prompt).not.toContain("left eyebrow");
});
it("rejects late preparation after story/author changes and rejects fabricated or creative evidence", async () => {
 const f = await setup(), b = await f.prepare(), before = await f.repo.rawRecords();
 for (const raw of [supplementReply(b).replace(b.requestId, "foreign"), supplementReply(b, fields => fields.appearance.evidence[0].quote = "Mira has magic wings."), supplementReply(b, fields => fields.goals = { status: "suggested", text: "Rule the city", evidence: [] })]) await expect(applyProfileSupplement(b, raw, f.repo)).rejects.toThrow();
 expect(await f.repo.rawRecords()).toEqual(before); await f.repo.put("entity", { ...f.actor, characterSheet: { ...f.actor.characterSheet!, appearance: "Author changed it while waiting." } }); await expect(applyProfileSupplement(b, supplementReply(b), f.repo)).rejects.toThrow("scene-changed");
 const next = await f.prepare(); f.snapshot.messages.push(f.message("6", "4", "user", "Continue."), f.message("7", "6", "assistant", "Mira leaves.")); f.snapshot.selectedNativeKey = key("7"); await f.play(); expect(await profileSupplementCurrent(next.input, f.repo)).toBe(false); await expect(applyProfileSupplement(next, supplementReply(next), f.repo)).rejects.toThrow();
});
it("keeps a late author edit while applying an independent field from the same proposal", async () => {
 const f = await setup(), b = await f.prepare(); await applyProfileSupplement(b, supplementReply(b), f.repo); const manual = { ...f.actor, characterSheet: { ...f.actor.characterSheet!, appearance: "New author description" } }; await f.repo.put("entity", manual);
 expect(await approve(f, b)).toMatchObject({ applied: 1, skipped: ["appearance"] }); const p = (await f.visible()).find(e => e.id === f.actor.id)!; expect(p.characterSheet).toMatchObject({ appearance: "New author description", background: "Grew up by the harbor." }); expect(await f.repo.get("entity", p.id)).toEqual(manual);
});
it("manual editor saving another field does not promote unedited supplements; clearing stays authoritative across variants", async () => {
 const f = await setup(), b = await f.prepare(); await applyProfileSupplement(b, supplementReply(b), f.repo); await approve(f, b); let people = await f.visible(), p = people.find(e => e.id === f.actor.id)!, scene = await f.scene();
 const original = characterEditBaseline(p, people, scene), edit = { ...f.scope, chatUrl: f.binding.chatUrl, base: characterRevision(people, scene), entityId: p.id, name: p.name, sheet: { ...p.characterSheet!, goals: "Author: finish an atlas." }, state: scene.states[p.id]!, present: true, original };
 const saved = await saveCharacter(edit, f.repo); const raw = (await f.repo.get<SceneEntity>("entity", p.id))!; expect(raw.characterSheet).toMatchObject({ appearance: f.actor.characterSheet!.appearance, background: "", goals: "Author: finish an atlas." }); expect(saved.original.sheet.appearance).toContain("left eyebrow"); expect(saved.original.sheet.background).toBe("Grew up by the harbor.");
 people = await f.visible(); p = people.find(e => e.id === p.id)!; scene = await f.scene(); await saveCharacter({ ...edit, base: characterRevision(people, scene), original: characterEditBaseline(p, people, scene), sheet: { ...p.characterSheet!, background: "" } }, f.repo); expect(validProfileVersions((await f.repo.get<SceneEntity>("entity", p.id))!.profileFieldRevisions)).toBe(true); expect((await f.visible()).find(e => e.id === p.id)!.characterSheet!.background).toBe("");
 await f.play("sync", "keep"); f.snapshot.selectedNativeKey = key("5"); await f.play("sync", "keep"); f.snapshot.selectedNativeKey = key("4"); await f.play("sync", "keep"); expect((await f.visible()).find(e => e.id === p.id)!.characterSheet!.background).toBe(""); expect((await f.visible()).find(e => e.id === p.id)!.characterSheet!.appearance).toContain("left eyebrow");
});
it("size overflow and unproved fields fail atomically; old profile text is never truncated", async () => {
 const f = await setup(), b = await f.prepare(); await applyProfileSupplement(b, supplementReply(b), f.repo); const before = await f.repo.rawRecords(); await expect(approve(f, b, { appearance: "x".repeat(1200), background: "Harbor" })).rejects.toThrow("text-too-long"); expect(await f.repo.rawRecords()).toEqual(before);
 await expect(approveProfileSupplement({ ...f.scope, guard: (await f.read()).guard, eventId: b.requestId, additions: { goals: "Invented goal" }, accept: true }, f.repo)).rejects.toThrow("invalid-result"); expect(appendProfileText("Known", " New ")).toBe("Known\nNew");
});
it("proof graph and backup preserve scope and prohibit raw profile replacement", async () => {
 const f = await setup(), b = await f.prepare(); await applyProfileSupplement(b, supplementReply(b), f.repo); await approve(f, b); const all = await f.repo.rawRecords(), corrupt = structuredClone(all), e = corrupt.find(r => r.kind === "story" && r.id === b.requestId)!.data as StoryEvent; e.profileUpdate!.appearance = "REPLACED AUTHOR"; expect(() => assertStoryGraph(corrupt)).toThrow("story-record-invalid");
 await f.repo.enableVault("synthetic vault password"); const payload = await parseBackup(JSON.stringify(await createBackup("synthetic backup password", f.repo)), "synthetic backup password"); const db = new DeepRoleDatabase("supplement-copy-" + crypto.randomUUID()); dbs.push(db); const copy = new DeepRoleRepository(db); await restoreBackup(payload, "replace", copy); expect(await copy.rawRecords()).toEqual(await f.repo.rawRecords()); expect(currentStoryProfileEntities(await copy.list("entity"), await copy.list("story"), f.world.id, f.scope.chatId).find(e => e.id === f.actor.id)!.characterSheet!.appearance).toContain("left eyebrow"); assertStoryGraph(await copy.rawRecords());
}, 15000);
it("queries the entire large library and supports stable non-native entity IDs", async () => {
 const f = await setup(1000), p = await f.read(null, "Resident 1000"); expect(validSupplementPage(p)).toBe(true); expect(p.people).toEqual([{ id: "person-1000", name: "Resident 1000" }]); expect((await f.read(null)).people).toHaveLength(40); expect(validSupplementInput({ ...f.scope, entityId: "legacy:person/2", guard: p.guard })).toBe(true);
}, 15000);
it("owned service job masks raw content, persists a proposal, cleans the window and keeps safe diagnostics", async () => {
 const f = await setup(), input = { ...f.scope, entityId: f.actor.id, guard: (await f.read()).guard }, tabs = new Map<number, any>([[1, { id: 1, active: true, url: f.binding.chatUrl }], [2, { id: 2, active: true, url: "about:blank" }]]), session: any = {};
 const api: any = { runtime: { id: "ours" }, tabs: { get: vi.fn(async (id: number) => tabs.get(id)), update: vi.fn(async (id: number, v: any) => Object.assign(tabs.get(id), v)), remove: vi.fn(async (id: number) => tabs.delete(id)), sendMessage: vi.fn(async () => undefined) }, windows: { create: vi.fn(async () => ({ tabs: [tabs.get(2)] })) }, storage: { session: { get: vi.fn(async (k: string) => ({ [k]: session[k] })), set: vi.fn(async (v: any) => Object.assign(session, structuredClone(v))) }, local: browser.storage.local } }, c = new IsolatedFieldCoordinator(f.repo, api, async () => DEFAULT_SETTINGS), sender = (id: number) => ({ id: "ours", frameId: 0, tab: tabs.get(id) });
 const start = await c.handle({ type: "DR_FIELD", action: "enrich-profile", input }, sender(1)); expect(start.ok).toBe(true); expect(api.windows.create).toHaveBeenCalledWith(expect.objectContaining({ focused: true })); expect(JSON.stringify(session)).not.toMatch(/Mira|green coat|left eyebrow/);
 const claim = await c.handle({ type: "DR_FIELD_WORKER", action: "claim", id: start.id }, sender(2)); expect(claim.presentation).toMatchObject({ kind: "profile", characterName: "Mira" }); const b = await prepareProfileSupplement(input, start.id, "en", f.repo);
 await c.handle({ type: "DR_FIELD_WORKER", action: "sent", id: start.id }, sender(2)); tabs.get(2).url = "https://chat.deepseek.com/chat/s/owned"; await c.handle({ type: "DR_FIELD_WORKER", action: "bound", id: start.id, chatId: "owned" }, sender(2)); expect(await c.handle({ type: "DR_FIELD_WORKER", action: "reply", id: start.id, chatId: "owned", raw: supplementReply(b) }, sender(2))).toMatchObject({ ok: true }); await c.handle({ type: "DR_FIELD", action: "cancel", id: start.id }, sender(1)); expect(session.deeprole_field_owners[0].phase).toBe("result"); tabs.get(2).url = "https://chat.deepseek.com/"; await c.handle({ type: "DR_FIELD_WORKER", action: "cleaned", id: start.id, chatId: "owned", ok: true }, sender(2));
 expect(await c.handle({ type: "DR_FIELD", action: "read", id: start.id }, sender(1))).toMatchObject({ outcome: { text: "profile-supplement-prepared", cleanup: "done" } }); await c.handle({ type: "DR_FIELD", action: "ack", id: start.id }, sender(1)); expect(tabs.has(2)).toBe(false); expect((await f.read()).target!.suggestions[0]!.accepted).toBe(false);
 const safe = serviceDiagnosticReport(await readServiceDiagnostics(f.repo), Date.now())!; expect(safe).not.toMatch(/Mira|green coat|left eyebrow|sourceChatId|https:/); expect(JSON.parse(safe).result.journal.entries[0]).toMatchObject({ phase: "result", cleanup: "done" });
});
it("client routes one supplement request and acknowledges cleanup instead of retrying", async () => {
 const f = await setup(), input = { ...f.scope, entityId: f.actor.id, guard: (await f.read()).guard }, calls: any[] = [], send = async (m: any) => { calls.push(m); return m.action === "enrich-profile" ? { ok: true, id: "job" } : m.action === "read" ? { ok: true, outcome: { text: "profile-supplement-prepared", cleanup: "done" } } : { ok: true }; };
 await new CharacterDiscoveryClient(send, async () => undefined).run(input, () => true); expect(calls.map(c => c.action)).toEqual(["enrich-profile", "read", "ack"]);
});
it("new checkpoints inherit the selected supplements, never apply an archived branch to a new binding", async () => {
 const f = await setup(), b = await f.prepare(); await applyProfileSupplement(b, supplementReply(b), f.repo); await approve(f, b); await f.play("restart");
 const binding = (await f.repo.list<import("../src/core/types").ChatBinding>("binding")).find(p => p.chatId === f.scope.chatId)!; expect(binding.id).not.toBe(f.binding.id); const page = await f.read(); expect(page.target!.values.appearance).toContain("left eyebrow"); expect(page.target!.suggestions).toHaveLength(0);
 const records = await f.repo.list<import("../src/core/story-records").StoryRecord>("story"), entities = await f.repo.list<SceneEntity>("entity"); expect(currentStoryProfileEntities(entities, records, f.world.id, f.scope.chatId, binding.id).find(p => p.id === f.actor.id)!.characterSheet!.background).toBe("Grew up by the harbor."); expect(currentStoryProfileEntities(entities, records, f.world.id, f.scope.chatId)).toEqual(entities);
 const p = currentStoryProfileEntities(entities, records, f.world.id, f.scope.chatId, binding.id).find(e => e.id === f.actor.id)!, scene = binding.characterScenes![f.world.id]!;
 await saveCharacter({ ...f.scope, chatUrl: binding.chatUrl, base: characterRevision(entities, scene), entityId: p.id, name: p.name, sheet: { ...p.characterSheet!, background: "" }, state: scene.states[p.id]!, present: true, original: characterEditBaseline(p, entities, scene) }, f.repo); expect((await f.read()).target!.values.background).toBe(""); expect((await f.read()).target!.values.appearance).toContain("left eyebrow"); assertStoryGraph(await f.repo.rawRecords());
});
it("a failed final source guard rolls back the entire approval transaction", async () => {
 const f = await setup(), b = await f.prepare(); await applyProfileSupplement(b, supplementReply(b), f.repo); const before = await f.repo.rawRecords();
 await expect(approveProfileSupplement({ ...f.scope, guard: (await f.read()).guard, eventId: b.requestId, additions: { background: "Harbor background" }, accept: true }, f.repo, async () => { throw Error("page-changed"); })).rejects.toThrow("page-changed"); expect(await f.repo.rawRecords()).toEqual(before); expect((await f.read()).target!.suggestions[0]!.accepted).toBe(false);
});
it("ambiguous names/aliases cannot assign another saved person's facts, including late collisions", async () => {
 const f = await setup(), b = await f.prepare(), other = f.entities[2]!; await f.repo.put("entity", { ...other, aliases: [f.actor.name] }); await expect(f.prepare()).rejects.toThrow("profile-ambiguous"); await expect(applyProfileSupplement(b, supplementReply(b), f.repo)).rejects.toThrow("profile-ambiguous"); expect((await f.read()).target!.suggestions).toHaveLength(0);
 const next = await setup(), brief = await next.prepare(); await applyProfileSupplement(brief, supplementReply(brief), next.repo); await next.repo.put("entity", { ...next.entities[2]!, name: next.actor.name }); await expect(approve(next, brief)).rejects.toThrow("profile-ambiguous"); expect((await next.read()).target!.suggestions[0]!.accepted).toBe(false);
});
