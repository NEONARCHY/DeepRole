import { afterEach, expect, it } from "vitest";
import { receivedCastCharacters, parseCastBatch, mergeCastBatches, interruptedCastJob } from "../src/core/cast-batches";
import { castSources, castPrompt, type CastDraft } from "../src/core/cast-initialization";
import { createCastJob, mutateCastJob, acceptCastReply, applyCastDraft } from "../src/storage/cast-initialization";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { castRecords, castDraft } from "./fixtures/cast-data";
const sources = castSources(castRecords(), "w"), dbs: DeepRoleDatabase[] = [];
afterEach(async () => { await Promise.all(dbs.map(db => db.delete())); dbs.length = 0; });
const first = (request: string) => { const d = castDraft(request); return { ...d, characters: [d.characters[0]!], present: ["p1"], partners: [] }; };
const second = (request: string) => { const d = castDraft(request); return { ...d, characters: [d.characters[1]!], present: ["p2"], partners: ["p2"] }; };
async function setup() { const db = new DeepRoleDatabase("cast-batch-" + crypto.randomUUID()); dbs.push(db); const repo = new DeepRoleRepository(db); await repo.mergeRecords(castRecords()); const job = await createCastJob("w", "en", false, repo); await mutateCastJob(job.id, j => ({ ...j, step: 1, awaiting: true, phase: "analyzing" }), repo); return { repo, job }; }
it("salvages only finished objects, handles braces and quotes inside strings", () => {
 const d = castDraft("x"); d.characters[0]!.sheet.appearance = 'Coat {blue} and "silver".';
 const prefix = '<deeprole_cast>{"version":1,"request":"x","characters":[' + JSON.stringify(d.characters[0]) + ',{"key":"cut","sheet":';
 const saved = receivedCastCharacters(prefix, "x")!;
 expect(parseCastBatch(saved, "x", sources, 2).draft?.characters).toHaveLength(1);
 expect(parseCastBatch(saved, "x", sources, 2).partial).toBe(true);
 expect(receivedCastCharacters(prefix, "other")).toBeUndefined();
 expect(receivedCastCharacters(prefix.slice(0, 100), "x")).toBeUndefined();
});
it("validates evidence and completion rather than treating cut data as a finished batch", () => {
 const d = first("x"); expect(() => parseCastBatch(JSON.stringify(d), "x", sources, 2)).toThrow();
 d.characters[0]!.evidence[0]!.quote = "Invented event";
 expect(() => parseCastBatch(JSON.stringify({ ...d, partial: true }), "x", sources, 2)).toThrow("invalid-evidence");
 expect(parseCastBatch(JSON.stringify({ version: 1, request: "x", characters: [], present: [], partners: [], warnings: [], more: false }), "x", sources, 2).draft).toBeUndefined();
});
it("merges batches without duplicate names, aliases, keys or lost scene state", () => {
 const a = first("x"), b = second("x"), combined = mergeCastBatches(a, b, "x", sources);
 expect(combined.characters).toHaveLength(2); expect(combined.partners).toEqual(["p2"]);
 expect(() => mergeCastBatches(a, a, "x", sources)).toThrow("duplicate-character");
 b.characters[0]!.aliases = ["Leon"]; expect(() => mergeCastBatches(a, b, "x", sources)).toThrow("duplicate-character");
});
it("persists each batch, asks only for remaining people and waits for explicit completion", async () => {
 const { repo, job } = await setup();
 const a = await acceptCastReply(job.id, 1, JSON.stringify({ ...first(job.id), more: true }), repo);
 expect(a.phase).toBe("analyzing"); expect(a.draft?.characters).toHaveLength(1); expect(a.step).toBe(2);
 expect(castPrompt(a)).toContain('Previously prepared people'); expect(castPrompt(a)).toContain('Leon'); expect(castPrompt(a)).toContain('at most ONE');
 await mutateCastJob(job.id, j => ({ ...j, awaiting: true }), repo);
 const b = await acceptCastReply(job.id, 2, JSON.stringify({ ...second(job.id), more: false }), repo);
 expect(b.phase).toBe("ready"); expect(b.draft?.characters).toHaveLength(2); expect(await repo.list("entity")).toHaveLength(0);
});
it("accepts only known earlier scene references while keeping incoming profiles separate", () => {
 const a = first("x"), b = { ...second("x"), present: ["p1", "p2"], more: false };
 const parsed = parseCastBatch(JSON.stringify(b), "x", sources, 1, a).draft!;
 expect(parsed.characters.map(c => c.key)).toEqual(["p2"]);
 expect(parsed.present).toEqual(["p1", "p2"]);
 expect(mergeCastBatches(a, parsed, "x", sources).characters).toHaveLength(2);
 for (const present of [["unknown"], ["Leon"], ["w"]]) expect(() => parseCastBatch(JSON.stringify({ ...b, present }), "x", sources, 1, a)).toThrow("invalid-result");
 expect(() => parseCastBatch(JSON.stringify({ ...b, partners: ["p1"] }), "x", sources, 1, a)).toThrow("invalid-result");
 expect(() => parseCastBatch(JSON.stringify({ ...b, characters: [{ ...b.characters[0]!, key: "p1" }] }), "x", sources, 1, a)).toThrow("invalid-result");
 b.characters[0]!.evidence[0]!.quote = "Not in the story";
 expect(() => parseCastBatch(JSON.stringify(b), "x", sources, 1, a)).toThrow("invalid-evidence");
});
it("new jobs prepare one person per request, persist each profile and stop only on completion", async () => {
 const { repo, job } = await setup(); expect(job.batchSize).toBe(1);
 expect(castPrompt({ ...job, step: 1 })).toContain("at most ONE character");
 const a = await acceptCastReply(job.id, 1, JSON.stringify({ ...first(job.id), more: true }), repo);
 const prompt = castPrompt(a);
 expect(prompt).toContain("OR the previously prepared people");
 expect(prompt).not.toContain("only keys from THIS batch");
 expect(prompt).toContain("reason is USER-FACING");
 expect(prompt).toContain("Do not turn an age, occupation, body description");
 await mutateCastJob(job.id, j => ({ ...j, awaiting: true }), repo);
 const b = await acceptCastReply(job.id, 2, JSON.stringify({ ...second(job.id), present: ["p1", "p2"], more: true }), repo);
 expect(b).toMatchObject({ phase: "analyzing", repair: false, step: 3 });
 expect(b.draft?.characters).toHaveLength(2); expect(await repo.list("entity")).toEqual([]);
 await mutateCastJob(job.id, j => ({ ...j, awaiting: true }), repo);
 const ready = await acceptCastReply(job.id, 3, JSON.stringify({ version: 1, request: job.id, characters: [], present: [], partners: [], warnings: [], more: false }), repo);
 expect(ready.phase).toBe("ready"); expect(ready.draft?.characters).toHaveLength(2);
 expect(ready.diagnostics).toBeUndefined();
});
it("rejects a multi-person response for a new sequential job and repairs only once", async () => {
 const { repo, job } = await setup();
 const repair = await acceptCastReply(job.id, 1, JSON.stringify({ ...castDraft(job.id), more: false }), repo);
 expect(repair.repair).toBe(true); expect(castPrompt(repair)).toContain("at most 1 profiles per batch");
 await mutateCastJob(job.id, j => ({ ...j, awaiting: true }), repo);
 const corrected = await acceptCastReply(job.id, 1, JSON.stringify({ ...first(job.id), more: true }), repo);
 expect(corrected.phase).toBe("analyzing"); expect(corrected.draft?.characters).toHaveLength(1);
});
it("restores a checkpoint containing references to an earlier validated profile", async () => {
 const { repo, job } = await setup();
 const a = await acceptCastReply(job.id, 1, JSON.stringify({ ...first(job.id), more: true }), repo);
 const raw = JSON.stringify({ ...second(job.id), present: ["p1", "p2"], more: false });
 const interrupted = interruptedCastJob({ ...a, awaiting: true, chatId: "owned", replyCheckpoint: { step: 2, repair: false, chatId: "owned", replyIdentity: '["message","r2"]', raw } }, "tab-closed");
 expect(interrupted.draft?.characters.map(c => c.key)).toEqual(["p1", "p2"]);
 expect(interrupted.draft?.partners).toEqual(["p2"]);
 expect(interrupted.replyCheckpoint).toBeUndefined();
});
it("continues an old two-person job without changing its parser limit", async () => {
 const { repo, job } = await setup();
 await mutateCastJob(job.id, j => ({ ...j, batchSize: 2 }), repo);
 const ready = await acceptCastReply(job.id, 1, JSON.stringify({ ...castDraft(job.id), more: false }), repo);
 expect(ready.phase).toBe("ready"); expect(ready.draft?.characters).toHaveLength(2);
 expect(castPrompt(ready)).toContain("at most TWO");
});
it("retains a partial answer for review and resumes after cleanup with a new scoped request", async () => {
 const { repo, job } = await setup();
 const a = await acceptCastReply(job.id, 1, JSON.stringify({ ...first(job.id), partial: true }), repo);
 expect(a.phase).toBe("error"); expect(a.error).toBe("partial-reply"); expect(a.draft?.characters).toHaveLength(1);
 await mutateCastJob(job.id, j => ({ ...j, cleanup: "done" }), repo);
 const retry = await createCastJob("w", "en", true, repo);
 expect(retry.draft?.request).toBe(retry.id); expect(retry.id).not.toBe(job.id); expect(retry.draft?.characters).toHaveLength(1);
});
it("does not reuse partial profiles after source lore changes", async () => {
 const { repo, job } = await setup(); await acceptCastReply(job.id, 1, JSON.stringify({ ...first(job.id), partial: true }), repo);
 await mutateCastJob(job.id, j => ({ ...j, cleanup: "done" }), repo);
 const world = await repo.get<any>("world", "w"); await repo.put("world", { ...world, description: world.description + " New established fact." });
 expect((await createCastJob("w", "en", true, repo)).draft).toBeUndefined();
});
it("allows explicit review and saving of validated partial profiles while preserving lore", async () => {
 const { repo, job } = await setup(); const a = await acceptCastReply(job.id, 1, JSON.stringify({ ...first(job.id), partial: true }), repo);
 expect(await applyCastDraft(job.id, a.draft as CastDraft, ["p1"], "p1", repo)).toBe(1);
 expect(await repo.list("entity")).toHaveLength(1); expect((await repo.get<any>("world", "w")).description).toBe((castRecords()[0]!.data as any).description);
});
it("retains earlier batches after a malformed reply and exactly one format repair", async () => {
 const { repo, job } = await setup(); await acceptCastReply(job.id, 1, JSON.stringify({ ...first(job.id), more: true }), repo);
 await mutateCastJob(job.id, j => ({ ...j, awaiting: true }), repo);
 const a = await acceptCastReply(job.id, 2, "bad", repo); expect(a.repair).toBe(true);
 await mutateCastJob(job.id, j => ({ ...j, awaiting: true }), repo);
 const b = await acceptCastReply(job.id, 2, "bad", repo); expect(b.phase).toBe("error"); expect(b.draft?.characters).toHaveLength(1);
});
