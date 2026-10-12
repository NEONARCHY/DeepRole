import { afterEach, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { castRecords, castDraft } from "./fixtures/cast-data";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { createCastJob, mutateCastJob, acceptCastReply, applyCastDraft } from "../src/storage/cast-initialization";
import { castPrompt, castParts, type CastJob } from "../src/core/cast-initialization";
import { largeCastSegment, largeProfileSources, acceptLargeCastReply, LARGE_LORE_BUDGET } from "../src/core/cast-large-lore";
import { CastCoordinator, castView } from "../src/adapters/cast-coordinator";
import { createBackup, parseBackup } from "../src/storage/backup";
import { removeWorld } from "../src/storage/worlds";
import { interruptedCastJob } from "../src/core/cast-batches";
const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dbs.splice(0).map(d => d.delete())); await browser.storage.session.clear(); });
async function setup() {
 const db = new DeepRoleDatabase("large-cast-" + crypto.randomUUID()); dbs.push(db); const repo = new DeepRoleRepository(db), records = castRecords();
 (records[0]!.data as any).description = "Leon is the protagonist. " + 'Scenery "\\" 🌿. '.repeat(18000) + " Mira trusts Leon after he kept his promise."; await repo.mergeRecords(records);
 const tabs = new Map<number, any>(); let sequence = 5;
 const api = { ...browser, runtime: { id: "ours", getURL: (p: string) => "chrome-extension://ours/" + p }, windows: { getLastFocused: vi.fn(async () => ({ id: 1 })), create: vi.fn(async () => { const tab = { id: sequence++, url: "about:blank" }; tabs.set(tab.id, tab); return { tabs: [tab] }; }) }, tabs: { get: vi.fn(async (id: number) => { if (!tabs.has(id)) throw Error("missing"); return tabs.get(id); }), update: vi.fn(async (id: number, v: any) => { Object.assign(tabs.get(id), v); return tabs.get(id); }), remove: vi.fn(async (id: number) => tabs.delete(id)), sendMessage: vi.fn(async () => ({ ok: true })) } } as any;
 const c = new CastCoordinator(repo, api), ui = { id: "ours", url: "chrome-extension://ours/sidepanel.html" }, send = (m: any, sender: any = ui) => c.handle(m, sender);
 const start = () => send({ type: "DR_CAST", action: "start", worldId: "w", locale: "en" });
 return { db, repo, records, tabs, api, c, ui, send, start };
}
function reply(job: CastJob) {
 if (job.large!.stage === "scan") { const part = largeCastSegment(job); return JSON.stringify({ version: 1, request: job.id, names: [{ name: "Leon", quote: "Leon is the protagonist." }, { name: "Mira", quote: "Mira trusts Leon after he kept his promise." }].filter(p => part.text.includes(p.quote) && !job.large!.candidates.some(c => c.name === p.name)).map(p => ({ ...p, source: part.source.id })), more: false }); }
 const candidate = job.large!.candidates[job.large!.prepared]!, sources = largeProfileSources(job), member = structuredClone(castDraft(job.id).characters[candidate.name === "Leon" ? 0 : 1]!); member.key = candidate.key;
 member.evidence = member.evidence.map(e => ({ ...e, source: sources.find(s => s.text.includes(e.quote))!.id }));
 return JSON.stringify({ version: 1, request: job.id, characters: [member], present: [], partners: [], warnings: [], more: false });
}
async function scan(job: CastJob) { let current = job; while (current.large!.stage === "scan") current = acceptLargeCastReply(current, reply(current)); return current; }
it("routes >220k lore to independent JSON windows with overlap, Unicode integrity and no overall truncation", async () => {
 const f = await setup(), job = await createCastJob("w", "en", false, f.repo); expect(job.large).toMatchObject({ stage: "scan", source: 0, offset: 0 }); expect(() => castParts(job.sources)).toThrow("world-too-large");
 let current = job, previous = 0, requests = 0;
 while (current.large!.stage === "scan") { const p = largeCastSegment(current); expect(JSON.stringify([{ id: p.source.id, text: p.text }]).length).toBeLessThanOrEqual(LARGE_LORE_BUDGET); expect(p.text.isWellFormed()).toBe(true); expect(p.end).toBeGreaterThan(previous); previous = p.end;
  expect(castPrompt(current)).not.toContain("Read and retain it"); expect(castPrompt(current).length).toBeLessThan(18000); current = acceptLargeCastReply(current, reply(current)); requests++; }
 expect(current.large!.candidates.map(c => c.name)).toEqual(["Leon", "Mira"]); expect(previous).toBe(job.sources[0]!.text.length); expect(requests).toBeGreaterThan(20); expect(current.sources).toEqual(job.sources); expect((castView(current) as any).large.candidates).toBeUndefined();
});
it("stores and resumes scan positions after cancel/reopen without rereading completed text", async () => {
 const f = await setup(), job = await createCastJob("w", "en", false, f.repo); await mutateCastJob(job.id, j => ({ ...j, phase: "reading", awaiting: true }), f.repo); const next = await acceptCastReply(job.id, 0, reply(job), f.repo);
 await mutateCastJob(job.id, j => ({ ...j, phase: "cancelled", cleanup: "done" }), f.repo); const resumed = await createCastJob("w", "en", true, new DeepRoleRepository(f.db));
 expect(resumed.large).toEqual(next.large); expect(resumed.id).not.toBe(job.id); expect(resumed.step).toBe(0); expect(largeCastSegment(resumed).text.startsWith(job.sources[0]!.text.slice(next.large!.offset - 1000, next.large!.offset))).toBe(true); expect(await f.repo.list("entity")).toEqual([]);
});
it("rejects invented quotes, repeated more=true, wrong envelopes and partial names without advancing", async () => {
 const f = await setup(), job = await createCastJob("w", "en", false, f.repo), raw = JSON.parse(reply(job));
 for (const input of [{ ...raw, request: "foreign" }, { ...raw, names: [{ ...raw.names[0], quote: "Leon never existed." }] }, { ...raw, names: [{ ...raw.names[0], source: "foreign" }] }, { ...raw, names: Array(33).fill(raw.names[0]) }]) expect(() => acceptLargeCastReply(job, JSON.stringify(input))).toThrow();
 const advanced = acceptLargeCastReply(job, JSON.stringify({ ...raw, more: true })); expect(advanced.large!.offset).toBe(0); expect(() => acceptLargeCastReply(advanced, JSON.stringify({ ...raw, more: true }))).toThrow(); expect(() => acceptLargeCastReply(job, JSON.stringify(raw).slice(0, -1))).toThrow(); expect(job.large!.candidates).toEqual([]);
});
it("prepares requested people from transmitted sources, retains scores and restores original evidence IDs", async () => {
 const f = await setup(), job = await scan(await createCastJob("w", "en", false, f.repo)); let current = job;
 for (let i = 0; i < 2; i++) { const sources = largeProfileSources(current); expect(sources.length).toBeLessThanOrEqual(16); expect(JSON.stringify(sources.map(({ originalId: _original, ...s }) => s)).length).toBeLessThanOrEqual(12000); const prompt = castPrompt(current); expect(prompt).toContain("[Request ID: " + current.id + "-0]"); expect(prompt).not.toContain(String(Number.MAX_SAFE_INTEGER)); expect(prompt.length).toBeLessThan(26000);
  expect(JSON.parse(prompt.split("[Large profile sources]\n")[1]!)).toEqual(sources.map(({ originalId: _original, ...s }) => s)); current = acceptLargeCastReply(current, reply(current)); expect(current.draft!.characters[i]!.evidence[0]!.source).toBe("w"); }
 expect(current.large!.stage).toBe("done"); expect(current.draft!.characters[1]!.sheet.relationships!.initial).toEqual({ trust: 82, affinity: 71 }); expect(current.draft!.present).toEqual([]); expect(current.draft!.partners).toEqual([]);
});
it("rejects a quote outside the actual excerpt, another name, aliases or guessed scene", async () => {
 const f = await setup(), job = await scan(await createCastJob("w", "en", false, f.repo)), raw = JSON.parse(reply(job));
 for (const mutate of [(v: any) => v.characters[0].name = "Someone else", (v: any) => v.characters[0].aliases = ["Mira"], (v: any) => v.characters[0].evidence[0].quote = "Mira trusts Leon after he kept his promise.", (v: any) => v.present = [v.characters[0].key], (v: any) => v.more = true]) { const changed = structuredClone(raw); mutate(changed); expect(() => acceptLargeCastReply(job, JSON.stringify(changed))).toThrow(); }
});
it("guards source changes atomically, allows explicit restart and leaves the old source intact", async () => {
 const f = await setup(), job = await createCastJob("w", "en", false, f.repo); await mutateCastJob(job.id, j => ({ ...j, phase: "reading", awaiting: true }), f.repo);
 const world = await f.repo.get<any>("world", "w"); await f.repo.put("world", { ...world, description: world.description + " Changed source.", updatedAt: 2 }); await expect(acceptCastReply(job.id, 0, reply(job), f.repo)).rejects.toThrow("lore-changed");
 await mutateCastJob(job.id, j => ({ ...j, phase: "error", cleanup: "done" }), f.repo); await expect(createCastJob("w", "en", true, f.repo)).rejects.toThrow("lore-changed"); const fresh = await createCastJob("w", "en", true, f.repo, undefined, true); expect(fresh.large!.offset).toBe(0); expect(fresh.large!.candidates).toEqual([]); expect(job.sources[0]!.text.endsWith(" Changed source.")).toBe(false);
});
it("chains fresh owned chats after cleanup, uses distinct audits and applies profiles only after review", async () => {
 const f = await setup(), before = (await f.repo.rawRecords()).filter(r => r.kind !== "cast" && r.kind !== "service"), result: any = await f.start(); let job = await f.repo.get<CastJob>("cast", result.job.id); const ids: string[] = [];
 for (let step = 0; job!.large!.stage !== "done"; step++) {
  expect(step).toBeLessThan(80); const tab = [...f.tabs.values()][0]!, sender = () => ({ id: "ours", url: tab.url, tab: { id: tab.id } }), id = job!.id; ids.push(id);
  expect(await f.send({ type: "DR_CAST_WORKER", action: "sent", id, step: 0 }, sender())).toMatchObject({ ok: true }); tab.url = "https://chat.deepseek.com/chat/s/owned-" + step;
  expect(await f.send({ type: "DR_CAST_WORKER", action: "bound", id, chatId: "owned-" + step }, sender())).toMatchObject({ ok: true }); expect(await f.send({ type: "DR_CAST_WORKER", action: "reply", id, step: 0, chatId: "owned-" + step, raw: reply(job!) }, sender())).toMatchObject({ ok: true });
  const waiting = await f.repo.get<CastJob>("cast", id); expect(f.api.windows.create).toHaveBeenCalledTimes(step + 1); expect(await f.repo.list("entity")).toEqual([]);
  expect(await f.send({ type: "DR_CAST_WORKER", action: "authorize-cleanup", id, chatId: "owned-" + step }, sender())).toMatchObject({ ok: true }); tab.url = "https://chat.deepseek.com/";
  expect(await f.send({ type: "DR_CAST_WORKER", action: "cleaned", id, chatId: "owned-" + step, ok: true }, sender())).toMatchObject({ ok: true });
  job = (await f.repo.list<CastJob>("cast"))[0]!; if (waiting!.large!.stage !== "done") expect(job.id).not.toBe(id); else break;
 }
 expect(job!.large).toMatchObject({ stage: "done", prepared: 2 }); expect(ids.length).toBeGreaterThan(20); expect(new Set(ids).size).toBe(ids.length); expect((await f.repo.list<any>("service")).every(r => r.phase === "result" && r.cleanup === "done")).toBe(true);
 expect((await f.repo.rawRecords()).filter(r => r.kind !== "cast" && r.kind !== "service")).toEqual(before.map(r => r.kind === "world" ? { ...r, data: { ...r.data, autoPrepareCharacters: false } } : r)); expect((await parseBackup(JSON.stringify(await createBackup(undefined, f.repo)))).records.some(r => r.kind === "cast")).toBe(false);
 await applyCastDraft(job!.id, job!.draft!, job!.draft!.characters.map(c => c.key), job!.draft!.characters[0]!.key, f.repo); expect(await f.repo.list("entity")).toHaveLength(2); expect((await f.repo.get<any>("world", "w")).description).toBe((f.records[0]!.data as any).description);
}, 30000);
it("cannot hand off after cancellation, missing ownership or world purge", async () => {
 const f = await setup(), result: any = await f.start(), id = result.job.id, tab = [...f.tabs.values()][0]!, sender = () => ({ id: "ours", url: tab.url, tab: { id: tab.id } });
 await f.send({ type: "DR_CAST_WORKER", action: "sent", id, step: 0 }, sender()); tab.url = "https://chat.deepseek.com/chat/s/owned"; await f.send({ type: "DR_CAST_WORKER", action: "bound", id, chatId: "owned" }, sender()); await f.send({ type: "DR_CAST_WORKER", action: "reply", id, step: 0, chatId: "owned", raw: reply((await f.repo.get<CastJob>("cast", id))!) }, sender());
 await f.send({ type: "DR_CAST", action: "cancel", id }); tab.url = "https://chat.deepseek.com/"; expect(await f.send({ type: "DR_CAST_WORKER", action: "cleaned", id, chatId: "owned", ok: true }, sender())).toMatchObject({ ok: true }); expect(f.api.windows.create).toHaveBeenCalledTimes(1);
 const resumed: any = await f.send({ type: "DR_CAST", action: "start", worldId: "w", locale: "en", retry: true }); expect(resumed.ok).toBe(true); await removeWorld("w", f.repo); expect((await f.repo.list("cast")).length).toBe(0); expect(await f.send({ type: "DR_CAST_WORKER", action: "claim", id: resumed.job.id }, { id: "ours", url: "https://chat.deepseek.com/", tab: { id: 999 } })).toMatchObject({ ok: false });
});
it("retains profile progress across encrypted reopen and excludes work from portable backups", async () => {
 const f = await setup(), original = await createCastJob("w", "en", false, f.repo), ready = await scan(original), prepared = acceptLargeCastReply(ready, reply(ready));
 await mutateCastJob(original.id, () => ({ ...prepared, phase: "error", cleanup: "done" }), f.repo); await f.repo.enableVault("synthetic large cast password"); const resumed = await createCastJob("w", "en", true, new DeepRoleRepository(f.db)); expect(resumed.large!.prepared).toBe(1); expect(resumed.draft!.characters).toHaveLength(1); expect(resumed.draft!.request).toBe(resumed.id); expect((await parseBackup(JSON.stringify(await createBackup(undefined, f.repo)))).records.some(r => r.kind === "cast")).toBe(false);
}, 15000);
async function firstStep(f: Awaited<ReturnType<typeof setup>>) {
 const result: any = await f.start(), id = result.job.id, tab = [...f.tabs.values()][0]!, sender = () => ({ id: "ours", url: tab.url, tab: { id: tab.id } });
 await f.send({ type: "DR_CAST_WORKER", action: "sent", id, step: 0 }, sender()); tab.url = "https://chat.deepseek.com/chat/s/owned";
 await f.send({ type: "DR_CAST_WORKER", action: "bound", id, chatId: "owned" }, sender()); await f.send({ type: "DR_CAST_WORKER", action: "reply", id, step: 0, chatId: "owned", raw: reply((await f.repo.get<CastJob>("cast", id))!) }, sender());
 return { id, tab, sender };
}
it("blocks continuation after failed cleanup and never starts from manual cleanup acknowledgement alone", async () => {
 const f = await setup(), step = await firstStep(f); expect(await f.send({ type: "DR_CAST_WORKER", action: "cleaned", id: step.id, chatId: "owned", ok: false }, step.sender())).toMatchObject({ ok: true });
 expect(f.api.windows.create).toHaveBeenCalledTimes(1); expect(await f.send({ type: "DR_CAST", action: "start", worldId: "w", locale: "en", retry: true })).toMatchObject({ ok: false, error: "cleanup-required" });
 expect(await f.send({ type: "DR_CAST", action: "confirm-cleanup", id: step.id })).toMatchObject({ ok: true }); expect(f.api.windows.create).toHaveBeenCalledTimes(1);
});
it("keeps hidden status and private-window ownership across handoff and rejects old worker messages", async () => {
 const f = await setup(); f.api.windows.getLastFocused.mockResolvedValue({ id: 1, incognito: true }); const step = await firstStep(f); await f.send({ type: "DR_CAST", action: "hide", id: step.id });
 await f.send({ type: "DR_CAST_WORKER", action: "authorize-cleanup", id: step.id, chatId: "owned" }, step.sender()); step.tab.url = "https://chat.deepseek.com/";
 f.api.windows.getLastFocused.mockResolvedValue({ id: 2, incognito: false }); expect(await f.send({ type: "DR_CAST_WORKER", action: "cleaned", id: step.id, chatId: "owned", ok: true }, step.sender())).toMatchObject({ ok: true });
 const next = (await f.repo.list<CastJob>("cast"))[0]!; expect(next).toMatchObject({ statusHidden: true, incognito: true }); expect(f.api.windows.create.mock.calls.map((c: any[]) => c[0].incognito)).toEqual([true, true]);
 const before = await f.repo.get("cast", next.id); expect(await f.send({ type: "DR_CAST_WORKER", action: "reply", id: step.id, step: 0, chatId: "owned", raw: "{}" }, step.sender())).toMatchObject({ ok: false }); expect(await f.repo.get("cast", next.id)).toEqual(before);
});
it("stops handoff if the old tab navigates away during its confirmed cleanup", async () => {
 const f = await setup(), step = await firstStep(f); step.tab.url = "https://chat.deepseek.com/"; f.api.tabs.remove.mockImplementation(async () => { step.tab.url = "https://chat.deepseek.com/chat/s/personal"; });
 expect(await f.send({ type: "DR_CAST_WORKER", action: "cleaned", id: step.id, chatId: "owned", ok: true }, step.sender())).toMatchObject({ ok: true }); expect(f.api.windows.create).toHaveBeenCalledTimes(1); expect(await f.repo.get("cast", step.id)).toMatchObject({ phase: "error", error: "user-interrupted", cleanup: "done" }); expect(step.tab.url).toContain("personal");
});
it("recovers a complete profile checkpoint once, then resumes the next profile with the original evidence", async () => {
 const f = await setup(), job = await scan(await createCastJob("w", "en", false, f.repo)); job.phase = "analyzing"; job.awaiting = true; job.chatId = "owned";
 job.replyCheckpoint = { step: 0, repair: false, chatId: "owned", replyIdentity: '["message","r1"]', raw: reply(job) }; const recovered = interruptedCastJob(job, "tab-closed");
 expect(recovered.large!.prepared).toBe(1); expect(recovered.draft!.characters).toHaveLength(1); expect(recovered.replyCheckpoint).toBeUndefined(); expect(interruptedCastJob(recovered, "interrupted").large!.prepared).toBe(1);
 await mutateCastJob(job.id, () => ({ ...recovered, cleanup: "done" }), f.repo); const next = await createCastJob("w", "en", true, f.repo); expect(next.large!.prepared).toBe(1); expect(largeProfileSources(next).some(s => s.text.includes("Mira trusts Leon"))).toBe(true);
});
it("keeps titles in large working excerpts so saved character names are not dropped, without rewriting records", async () => {
 const f = await setup(), person = structuredClone(castDraft("test").characters[0]!.sheet);
 await f.repo.put("entity", { id: "known-person", name: "Canonical Hero", kind: "character", worldId: "w", description: "", aliases: [], memberIds: [], characterSheet: person, createdAt: 1, updatedAt: 1 });
 const before = await f.repo.get("entity", "known-person"), job = await createCastJob("w", "en", false, f.repo), source = job.sources.find(s => s.id === "known-person")!;
 expect(source.text).toContain("Canonical Hero"); expect(source.text).toContain('"protagonist":true'); expect(await f.repo.get("entity", "known-person")).toEqual(before);
});
