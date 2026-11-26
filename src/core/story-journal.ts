import { storyEpisodes } from "./story-episodes";
import { createStoryEventLinkReader } from "./story-event-links";
import { isRoutineStoryFact } from "./story-memory-admission";
import { narrativeFactKey } from "./story-narrative";
import type { SourcePerson } from "./story-source-roles";
import { validStoryTask } from "./story-memory-lifecycle";
import { normalizeText } from "./text";
import type { WorldGame } from "./world-game";
import type { StoryRecord } from "./story-records";
import type { StoryReviewGuard } from "./story-review";

type JournalGame = Pick<WorldGame, "facts" | "factRoleSeeds" | "episodeSources">;

/** Rebuild a view from the selected game's accepted memory. Older saves can
 * lack source order or role bindings. Those records remain readable. */
export function createStoryJournal(game: JournalGame) {
  const { facts, factRoleSeeds = [], episodeSources = [] } = game;
  const links = createStoryEventLinkReader(game);
  const people = new Map<string, { person: SourcePerson; order: number }>();
  const plots = new Map<string, { key: string; title: string; order: number }>();
  const episodes = storyEpisodes(facts, factRoleSeeds, episodeSources).map(episode => {
    const individualEntries = episode.facts.map(fact => {
      const event = links.read(fact);
      const order = links.position(fact);
      const task = validStoryTask(fact.task) ? fact.task : undefined;
      if (task && (!plots.has(task.key) || plots.get(task.key)!.order < order)) {
        plots.set(task.key, { key: task.key, title: task.title, order });
      }
      const linked = new Map<string, SourcePerson>();
      for (const { id, name } of event.people) {
        const person = { id, name };
        linked.set(id, person);
        if ((people.get(id)?.order ?? 0) < order) people.set(id, { person, order });
      }
      return {
        id: narrativeFactKey(fact), fact, order: order || null,
        sourceRevisionId: event.sourceRevisionId ?? null,
        people: [...linked.values()], routine: isRoutineStoryFact(fact),
        objects: event.objects, facts: [fact], tasks: task ? [{ ...task }] : [],
      };
    }).sort((first, second) => (first.order ?? 0) - (second.order ?? 0));

    const outcomes = new Map<string, typeof individualEntries[number]>();
    const entries = individualEntries.filter(entry => {
      const task = entry.tasks[0];
      if (!entry.sourceRevisionId || entry.fact.kind !== "event" || !task || task.status === "open") return true;

      // The same played sentence can close more than one goal. Each goal keeps
      // its own accepted status, while the journal shows that evidence once.
      const source = JSON.stringify([entry.sourceRevisionId, entry.fact.quote]);
      const existing = outcomes.get(source);
      if (!existing) {
        outcomes.set(source, entry);
        return true;
      }
      existing.facts.push(entry.fact);
      if (!existing.tasks.some(value => value.key === task.key)) existing.tasks.push(task);
      for (const person of entry.people) if (!existing.people.some(value => value.id === person.id)) existing.people.push(person);
      for (const object of entry.objects) if (!existing.objects.some(value => value.id === object.id)) existing.objects.push(object);
      return false;
    });
    return { number: episode.number, sourceIds: episode.sourceIds, entries };
  });
  return { episodes, people: [...people.values()].map(({ person }) => person), plots: [...plots.values()], hasRoutine: episodes.some(episode => episode.entries.some(entry => entry.routine)) };
}

export function filterStoryJournal(journal: ReturnType<typeof createStoryJournal>, query: string, personId: string, includeRoutine: boolean, plotKey = "") {
  const search = normalizeText(query);
  return journal.episodes.map(episode => ({
    ...episode, entries: episode.entries.filter(({ facts, objects, people, routine, tasks }) =>
      (includeRoutine || !routine)
      && (!personId || people.some(person => person.id === personId))
      && (!plotKey || tasks.some(task => task.key === plotKey))
      && (!search || normalizeText([
        ...facts.flatMap(fact => [fact.text, fact.task?.title, fact.quote]),
        ...people.map(person => person.name), ...objects.map(object => object.name),
      ].join(" ")).includes(search)),
    ),
  })).filter(episode => episode.entries.length);
}

export interface JournalActions {
  chatId: string;
  worldId: string;
  guard: StoryReviewGuard;
  events: ReadonlyMap<string, string | null>;
}

/** Only selected, applied events are actionable. Inherited facts remain
 * visible with their sources, as do ambiguous matches with no safe event ID. */
export function indexStoryJournalActions(records: readonly StoryRecord[]) {
  const byId = new Map(records.map(record => [record.id, record]));
  const counts = new Map<string, number>();
  for (const record of records) if (record.type === "revision") counts.set(record.branchId, (counts.get(record.branchId) ?? 0) + 1);
  const scopes = new Map<string, JournalActions>();
  for (const projection of records) {
    if (projection.type !== "projection" || !projection.worldId) continue;
    const branch = byId.get(projection.branchId);
    if (branch?.type !== "branch" || !branch.gameManaged || branch.projectionId !== projection.id) continue;
    const selected = new Set(projection.revisionIds);
    const events = new Map<string, string | null>();
    for (const id of projection.appliedEventIds) {
      const event = byId.get(id);
      if (event?.type !== "event" || !event.memory || event.branchId !== branch.id || !selected.has(event.revisionId)) continue;
      const key = narrativeFactKey(event.memory);
      events.set(key, events.has(key) ? null : id);
    }
    scopes.set(projection.bindingId, { chatId: projection.chatId, worldId: projection.worldId, events,
      guard: { branchId: branch.id, headRevisionId: branch.headRevisionId, selectionVersion: branch.selectionVersion, revisionCount: counts.get(branch.id) ?? 0 } });
  }
  return scopes;
}
