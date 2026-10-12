import { afterEach, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { IsolatedFieldCoordinator } from "../src/adapters/isolated-field-coordinator";
import { IsolatedFieldClient } from "../src/adapters/isolated-field-client";
import { fieldSceneReference, FIELD_OWNERS_KEY, isolatedFieldPrompt, isolatedFieldResult, validIsolatedFieldInput, type IsolatedFieldInput } from "../src/core/isolated-character-text";
import { characterTextRequest } from "../src/core/character-text";
import { DEFAULT_SETTINGS } from "../src/core/defaults";
import { EMPTY_CHARACTER, EMPTY_STATUS } from "../src/core/characters";
import { boundStory } from "../src/core/story-continuation";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { castRecords } from "./fixtures/cast-data";
import type { DataRecord, MemoryEntry } from "../src/core/types";
import type { ServiceOperation } from "../src/core/service-operations";
import { removeWorld } from "../src/storage/worlds";
import { SERVICE_OUTBOX_PREFIX } from "../src/core/service-outbox";
import { readServiceDiagnostics } from "../src/storage/service-diagnostics";
import { serviceDiagnosticReport } from "../src/core/service-diagnostics";
import { FIELD_CLEANUP_WAIT } from "../src/core/field-runtime";
import { PROFILE_KEY, PROFILE_FIELDS, profileField, profileValues, readProfileProposal } from "../src/core/character-profile";

it("validates a one-character profile through the real coordinator, cleans its popup, and persists no profile text", async () => {
 const f = await fixture(), value = input();
 value.draft = characterTextRequest(profileField("en", "history"), JSON.stringify(profileValues(EMPTY_CHARACTER)), "New person", null, { ...EMPTY_CHARACTER, background: "Mira’s friend" }, EMPTY_STATUS);
 const before = (await f.repo.rawRecords()).filter(r => r.kind !== "service"), id = await f.start(value);
 const claim = await f.w(id, "claim"); expect(claim.presentation).toMatchObject({ kind: "profile", characterName: "New person" }); expect(claim.prompt).toContain("Mira’s friend");
 await f.bind(id);
 const raw = JSON.stringify({ requestId: id, field: PROFILE_KEY, fields: Object.fromEntries(PROFILE_FIELDS.map(key => [key, { status: "not-found", text: "", evidence: [] }])) });
 expect(await f.w(id, "reply", { chatId: "owned", raw })).toMatchObject({ ok: true }); await f.finish(id);
 const reply = await f.run({ type: "DR_FIELD", action: "read", id }); expect(reply).toMatchObject({ ok: true, outcome: { cleanup: "done", mode: "history" } });
 expect(readProfileProposal(reply.outcome.text, [...PROFILE_FIELDS]).appearance?.status).toBe("not-found");
 await f.run({ type: "DR_FIELD", action: "ack", id }); expect((await f.repo.rawRecords()).filter(r => r.kind !== "service")).toEqual(before);
 const audit = await f.repo.get<any>("service", id); expect(audit).toMatchObject({ phase: "result", cleanup: "done" }); expect(JSON.stringify(audit)).not.toMatch(/Mira|New person|not-found|profileFields/);
 expect(f.api.tabs.remove).toHaveBeenCalledExactlyOnceWith(2);
});

const databases: DeepRoleDatabase[] = [];
it("returns an accepted draft after bounded cleanup wait, blocks a second worker, and records late success without losing result", async () => {
 let clock = 1000; vi.spyOn(Date, "now").mockImplementation(() => clock);
 const f = await fixture(), id = await f.start(); await f.bind(id); await f.w(id, "reply", { chatId: "owned", raw: "Blue coat." });
 clock += FIELD_CLEANUP_WAIT - 1; expect(await f.run({ type: "DR_FIELD", action: "read", id })).toEqual({ ok: true });
 clock++; expect(await f.run({ type: "DR_FIELD", action: "read", id })).toMatchObject({ ok: true, outcome: { text: "Blue coat.", cleanup: "failed", cleanupUrl: "https://chat.deepseek.com/chat/s/owned" } });
 expect(await f.repo.get("service", id)).toMatchObject({ phase: "result", cleanup: "pending", error: null });
 expect(await f.run({ type: "DR_FIELD", action: "ack", id })).toMatchObject({ ok: true });
 expect(await f.run({ type: "DR_FIELD", action: "start", input: input() })).toMatchObject({ ok: false, error: "cleanup-pending" });
 expect(f.api.windows.create).toHaveBeenCalledTimes(1); await f.w(id, "progress", { stage: "finished", visibility: "visible" }); await f.finish(id);
 expect(await f.repo.get("service", id)).toMatchObject({ phase: "result", cleanup: "done", error: null, runtime: { stage: "finished", visibility: "visible" } });
 expect((await browser.storage.session.get(FIELD_OWNERS_KEY))[FIELD_OWNERS_KEY]).toEqual([]);
});
it("bounds cleanup wait on a rejected reply too and never applies the invalid draft", async () => {
 let clock = 2000; vi.spyOn(Date, "now").mockImplementation(() => clock);
 const f = await fixture(), id = await f.start(); await f.bind(id); await f.w(id, "error", { error: "invalid-result" }); clock += FIELD_CLEANUP_WAIT;
 expect(await f.run({ type: "DR_FIELD", action: "read", id })).toMatchObject({ ok: false, error: "invalid-result", cleanup: "failed" });
 expect(await f.run({ type: "DR_FIELD", action: "ack", id })).toMatchObject({ ok: false }); expect(await f.repo.get("service", id)).toMatchObject({ phase: "failed", cleanup: "pending" });
});
it("records only fixed worker stages/visibility, rejects foreign and backward updates, and keeps lore timestamps unchanged", async () => {
 const f = await fixture(), id = await f.start(); await f.bind(id); const before = await f.repo.rawRecords(), previous = await f.repo.get<any>("service", id);
 expect(await f.w(id, "progress", { stage: "waiting-reply", visibility: "hidden", text: "PRIVATE_LORE" })).toMatchObject({ ok: true });
 expect(await f.w(id, "progress", { stage: "ready", visibility: "visible" })).toMatchObject({ ok: false, error: "stale-step" });
 expect(await f.w(id, "progress", { stage: "PRIVATE_STAGE", visibility: "visible" })).toMatchObject({ ok: false });
 expect(await f.run({ type: "DR_FIELD_WORKER", action: "progress", id, stage: "finished", visibility: "visible" }, { id: "ours", tab: { id: 9 } })).toMatchObject({ ok: false });
 const value = await f.repo.get<any>("service", id); expect(value).toMatchObject({ contractVersion: 4, phase: previous.phase, updatedAt: previous.updatedAt, runtime: { stage: "waiting-reply", visibility: "hidden" } });
 expect((await f.repo.rawRecords()).filter(r => r.kind !== "service")).toEqual(before.filter(r => r.kind !== "service"));
 const report = serviceDiagnosticReport(await readServiceDiagnostics(f.repo), 5)!; expect(report).toContain('"diagnosticVersion": 4'); expect(report).not.toMatch(/PRIVATE|worldId|sourceChatId|workerChatId/);
});
it("does not fall back to an inactive tab or resend when creating the service window fails", async () => {
 const f = await fixture(); f.api.windows.create.mockRejectedValueOnce(new Error("PRIVATE_NATIVE_ERROR"));
 expect(await f.run({ type: "DR_FIELD", action: "start", input: input() })).toMatchObject({ ok: false, error: "tab-unavailable" }); expect(f.api.tabs.create).not.toHaveBeenCalled();
 expect((await f.repo.list<any>("service"))[0]).toMatchObject({ phase: "failed", cleanup: "done", error: "tab-unavailable" });
});
it("keeps service work in the source tab's private browsing mode", async () => {
 const f = await fixture(); f.tabs.set(1, { ...f.tabs.get(1), incognito: true }); await f.start(); expect(f.api.windows.create).toHaveBeenCalledWith(expect.objectContaining({ incognito: true, focused: true }));
});
afterEach(async () => { await Promise.all(databases.map(db => db.delete())); databases.length = 0; vi.restoreAllMocks(); });
const input = (): IsolatedFieldInput => ({ scope: { chatId: "game", chatUrl: "https://chat.deepseek.com/chat/s/game", worldId: "w", bookId: null }, locale: "en", draft: characterTextRequest({ key: "appearance", label: "Appearance", scope: "profile", maxLength: 1200 }, "Unsaved coat", "Mira", null, { ...EMPTY_CHARACTER, appearance: "Unsaved blue coat", sprites: { neutral: "PRIVATE_BYTES" } }, EMPTY_STATUS), sceneReference: 'Mira waited by the gate.' });
const entry = (id: string, extras: Partial<MemoryEntry> = {}): DataRecord => ({ kind: "entry", id, data: { id, title: id, content: "LORE_" + id, worldId: "w", bookId: null, entityIds: [], keywords: ["Mira"], activation: "always", priority: "high", enabled: true, source: { type: "manual" }, createdAt: 1, updatedAt: 1, ...extras } });
async function fixture() {
 const db = new DeepRoleDatabase("isolated-fields-" + crypto.randomUUID()); databases.push(db); const repo = new DeepRoleRepository(db); await repo.mergeRecords(castRecords());
 const tabs = new Map<number, any>([[1, { id: 1, url: input().scope.chatUrl }], [9, { id: 9, url: "https://chat.deepseek.com/chat/s/personal" }]]);
 const api: any = { ...browser, runtime: { id: "ours" }, tabs: { get: vi.fn(async (id: number) => { if (!tabs.has(id)) throw Error("closed"); return tabs.get(id); }), create: vi.fn(async (value: any) => { const tab = { id: 2, ...value }; tabs.set(2, tab); return tab; }), update: vi.fn(async (id: number, value: any) => { const tab = { ...tabs.get(id), ...value }; tabs.set(id, tab); return tab; }), remove: vi.fn(async (id: number) => { tabs.delete(id); }), sendMessage: vi.fn(async () => ({ ok: true })) } };
 api.windows = { create: vi.fn(async (value: any) => ({ id: 3, tabs: [await api.tabs.create({ url: value.url, active: true, windowId: 3 })] })) };
 const coordinator = new IsolatedFieldCoordinator(repo, api, async () => DEFAULT_SETTINGS);
 const source: any = { id: "ours", tab: { id: 1 }, url: input().scope.chatUrl }, worker = (): any => ({ id: "ours", tab: { id: 2 }, url: tabs.get(2)?.url });
 const run = (message: any, sender = source) => coordinator.handle(message, sender);
 const start = async (value = input()) => { const result = await run({ type: "DR_FIELD", action: "start", input: value }); expect(result.ok).toBe(true); return result.id as string; };
 const w = (id: string, action: string, data: any = {}) => run({ type: "DR_FIELD_WORKER", action, id, ...data }, worker());
 const bind = async (id: string) => { expect(await w(id, "sent")).toMatchObject({ ok: true }); tabs.set(2, { id: 2, url: "https://chat.deepseek.com/chat/s/owned" }); expect(await w(id, "bound", { chatId: "owned" })).toMatchObject({ ok: true }); };
 const finish = async (id: string, ok = true) => { if (ok) tabs.set(2, { id: 2, url: "https://chat.deepseek.com/" }); return w(id, "cleaned", { chatId: "owned", ok }); };
 return { repo, tabs, api, coordinator, source, worker, run, start, w, bind, finish };
}
it("persists text-free field audit after worker cleanup and acknowledgement", async () => {
 const f = await fixture(), id = await f.start();
 expect(await f.repo.get("service", id)).toMatchObject({ origin: "local", purpose: "service", phase: "prepared", cleanup: "pending", worldId: "w", sourceChatId: "game", workerChatId: null });
 await f.bind(id); expect(await f.repo.get("service", id)).toMatchObject({ phase: "dispatching", workerChatId: "owned" });
 await f.w(id, "reply", { chatId: "owned", raw: "PRIVATE_REPLY" }); await f.finish(id); await f.run({ type: "DR_FIELD", action: "ack", id });
 const audit = await f.repo.get<ServiceOperation>("service", id); expect(audit).toMatchObject({ phase: "result", cleanup: "done", mode: "suggest" });
 const raw = JSON.stringify(audit); for (const value of ["PRIVATE_REPLY", "Unsaved", "Mira", "https://", "PRIVATE_BYTES"]) expect(raw).not.toContain(value);
 expect((await browser.storage.session.get(FIELD_OWNERS_KEY))[FIELD_OWNERS_KEY]).toEqual([]);
});
for (const scenario of ["quote", "missing", "length", "plan"] as const) it(`persists the real ${scenario} validator reason after cleanup, losing the owner and reloading`, async () => {
 const f = await fixture(), value = input();
 if (["quote", "missing"].includes(scenario)) { value.draft.field.mode = "history"; value.historyReference = { origin: "native", partial: true, sources: [{ id: "h0", role: "user", text: "Mira wears a blue coat." }] }; }
 if (scenario === "plan") value.draft.field = { key: "image-plan", label: "PRIVATE_LABEL", scope: "scene", maxLength: 12000, mode: "suggest" };
 const id = await f.start(value); await f.bind(id); const before = (await f.repo.rawRecords()).filter(r => r.kind !== "service");
 const raw = scenario === "length" ? "PRIVATE_VALUE".repeat(101) : scenario === "plan" ? JSON.stringify({ scene: "short", characters: [] }) : JSON.stringify({ requestId: id, field: "appearance", status: scenario === "missing" ? "not-found" : "found", text: scenario === "missing" ? "" : "Blue coat.", evidence: scenario === "missing" ? [] : [{ source: "h0", quote: "PRIVATE_CHANGED_QUOTE" }] });
 const code = scenario === "quote" ? "invalid-evidence" : scenario === "missing" ? "facts-not-found" : scenario === "length" ? "text-too-long" : "invalid-result";
 expect(await f.w(id, "reply", { chatId: "owned", raw })).toMatchObject({ ok: false, error: code });
 expect(await f.repo.get("service", id)).toMatchObject({ contractVersion: 4, phase: "dispatching", error: null, validation: { family: "field", events: [{ code }] } });
 await f.w(id, "error", { error: code }); await f.finish(id); await browser.storage.session.clear(); await new IsolatedFieldCoordinator(f.repo, f.api, async () => DEFAULT_SETTINGS).reconcilePending();
 expect(await f.repo.get("service", id)).toMatchObject({ contractVersion: 4, phase: "failed", error: code, cleanup: "done" });
 const report = serviceDiagnosticReport(await readServiceDiagnostics(f.repo), Date.now())!; expect(report).not.toMatch(/PRIVATE|Mira|game|owned|ChatId|worldId|"sources"\s*:|https:\/\//u);
 expect(JSON.parse(report).result.journal.entries[0].validation.events[0].issues[0].path).toBe(scenario === "quote" ? "evidence[0].quote" : scenario === "missing" ? "status" : scenario === "length" ? "text" : "plan.scene");
 expect((await f.repo.rawRecords()).filter(r => r.kind !== "service")).toEqual(before); expect(f.api.tabs.create).toHaveBeenCalledTimes(1); expect(f.api.tabs.remove).toHaveBeenCalledExactlyOnceWith(2);
});
it("recovers a failed reason write while this coordinator remains alive, without resending", async () => {
 const f = await fixture(), id = await f.start(); await f.bind(id); const update = vi.spyOn(f.repo, "updateRecords").mockRejectedValueOnce(new Error("PRIVATE_DISK"));
 expect(await f.w(id, "reply", { chatId: "owned", raw: "X".repeat(1201) })).toMatchObject({ ok: false, error: "text-too-long" });
 expect((await f.repo.get<any>("service", id))!.validation).toBeNull(); update.mockRestore(); await f.coordinator.reconcilePending();
 expect(await f.repo.get("service", id)).toMatchObject({ phase: "dispatching", validation: { family: "field", events: [{ code: "text-too-long" }] } }); expect(f.api.tabs.create).toHaveBeenCalledTimes(1); expect(f.api.tabs.sendMessage).not.toHaveBeenCalled();
});
it("cannot invent lost details after simultaneous failed storage and background restart", async () => {
 const f = await fixture(), id = await f.start(); await f.bind(id); const update = vi.spyOn(f.repo, "updateRecords").mockRejectedValue(new Error("PRIVATE_DISK"));
 await f.w(id, "reply", { chatId: "owned", raw: "X".repeat(1201) }); await f.w(id, "error", { error: "text-too-long" }); await f.finish(id); await browser.storage.session.clear(); update.mockRestore();
 await new IsolatedFieldCoordinator(f.repo, f.api, async () => DEFAULT_SETTINGS).reconcilePending();
 expect(await f.repo.get("service", id)).toMatchObject({ phase: "failed", error: "text-too-long", cleanup: "done", contractVersion: 4 }); expect((await f.repo.get<any>("service", id))!.validation).toBeNull();
 expect(JSON.stringify(await browser.storage.local.get())).not.toContain("text length <=1200"); expect(f.api.tabs.create).toHaveBeenCalledTimes(1);
});
it("does not accept validation details from a worker or an unowned chat", async () => {
 const f = await fixture(), id = await f.start(); await f.bind(id);
 expect(await f.w(id, "reply", { chatId: "PRIVATE_FOREIGN", raw: "X".repeat(1201), issues: [{ path: "PRIVATE_PATH", rule: "PRIVATE_RULE" }] })).toMatchObject({ ok: false, error: "chat-changed" });
 await f.w(id, "error", { error: "invalid-evidence", issues: [{ path: "evidence[0].quote", rule: "exact substring of source text", actual: "PRIVATE" }] });
 expect((await f.repo.get<any>("service", id))!.validation).toBeNull();
});
it("records restart failure without resending or claiming the request finished", async () => {
 const f = await fixture(), id = await f.start(); await f.bind(id);
 const restarted = new IsolatedFieldCoordinator(f.repo, f.api, async () => DEFAULT_SETTINGS);
 expect(await restarted.handle({ type: "DR_FIELD", action: "read", id }, f.source)).toEqual({ ok: true });
 expect(await f.repo.get("service", id)).toMatchObject({ phase: "failed", error: "interrupted", cleanup: "pending" }); expect(f.api.tabs.create).toHaveBeenCalledTimes(1);
});
it("does not reread or rewrite the audit on every unchanged result poll", async () => {
 const f = await fixture(), id = await f.start(); await f.bind(id); const update = vi.spyOn(f.repo, "updateRecords");
 for (let n = 0; n < 8; n++) expect(await f.run({ type: "DR_FIELD", action: "read", id })).toEqual({ ok: true });
 expect(update).not.toHaveBeenCalled();
});
it("keeps a queued final audit after successful ack and after losing every owner", async () => {
 const f = await fixture(), id = await f.start(); await f.bind(id);
 const update = vi.spyOn(f.repo, "updateRecords").mockRejectedValue(new Error("quota-private"));
 await f.w(id, "reply", { chatId: "owned", raw: "PRIVATE_REPLY" }); await f.finish(id); expect(await f.run({ type: "DR_FIELD", action: "ack", id })).toMatchObject({ ok: true });
 expect((await browser.storage.local.get(SERVICE_OUTBOX_PREFIX + id))[SERVICE_OUTBOX_PREFIX + id]).toMatchObject({ phase: "result", cleanup: "done" });
 expect((await browser.storage.session.get(FIELD_OWNERS_KEY))[FIELD_OWNERS_KEY]).toEqual([]); await browser.storage.session.clear(); update.mockRestore();
 const restarted = new IsolatedFieldCoordinator(f.repo, f.api, async () => DEFAULT_SETTINGS); await restarted.reconcilePending();
 expect(await f.repo.get("service", id)).toMatchObject({ phase: "result", cleanup: "done", workerChatId: "owned" }); expect(f.api.tabs.create).toHaveBeenCalledTimes(1);
 expect((await browser.storage.local.get(SERVICE_OUTBOX_PREFIX + id))[SERVICE_OUTBOX_PREFIX + id]).toBeUndefined();
});
it("refuses acknowledgement when both durable stores fail, without saving the profile or skipping cleanup", async () => {
 const f = await fixture(), id = await f.start(); await f.bind(id);
 vi.spyOn(f.repo, "updateRecords").mockRejectedValue(new Error("quota-private")); vi.spyOn(browser.storage.local, "set").mockRejectedValue(new Error("quota-private"));
 await f.w(id, "reply", { chatId: "owned", raw: "PRIVATE_REPLY" }); await f.finish(id);
 expect(await f.run({ type: "DR_FIELD", action: "ack", id })).toMatchObject({ ok: false, error: "interrupted" });
 expect(f.api.tabs.remove).toHaveBeenCalledExactlyOnceWith(2); expect(await f.repo.list("entity")).toEqual([]); expect((await browser.storage.session.get(FIELD_OWNERS_KEY))[FIELD_OWNERS_KEY]).toHaveLength(1);
});
it("refuses the pre-click dispatch claim when neither durable store can track it", async () => {
 const f = await fixture(), id = await f.start(); vi.spyOn(f.repo, "updateRecords").mockRejectedValue(new Error("quota-private")); vi.spyOn(browser.storage.local, "set").mockRejectedValue(new Error("quota-private"));
 expect(await f.w(id, "sent")).toMatchObject({ ok: false, error: "interrupted" });
 expect((await f.w(id, "claim")).awaiting).toBe(true); expect(await f.w(id, "sent")).toMatchObject({ ok: false, error: "stale-step" }); expect(f.api.tabs.create).toHaveBeenCalledTimes(1);
});
it("reconciles the ownership-to-outbox suspension gap without resubmitting or reconstructing text", async () => {
 const f = await fixture(), id = await f.start(); await f.bind(id);
 const values = await browser.storage.session.get(FIELD_OWNERS_KEY); const owner = (values[FIELD_OWNERS_KEY] as any[])[0]; owner.phase = "error"; owner.error = "cancelled"; owner.cleanup = "done";
 await browser.storage.session.set({ [FIELD_OWNERS_KEY]: [owner] });
 const restarted = new IsolatedFieldCoordinator(f.repo, f.api, async () => DEFAULT_SETTINGS); await restarted.reconcilePending();
 expect(await f.repo.get("service", id)).toMatchObject({ phase: "failed", error: "cancelled", cleanup: "done" }); expect(f.api.tabs.update).toHaveBeenCalledTimes(1); expect(f.api.tabs.create).toHaveBeenCalledTimes(1);
});
it("reconciles a locked cancellation at unlock even after the owner/session was lost", async () => {
 const f = await fixture(), id = await f.start(); await f.bind(id); await f.repo.enableVault("test-password"); await f.repo.lockVault();
 await f.coordinator.cancelLocked(); await f.finish(id); await browser.storage.session.clear(); await f.repo.unlockVault("test-password");
 await new IsolatedFieldCoordinator(f.repo, f.api, async () => DEFAULT_SETTINGS).reconcilePending();
 expect(await f.repo.get("service", id)).toMatchObject({ phase: "failed", error: "vault-locked", cleanup: "done" }); expect(f.api.tabs.create).toHaveBeenCalledTimes(1);
});
it("failed tab creation also queues its outcome if the journal becomes unavailable", async () => {
 const f = await fixture(); f.api.tabs.create.mockImplementationOnce(async () => { vi.spyOn(f.repo, "updateRecords").mockRejectedValue(new Error("transient")); throw new Error("PRIVATE"); });
 expect(await f.run({ type: "DR_FIELD", action: "start", input: input() })).toMatchObject({ ok: false, error: "tab-unavailable" });
 const pending = Object.entries(await browser.storage.local.get()).filter(([key]) => key.startsWith(SERVICE_OUTBOX_PREFIX)); expect(pending).toHaveLength(1); expect(pending[0]![1]).toMatchObject({ phase: "failed", cleanup: "done", error: "tab-unavailable" });
});
it.each(["creation", "navigation", "session"])("records failed worker %s and closes only an owned blank tab", async stage => {
 const f = await fixture();
 if (stage === "creation") f.api.tabs.create.mockRejectedValueOnce(new Error("PRIVATE"));
 if (stage === "navigation") f.api.tabs.update.mockRejectedValueOnce(new Error("PRIVATE"));
 if (stage === "session") vi.spyOn(f.api.storage.session, "set").mockRejectedValueOnce(new Error("PRIVATE"));
 const result = await f.run({ type: "DR_FIELD", action: "start", input: input() }); expect(result).toMatchObject({ ok: false, error: "tab-unavailable" });
 expect((await f.repo.list<ServiceOperation>("service"))[0]).toMatchObject({ phase: "failed", cleanup: "done", error: "tab-unavailable", workerChatId: null });
 expect(f.tabs.has(1)).toBe(true); expect(f.tabs.has(9)).toBe(true); if (stage !== "creation") expect(f.api.tabs.remove).toHaveBeenCalledExactlyOnceWith(2);
});
it("fails before creating a tab if initial operation tracking cannot be stored", async () => {
 const f = await fixture(); vi.spyOn(f.repo, "updateRecords").mockRejectedValue(new Error("quota-private"));
 expect(await f.run({ type: "DR_FIELD", action: "start", input: input() })).toMatchObject({ ok: false, error: "interrupted" }); expect(f.api.tabs.create).not.toHaveBeenCalled();
});
it("does not let later audit failures prevent owned cleanup or recreate purged lore", async () => {
 const f = await fixture(), id = await f.start(); await f.bind(id);
 await removeWorld("w", f.repo, { deleteLore: true }); await f.w(id, "error", { error: "cancelled" }); await f.finish(id);
 expect(await f.repo.get("service", id)).toBeNull(); expect(f.api.tabs.remove).toHaveBeenCalledExactlyOnceWith(2); expect(await f.repo.get("world", "w")).toBeNull();
});
it("allows cleanup while vault metadata is inaccessible, then reconciles at the next unlocked read", async () => {
 const f = await fixture(), id = await f.start(); await f.bind(id); await f.repo.enableVault("test-password"); await f.repo.lockVault();
 await f.coordinator.cancelLocked(); expect(await f.w(id, "authorize-cleanup")).toMatchObject({ ok: true }); await f.finish(id);
 expect(f.api.tabs.remove).toHaveBeenCalledExactlyOnceWith(2); await f.repo.unlockVault("test-password");
 await f.run({ type: "DR_FIELD", action: "read", id }); expect(await f.repo.get("service", id)).toMatchObject({ phase: "failed", error: "vault-locked", cleanup: "done" });
});
it("bounds latest scene JSON including escaped text, without keeping the old beginning", () => {
 const story = boundStory([{ role: "user", text: "OLD" + "a".repeat(17000) }, { role: "assistant", text: 'LATEST' + '"\\'.repeat(15000) }], "page");
 const value = fieldSceneReference(story); expect(value.length).toBeLessThanOrEqual(12000); expect(JSON.parse(value).partial).toBe(true); expect(value).not.toContain("OLD"); expect(JSON.parse(value).turns[0].role).toBe("assistant");
});
it("compiles current approved world only, respecting disabled/manual excluded sources and unsaved reference", () => {
 const records = [...castRecords(), entry("selected"), entry("excluded"), entry("disabled", { enabled: false }), entry("foreign", { worldId: "other" })];
 const result = isolatedFieldPrompt(input(), records, DEFAULT_SETTINGS, "field_test", { includedIds: [], excludedIds: ["excluded"] });
 expect(result.prompt).toContain("LORE_selected"); for (const value of ["LORE_excluded", "LORE_disabled", "LORE_foreign", "PRIVATE_BYTES"]) expect(result.prompt).not.toContain(value);
 expect(result.prompt).toContain("Unsaved blue coat"); expect(result.prompt).toContain("[Request ID: field_test]"); expect(result.prompt).toContain("original conversation is NOT present"); expect(result.prompt).not.toContain("Leon is the protagonist");
});
it("does not bypass world profile exclusion and rejects foreign/stale entity or book", () => {
 const records = castRecords(); (records[0]!.data as any).useDescriptionInContext = true;
 expect(isolatedFieldPrompt(input(), records, DEFAULT_SETTINGS, "field_test").prompt).toContain("Leon is the protagonist");
 expect(isolatedFieldPrompt(input(), records, DEFAULT_SETTINGS, "field_test", { includedIds: [], excludedIds: ["profile:world:w"] }).prompt).not.toContain("Leon is the protagonist");
 const draft = input(); draft.draft.reference.entityId = "missing"; expect(() => isolatedFieldPrompt(draft, records, DEFAULT_SETTINGS, "field_test")).toThrow("scene-changed"); draft.draft.reference.entityId = undefined; draft.scope.bookId = "missing"; expect(() => isolatedFieldPrompt(draft, records, DEFAULT_SETTINGS, "field_test")).toThrow("scene-changed");
});
it("bounds whole selected sources without clipping lore and reports omitted context", () => {
 const records = [...castRecords(), entry("big", { content: "A".repeat(39000) }), entry("otherbig", { content: "B".repeat(39000) })];
 const result = isolatedFieldPrompt(input(), records, DEFAULT_SETTINGS, "field_test"); expect(result.partialContext).toBe(true); expect(result.prompt.length).toBeLessThan(150000); expect(result.prompt.includes("A".repeat(39000)) || result.prompt.includes("B".repeat(39000))).toBe(true); expect(result.prompt.includes("A".repeat(39000)) && result.prompt.includes("B".repeat(39000))).toBe(false);
});
it.each(["https://evil.example/chat/s/game", "https://chat.deepseek.com/chat/s/other", "https://chat.deepseek.com/?deeprole_cast_job=x", "https://chat.deepseek.com/?deeprole_field_job=x"])("rejects foreign or worker source %s", url => { const value = input(); value.scope.chatUrl = url; expect(validIsolatedFieldInput(value)).toBe(false); });
it("validates plain fields and keeps the separate image-plan parser", () => {
 expect(isolatedFieldResult(" Blue coat. ", input().draft)).toBe("Blue coat.");
 expect(() => isolatedFieldResult("Sorry, that's beyond my current scope. Let's talk about something else.", input().draft)).toThrow("invalid-result");
 expect(() => isolatedFieldResult("X".repeat(1201), input().draft)).toThrow("text-too-long");
 expect(() => isolatedFieldResult("Blue coat.", { field: { ...input().draft.field, key: "image-plan" } })).toThrow();
});
it("opens a focused service window with ephemeral screen labels, no field text in session, and no original-tab writes", async () => {
 const f = await fixture(), id = await f.start(); const claim = await f.w(id, "claim"); expect(claim.prompt).toContain("Unsaved blue coat");
 expect(claim.presentation).toEqual({ locale: "en", fieldLabel: "Appearance", characterName: "Mira" });
 expect(f.api.windows.create).toHaveBeenCalledExactlyOnceWith({ url: "about:blank", type: "popup", focused: true, width: 520, height: 720, incognito: false }); expect(f.api.tabs.create).toHaveBeenCalledExactlyOnceWith({ url: "about:blank", active: true, windowId: 3 }); expect(f.api.tabs.update).toHaveBeenCalledExactlyOnceWith(2, { url: "https://chat.deepseek.com/?deeprole_field_job=" + id + "&deeprole_field_locale=en" });
 const metadata = JSON.stringify(await browser.storage.session.get(FIELD_OWNERS_KEY)); expect(metadata).not.toContain("Unsaved"); expect(metadata).not.toContain("Mira"); expect(f.tabs.get(1).url).toBe(input().scope.chatUrl);
 expect(await f.run({ type: "DR_FIELD_WORKER", action: "claim", id }, { id: "ours", tab: { id: 9 }, url: f.tabs.get(9).url })).toMatchObject({ ok: false, error: "unowned-tab" });
});
it.each(["found", "not-found", "bad-evidence"])("checks history field %s before returning, cleans the owned chat, and does not save profile facts", async status => {
 const f = await fixture(), value = input(); value.draft.field.mode = "history";
 value.historyReference = { origin: "native", partial: true, sources: [{ id: "h0", role: "user", text: "Mira wears a blue coat." }] };
 const start = await f.run({ type: "DR_FIELD", action: "start", input: value }); expect(start.ok).toBe(true); const id = start.id;
 await f.bind(id);
 const raw = JSON.stringify({ requestId: id, field: "appearance", status: status === "not-found" ? "not-found" : "found", text: status === "not-found" ? "" : "Blue coat.", evidence: status === "not-found" ? [] : [{ source: "h0", quote: status === "bad-evidence" ? "Mira has a RED coat." : "Mira wears a blue coat." }] });
 const result = await f.w(id, "reply", { chatId: "owned", raw });
 if (status !== "found") { expect(result).toMatchObject({ ok: false, error: status === "not-found" ? "facts-not-found" : "invalid-evidence" }); await f.w(id, "error", { error: result.error }); }
 await f.finish(id); const final = await f.run({ type: "DR_FIELD", action: "read", id });
 expect(final).toMatchObject(status === "found" ? { ok: true, outcome: { text: "Blue coat.", mode: "history", historyOrigin: "native", cleanup: "done" } } : { ok: false, cleanup: "done" });
 expect(f.api.tabs.remove).toHaveBeenCalledExactlyOnceWith(2); expect(await f.repo.list("entity")).toEqual([]);
 expect(JSON.stringify(await browser.storage.session.get(FIELD_OWNERS_KEY))).not.toContain("blue coat");
});
it("serializes simultaneous clicks and refuses untrusted origins/frames", async () => {
 const f = await fixture(), message: any = { type: "DR_FIELD", action: "start", input: input() };
 const results = await Promise.all([f.run(message), f.run(message)]); expect(results.map(r => r.ok)).toEqual([true, false]); expect(results[1].error).toBe("busy");
 expect(await f.run(message, { ...f.source, id: "foreign" })).toMatchObject({ ok: false, error: "untrusted" });
 expect(await f.coordinator.handle(message, { ...f.source, frameId: 2 })).toMatchObject({ ok: false, error: "untrusted" });
});
it("persists dispatch before send; MV3 restart fails closed and never resends", async () => {
 const f = await fixture(), id = await f.start(); await f.w(id, "sent"); expect(await f.w(id, "sent")).toMatchObject({ ok: false, error: "stale-step" });
 const restart = new IsolatedFieldCoordinator(f.repo, f.api); const claim = await restart.handle({ type: "DR_FIELD_WORKER", action: "claim", id }, f.worker());
 expect(claim).toMatchObject({ ok: true, awaiting: true, phase: "error" }); expect(claim.prompt).toBeUndefined(); expect(f.api.tabs.create).toHaveBeenCalledTimes(1);
});
it("requires dispatch and exact owned native chat; cannot bind original or delete foreign chat", async () => {
 const f = await fixture(), id = await f.start(); expect(await f.w(id, "bound", { chatId: "game" })).toMatchObject({ ok: false }); await f.w(id, "sent"); f.tabs.set(2, { id: 2, url: input().scope.chatUrl });
 expect(await f.w(id, "bound", { chatId: "game" })).toMatchObject({ ok: false }); expect(await f.w(id, "authorize-cleanup")).toMatchObject({ ok: false });
 f.tabs.set(2, { id: 2, url: "https://chat.deepseek.com/chat/s/owned" }); await f.w(id, "bound", { chatId: "owned" }); f.tabs.set(2, { id: 2, url: f.tabs.get(9).url });
 expect(await f.w(id, "authorize-cleanup")).toMatchObject({ ok: false, error: "chat-changed" }); expect(await f.w(id, "cleaned", { ok: true, chatId: "owned" })).toMatchObject({ ok: false }); expect(f.api.tabs.remove).not.toHaveBeenCalled();
});
it("returns text only after cleanup, then closes exactly the owned tab, never saving canon", async () => {
 const f = await fixture(), id = await f.start(); await f.bind(id); expect(await f.w(id, "reply", { chatId: "owned", raw: "Blue coat." })).toMatchObject({ ok: true });
 expect(await f.run({ type: "DR_FIELD", action: "read", id })).toEqual({ ok: true }); expect(await f.w(id, "authorize-cleanup")).toMatchObject({ ok: true, chatId: "owned" });
 expect(await f.finish(id)).toMatchObject({ ok: true }); const result = await f.run({ type: "DR_FIELD", action: "read", id }); expect(result.outcome).toMatchObject({ text: "Blue coat.", cleanup: "done" });
 expect(f.api.tabs.remove).toHaveBeenCalledExactlyOnceWith(2); expect(f.tabs.has(1)).toBe(true); expect(f.tabs.has(9)).toBe(true); expect(await f.repo.list("entity")).toEqual([]);
 await f.run({ type: "DR_FIELD", action: "ack", id }); expect((await browser.storage.session.get(FIELD_OWNERS_KEY))[FIELD_OWNERS_KEY]).toEqual([]);
});
it("keeps a valid suggestion if deletion fails and exposes only a safe owned link", async () => {
 const f = await fixture(), id = await f.start(); await f.bind(id); await f.w(id, "reply", { chatId: "owned", raw: "Blue coat." }); await f.finish(id, false);
 const result = await f.run({ type: "DR_FIELD", action: "read", id }); expect(result.outcome).toMatchObject({ text: "Blue coat.", cleanup: "failed", cleanupUrl: "https://chat.deepseek.com/chat/s/owned" }); expect(f.api.tabs.remove).not.toHaveBeenCalled();
 await f.run({ type: "DR_FIELD", action: "ack", id }); expect(JSON.stringify(await browser.storage.session.get(FIELD_OWNERS_KEY))).not.toContain("Blue coat.");
});
it("cancels on source closure, navigation or lock; cleanup remains owned and allowed", async () => {
 const f = await fixture(), id = await f.start(); await f.bind(id); f.tabs.set(1, { id: 1, url: "https://chat.deepseek.com/chat/s/other" });
 expect(await f.w(id, "reply", { chatId: "owned", raw: "Too late." })).toMatchObject({ ok: false }); expect(await f.w(id, "authorize-cleanup")).toMatchObject({ ok: true });
 await f.finish(id); expect(f.api.tabs.remove).toHaveBeenCalledExactlyOnceWith(2); expect(await f.repo.list("entity")).toEqual([]);
});
it("vault lock clears even a finished result, and source closure wakes its worker", async () => {
 const f = await fixture(), id = await f.start(); await f.bind(id); await f.w(id, "reply", { chatId: "owned", raw: "Blue coat." }); await f.finish(id, false);
 vi.spyOn(f.repo, "isLocked").mockResolvedValue(true); await f.coordinator.cancelLocked(); expect(await f.run({ type: "DR_FIELD", action: "read", id })).toMatchObject({ ok: false, error: "vault-locked" });
 await f.coordinator.removed(1); expect(f.api.tabs.sendMessage).toHaveBeenCalledWith(2, { type: "DR_FIELD_CLEANUP" });
});
it("a lost worker reports cleanup failure instead of closing another tab", async () => {
 const f = await fixture(), id = await f.start(); await f.bind(id); await f.w(id, "reply", { chatId: "owned", raw: "Blue coat." }); f.tabs.delete(2); await f.coordinator.removed(2);
 expect((await f.run({ type: "DR_FIELD", action: "read", id })).outcome).toMatchObject({ text: "Blue coat.", cleanup: "failed" }); expect(f.api.tabs.remove).not.toHaveBeenCalled();
});
it("client polls only one job, acknowledges once, strips unsafe cleanup URLs", async () => {
 const send = vi.fn(async (m: any) => m.action === "start" ? { ok: true, id: "field_test" } : m.action === "read" ? { ok: true, outcome: { text: "Blue coat.", cleanup: "failed", cleanupUrl: "javascript:alert(1)", partialContext: false } } : { ok: true });
 const result = await new IsolatedFieldClient(send).generate(input(), () => true); expect(result.cleanupUrl).toBeUndefined(); expect(send.mock.calls.map(([m]) => m.action)).toEqual(["start", "read", "ack"]);
});
it("an invalid answer waits for cleanup and reports failed deletion without applying text", async () => {
 const f = await fixture(), id = await f.start(); await f.bind(id);
 expect(await f.w(id, "reply", { chatId: "owned", raw: '{"appearance":"Blue"}' })).toMatchObject({ ok: false, error: "invalid-result" });
 await f.w(id, "error", { error: "invalid-result" }); expect(await f.run({ type: "DR_FIELD", action: "read", id })).toEqual({ ok: true });
 await f.finish(id, false); expect(await f.run({ type: "DR_FIELD", action: "read", id })).toMatchObject({ ok: false, error: "invalid-result", cleanup: "failed", cleanupUrl: "https://chat.deepseek.com/chat/s/owned" });
});
it("client rejects late world/book/chat results, cancels once and never resends", async () => {
 let inScope = true; const send = vi.fn(async (m: any) => { if (m.action === "start") return { ok: true, id: "field_test" }; if (m.action === "read") { inScope = false; return { ok: true, outcome: { text: "Stale", cleanup: "done", partialContext: false } }; } return { ok: true }; });
 await expect(new IsolatedFieldClient(send).generate(input(), () => inScope)).rejects.toThrow("scene-changed"); expect(send.mock.calls.map(([m]) => m.action)).toEqual(["start", "read", "cancel"]);
});
it("a lost acknowledgement or vault lock prevents applying an already read result", async () => {
 const send = vi.fn(async (m: any) => m.action === "start" ? { ok: true, id: "field_test" } : m.action === "read" ? { ok: true, outcome: { text: "Blue coat", cleanup: "done", partialContext: false } } : m.action === "ack" ? { ok: false, error: "vault-locked" } : { ok: true });
 await expect(new IsolatedFieldClient(send).generate(input(), () => true)).rejects.toThrow("vault-locked"); expect(send.mock.calls.map(([m]) => m.action)).toEqual(["start", "read", "ack", "cancel"]);
});
it("client bounds the wait and refuses a parallel job without sending it", async () => {
 let time = 0; const send = vi.fn(async (m: any) => m.action === "start" ? { ok: true, id: "field_test" } : m.action === "cleanup" ? { ok: true, cleanup: "done" } : { ok: true }); const client = new IsolatedFieldClient(send, async () => { time += 500000; }, () => time);
 const first = client.generate(input(), () => true); await expect(client.generate(input(), () => true)).rejects.toThrow("busy"); await expect(first).rejects.toThrow("reply-timeout"); expect(send.mock.calls.map(([m]) => m.action)).toEqual(["start", "read", "cancel", "cleanup"]);
});
it("blocks a new chat while a cancelled worker has not settled cleanup, including after restart", async () => {
 const f = await fixture(), id = await f.start(); await f.bind(id); await f.run({ type: "DR_FIELD", action: "cancel", id });
 const start = { type: "DR_FIELD", action: "start", input: input() } as const;
 expect(await f.run(start)).toMatchObject({ ok: false, error: "cleanup-pending" });
 const restart = new IsolatedFieldCoordinator(f.repo, f.api);
 expect(await restart.handle(start, f.source)).toMatchObject({ ok: false, error: "cleanup-pending" }); expect(f.api.tabs.create).toHaveBeenCalledTimes(1);
 await f.finish(id); expect(await f.run(start)).toMatchObject({ ok: true }); expect(f.api.tabs.create).toHaveBeenCalledTimes(2);
});
it("source can check only owned cleanup after navigation, never retrieve stale reply text", async () => {
 const f = await fixture(), id = await f.start(); await f.bind(id); f.tabs.set(1, { id: 1, url: "https://chat.deepseek.com/chat/s/other" });
 await f.run({ type: "DR_FIELD", action: "cancel", id }); await f.finish(id, false);
 expect(await f.run({ type: "DR_FIELD", action: "cleanup", id })).toEqual({ ok: true, cleanup: "failed", cleanupUrl: "https://chat.deepseek.com/chat/s/owned" });
 expect(await f.run({ type: "DR_FIELD", action: "read", id })).toMatchObject({ ok: false, error: "scene-changed" });
 expect(await f.run({ type: "DR_FIELD", action: "cleanup", id }, { ...f.source, tab: { id: 9 } })).toMatchObject({ ok: false, error: "unowned-tab" });
});
it("cancellation during start still obtains ownership and waits for cleanup without resending", async () => {
 const controller = new AbortController(); let release!: (value: any) => void;
 const send = vi.fn(async (m: any) => m.action === "start" ? new Promise(r => { release = r; }) : m.action === "cleanup" ? { ok: true, cleanup: "failed", cleanupUrl: "https://chat.deepseek.com/chat/s/owned" } : { ok: true });
 const result = new IsolatedFieldClient(send).generate(input(), () => true, controller.signal); controller.abort(); release({ ok: true, id: "field_test" });
 await expect(result).rejects.toMatchObject({ message: "cancelled", cleanup: "failed", cleanupUrl: "https://chat.deepseek.com/chat/s/owned" });
 expect(send.mock.calls.map(([m]) => m.action)).toEqual(["start", "cancel", "cleanup"]);
});
it("refuses an already cancelled request without opening a tab", async () => {
 const send = vi.fn(), controller = new AbortController(); controller.abort();
 await expect(new IsolatedFieldClient(send).generate(input(), () => true, controller.signal)).rejects.toThrow("cancelled"); expect(send).not.toHaveBeenCalled();
});
it("unconfirmed cleanup has a finite wait and stops the lane rather than pretending deletion succeeded", async () => {
 const controller = new AbortController(), send = vi.fn(async (m: any) => { if (m.action === "start") { controller.abort(); return { ok: true, id: "field_test" }; } return { ok: true }; });
 await expect(new IsolatedFieldClient(send, async () => {}).generate(input(), () => true, controller.signal)).rejects.toThrow("cleanup-pending");
 expect(send.mock.calls.filter(([m]) => m.action === "start")).toHaveLength(1); expect(send.mock.calls.filter(([m]) => m.action === "cancel")).toHaveLength(1); expect(send.mock.calls.filter(([m]) => m.action === "cleanup")).toHaveLength(30);
});
