import { afterEach, expect, it } from "vitest";
import { castDiagnostic, castRepairIssues, castPrompt, castSources, parseCastDraft } from "../src/core/cast-initialization";
import { createCastJob, mutateCastJob, acceptCastReply } from "../src/storage/cast-initialization";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { castDraft, castRecords } from "./fixtures/cast-data";
import { castError } from "../src/core/cast-i18n";
const databases: DeepRoleDatabase[] = [];
afterEach(async () => { await Promise.all(databases.map(db => db.delete())); databases.length = 0; });
function malformed(request: string) {
  const data: any = { ...castDraft(request), more: false };
  data.characters[0].completed = [{ id: "past-event", label: "Past event", required: false }];
  delete data.characters[1].state; delete data.characters[1].completed;
  delete data.characters[1].reason; delete data.characters[1].evidence;
  data.characters[1].sheet.relationships.stageBehavior = { trust_low: "Reserved" };
  return data;
}
it("pinpoints the real failure shapes without accepting them or echoing model prose", () => {
  const data = malformed("x"); data.characters[1].name = "UNTRUSTED MODEL INSTRUCTION";
  const raw = JSON.stringify(data), issues = castRepairIssues(raw).join("\n");
  expect(issues).toContain("characters[0].completed must contain at most 8 unique STRING");
  expect(issues).toContain("characters[0].completed must be [] when relationships is null");
  for (const field of ["state", "completed", "reason", "evidence"]) expect(issues).toContain(`characters[1].${field} is required`);
  expect(issues).toContain("guarded, acquaintance, trusting, close");
  expect(issues).not.toContain("UNTRUSTED");
  expect(() => parseCastDraft(raw, "x", castSources(castRecords(), "w"))).toThrow();
});
it("persists concrete repair instructions and accepts a correctly repaired batch", async () => {
  const db = new DeepRoleDatabase("cast-format-" + crypto.randomUUID()); databases.push(db);
  const repo = new DeepRoleRepository(db); await repo.mergeRecords(castRecords());
  const job = await createCastJob("w", "en", false, repo);
  // Legacy two-person protocol still reports every malformed profile field.
  await mutateCastJob(job.id, j => ({ ...j, batchSize: 2, phase: "reading", awaiting: true }), repo);
  await acceptCastReply(job.id, 0, "received", repo);
  await mutateCastJob(job.id, j => ({ ...j, phase: "analyzing", awaiting: true }), repo);
  const repair = await acceptCastReply(job.id, 1, JSON.stringify(malformed(job.id)), repo);
  expect(repair).toMatchObject({ repair: true, phase: "analyzing", awaiting: false });
  const prompt = castPrompt(repair);
  expect(prompt).toContain("Local validation found these errors");
  expect(prompt).toContain("characters[1].state is required");
  expect(prompt).toContain("completed is an array of STRING IDs");
  await mutateCastJob(job.id, j => ({ ...j, awaiting: true }), repo);
  const ready = await acceptCastReply(job.id, 1, JSON.stringify({ ...castDraft(job.id), more: false }), repo);
  expect(ready).toMatchObject({ phase: "ready", repair: false });
  expect(ready.draft?.characters).toHaveLength(2); expect(ready.repairIssues).toBeUndefined();
  expect(ready.diagnostics).toHaveLength(1);
  await mutateCastJob(job.id, j => ({ ...j, cleanup: "done" }), repo);
  const retry = await createCastJob("w", "en", true, repo);
  expect(retry.diagnostics).toEqual(ready.diagnostics);
  expect(retry.diagnostics![0]!.requestId).toBe(job.id);
  expect(await repo.list("entity")).toEqual([]);
});
it("retains both rejected attempts after cleanup without copying model prose", async () => {
  const db = new DeepRoleDatabase("cast-diagnostics-" + crypto.randomUUID()); databases.push(db);
  const repo = new DeepRoleRepository(db); await repo.mergeRecords(castRecords());
  const job = await createCastJob("w", "ru", false, repo);
  await mutateCastJob(job.id, j => ({ ...j, phase: "analyzing", step: 1, awaiting: true }), repo);
  const data = malformed(job.id); data.characters[0].name = "PRIVATE MODEL PROSE";
  data.characters = data.characters.slice(0, 1); data.present = ["p1"]; data.partners = [];
  await acceptCastReply(job.id, 1, JSON.stringify(data), repo);
  await mutateCastJob(job.id, j => ({ ...j, awaiting: true }), repo);
  await acceptCastReply(job.id, 1, JSON.stringify(data), repo);
  const cleaned = await mutateCastJob(job.id, j => ({ ...j, cleanup: "done" }), repo);
  expect(cleaned.phase).toBe("error"); expect(cleaned.diagnostics!.map(d => d.repair)).toEqual([false, true]);
  expect(cleaned.diagnostics![0]).toMatchObject({ stage: "parse", replyLength: JSON.stringify(data).length, prepared: 0 });
  expect(cleaned.diagnostics![0]!.details?.[0]?.path).toBe("characters[0].completed");
  // A third reply cannot restart a terminal job or schedule endless repairs.
  await expect(acceptCastReply(job.id, 1, JSON.stringify(data), repo)).rejects.toThrow("stale-step");
  expect((await repo.list<any>("cast"))[0].diagnostics).toEqual(cleaned.diagnostics);
  expect(JSON.stringify(cleaned.diagnostics)).not.toContain("PRIVATE MODEL PROSE");
  expect((await repo.list<any>("cast"))[0].diagnostics).toEqual(cleaned.diagnostics);
  let bounded = cleaned; for (let i = 0; i < 40; i++) bounded = castDiagnostic(bounded, "PRIVATE KEY");
  expect(bounded.diagnostics).toHaveLength(24); expect(JSON.stringify(bounded.diagnostics)).not.toContain("PRIVATE KEY");
});
it("identifies batch envelope and source quote failures without exposing the quote", () => {
  const data: any = castDraft("wrong"); data.characters[0].evidence = [{ source: "unknown", quote: "PRIVATE QUOTE" }];
  const issues = castRepairIssues(JSON.stringify(data), { id: "expected", sources: castSources(castRecords(), "w"), batchSize: 2 }).join("\n");
  expect(issues).toContain("request must match"); expect(issues).toContain("more must be a boolean"); expect(issues).toContain("characters[0].evidence[0]"); expect(issues).not.toContain("PRIVATE QUOTE");
});
it("bounds diagnostics and gives a safe fallback for malformed JSON", () => {
  expect(castRepairIssues("broken JSON")[0]).toContain("not complete JSON");
  expect(castRepairIssues("x".repeat(180001))[0]).toContain("limit");
  const data = { characters: Array.from({ length: 40 }, () => ({})) };
  expect(castRepairIssues(JSON.stringify(data))).toHaveLength(20);
});
it("explains format failures separately from cleanup in both languages", () => {
  expect(castError("ru", "invalid-result")).toContain("формат анкет");
  expect(castError("en", "invalid-evidence")).toContain("format validation");
  expect(castError("ru", "model-refusal")).not.toContain("формат анкет");
});
