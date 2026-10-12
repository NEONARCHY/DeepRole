import type { StoryReviewPage, StoryReviewPreview } from "../../src/core/story-review";
import { checkpointReview } from "./story-checkpoint";
export function storyReviewPage(locale: "ru" | "en" = "en"): StoryReviewPage {
  const f = checkpointReview(locale);
  return { chatId: f.chatId, worldId: f.worldId, bindingId: f.bindingId, worldName: f.worldName, baselineAt: 30,
    guard: { branchId: "review-branch", headRevisionId: null, selectionVersion: 0, revisionCount: 4 }, offset: 0,
    entries: [
      { id: "review-user", role: "user", completion: "complete", content: f.candidates[0]!.draft, parentExcerpt: null, observedAt: 31, selected: false, candidateCount: 0, appliedCount: 0 },
      { id: "review-assistant", role: "assistant", completion: "complete", content: f.candidates[0]!.answer, parentExcerpt: f.candidates[0]!.draft, observedAt: 32, selected: false, candidateCount: 1, appliedCount: 0 },
    ], next: { branchId: "review-branch", headRevisionId: null, selectionVersion: 0, revisionCount: 4, offset: 2 } };
}
export function storyReviewLastPage(locale: "ru" | "en" = "en") {
  const f = storyReviewPage(locale); return { ...f, offset: 2, next: null, entries: f.entries.map((e, i) => ({ ...e, id: `last-${i}`, completion: "interrupted" as const })) };
}
export function storyReviewPreview(locale: "ru" | "en" = "en", headRevisionId: string | null = "review-assistant"): StoryReviewPreview {
  const f = checkpointReview(locale), p = storyReviewPage(locale);
  return { chatId: f.chatId, worldId: f.worldId, guard: p.guard!, headRevisionId, snapshot: f.snapshot, addedEvents: 0, removedEvents: 0, manualConflict: false };
}
