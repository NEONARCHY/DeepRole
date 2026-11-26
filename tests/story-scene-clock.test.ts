import { expect, it } from "vitest";
import { compileGameContext, type GameContextInput } from "../src/core/game-context";
import { assembledPrompt } from "../src/core/request-injection";
import { createEpisodeReader } from "../src/core/story-episodes";
import { roleSeed } from "../src/core/story-role-binding";
import { createSceneClockTimeline, indexSceneClocks, sceneClockHeading, sceneClockHeadingGuide, SCENE_CLOCK_HEADING_GUIDE } from "../src/core/story-scene-clock";
import { createStoryTimeReader, GAME_TIME_KEY, gameTimeEvidence } from "../src/core/story-time";
import type { StoryRevision } from "../src/core/story-records";
import type { StoryFact } from "../src/core/story-update";
import contract from "./fixtures/story-scene-clock-contract.json";
import { storyWorld } from "./fixtures/story-worlds";

const worldId = storyWorld().world.id;
const revision = (id: string, content: string, outOfCharacter = false): StoryRevision => ({
  format: "deeprole-story", contractVersion: 1, type: "revision", id, branchId: "branch", playthroughId: "play",
  worldId, createdAt: 0, updatedAt: 0, role: "assistant", messageId: id, nativeMessageKey: id,
  parentRevisionId: null, requestId: null, content, completion: "complete", storyPurpose: outOfCharacter ? "out-of-character" : "game",
});

it.each(contract.scenarios)("keeps source time and recording order independent in $name", scenario => {
  const events = new Map(scenario.events.map(event => [event.at, event]));
  const sources = Array.from({ length: scenario.sources }, (_, index) => {
    const event = events.get(index + 1);
    return revision(`reply-${index + 1}`, event ? `${event.heading}\n\nThe archivist waits.` : "A played detail without time.", event?.ooc);
  });
  const alternative = revision("alternate", scenario.alternate.heading);
  const turns = sources.flatMap((source, index) => [{ ...revision(`turn-${index + 1}`, "Continue."), role: "user" as const }, source]);
  const index = indexSceneClocks([...turns, alternative]);
  const selected = turns.map(source => source.id);
  const timeline = createSceneClockTimeline(selected, index, worldId);
  for (const event of scenario.events) {
    const marker = timeline.markers.get(`reply-${event.at}`);
    expect(!marker ? "ignored" : marker.flashback ? "flashback" : "current", event.heading).toBe(event.expected);
  }
  const partial = createSceneClockTimeline(selected.slice(0, scenario.current.through * 2), index, worldId);
  const { through, source, ...expected } = scenario.current;
  expect(partial.current).toMatchObject({ ...expected, revisionId: `reply-${source}` });
  expect(partial.latest?.flashback).toBe(true);
  const { source: lastSource, ...lastExpected } = scenario.last;
  expect(timeline.current).toMatchObject({ ...lastExpected, revisionId: `reply-${lastSource}` });
  expect(timeline.current?.clock).toBeUndefined();
  expect(timeline.markers.has(alternative.id)).toBe(false);
  selected[scenario.alternate.at * 2 - 1] = alternative.id;
  expect(createSceneClockTimeline(selected, index, worldId).current?.clock).toBe(scenario.alternate.clock);
});

it("leaves an unaccepted old clock unknown and retains a previously accepted marker", () => {
  const source = revision("legacy", "Day 8. The archivist waits.");
  const later = revision("later", "Day 6 · 08:10");
  const index = indexSceneClocks([source, later]);
  expect(createSceneClockTimeline([source.id], index, worldId).current).toBeUndefined();
  const facts: StoryFact[] = [{ kind: "event", text: "Day 8", quote: "Day 8", claim: { key: GAME_TIME_KEY, scope: "state", value: "Day 8" } }];
  const factRoleSeeds = [roleSeed(facts[0]!, { version: 1, sourceRevisionId: source.id, quote: "Day 8", roles: {} })];
  const timeline = createSceneClockTimeline([source.id, later.id], index, worldId, { facts, factRoleSeeds });
  expect(timeline.current).toMatchObject({ day: 8, precision: "day", revisionId: source.id });
  expect(timeline.markers.has(later.id)).toBe(false);
  expect(gameTimeEvidence(facts[0]!, "Flashback · Day 8\n\nDay 8. The archivist waits.")).toBe(false);
});

it("attaches the time of a fact's source and carries current time through a flashback in the request", () => {
  const w = storyWorld();
  const cases = [revision("now", "Day 9 · 18:30"), revision("memory", "Flashback · Day 2 · morning")];
  const selected = cases.map(entry => entry.id);
  const timeline = createSceneClockTimeline(selected, indexSceneClocks(cases), worldId);
  const fact: StoryFact = { kind: "event", text: "Mira waited at the bridge.", quote: "Mira waited at the bridge.", claim: { key: "mira-place", scope: "state", value: "bridge", lifetime: "scene" } };
  const roleSeeds = [roleSeed(fact, { version: 1, sourceRevisionId: "memory", quote: fact.quote, roles: {} })];
  const time = createStoryTimeReader([fact], createEpisodeReader(roleSeeds, selected), timeline);
  expect(time.sceneAt(fact)).toMatchObject({ day: 2, flashback: true, part: "morning" });
  expect(time.read(fact)).toBe("earlier-scene");
  const out = compileGameContext({ draft: "I wait.", recentMessages: [], entries: [w.entry], books: [], entities: w.entities, activeBookId: null,
    worlds: [w.world], settings: { contextBudget: 2000, relevanceThreshold: 6 }, scene: { worldId, bookId: null, focusIds: [] },
    story: { world: w.world, chat: w.binding.chatId, branch: "branch", facts: [fact], sheetsEnabled: true, roleSeeds,
      episodeSources: selected, sceneClock: timeline } });
  expect(out.text).toContain(SCENE_CLOCK_HEADING_GUIDE);
  expect(out.text).toContain('"clock":"18:30"');
  expect(out.text).toContain('"lastFlashback":');
  expect(out.text).toContain('"sourceTimes":[["memory","Flashback · Day 2 · morning"]]');
  expect(out.report.total).toBeLessThanOrEqual(2000);
});

it.each(["Day 2 · 24:15", "Day 3 · 05:99", "2025-02-29 · 12:00", "Maybe Day 4 · 09:00", "Day 3 · 09:00?", "‘Day 3 · evening’", "Tomorrow · 09:30", "A note mentions Day 3 · 08:00"])("rejects %s", invalid => {
  expect(sceneClockHeading(invalid)).toBeUndefined();
});

it("gives a literal relative heading only for an explicit elapsed opening", () => {
  expect(sceneClockHeadingGuide("Three days later, I open the gate.", true)).toContain('"Scene time · Three days later"');
  expect(sceneClockHeadingGuide("Прошло три дня. Я подхожу к мосту.", false)).toContain('"Время сцены · Прошло три дня"');
  expect(sceneClockHeadingGuide("I open the gate.", false).length).toBeLessThan(SCENE_CLOCK_HEADING_GUIDE.length);
  for (const draft of ["Three days later?", "If three days pass, I may go back.", "— Прошло три дня, — сказал он.", "I say: Three days later."]) {
    expect(sceneClockHeadingGuide(draft, true)).toBe(SCENE_CLOCK_HEADING_GUIDE);
  }
});

it("preserves the ordinary turn and compacts the clock when the model window is tight", () => {
  const w = storyWorld(), source = revision("now", "Day 9 · 18:30"), sources = [source.id];
  const story = { world: w.world, chat: w.binding.chatId, branch: "branch", facts: [], sheetsEnabled: true, episodeSources: sources };
  const input: GameContextInput = { draft: "Continue.", entries: [], books: [], entities: [], worlds: [w.world],
    recentMessages: [], activeBookId: null, settings: { contextBudget: 2000, relevanceThreshold: 6 },
    scene: { worldId, bookId: null, focusIds: [] }, story };
  const bytes = (text: string) => new TextEncoder().encode(assembledPrompt("", text)).byteLength;
  const previous = compileGameContext(input).text;
  input.story = { ...story, sceneClock: createSceneClockTimeline(sources, indexSceneClocks([source]), worldId) };
  const compactLimit = bytes(previous) + 210;
  const compact = compileGameContext({ ...input, nativeContextBytes: compactLimit }).text;
  expect(compact).toContain('"label":"Day 9 · 18:30"');
  expect(compact).not.toContain(SCENE_CLOCK_HEADING_GUIDE);
  expect(bytes(compact)).toBeLessThanOrEqual(compactLimit);
  expect(compileGameContext({ ...input, nativeContextBytes: bytes(previous) }).text).toBe(previous);
  expect(compileGameContext({ ...input, choices: true }).text).toContain("deeprole_choices");
  expect(compileGameContext({ ...input, choices: true, nativeContextBytes: bytes(previous) }).text).toBe(previous);
});
