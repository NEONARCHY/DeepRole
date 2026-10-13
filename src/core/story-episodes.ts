import { compactStoryFactSources, cleanStoryFact, type StoryFact } from "./story-update";
import { storyFactIdentity } from "./story-memory-lifecycle";
import { validRoleBinding, type FactRoleSeed } from "./story-role-binding";
import type { StoryRecord } from "./story-records";
import { projectStoryBranch } from "./story-projection";

/** A local portion of recorded turns, never a calendar day or guessed story arc. */
export const EPISODE_TURNS = 12;
export const validEpisodeSources = (v: unknown): v is string[] => Array.isArray(v) && v.every(id => typeof id === "string" && !!id && id === id.trim() && id.length <= 160 && !["__proto__", "prototype", "constructor"].includes(id)) && new Set(v).size === v.length;
export interface EpisodeReference { revisionId: string; episode: number; period: "latest-turn" | "earlier-turn" }
export interface EpisodeReader { read(fact: StoryFact): EpisodeReference | undefined; position(fact: StoryFact): number }
export interface StoryEpisode { number: number | null; sourceIds: string[]; facts: StoryFact[] }

/** Imports must prove order, complete source membership and same-game segment
 * inheritance. A same-world alternative cannot be inserted as a past episode. */
export function validEpisodeLineage(sources: string[], records: StoryRecord[], scope: { worldId: string | null; gameId?: string; playthroughId?: string; bindingId?: string }) {
  if (!validEpisodeSources(sources)) return false;
  const all = new Map(records.map(r => [r.id, r])), used = new Set<string>();
  let offset = 0;
  try {
    while (offset < sources.length) {
      const first = all.get(sources[offset]!), owner = first && all.get(first.branchId);
      const base = owner?.type === "branch" ? all.get(owner.baselineId) : undefined;
      if (first?.type !== "revision" || base?.type !== "baseline" || used.has(base.id) || base.worldId !== scope.worldId || !(scope.gameId && base.gameId === scope.gameId || scope.playthroughId && base.playthroughId === scope.playthroughId || scope.bindingId && base.origin.bindingId === scope.bindingId)) return false;
      if (scope.gameId && base.gameId && base.gameId !== scope.gameId) return false;
      if (JSON.stringify(base.episodeSourceSeeds ?? []) !== JSON.stringify(sources.slice(0, offset))) return false;
      used.add(base.id);
      let end = offset;
      while (end < sources.length) {
        const r = all.get(sources[end]!), b = r && all.get(r.branchId);
        if (b?.type !== "branch" || b.baselineId !== base.id) break;
        if (r?.type !== "revision" || r.worldId !== scope.worldId || r.completion !== "complete" || r.storyPurpose === "out-of-character") return false;
        end++;
      }
      const last = all.get(sources[end - 1]!)!;
      const expected = projectStoryBranch(records, last.branchId, last.id, []).revisionIds.filter(id => { const r = all.get(id); return r?.type === "revision" && r.completion === "complete" && r.storyPurpose !== "out-of-character"; });
      if (JSON.stringify(expected) !== JSON.stringify(sources.slice(offset, end))) return false;
      offset = end;
    }
    return true;
  } catch { return false; }
}

/** Source order comes from a validated selected lineage. No date, current name,
 * fact wording or wall clock can manufacture a historical position. */
export function createEpisodeReader(seeds: FactRoleSeed[] = [], sources: string[] = []): EpisodeReader {
  const ordered = validEpisodeSources(sources) ? [...sources] : [];
  const positions = new Map(ordered.map((id, index) => [id, index]));
  const bindings = new Map(seeds.filter(s => validRoleBinding(s.binding)).map(s => [s.key, structuredClone(s.binding)]));
  const position = (fact: StoryFact) => {
    const binding = bindings.get(storyFactIdentity(fact));
    if (!binding || binding.quote !== fact.quote) return undefined;
    return positions.get(binding.sourceRevisionId);
  };
  return { position: fact => (position(fact) ?? -1) + 1, read(fact) {
    const index = position(fact), binding = bindings.get(storyFactIdentity(fact));
    return index === undefined || !binding ? undefined : { revisionId: binding.sourceRevisionId, episode: Math.floor(index / EPISODE_TURNS) + 1, period: index === ordered.length - 1 ? "latest-turn" : "earlier-turn" };
  } };
}

/** Extractive summaries are a replaceable view of accepted current facts.
 * Claim progress, replacement, rejection and undo are recomputed, not copied
 * into a second authoritative memory. Exact evidence remains on every item. */
export function storyEpisodes(facts: StoryFact[], seeds: FactRoleSeed[] = [], sources: string[] = []): StoryEpisode[] {
  const reader = createEpisodeReader(seeds, sources), ordered = validEpisodeSources(sources) ? sources : [];
  const groups = new Map<number | null, StoryEpisode>();
  for (const fact of compactStoryFactSources(facts)) {
    const number = reader.read(fact)?.episode ?? null;
    const group = groups.get(number) ?? { number, sourceIds: number === null ? [] : ordered.slice((number - 1) * EPISODE_TURNS, number * EPISODE_TURNS), facts: [] };
    group.facts.push(cleanStoryFact(fact)); groups.set(number, group);
  }
  return [...groups.values()].sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
}

export const EPISODE_MEMORY_GUIDE = "episodeSource links the exact source revision to a 12-turn episode, NOT dates or game days. earlier-turn belongs to its source scene. For transient state, latest recorded value is last-known at its source; current scene and later explicit updates take priority. Persistent knowledge may remain relevant. Time alone NEVER fulfills or cancels a promise/task. Missing source=unknown chronology. Preserve kind/status/negation/conditions; omit episodeSource from proposals.";
