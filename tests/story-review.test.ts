import { afterEach, expect, it, vi } from "vitest";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { readStoryReview, previewStoryReview } from "../src/storage/story-review";
import { ensureLegacyStory, recordStoryObservation } from "../src/storage/story-history";
import { anchorStoryCheckpoint } from "../src/storage/story-observer";
import { selectStoryRevision } from "../src/storage/story-selection";
import { nativeStoryMessageKey as key } from "../src/core/story-transport";
import { validStoryPreviewInput, validStoryReviewInput, validStoryReviewPage, validStoryReviewPreview } from "../src/core/story-review";
import { storyWorld } from "./fixtures/story-worlds";
import type { StoryRevision } from "../src/core/story-records";
const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dbs.splice(0).map(d => d.delete())); });
async function fixture(anchored = true) {
  const db = new DeepRoleDatabase("review-" + crypto.randomUUID()); dbs.push(db); const repo = new DeepRoleRepository(db), f = storyWorld(); await repo.mergeRecords(f.records);
  const input = { chatId: f.binding.chatId, worldId: f.world.id, cursor: null }, branch = await ensureLegacyStory({ bindingId: f.binding.id, worldId: f.world.id }, repo);
  if (anchored) await anchorStoryCheckpoint(branch.id, { identity: { chatId: input.chatId, nativeParentKey: key("41") }, role: "assistant", completion: "complete", expectedSceneRevision: "legacy-scene-a" }, repo);
  let sequence = 0;
  const initial = structuredClone(f.binding.characterScenes![f.world.id]!.states["person-1"]!);
  async function add(parent: string | null = null, role: "user" | "assistant" = "assistant", completion: StoryRevision["completion"] = "complete", event = false, before = initial, after = "Key delivered") {
    const id = `revision-${++sequence}`, eventId = `event-${sequence}`;
    await recordStoryObservation(branch.id, { id, messageId: `message-${sequence}`, nativeMessageKey: key(String(100 + sequence)), requestId: null, parentRevisionId: parent, role, completion,
      content: role === "user" ? "I take the key." : "The courier delivers the key.", events: event ? [{ id: eventId, label: "Delivery", quote: "delivers the key", participantIds: ["person-1"], changes: [{ entityId: "person-1", before, after: { ...before, condition: after } }] }] : [] }, repo);
    return { id, eventId, after: { ...before, condition: after } };
  }
  return { ...f, repo, db, input, branch, add, initial };
}
it("reads anchored sources only, bounded pages and exact parent excerpts without selecting or writing", async () => {
  const f = await fixture(); const user = await f.add(null, "user"), answer = await f.add(user.id); for (let i = 0; i < 9; i++) await f.add();
  const before = await f.repo.rawRecords(), first = await readStoryReview(f.input, f.repo); expect(validStoryReviewPage(first)).toBe(true); expect(first.entries).toHaveLength(8); expect(first.guard!.revisionCount).toBe(11);
  expect(first.entries.find(e => e.id === answer.id)).toMatchObject({ parentExcerpt: "I take the key.", selected: false, appliedCount: 0 });
  const second = await readStoryReview({ ...f.input, cursor: first.next }, f.repo); expect(validStoryReviewPage(second)).toBe(true); expect(second.entries).toHaveLength(3); expect(second.next).toBeNull();
  expect(new Set([...first.entries, ...second.entries].map(e => e.id)).size).toBe(11); expect(await f.repo.rawRecords()).toEqual(before);
});
it("does not present an unanchored legacy snapshot as a selected history", async () => {
  const f = await fixture(false); await f.add(); const page = await readStoryReview(f.input, f.repo); expect(page).toMatchObject({ guard: null, baselineAt: null, entries: [], next: null }); expect(validStoryReviewPage(page)).toBe(true);
});
it("does not accept candidates merely by previewing a completed answer", async () => {
  const f = await fixture(), a = await f.add(null, "assistant", "complete", true), page = await readStoryReview(f.input, f.repo), before = await f.repo.rawRecords();
  const preview = await previewStoryReview({ ...f.input, cursor: undefined, guard: page.guard!, headRevisionId: a.id } as any, f.repo).catch(e => e.message);
  expect(preview).toBe("story-review-invalid");
  const input = { chatId: f.input.chatId, worldId: f.input.worldId, guard: page.guard!, headRevisionId: a.id };
  const result = await previewStoryReview(input, f.repo); expect(validStoryReviewPreview(result)).toBe(true); expect(result).toMatchObject({ addedEvents: 0, removedEvents: 0, manualConflict: false }); expect(result.snapshot.states["person-1"]).toEqual(f.initial); expect(await f.repo.rawRecords()).toEqual(before);
});
it("previews rollback of approved events, excluding later and alternate consequences", async () => {
  const f = await fixture(), a = await f.add(null, "assistant", "complete", true), b = await f.add(a.id, "assistant", "complete", true, a.after, "Clock repaired"), alternate = await f.add(null, "assistant", "complete", true, f.initial, "Key retained");
  await selectStoryRevision(f.branch.id, { headRevisionId: b.id, expectedHeadRevisionId: null, expectedSelectionVersion: 0, acceptedEventIds: [a.eventId, b.eventId, alternate.eventId] }, f.repo);
  const page = await readStoryReview(f.input, f.repo), before = await f.repo.rawRecords(); expect(page.entries.find(e => e.id === b.id)).toMatchObject({ selected: true, appliedCount: 1 }); expect(page.entries.find(e => e.id === alternate.id)!.selected).toBe(false);
  for (const [head, added, removed, condition] of [[a.id, 0, 1, "Key delivered"], [alternate.id, 1, 2, "Key retained"], [null, 0, 2, "In the workshop."]] as const) {
    const p = await previewStoryReview({ chatId: f.input.chatId, worldId: f.input.worldId, guard: page.guard!, headRevisionId: head }, f.repo);
    expect(p).toMatchObject({ addedEvents: added, removedEvents: removed, manualConflict: false }); expect(p.snapshot.states["person-1"]!.condition).toBe(condition);
  }
  expect(await f.repo.rawRecords()).toEqual(before);
});
it.each(["revision", "state", "present", "partner"])("warns about %s changes without overwriting them", async change => {
  const f = await fixture(), a = await f.add(), page = await readStoryReview(f.input, f.repo), binding = structuredClone(f.binding), scene = binding.characterScenes![f.world.id]!;
  if (change === "revision") scene.revision = "manual-edit"; if (change === "state") scene.states["person-1"]!.goal = "PRIVATE_MANUAL_GOAL"; if (change === "present") scene.presentIds.reverse(); if (change === "partner") scene.partnerIds = ["person-1"];
  await f.repo.put("binding", binding); const before = await f.repo.rawRecords(); const p = await previewStoryReview({ chatId: f.input.chatId, worldId: f.input.worldId, guard: page.guard!, headRevisionId: a.id }, f.repo); expect(p.manualConflict).toBe(true); expect(await f.repo.rawRecords()).toEqual(before);
});
it.each(["partial", "interrupted", "user", "missing"])("rejects %s preview targets", async change => {
  const f = await fixture(), a = await f.add(null, change === "user" ? "user" : "assistant", change === "partial" || change === "interrupted" ? change : "complete"), p = await readStoryReview(f.input, f.repo);
  await expect(previewStoryReview({ chatId: f.input.chatId, worldId: f.input.worldId, guard: p.guard!, headRevisionId: change === "missing" ? "not-in-line" : a.id }, f.repo)).rejects.toThrow("story-source-incomplete");
});
it("rejects a completed reply whose ancestor is incomplete", async () => {
  const f = await fixture(), parent = await f.add(null, "user", "partial"), child = await f.add(parent.id), p = await readStoryReview(f.input, f.repo);
  await expect(previewStoryReview({ chatId: f.input.chatId, worldId: f.input.worldId, guard: p.guard!, headRevisionId: child.id }, f.repo)).rejects.toThrow("story-source-incomplete");
});
it("rejects stale pages and previews after a new observation or selection", async () => {
  const f = await fixture(); for (let i = 0; i < 10; i++) await f.add(); const p = await readStoryReview(f.input, f.repo); await f.add();
  await expect(readStoryReview({ ...f.input, cursor: p.next }, f.repo)).rejects.toThrow("story-review-stale");
  await expect(previewStoryReview({ chatId: f.input.chatId, worldId: f.input.worldId, guard: p.guard!, headRevisionId: null }, f.repo)).rejects.toThrow("story-review-stale");
  const fresh = await readStoryReview(f.input, f.repo); await selectStoryRevision(f.branch.id, { headRevisionId: fresh.entries[0]!.id, expectedHeadRevisionId: null, expectedSelectionVersion: 0, acceptedEventIds: [] }, f.repo);
  await expect(readStoryReview({ ...f.input, cursor: fresh.next }, f.repo)).rejects.toThrow("story-review-stale");
});
it.each(["world", "chat", "binding", "duplicate", "branch"])("rejects %s scope confusion without returning another history", async change => {
  const f = await fixture(); await f.add(); const p = await readStoryReview(f.input, f.repo), scope = { ...f.input };
  if (change === "world") scope.worldId = "foreign-world"; if (change === "chat") scope.chatId = "foreign-chat";
  if (change === "binding") await f.repo.put("binding", { ...f.binding, worldId: null });
  if (change === "duplicate") await f.repo.put("binding", { ...f.binding, id: "duplicate" });
  if (change === "branch") scope.cursor = { ...p.guard!, branchId: "foreign-branch", offset: 1 } as any;
  await expect(readStoryReview(scope, f.repo)).rejects.toThrow();
});
it("requires explicit scope, validates response bounds and blocks a locked vault", async () => {
  const f = await fixture(), p = await readStoryReview(f.input, f.repo); expect(validStoryReviewInput(f.input)).toBe(true); expect(validStoryReviewInput({ ...f.input, secret: "PRIVATE" })).toBe(false);
  expect(validStoryReviewPage({ ...p, secret: "PRIVATE" })).toBe(false); expect(validStoryReviewPage({ ...p, entries: Array(9).fill({}) })).toBe(false); expect(validStoryReviewPage({ ...p, next: { ...p.guard!, offset: 0 } })).toBe(false);
  expect(validStoryPreviewInput({ chatId: f.input.chatId, worldId: f.input.worldId, guard: p.guard!, headRevisionId: null })).toBe(true);
  await f.repo.enableVault("synthetic-passphrase"); await f.repo.lockVault(); await expect(readStoryReview(f.input, f.repo)).rejects.toThrow(); await expect(previewStoryReview({ chatId: f.input.chatId, worldId: f.input.worldId, guard: p.guard!, headRevisionId: null }, f.repo)).rejects.toThrow();
});
