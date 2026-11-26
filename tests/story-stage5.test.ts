import { expect, it } from "vitest";
import { createEpisodeReader } from "../src/core/story-episodes";
import { createStoryEventLinkReader } from "../src/core/story-event-links";
import { directLinkedRecall } from "../src/core/story-linked-recall";
import { isStandaloneRoutineStoryFact } from "../src/core/story-memory-admission";
import { validStoryFact } from "../src/core/story-update";
import contract from "./fixtures/story-stage5-contract.json";
import { stage5Prompts, stagedStory } from "./fixtures/story-stage5";

it.each(contract.stories)("preserves evidence order, people, current state and clock over $turns turns", story => {
  const game = stagedStory(story);
  const important = game.proposed.filter(row => !row.id.startsWith("noise-"));
  expect(game.rows).toHaveLength(story.turns * 2);
  expect(important.map(row => row.id)).toEqual(story.expectedOrder);
  expect(game.facts.map(fact => game.idsByText.get(fact.text)).filter(id => !id?.startsWith("noise-"))).toEqual(story.expectedCurrent);
  expect(game.sceneClock.current?.label).toBe(story.currentClock);
  const links = createStoryEventLinkReader({ factRoleSeeds: game.seeds, episodeSources: game.episodeSources });
  for (const [index, row] of important.entries()) {
    expect(validStoryFact(row.fact)).toBe(true);
    expect(links.position(row.fact)).toBe(story.events[index]!.turn * 2);
    expect(links.read(row.fact).sourceRevisionId).toBe(row.source.id);
    const name = (story.expectedPromisors as Record<string, string | undefined>)[row.id];
    if (name) expect(links.read(row.fact).people.filter(person => person.role === "promisor").map(person => person.name)).toEqual([name]);
  }
});

it.each(contract.stories)("skips isolated housekeeping and retains a consequential clause in $locale", story => {
  const routine = (text: string) => isStandaloneRoutineStoryFact({ kind: "event", text, quote: text }, text);
  expect(routine(story.routineControl)).toBe(true);
  expect(routine(story.routine)).toBe(true);
  expect(routine(story.consequential)).toBe(false);
});

it("selects each requested current fact with its exact source and without similar unrelated duties", () => {
  for (const row of stage5Prompts()) {
    const label = row.story + "/" + row.query.id;
    expect(row.content, label).toContain("<deeprole_story_time>");
    expect(row.tokens, label).toBeLessThanOrEqual(4500);
    expect(row.ids, label).not.toContain("unknown");
    for (const id of row.query.wanted) {
      expect(row.ids, label).toContain(id);
      const fact = row.facts[row.ids.indexOf(id)]!;
      const expected = contract.stories.find(story => story.id === row.story)!.events.find(event => event.id === id)!;
      expect(fact.sourceQuote ?? fact.text, label).toBe(expected.text);
      expect(fact.episodeSource?.revisionId, label).toBe("stage5-" + row.story + "-reply-" + expected.turn);
      if (expected.task) expect(fact.task, label).toEqual(expected.task);
    }
    for (const id of row.query.forbidden) expect(row.ids, label).not.toContain(id);
  }
});

it("requires one evidenced current place and leaves mixed questions to general retrieval", () => {
  const story = contract.stories[1]!;
  const game = stagedStory(story);
  const query = story.queries.find(row => row.id === "current-place")!.draft;
  const current = game.proposed.find(row => row.id === "new-place")!.fact;
  const previous = game.proposed.find(row => row.id === "old-place")!.fact;
  const scope = { worldId: game.world.id, entities: game.entities };
  const episodes = createEpisodeReader(game.seeds, game.episodeSources);
  expect(directLinkedRecall(query, [current], scope, episodes)).toBe(current);
  expect(directLinkedRecall(query, [current, previous], scope, episodes)).toBeUndefined();
  expect(directLinkedRecall(query, [current], scope, createEpisodeReader())).toBeUndefined();
  expect(directLinkedRecall(query + " Who carries the key?", [current], scope, episodes)).toBeUndefined();
});
