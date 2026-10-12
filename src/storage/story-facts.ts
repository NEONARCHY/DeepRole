import { assertStoryGraph, storyRow, type StoryBranch, type StoryEvent, type StoryProjection, type StoryRecord, type StoryRevision } from "../core/story-records";
import { validStoryReviewGuard, type StoryReviewGuard } from "../core/story-review";
import { validStoryFact } from "../core/story-update";
import { sameStoryValue } from "../core/story-value";
import type { ChatBinding } from "../core/types";
import { planStorySelection } from "./story-selection";
import { repository, type DeepRoleRepository } from "./repository";

export interface StoryFactApproval { chatId: string; worldId: string; guard: StoryReviewGuard; eventId: string; text: string; accept: boolean }
export function validStoryFactApproval(v: unknown): v is StoryFactApproval {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const s = v as StoryFactApproval;
  return Object.keys(s).length === 6 && ["chatId", "worldId", "eventId"].every(k => typeof s[k as "chatId"] === "string" && !!s[k as "chatId"] && s[k as "chatId"].length <= 160)
    && validStoryReviewGuard(s.guard) && typeof s.text === "string" && !!s.text.trim() && s.text.length <= 1200 && typeof s.accept === "boolean";
}
/** Explicit review is local playthrough memory, never a write to shared canon. */
export async function approveStoryFact(input: StoryFactApproval, repo: DeepRoleRepository = repository, current?: () => Promise<void>) {
  input = structuredClone(input); if (!validStoryFactApproval(input)) throw Error("story-review-invalid");
  return repo.updateRecords(all => {
    assertStoryGraph(all);
    const stored = all.filter(r => r.kind === "story").map(r => r.data as StoryRecord);
    const branch = stored.find(r => r.type === "branch" && r.id === input.guard.branchId && r.worldId === input.worldId && r.gameManaged) as StoryBranch | undefined;
    const projection = branch && stored.find(r => r.id === branch.projectionId) as StoryProjection | undefined;
    const binding = projection && all.find(r => r.kind === "binding" && r.id === projection.bindingId)?.data as ChatBinding | undefined;
    if (!branch || !projection || !binding || binding.chatId !== input.chatId || binding.worldId !== input.worldId) throw Error("story-binding-conflict");
    const guard = { branchId: branch.id, headRevisionId: branch.headRevisionId, selectionVersion: branch.selectionVersion, revisionCount: stored.filter(r => r.type === "revision" && r.branchId === branch.id).length };
    if (!sameStoryValue(guard, input.guard)) throw Error("story-review-stale");
    const event = stored.find(r => r.type === "event" && r.id === input.eventId && r.branchId === branch.id) as StoryEvent | undefined;
    const revision = event && stored.find(r => r.id === event.revisionId) as StoryRevision | undefined;
    if (!event?.memory || !revision || revision.storyPurpose === "out-of-character" || !projection.revisionIds.includes(revision.id)) throw Error("story-binding-conflict");
    const memory = { ...event.memory, text: input.text.trim(), ...(event.memory.text !== input.text.trim() ? { edited: true } : {}) };
    if (memory.claim && event.memory.text !== input.text.trim()) memory.claim = { ...memory.claim, value: input.text.trim() };
    if (!validStoryFact({ text: memory.text, quote: memory.quote, kind: memory.kind, ...(memory.task ? {task:memory.task} : {}), ...(memory.replaces ? {replaces:memory.replaces} : {}), ...(memory.claim ? { claim: memory.claim } : {}) })) throw Error("story-review-invalid");
    const updated: StoryEvent = { ...event, memory, ...(event.automation ? { automation: { ...event.automation, status: input.accept ? "saved" as const : "dismissed" as const, reason: "manual" as const, at: Date.now() } } : {}), updatedAt: Date.now() };
    const changed = [...all.filter(r => !(r.kind === "story" && r.id === event.id)), storyRow(updated)];
    // Removing an explicitly resolved old proposal is a durable dismissal.
    // Keep the pure resolution selected, without its memory effect.
    if (event.originEventId && !input.accept) delete updated.memory;
    const approved = projection.acceptedEventIds.filter(id => id !== event.id); if (input.accept || event.originEventId) approved.push(event.id);
    const selection = planStorySelection(changed, branch.id, { headRevisionId: branch.headRevisionId, expectedHeadRevisionId: branch.headRevisionId, expectedSelectionVersion: branch.selectionVersion, acceptedEventIds: approved });
    return { records: [storyRow(updated), ...selection.records], removed: selection.removed, result: { active: true, changed: true } };
  }, current);
}
