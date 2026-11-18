import { validEpisodeLineage } from "./story-episodes";
import { storyReplyProse } from "./story-update";
import type { StoryRecord } from "./story-records";
import type { HandoffSnapshot, WorldProfile } from "./types";
import { uniqueTokens } from "./text";

// The transcript is scene reference. Never synthesize a fact, resolve a
// pronoun, or use a player's requested action as evidence that it happened.
const locationQuestion = /(?:^|[^\p{L}])(?:где|куда|where)\s+([^.!?;\n]{1,350})/giu;
const mechanics = /(?:^|[^\p{L}])(?:бер[её]т|взял[аи]?|клад[её]т|кладут|положил[аи]?|помеща[ею]т|поместил[аи]?|опуска[ею]т|опустил[аи]?|ставит|поставил[аи]?|убира[ею]т|убрал[аи]?|оставил[аи]?|перен[её]с(?:ла|ли)?|доста[её]т|достал[аи]?|переда[ею]т|передал[аи]?|put[s]?|plac(?:es|ed)|set[s]?|mov(?:es|ed)|lower(?:s|ed)|return(?:s|ed)|hand(?:s|ed)|tak(?:es|en)|took|retriev(?:es|ed)|remov(?:es|ed))(?=$|[^\p{L}])/iu;
const reported = /[«»“”"?:]|^\s*[-—–>`]|(?:^|[^\p{L}])(?:если|бы|якобы|кажется|возможно|будет|собирается|хочет|планирует|говорит|сказал[аи]?|думает|помнит|if|would|will|might|maybe|plans?|says?|said|thinks?|remembers?)(?=$|[^\p{L}])/iu;
const ignoreTerms = uniqueTokens("сейчас теперь сегодня вчера находится находятся лежит лежат найти искать стоит стоят остался осталась остались можно мне у нас is are does did can find now currently today left located kept please my our");
const maxReference = 1600;

export interface HandoffPassage { text: string; terms: Set<string> }

export function handoffLocationHistory(records: StoryRecord[], checkpoints: HandoffSnapshot[], world?: WorldProfile, snapshot?: HandoffSnapshot | null): HandoffPassage[] {
  const game = world?.sharedGame;
  if (!world || !game || !snapshot?.savedMemory || snapshot.resetGameId || game.restartPending || snapshot.worldId !== world.id
    || snapshot.sharedGameRevision !== game.revision || snapshot.sourceChatId !== game.activeChatId || !game.episodeSources?.length
    || !validEpisodeLineage(game.episodeSources, records, {worldId: world.id, gameId: game.id})) return [];
  const byId = new Map(records.map(row => [row.id, row]));
  const ignored = new Set(Object.entries(game.reviewResolutions ?? {}).flatMap(([id, status]) => {
    const event = byId.get(id);
    return status === "dismissed" && event?.type === "event" ? [event.revisionId] : [];
  }));
  const passages: HandoffPassage[] = [];
  const addNarration = (prose: string) => {
    for (const line of storyReplyProse(prose).split(/\n/u)) {
      const text = line.trim();
      if (!text || text.startsWith("…") || reported.test(text) || !mechanics.test(text)) continue;
      passages.push({text, terms: uniqueTokens(text)});
    }
  };
  const ignoredProse = [...ignored].flatMap(id => {
    const row = byId.get(id);
    return row?.type === "revision" ? [storyReplyProse(row.content).trim()] : [];
  });
  for (const id of game.episodeSources) {
    const row = byId.get(id);
    if (row?.type !== "revision") continue;
    const branch = byId.get(row.branchId);
    const base = branch?.type === "branch" ? byId.get(branch.baselineId) : undefined;
    if (base?.type === "baseline" && base.gameId === game.id && row.role === "user" && row.parentRevisionId === null && row.continuationNativeContent) {
      // Some old scenes predate the journal. A confirmed local checkpoint
      // and its exact copy in this segment's verified opening prove which
      // excerpt was carried. Never search the player's own text or other chats.
      const suffix = "\n\n[User message]\n" + row.content;
      const native = row.continuationNativeContent;
      const block = native.endsWith(suffix) && native.slice(0, -suffix.length).match(/^\s*<deeprole_context\b[^>]*>[\s\S]*?\n<deeprole_handoff version="1">\n([^\n]+)\n<\/deeprole_handoff>/u)?.[1];
      const prior = block && checkpoints.find(c => c.savedMemory && !c.resetGameId && c.appliedAt !== undefined && c.sharedGameRevision
        && c.worldId === world.id && c.targetChatId === base.origin.chatId && JSON.stringify(c.summary).replaceAll("<", "\\u003c") === block);
      if (prior && !ignoredProse.some(text => text && text.includes(prior.summary))) addNarration(prior.summary);
    }
    if (row.role === "assistant" && !ignored.has(id)) addNarration(row.content);
  }
  return passages;
}

export function handoffLocationReference(summary: string, draft: string, history: HandoffPassage[]): string {
  if (!history.length) return summary;
  const terms = new Set([...draft.matchAll(locationQuestion)].flatMap(match => [...uniqueTokens(match[1]!)]).filter(term => !ignoreTerms.has(term)));
  if (!terms.size) return summary;
  // At most one latest passage per literal query term. Render them in played
  // order without cutting conditions or presenting two objects as one.
  const selected: string[] = [];
  for (let i = history.length - 1; i >= 0 && terms.size; i--) {
    const passage = history[i]!;
    const hits = [...terms].filter(term => passage.terms.has(term));
    if (!hits.length) continue;
    for (const term of hits) terms.delete(term);
    selected.unshift(passage.text);
  }
  if (selected.every(text => summary.includes(text))) return summary;
  const label = "Latest scene (dialogue and incidental descriptions may repeat earlier guesses):";
  const handling = ["Recorded handling, oldest first. For current locations use the last narrated placement. Starting lore, dialogue and incidental scenery do not move an item back. Keep unknown locations unknown.", ...selected].join("\n");
  const reference = [label, summary, handling].join("\n");
  if (reference.length <= maxReference) return reference;
  // A full-length unrelated last scene must not consume the entire handoff.
  // Keep the matched bundle intact, and fit whole trailing paragraphs. Never
  // clip a condition or choose an older passage when the newer one is too long.
  const partial = "Latest scene excerpt is incomplete.";
  if (partial.length + 1 + handling.length > maxReference) return summary;
  const ending: string[] = [];
  let remaining = maxReference - partial.length - handling.length - 1;
  for (const paragraph of summary.split(/\n\s*\n/u).reverse()) {
    if (paragraph.length + 1 > remaining) break;
    ending.unshift(paragraph);
    remaining -= paragraph.length + 1;
  }
  return [partial, ...ending, handling].join("\n");
}
