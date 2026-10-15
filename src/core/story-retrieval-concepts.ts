import type { StoryFact } from "./story-update";
import { normalizeText } from "./text";
import { storyFactSearchEntry } from "./story-fact-search-index";
import type { MemoryEntry } from "./types";

// Small, explicit retrieval dictionary, not a language model or truth parser.
// Recognized actions only add a bounded candidate bonus. They never establish
// an owner, fulfillment, consent, a source role or a new recorded event.
const actions = {
  repair: /(?:почин(?:ить|ил[аи]?|ят)|ремонт(?:а|у|ом|е)?|ремонтир(?:овать|ует|овал[аи]?)|восстанов(?:ить|ил[аи]?|ление)|repair(?:s|ed|ing)?|fix(?:es|ed|ing)?|mend(?:s|ed|ing)?)/u,
  return: /(?:верн(?:уть|ул[аи]?|ет)|возврат(?:ить|ил[аи]?|а|у)?|отдать обратно|отдал[аи]? обратно|return(?:s|ed|ing)?(?! (?:to|from)(?: |$))|give(?: [\p{L}\p{N}_]+){0,3} back|gave(?: [\p{L}\p{N}_]+){0,3} back)/u,
  conceal: /(?:спрят(?:ать|ал[аи]?)|скры(?:ть|л[аи]?)|ута(?:ить|ил[аи]?)|hide|hides|hiding|hid|hidden|conceal(?:s|ed|ing)?)/u,
  meeting: /(?:встрет(?:иться|ились|илась|ился)|встреч(?:а|и|у|е|ей)|увидеться|свидани(?:е|я|ю|ем|и)|meet(?:s|ing|ings)?|met|rendezvous)/u,
  delivery: /(?:достав(?:ить|ил[аи]?|ка|ки|ку|ке|кой)|прин(?:ести|ес[лаи]?|есла|если)|deliver(?:s|ed|ing|y|ies)?|(?:bring(?:s|ing)?|brought)(?! (?:up|back|down|out)(?: |$)))/u,
  waiting: /(?:ждать|жд(?:ал[аи]?|ет|ут)|ожид(?:ать|ал[аи]?|ание|ания|ании|ает)|wait(?:s|ed|ing)?|await(?:s|ed|ing)?)/u,
  departure: /(?:уйти|уш(?:ел|ла|ли)|уех(?:ать|ал[аи]?)|покин(?:уть|ул[аи]?|ет)|(?:leave|leaves|leaving)(?! (?:behind|out|alone)(?: |$))|depart(?:s|ed|ing|ure|ures)?)/u,
  assistance: /(?:помочь|помо(?:г[лаи]?|гла|гли|жет)|помощ(?:ь|и|ью)|поддерж(?:ать|ал[аи]?|ка|ки|ку|кой)|help(?:s|ed|ing)?|assist(?:s|ed|ing|ance)?)/u,
} as const;
type Action = keyof typeof actions;
const patterns = Object.entries(actions).map(([id, pattern]) => [id as Action, new RegExp(`(?:^| )${pattern.source}(?= |$)`, "u")] as const);
const clauses = (text: string) => text.split(/[.!?;:\r\n]+/u).map(normalizeText);
const cache = new WeakMap<MemoryEntry, { text: string; title: string; names: string; actions: Set<Action> }>();

/** Does not expand the user prompt. Known names (including ambiguous aliases)
 * are masked so a character named "Help" cannot manufacture an action match. */
export function storyConceptSearch(query: string, excludedNames: Iterable<string> = []) {
  const names = [...new Set([...excludedNames].map(normalizeText).filter(Boolean))].sort((a, b) => b.length - a.length || a.localeCompare(b));
  const signature = names.join("\n");
  const mask = names.length ? new RegExp(`(^| )(?:${names.join("|")})(?= |$)`, "gu") : undefined;
  const extract = (text: string) => {
    const parts = clauses(text).map(part => mask ? part.replace(mask, "$1#") : part);
    return new Set(patterns.filter(([, pattern]) => parts.some(part => pattern.test(part))).map(([id]) => id));
  };
  const requested = extract(query);
  return {
    concepts: [...requested],
    score(fact: StoryFact) {
      if (!requested.size) return 0;
      const text = fact.text, title = fact.task?.title ?? "";
      const key = storyFactSearchEntry(fact);
      let prepared = cache.get(key);
      if (!prepared || prepared.text !== text || prepared.title !== title || prepared.names !== signature) {
        // Separate fields: never join an action phrase across a text/title
        // boundary, or use opaque claim/task keys and original quotes as tags.
        prepared = { text, title, names: signature, actions: new Set([...extract(text), ...extract(title)]) };
        cache.set(key, prepared);
      }
      return Math.min(2, [...requested].filter(id => prepared.actions.has(id)).length) * 14;
    },
  };
}
