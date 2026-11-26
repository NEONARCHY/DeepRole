import { DEFAULT_ACTIONS } from "../../src/core/characters";
import { compileGameContext, type GameContextInput } from "../../src/core/game-context";
import { GameSearchIndex } from "../../src/core/game-search-index";
import { decodeStoryMemory } from "../../src/core/story-memory-transport";
import { assembledPrompt } from "../../src/core/request-injection";
import type { StoryRevision } from "../../src/core/story-records";
import { bindStoryRoles, roleSeed, sourceRoleRoster } from "../../src/core/story-role-binding";
import { createSceneClockTimeline, indexSceneClocks } from "../../src/core/story-scene-clock";
import { compactStoryFactSources, type StoryFact } from "../../src/core/story-update";
import type { Locale } from "../../src/core/types";
import contract from "./story-stage5-contract.json";
import { storyWorld } from "./story-worlds";

export type Stage5Story = (typeof contract.stories)[number];
export type Stage5Query = Stage5Story["queries"][number];

export function stagedStory(story: Stage5Story) {
  const ru = story.locale === "ru", budget = 4500;
  const { world, entities, binding } = storyWorld(story.locale as Locale, story.people.length);
  world.name = ru ? "Плавучая обсерватория" : "Floodplain Archive";
  world.description = ru ? "Работа ночной смены в обсерватории." : "The night shift at a riverside archive.";
  world.contextBudget = budget;
  world.storyAutomation = { mode: "automatic", revision: "stage5-policy" };
  entities.forEach((person, index) => { person.name = story.people[index]!; });
  const roster = entities.map(({ id, name, aliases }) => ({ id, name, aliases }));
  const scene = binding.characterScenes![world.id]!;
  scene.states = {};
  const branch = "stage5-" + story.id;
  const events = new Map(story.events.map(event => [event.turn, event]));
  const rows: StoryRevision[] = [], proposed: { id: string; fact: StoryFact; source: StoryRevision }[] = [];
  const revision = (name: string, role: "user" | "assistant", content: string) => {
    const id = branch + "-" + name, order = rows.length + 1;
    const source: StoryRevision = { format: "deeprole-story", contractVersion: 1, type: "revision",
      id, branchId: branch, playthroughId: branch, worldId: world.id, createdAt: order, updatedAt: order,
      messageId: id, nativeMessageKey: id, role, completion: "complete", requestId: null,
      content, parentRevisionId: rows.at(-1)?.id ?? null, roleRoster: sourceRoleRoster(roster, world.id, content) };
    rows.push(source);
    return source;
  };
  for (let turn = 1; turn <= story.turns; turn++) {
    const event = events.get(turn);
    const text = event?.text ?? story.noise.replaceAll("{n}", String(turn));
    revision("prompt-" + turn, "user", ru ? "Продолжаю обход участка " + turn + "." : "I continue my round at station " + turn + ".");
    const source = revision("reply-" + turn, "assistant", event?.clock ? event.clock + "\n\n" + text : text);
    const fact: StoryFact = { kind: (event?.kind ?? "event") as StoryFact["kind"], text, quote: text,
      ...(event?.task ? { task: event.task as StoryFact["task"] } : {}),
      ...(event?.claim ? { claim: event.claim as StoryFact["claim"] } : {}) };
    proposed.push({ id: event?.id ?? "noise-" + turn, fact, source });
  }
  const facts = compactStoryFactSources(proposed.map(row => row.fact));
  const seeds = proposed.map(row => roleSeed(row.fact, bindStoryRoles(row.fact, row.source)));
  const episodeSources = rows.map(row => row.id);
  const sceneClock = createSceneClockTimeline(episodeSources, indexSceneClocks(rows), world.id, { facts, factRoleSeeds: seeds });
  const history = rows.map(row => ({ role: row.role, content: row.content, ...(row.role === "assistant" ? { recordedScene: true } : {}) }));
  const recentMessages = history.slice(-48).map(row => row.content);
  const inputFor = (draft: string): GameContextInput => ({
    draft, recentMessages, entries: [], books: [], entities, worlds: [world], activeBookId: null,
    scene: { worldId: world.id, bookId: null, focusIds: [] },
    settings: { contextBudget: budget, relevanceThreshold: 6 },
    character: [world.id, binding.chatId, entities, scene, DEFAULT_ACTIONS, [], draft, branch, true, false, false],
    story: { world, chat: binding.chatId, branch, facts, sheetsEnabled: true, roleSeeds: seeds, episodeSources, sceneClock,
      taskArchive: { facts: proposed.filter(row => row.fact.task?.status === "open").map(row => row.fact), roleSeeds: seeds } },
  });
  const idsByText = new Map(proposed.map(row => [row.fact.text, row.id]));
  return { world, entities, rows, proposed, facts, seeds, episodeSources, sceneClock, history, idsByText, inputFor };
}

export function stage5Prompts() {
  return contract.stories.flatMap(story => {
    const game = stagedStory(story), searchIndex = new GameSearchIndex();
    return story.queries.map(query => {
      const chatId = "stage5-" + story.id + "-" + query.id;
      const input = game.inputFor(query.draft);
      if (input.story) input.story.chat = chatId;
      if (input.character) input.character[1] = chatId;
      const coverage: string[] = [];
      const start = performance.now();
      const result = compileGameContext(input, { searchIndex, memoryTransport: "columns" }, item => coverage.push(item.kind));
      const prepMs = performance.now() - start;
      const block = result.text.split("<deeprole_story_memory>")[1]?.split("</deeprole_story_memory>")[0];
      const facts = block ? decodeStoryMemory(JSON.parse(block.split("\n").find(line => /^[\[{]/u.test(line))!)) : [];
      const ids = facts.map(fact => game.idsByText.get(fact.text) ?? "unknown");
      return { story: story.id, chatId, query, prepMs, ids, facts, coverage, tokens: result.report.total,
        history: game.history, content: assembledPrompt(query.draft, result.text) };
    });
  });
}
