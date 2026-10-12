import { afterEach, expect, it } from "vitest";
import { castDraft, castRecords } from "./fixtures/cast-data";
import { castSources, parseCastDraft, validateCastDraftValue, type CastDraft } from "../src/core/cast-initialization";
import { mergeCastBatches, parseCastBatch } from "../src/core/cast-batches";
import { createCastJob, mutateCastJob, acceptCastReply, applyCastDraft } from "../src/storage/cast-initialization";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { validDataRecord } from "../src/core/record-validation";
import type { ChatBinding } from "../src/core/types";
const dbs: DeepRoleDatabase[] = []; afterEach(async () => { await Promise.all(dbs.splice(0).map(db => db.delete())); });
function large(request: string, count: number): CastDraft {
  const d = castDraft(request), sample = d.characters[1]!;
  return { ...d, characters: [d.characters[0]!, ...Array.from({ length: count - 1 }, (_, i) => ({ ...structuredClone(sample), key: `npc-${i + 1}`, name: `Resident ${i + 1}` }))], present: ["p1"], partners: [] };
}
it.each([41, 100, 1000])("validated local drafts of %i people are distinct from the bounded native reply", count => {
  const sources = castSources(castRecords(), "w"), draft = large("request", count);
  expect(validateCastDraftValue(draft, "request", sources).characters).toHaveLength(count);
  expect(mergeCastBatches({ ...draft, characters: draft.characters.slice(0, -1) }, { ...draft, characters: draft.characters.slice(-1), present: [], partners: [] }, "request", sources).characters).toHaveLength(count);
  expect(() => parseCastBatch(JSON.stringify({ ...draft, more: false }), "request", sources, 1)).toThrow();
  if (JSON.stringify(draft).length > 180000) expect(() => parseCastDraft(JSON.stringify(draft), "request", sources)).toThrow();
  draft.characters.at(-1)!.evidence[0]!.quote = "NOT IN SOURCE"; expect(() => validateCastDraftValue(draft, "request", sources)).toThrow("invalid-evidence");
});
it("the 41st prepared person continues the job rather than returning a character-limit error", async () => {
  const db = new DeepRoleDatabase("large-cast-" + crypto.randomUUID()); dbs.push(db); const repo = new DeepRoleRepository(db); await repo.mergeRecords(castRecords()); const job = await createCastJob("w", "en", false, repo), previous = large(job.id, 40);
  await mutateCastJob(job.id, j => ({ ...j, step: 1, phase: "analyzing", awaiting: true, draft: previous }), repo);
  const next = large(job.id, 41).characters.at(-1)!; const received = await acceptCastReply(job.id, 1, JSON.stringify({ version: 1, request: job.id, characters: [next], present: [], partners: [], warnings: [], more: true }), repo);
  expect(received).toMatchObject({ phase: "analyzing", awaiting: false, step: 2 }); expect(received.draft!.characters).toHaveLength(41); expect(received.error).toBeUndefined();
});
it.each([41, 100, 1000])("applying %i prepared profiles does not truncate saved states or rewrite lore", async count => {
  const db = new DeepRoleDatabase("apply-large-cast-" + crypto.randomUUID()); dbs.push(db); const repo = new DeepRoleRepository(db); const records = castRecords(); await repo.mergeRecords(records); const job = await createCastJob("w", "en", false, repo), draft = large(job.id, count);
  await mutateCastJob(job.id, j => ({ ...j, phase: "ready", cleanup: "done", draft }), repo); expect(await applyCastDraft(job.id, draft, draft.characters.map(c => c.key), "p1", repo)).toBe(count);
  expect(await repo.list("entity")).toHaveLength(count); const binding = (await repo.get<ChatBinding>("binding", "binding:a"))!; expect(Object.keys(binding.characterScenes!.w!.states)).toHaveLength(count); expect((await repo.rawRecords()).filter(r => r.kind !== "cast").every(validDataRecord)).toBe(true); expect((await repo.get("world", "w")) as any).toMatchObject({ description: (records[0]!.data as any).description });
});
