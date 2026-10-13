import type { Locale } from "./types";
import { cleanStoryFact, compactStoryFactSources, validStoryFact, type StoryFact } from "./story-update";
import { storyFactIdentity } from "./story-memory-lifecycle";
import { createEpisodeReader, type EpisodeReader } from "./story-episodes";
import { validRoleBinding, type FactRoleSeed } from "./story-role-binding";
import type { StorySourceRoles } from "./story-source-roles";
import { createStoryTimeReader, isGameTimeFact, type StoryTimeReader, type StoryTimeStatus } from "./story-time";
import { storyNarrativeText, type NarrativeSignal } from "./story-narrative-i18n";

/** Runtime read-only references. The data identity contains private fact text;
 * this projection is not a safe diagnostic report or a persisted summary. */
export interface NarrativeReference {
  factId: string; sourceRevisionId: string | null; episode: number | null;
  quote: string; fact: StoryFact; roles?: StorySourceRoles; timeStatus?: StoryTimeStatus;
}
export interface NarrativePart {
  text: string; signal: NarrativeSignal; link: "first"|"later"|"same"|"unplaced";
  reference: NarrativeReference;
}
export interface StoryNarrative { version: 1; text: string; parts: NarrativePart[]; total: number; omitted: number }
export const narrativeFactKey = (fact: StoryFact) => JSON.stringify([storyFactIdentity(fact),fact.quote]);

const temporalSignal = (time: StoryTimeStatus) => ({"earlier-scene":"earlier","last-known":"lastKnown",persistent:"persistent",unknown:"unknown",ended:"ended"} as const)[time];
function signal(fact: StoryFact, time?: StoryTimeStatus): NarrativeSignal {
  if (fact.task) {
    if (fact.task.status !== "open") return fact.task.status;
    return fact.kind === "promise" ? "openPromise" : fact.kind === "plan" ? "openPlan" : "openTask";
  }
  if (isGameTimeFact(fact)) return "clock";
  if (time && fact.kind === "event") return temporalSignal(time);
  return fact.kind === "event" && fact.claim?.scope === "state" ? "state" : fact.kind;
}

/** A snapshot of accepted current facts, never a second writable memory.
 * Unknown chronology stays neutral. Connectors concern recorded turns, not
 * causality, dates or inferred chronology of the events described in a quote. */
export function createStoryNarrativeReader(facts: StoryFact[], seeds: FactRoleSeed[] = [], sources: string[] = [], locale: Locale = "en", readers?: { episodes: EpisodeReader; time: StoryTimeReader }) {
  const accepted = compactStoryFactSources(facts.filter(validStoryFact)).map(cleanStoryFact);
  const byKey = new Map(accepted.map(f => [narrativeFactKey(f),f]));
  const episodes = readers?.episodes ?? createEpisodeReader(seeds,sources);
  const time = readers?.time ?? createStoryTimeReader(accepted,episodes);
  const bindings = new Map(seeds.filter(s => validRoleBinding(s.binding)).map(s => [s.key,structuredClone(s.binding)]));
  const t = storyNarrativeText(locale);
  return { read(selected: StoryFact[], options: { maxCharacters?: number; maxFacts?: number } = {}): StoryNarrative {
    const cap = (n: number | undefined, fallback: number, ceiling: number) => n === undefined || !Number.isFinite(n) ? fallback : Math.max(0,Math.min(ceiling,Math.floor(n)));
    const maxCharacters = cap(options.maxCharacters,1800,10000), maxFacts = cap(options.maxFacts,6,12);
    const seen = new Set<string>();
    const candidates = selected.flatMap(f => {
      const key = narrativeFactKey(f), current = byKey.get(key);
      // Matching identity is insufficient when replacement metadata changed.
      if (!current || JSON.stringify(cleanStoryFact(f)) !== JSON.stringify(current) || seen.has(key)) return [];
      seen.add(key); return [{fact:current,position:episodes.position(current)}];
    }).sort((a,b) => a.position && b.position ? a.position-b.position : a.position ? -1 : b.position ? 1 : 0);
    const parts: NarrativePart[] = []; let text = "", previous = 0;
    for (const {fact,position} of candidates) {
      if (parts.length >= maxFacts) break;
      const source = episodes.read(fact), timeStatus = time.read(fact);
      const link = !position ? "unplaced" : !previous ? "first" : previous === position ? "same" : "later";
      const tag = signal(fact,timeStatus);
      // Keep the entire original quote. Never chop clauses to meet the limit.
      const label = t[tag] + (timeStatus && fact.kind !== "event" ? "; " + t[temporalSignal(timeStatus)] : "");
      const partText = `${t[link]} — ${label}: ${fact.quote}`;
      const next = text + (text ? " " : "") + partText + ` [${parts.length+1}].`;
      if (next.length > maxCharacters) continue;
      const binding = bindings.get(storyFactIdentity(fact));
      const roles = source && binding?.sourceRevisionId === source.revisionId && binding.quote === fact.quote && Object.keys(binding.roles).length ? structuredClone(binding.roles) : undefined;
      const reference: NarrativeReference = {
        factId:storyFactIdentity(fact),sourceRevisionId:source?.revisionId??null,episode:source?.episode??null,
        quote:fact.quote,fact:cleanStoryFact(fact),...(roles?{roles}:{}),...(timeStatus?{timeStatus}:{}),
      };
      parts.push({text:partText,signal:tag,link,reference}); text=next; previous=position;
    }
    return {version:1,text,parts,total:candidates.length,omitted:candidates.length-parts.length};
  } };
}
