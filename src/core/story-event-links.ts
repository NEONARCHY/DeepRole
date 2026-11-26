import { createEpisodeReader } from "./story-episodes";
import { storyFactIdentity, validStoryTask, type StoryTask } from "./story-memory-lifecycle";
import { createStoredStoryPersonReader, validRoleBinding } from "./story-role-binding";
import { normalizeText } from "./text";
import type { MergeSeeds } from "./story-character-merge";
import type { SourcePerson, StorySourceRoles } from "./story-source-roles";
import type { StoryFact } from "./story-update";
import type { SceneEntity } from "./types";
import type { WorldGame } from "./world-game";

export type StoryEventPerson = SourcePerson & { role: keyof StorySourceRoles | "subject" | "participant" };
export interface StoryEventObject { id: string; name: string }
export interface StoryEventLinks {
  people: StoryEventPerson[];
  objects: StoryEventObject[];
  task?: StoryTask;
  sourceRevisionId?: string;
}

/** Read links only for selected source-backed facts. Historical identities are
 * never matched to today's names. Explicit selected merges can move the ID. */
export function createStoryEventLinkReader(
  game: Pick<WorldGame, "factRoleSeeds" | "episodeSources">,
  options?: { worldId: string; entities: readonly SceneEntity[]; merges?: MergeSeeds },
) {
  const { factRoleSeeds = [], episodeSources = [] } = game;
  const episodes = createEpisodeReader(factRoleSeeds, episodeSources);
  const bindings = new Map(factRoleSeeds.filter(seed => validRoleBinding(seed.binding)).map(seed => [seed.key, seed.binding]));
  const resolve = options ? createStoredStoryPersonReader(options.entities, options.worldId, options.merges) : (person: SourcePerson) => ({ ...person });
  return {
    position: episodes.position,
    read(fact: StoryFact): StoryEventLinks {
      const source = episodes.read(fact);
      const binding = bindings.get(storyFactIdentity(fact));
      if (!source || !binding || binding.sourceRevisionId !== source.revisionId || binding.quote !== fact.quote) return { people: [], objects: [] };

      const subjects = binding.eventLinks?.subjects ?? [];
      const role: "subject" | "participant" = subjects.length === 1 ? "subject" : "participant";
      const people: StoryEventPerson[] = [
        ...Object.entries(binding.roles).map(([role, person]) => ({ ...resolve(person), role: role as keyof StorySourceRoles })),
        ...subjects.map(person => ({ ...resolve(person), role })),
      ];
      const object = binding.eventLinks?.object;
      return {
        people,
        objects: object ? [{ id: normalizeText(object), name: object }] : [],
        ...(validStoryTask(fact.task) ? { task: { ...fact.task } } : {}),
        sourceRevisionId: source.revisionId,
      };
    },
  };
}
