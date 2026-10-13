import { expect, it } from "vitest";
import { addedContextTokens, compileGameContext } from "../src/core/game-context";
import { roleSeed } from "../src/core/story-role-binding";
import { storyWorld } from "./fixtures/story-worlds";
import type { StoryFact } from "../src/core/story-update";

const sources = Array.from({ length: 30 }, (_, i) => "source-" + i);
it.each(["ru", "en"] as const)("preserves past scene, open promise and common budget in %s context", locale => {
  const w = storyWorld(locale), ru = locale === "ru";
  const old: StoryFact = { kind: "event", text: ru ? "Нора ждала у моста." : "Nora waited at the bridge.", quote: ru ? "В той сцене Нора ждала у моста." : "In that scene Nora waited at the bridge.", claim: { key: "last-place", value: "bridge", scope: "state" } };
  const promise: StoryFact = { kind: "promise", text: "Help if road opens", quote: "Nora promised to help only if the road opens.", task: { key: "help", title: "Help", status: "open" } };
  const seed = (f: StoryFact, id: string) => roleSeed(f, { version: 1, sourceRevisionId: id, quote: f.quote, roles: {} });
  const facts = [old, promise], before = structuredClone(facts);
  const input = { draft: ru ? "Что было раньше?" : "What happened earlier?", recentMessages: [], entries: [], books: [], entities: w.entities, worlds: [w.world], activeBookId: null, settings: { contextBudget: 6000, relevanceThreshold: 6 }, story: { world: w.world, chat: w.binding.chatId, branch: "a", facts, roleSeeds: [seed(old, sources[0]!), seed(promise, sources[1]!)], episodeSources: sources, sheetsEnabled: false } };
  const out = compileGameContext(input), json = out.text.split("<deeprole_story_memory>")[1]!.split("</deeprole_story_memory>")[0]!.split("\n").find(x => x.startsWith("["))!, payload = JSON.parse(json);
  expect(payload.find((x: any) => x.text === old.text)).toMatchObject({ claim: old.claim, sourceQuote: old.quote, episodeSource: { episode: 1, period: "earlier-turn" } });
  expect(payload.find((x: any) => x.text === promise.text)).toMatchObject({ task: promise.task, kind: "promise", sourceQuote: promise.quote });
  expect(out.text).toContain("latest recorded value is last-known"); expect(out.text).toContain("NEVER fulfills or cancels"); expect(facts).toEqual(before);
  expect(out.report.total).toBe(addedContextTokens(out.text)); input.settings.contextBudget = out.report.total; expect(compileGameContext(input).text).toBe(out.text);
  input.settings.contextBudget = out.report.required; expect(compileGameContext(input).text).not.toContain(old.quote);
});

it("prefers confirmed source recency on a relevance tie, not late extraction order", () => {
  const w = storyWorld(), newer: StoryFact = { kind: "event", text: "A recorded detail alpha", quote: "A newer source" }, older = { ...newer, text: "A recorded detail beta", quote: "An older source" };
  const seed = (f: StoryFact, id: string) => roleSeed(f, { version: 1, sourceRevisionId: id, quote: f.quote, roles: {} });
  const out = compileGameContext({ draft: "recorded detail", recentMessages: [], entries: [], books: [], entities: [], worlds: [w.world], activeBookId: null, settings: { contextBudget: 6000, relevanceThreshold: 6 }, story: { world: w.world, chat: "synthetic-a", branch: "a", facts: [newer, older], roleSeeds: [seed(newer, sources[29]!), seed(older, sources[0]!)], episodeSources: sources, sheetsEnabled: false } });
  const payload = JSON.parse(out.text.split("<deeprole_story_memory>")[1]!.split("\n").find(x => x.startsWith("["))!);
  expect(payload[0]).toMatchObject({ sourceQuote: newer.quote, episodeSource: { period: "latest-turn" } });
});
