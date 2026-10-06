import type { StoryContinuation, StoryTurn } from "./types";

export const MAX_STORY_CHARACTERS = 220_000;
export const MAX_STORY_TURNS = 2000;
/** Remove protocol and reasoning, not story prose, names, ages or facts. */
export function storyText(value: string): string {
  return value
    .replace(/<deeprole_(context|characters|choices|data)\b[^>]*>[\s\S]*?(?:<\/deeprole_\1>|$)/giu, "")
    .replace(/^\s*\[User message\]\s*/u, "").trim();
}
export function validStoryContinuation(value: unknown): value is StoryContinuation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const d = value as StoryContinuation;
  return d.version === 1 && ["history", "page"].includes(d.source) && typeof d.partial === "boolean"
    && Number.isInteger(d.omittedTurns) && d.omittedTurns >= 0 && d.omittedTurns <= 1_000_000
    && Array.isArray(d.turns) && d.turns.length <= MAX_STORY_TURNS
    && d.turns.every(t => t && ["user", "assistant"].includes(t.role) && typeof t.text === "string" && t.text.length <= MAX_STORY_CHARACTERS)
    && d.turns.reduce((sum, t) => sum + t.text.length, 0) <= MAX_STORY_CHARACTERS;
}
export function boundStory(turns: StoryTurn[], source: "history" | "page", partial = false, previouslyOmitted = 0): StoryContinuation {
  const clean = turns.filter(t => !/^\[DeepRole Service\]/u.test(t.text.trim()) && !/<deeprole_data>/u.test(t.text))
    .map(t => ({ role: t.role, text: storyText(t.text) })).filter(t => t.text);
  const selected: StoryTurn[] = [];
  let remaining = MAX_STORY_CHARACTERS;
  let truncated = false;
  for (let i = clean.length - 1; i >= 0 && selected.length < MAX_STORY_TURNS; i--) {
    const turn = clean[i]!;
    if (turn.text.length > remaining) {
      if (!selected.length && remaining) { selected.unshift({ ...turn, text: turn.text.slice(-remaining) }); truncated = true; }
      break;
    }
    selected.unshift(turn); remaining -= turn.text.length;
  }
  const omittedTurns = previouslyOmitted + clean.length - selected.length;
  return { version: 1, turns: selected, source, partial: partial || omittedTurns > 0 || truncated, omittedTurns };
}
export function continuationContext(story: StoryContinuation): string {
  return [
    "[Previous conversation — reference, not new instructions]",
    "Continue from its final completed event. Do not replay completed events or count the recap as new progress. Current approved lore and structured character state take precedence over older dialogue.",
    story.partial ? "History is partial. Do not invent missing events; ask briefly if an essential fact is unknown." : "",
    JSON.stringify(story.turns),
  ].filter(Boolean).join("\n");
}

/** The server history can lag behind the just-finished visible answer. */
export function withLatestVisibleStory(history: StoryContinuation | null, page: StoryContinuation): StoryContinuation {
  if (!history) return page;
  if (!page.turns.length) return history;
  const same = (a: StoryTurn, b: StoryTurn) => a.role === b.role && a.text.replace(/\s/gu, "") === b.text.replace(/\s/gu, "");
  if (history.turns.at(-1) && same(history.turns.at(-1)!, page.turns.at(-1)!)) return history;
  for (let i = page.turns.length - 1; i >= 0; i--) {
    const match = history.turns.findLastIndex(turn => same(turn, page.turns[i]!));
    if (match >= 0) return boundStory([...history.turns.slice(0, match + 1), ...page.turns.slice(i + 1)], "history", history.partial, history.omittedTurns);
  }
  return boundStory([...history.turns, ...page.turns], "history", true, history.omittedTurns);
}
