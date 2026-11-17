import type { StoryRecord } from "./story-records";
import type { ChatBinding } from "./types";
import type { WorldGame } from "./world-game";

const REMINDER_INTERVAL = 5;

/** Select the latest reminder from the active game line. Only unresolved entries open the interval. */
export function storyReviewReminderReply(story: StoryRecord[], game: WorldGame | undefined, binding: ChatBinding | undefined): string | undefined {
  if (!game?.pendingReviewIds?.length || !binding || game.activeBindingId !== binding.id || game.activeChatId !== binding.chatId) return;
  const baseline = story.find(r => r.type === "baseline" && r.origin.bindingId === binding.id && r.worldId === binding.worldId && r.gameId === game.id);
  if (baseline?.type !== "baseline") return;
  const index = new Map(story.map(record => [record.id, record]));
  const branch = index.get(baseline.branchId);
  const projection = branch?.type === "branch" && branch.gameManaged && branch.projectionId ? index.get(branch.projectionId) : undefined;
  if (projection?.type !== "projection" || projection.bindingId !== binding.id || projection.chatId !== binding.chatId) return;

  const pending = new Set(game.pendingReviewIds);
  const origins = new Set(game.pendingReviewIds.flatMap(id => {
    const event = index.get(id);
    return event?.type === "event" && event.branchId === baseline.branchId ? [event.revisionId] : [];
  }));
  let started = baseline.pendingReviewSeeds?.some(id => pending.has(id)) ?? false;
  let messages = 0;
  let reminder: string | undefined;
  for (const id of projection.revisionIds) {
    if (!started) { started = origins.has(id); continue; }
    const revision = index.get(id);
    if (revision?.type !== "revision" || revision.completion !== "complete") continue;
    if (revision.role === "user") messages++;
    else if (messages >= REMINDER_INTERVAL) {
      reminder = revision.nativeMessageKey;
      messages %= REMINDER_INTERVAL;
    }
  }
  return reminder;
}
