import { expect, it } from "vitest";
import { DEFAULT_ACTIONS } from "../src/core/characters";
import { compileGameContext, type GameContextInput } from "../src/core/game-context";
import { factAutomationReason, playedTaskCompletion } from "../src/core/story-automation";
import { createEpisodeReader } from "../src/core/story-episodes";
import { createStoryEventLinkReader } from "../src/core/story-event-links";
import { createStoryJournal, filterStoryJournal } from "../src/core/story-journal";
import { decodeStoryMemory } from "../src/core/story-memory-transport";
import type { StoryRevision } from "../src/core/story-records";
import { bindStoryRoles, roleSeed, sourceRoleRoster, type RolePerson } from "../src/core/story-role-binding";
import { GAME_TIME_KEY } from "../src/core/story-time";
import { compactStoryFactSources, validStoryFact, type StoryFact } from "../src/core/story-update";
import type { Locale } from "../src/core/types";
import contract from "./fixtures/story-event-links-contract.json";
import { storyWorld } from "./fixtures/story-worlds";

type Scenario = (typeof contract.scenarios)[number];

const worldId = "synthetic-world";
const revision = (id: string, role: StoryRevision["role"], content: string, roster: RolePerson[], parentRevisionId: string | null, order: number): StoryRevision => ({
  format: "deeprole-story",
  contractVersion: 1,
  type: "revision",
  worldId,
  playthroughId: "event-links-game",
  branchId: "event-links-branch",
  id,
  createdAt: order,
  updatedAt: order,
  messageId: id,
  nativeMessageKey: id,
  requestId: null,
  parentRevisionId,
  role,
  completion: "complete",
  content,
  roleRoster: sourceRoleRoster(roster, worldId, content),
});

function buildStory(scenario: Scenario) {
  const events = new Map(scenario.events.map(event => [event.order, event]));
  const factIds = new Map<string, StoryFact>();
  const rows = Array.from({ length: scenario.sourceCount }, (_, index) => {
    const order = index + 1;
    const event = events.get(order);
    const content = event?.quote ?? scenario.fillerTemplate.replace("{number}", String(order));
    const user = revision(
      `player-${order}`, "user", scenario.locale === "ru" ? "Продолжаю." : "I go on.", scenario.people,
      index ? `reply-${index}` : null, index * 2 + 1,
    );
    const source = revision(`reply-${order}`, "assistant", content, scenario.people, user.id, index * 2 + 2);
    const fact: StoryFact = {
      kind: event ? event.kind as StoryFact["kind"] : "event",
      text: content,
      quote: content,
      ...(event?.task ? { task: event.task as StoryFact["task"] } : {}),
      ...(event?.claim ? { claim: event.claim as StoryFact["claim"] } : {}),
      ...(event?.clock ? { claim: { key: GAME_TIME_KEY, value: content, scope: "state", transition: "progress" } } : {}),
    };
    if (event) factIds.set(event.id, fact);
    return { user, source, fact, seed: roleSeed(fact, bindStoryRoles(fact, source)), eventId: event?.id };
  });
  const select = (through: number) => {
    const selected = rows.slice(0, through);
    const recentMessages = selected.flatMap(row => [row.user.content, row.source.content]).slice(-48);
    return {
      facts: selected.map(row => row.fact),
      factRoleSeeds: selected.map(row => row.seed),
      episodeSources: selected.flatMap(row => [row.user.id, row.source.id]),
      recentMessages,
    };
  };
  return { rows, factIds, select };
}

function requestInput(scenario: Scenario, story: ReturnType<ReturnType<typeof buildStory>["select"]>, draft: string): GameContextInput {
  const { world, binding, entities } = storyWorld(scenario.locale as Locale, scenario.people.length);
  scenario.people.forEach((person, index) => Object.assign(entities[index]!, person));
  const scene = { ...binding.characterScenes![world.id]!, presentIds: scenario.present, states: {} };
  world.contextBudget = 6000;
  world.storyAutomation = { mode: "automatic", revision: "fixture" };
  return {
    draft,
    recentMessages: story.recentMessages,
    entries: [],
    books: [],
    entities,
    worlds: [world],
    scene: { worldId: world.id, bookId: null, focusIds: [] },
    activeBookId: null,
    settings: { contextBudget: world.contextBudget, relevanceThreshold: 6 },
    character: [world.id, binding.chatId, entities, scene, DEFAULT_ACTIONS, [], draft, "event-links-request", true, false, false],
    story: { world, chat: binding.chatId, branch: "event-links-branch", sheetsEnabled: true, facts: story.facts, episodeSources: story.episodeSources, roleSeeds: story.factRoleSeeds },
  };
}

it.each(contract.scenarios)("proves source links, spaced order and played outcomes across $messageCount messages · $name", scenario => {
  const { rows, factIds, select } = buildStory(scenario);
  const game = select(scenario.sourceCount);
  expect(game.episodeSources).toHaveLength(scenario.messageCount);
  expect(rows.every(row => validStoryFact(row.fact))).toBe(true);
  const sourceOrder = createEpisodeReader(game.factRoleSeeds, game.episodeSources);
  expect(scenario.events
    .map(event => ({ id: event.id, position: sourceOrder.position(factIds.get(event.id)!) }))
    .sort((left, right) => left.position - right.position)
    .map(row => row.id)).toEqual(scenario.expected.importantOrder);
  for (const event of scenario.events) {
    const fact = factIds.get(event.id)!;
    expect(sourceOrder.position(fact)).toBe(event.order * 2);
    expect(sourceOrder.read(fact)?.revisionId).toBe(`reply-${event.order}`);
    expect(fact.quote).toBe(event.quote);
  }

  const links = createStoryEventLinkReader(game);
  const photo = links.read(factIds.get("photo")!);
  expect(photo?.people.map(person => person.id).sort()).toEqual(scenario.expected.photoPeople);
  expect(photo?.objects.map(object => object.name)).toContain(scenario.expected.photoObject);
  expect(links.read(factIds.get("near-match")!)?.objects.map(object => object.name)).toContain(scenario.expected.nearMatchObject);
  expect(links.read(factIds.get("open")!)?.task).toMatchObject({ key: scenario.expected.goalKey, status: "open" });
  expect(links.read(factIds.get("done")!)?.task).toMatchObject({ key: scenario.expected.goalKey, status: "completed" });
  expect(scenario.present).not.toContain(scenario.expected.partyView);
  expect(scenario.events
    .filter(event => links.read(factIds.get(event.id)!)?.people.some(person => person.id === scenario.expected.partyView))
    .sort((left, right) => left.order - right.order)
    .map(event => event.id)).toEqual(scenario.expected.partyEventIds);

  const journal = createStoryJournal(game);
  const partyView = filterStoryJournal(journal, "", scenario.expected.partyView, true);
  expect(partyView.flatMap(episode => episode.entries).filter(entry => entry.fact.quote === factIds.get("photo")!.quote)).toHaveLength(1);

  const taskAt = (through: number) => compactStoryFactSources(select(through).facts).find(fact => fact.task?.key === scenario.expected.goalKey);
  const clock = scenario.events.find(event => event.id === "time")!;
  expect(taskAt(clock.order)).toEqual(factIds.get(scenario.expected.afterClockFact));
  expect(taskAt(scenario.sourceCount)).toEqual(factIds.get(scenario.expected.afterPlayedOutcomeFact));
});

it.each(contract.scenarios)("selects the promised fact and scene evidence without confusing near-matches · $name", scenario => {
  const { factIds, select } = buildStory(scenario);
  for (const draft of scenario.expected.drafts) {
    const input = requestInput(scenario, select(draft.through), draft.text);
    expect(input.recentMessages).not.toContain(factIds.get("photo")!.quote);
    expect(input.recentMessages).not.toContain(factIds.get("promise")!.quote);
    const original = structuredClone(input);
    const result = compileGameContext(input);
    const memory = result.text.split("<deeprole_story_memory>")[1]?.split("</deeprole_story_memory>")[0];
    const selected = memory ? decodeStoryMemory(JSON.parse(memory.split("\n").find(line => line.startsWith("[")) ?? "[]")) : [];
    const contexts = selected.map(fact => fact.text);
    const expected = draft.include.map(id => factIds.get(id)!.text);
    expect(contexts, draft.text).toEqual(expect.arrayContaining(expected));
    for (const id of draft.exclude) expect(contexts, draft.text).not.toContain(factIds.get(id)!.text);
    expect(result.report.total, draft.text).toBeLessThanOrEqual(result.report.limit);
    expect(input).toEqual(original);
  }
});

it("does not turn a later figure of speech into the character's last position", () => {
  const scenario = contract.scenarios.find(scenario => scenario.locale === "en")!;
  const { factIds, select } = buildStory(scenario);
  const story = select(scenario.sourceCount);
  const quote = "Nora is in trouble.";
  const mood: StoryFact = { kind: "event", text: quote, quote, claim: { key: "nora-mood", value: "in trouble", scope: "state", lifetime: "scene" } };
  const source = revision("mood-reply", "assistant", quote, scenario.people, story.episodeSources.at(-1)!, scenario.messageCount + 1);
  story.facts.push(mood);
  story.factRoleSeeds.push(roleSeed(mood, bindStoryRoles(mood, source)));
  story.episodeSources.push(source.id);

  const result = compileGameContext(requestInput(scenario, story, "What did Nora promise Inez, and where is Nora now?"));
  const memory = result.text.split("<deeprole_story_memory>")[1]!.split("</deeprole_story_memory>")[0]!;
  const selected = decodeStoryMemory(JSON.parse(memory.split("\n").find(line => line.startsWith("["))!));
  expect(selected.map(fact => fact.text)).toEqual([factIds.get("promise")!.text, factIds.get("place")!.text]);
});

it.each(contract.sharedOutcomeScenarios)("demands proof for every goal in a shared outcome · $locale", testCase => {
  const roster = [
    { id: "actor", name: testCase.actor, aliases: [] },
    { id: "other", name: testCase.other, aliases: [] },
  ];
  const definitions = [testCase.first, testCase.second, testCase.unrelated];
  const previous = definitions.map(({ key, title, quote }): StoryFact => ({
    kind: "promise", text: quote, quote, task: { key, title, status: "open" },
  }));
  const openingSources = new Map(previous.map((fact, index) => [
    fact, revision(`open-${index}`, "assistant", fact.quote, roster, null, index + 1),
  ]));
  const outcome = revision("outcome", "assistant", testCase.played, roster, "open-2", 4);
  const proposed = definitions.map(({ key, title }): StoryFact => ({
    kind: "event", text: testCase.played, quote: testCase.played, task: { key, title, status: "completed" },
  }));
  const accepted = proposed.filter(fact => playedTaskCompletion(fact, outcome, previous, candidate => openingSources.get(candidate)));
  expect(accepted.map(fact => fact.task!.key)).toEqual(testCase.accepted);
  expect(compactStoryFactSources([...previous, ...accepted]).filter(fact => fact.task?.status === "open").map(fact => fact.task!.key)).toEqual(testCase.remainOpen);
  const journal = createStoryJournal({
    facts: [...previous, ...accepted],
    factRoleSeeds: [
      ...previous.map(fact => roleSeed(fact, bindStoryRoles(fact, openingSources.get(fact)!))),
      ...accepted.map(fact => roleSeed(fact, bindStoryRoles(fact, outcome))),
    ],
    episodeSources: [...openingSources.values(), outcome].map(source => source.id),
  });
  const shared = journal.episodes.flatMap(episode => episode.entries).filter(entry => entry.fact.quote === testCase.played);
  expect(shared).toHaveLength(1);
  expect(shared[0]!.tasks.map(task => task.key).sort()).toEqual([...testCase.accepted].sort());
  for (const fact of proposed) {
    const clockOnly = { ...fact, text: testCase.clockOnly, quote: testCase.clockOnly };
    expect(factAutomationReason(clockOnly, "ordinary", previous, [])).not.toBe("new");
  }
});
