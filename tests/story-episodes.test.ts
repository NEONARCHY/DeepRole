import { expect, it } from "vitest";
import { createEpisodeReader, storyEpisodes, validEpisodeSources, EPISODE_MEMORY_GUIDE } from "../src/core/story-episodes";
import { roleSeed } from "../src/core/story-role-binding";
import { storyFactPayload } from "../src/core/story-fact-context";
import { storyFactIdentity } from "../src/core/story-memory-lifecycle";
import type { StoryFact } from "../src/core/story-update";

const fact = (text: string, extra: Partial<StoryFact> = {}): StoryFact => ({ kind: "event", text, quote: text, ...extra });
const seed = (f: StoryFact, source: string) => roleSeed(f, { version: 1, sourceRevisionId: source, quote: f.quote, roles: {} });
const sources = Array.from({ length: 29 }, (_, i) => "source-" + i);

it("groups accepted fact outlines by proven source order, not insertion order or dates", () => {
  const facts = [fact("Clock fixed"), fact("Waiting at bridge"), fact("Third scene")], seeds = [seed(facts[0]!, sources[28]!), seed(facts[1]!, sources[0]!), seed(facts[2]!, sources[12]!)];
  const before = structuredClone({ facts, seeds, sources }), episodes = storyEpisodes(facts, seeds, sources);
  expect(episodes.map(e => [e.number, e.sourceIds.length, e.facts[0]!.text])).toEqual([[3, 5, "Clock fixed"], [2, 12, "Third scene"], [1, 12, "Waiting at bridge"]]);
  const reader = createEpisodeReader(seeds, sources);
  expect(reader.read(facts[1]!)).toEqual({ revisionId: sources[0], episode: 1, period: "earlier-turn" });
  expect(reader.read(facts[0]!)?.period).toBe("latest-turn");
  episodes[0]!.facts[0]!.text = "UI edit"; episodes[0]!.sourceIds.splice(0);
  expect({ facts, seeds, sources }).toEqual(before);
});

it.each([undefined, null, {}, [" x"], ["x", "x"], [""], ["__proto__"], ["constructor"], ["prototype"], ["x".repeat(161)], [123]])("rejects an invalid chronology shape: %j", value => expect(validEpisodeSources(value)).toBe(false));

it("keeps old unplaced facts readable without manufacturing a source position", () => {
  const f = fact("An old belief", { kind: "belief" }), old = seed(f, "missing");
  expect(storyEpisodes([f], [old], sources)).toEqual([{ number: null, sourceIds: [], facts: [f] }]);
  expect(createEpisodeReader([old], sources).read(f)).toBeUndefined();
  expect(createEpisodeReader([seed(f, sources[0]!)], [sources[0]!, sources[0]!]).read(f)).toBeUndefined();
});

it("checks original quote and fact key, and isolates the reader from later source edits", () => {
  const f = fact("A record"), s = seed(f, sources[0]!), reader = createEpisodeReader([s], sources);
  s.binding.sourceRevisionId = sources[28]!; expect(reader.read(f)?.revisionId).toBe(sources[0]);
  f.quote = "Changed quote"; expect(reader.read(f)).toBeUndefined();
  f.quote = "A record"; f.text = "Changed fact"; expect(reader.read(f)).toBeUndefined();
});

it.each(["promise", "plan", "belief", "secret"] as const)("retains the accepted %s and its exact condition after many turns", kind => {
  const f = fact("Help if road opens", { kind, quote: "Nora did not agree to help unless the road opens." }), before = structuredClone(f);
  const result = storyEpisodes([f], [seed(f, sources[0]!)], sources);
  expect(result[0]!.facts).toEqual([before]); expect(f).toEqual(before);
  const payload = storyFactPayload([f], undefined, createEpisodeReader([seed(f, sources[0]!)], sources));
  expect(JSON.parse(payload.json)[0]).toMatchObject({ kind, sourceQuote: f.quote, episodeSource: { episode: 1, period: "earlier-turn" } });
  expect(payload.guide).toContain(EPISODE_MEMORY_GUIDE);
});

it.each(["open", "completed", "cancelled"] as const)("passage of source turns does not change task status: %s", status => {
  const f = fact("Repair gate", { kind: status === "open" ? "promise" : "event", task: { key: "gate", title: "Repair gate", status } });
  expect(storyEpisodes([f], [seed(f, sources[0]!)], sources)[0]!.facts[0]).toEqual(f);
});

it("rebuilds progress, replacement and undo instead of keeping a stale summary", () => {
  const old = fact("Key at bridge", { claim: { key: "key-place", value: "bridge", scope: "state" } }), next = fact("Key in library", { claim: { key: "key-place", value: "library", scope: "state", transition: "progress" } });
  const facts = [old, next], seeds = [seed(old, sources[0]!), seed(next, sources[28]!)];
  expect(storyEpisodes(facts, seeds, sources).flatMap(e => e.facts)).toEqual([next]);
  facts.pop(); expect(storyEpisodes(facts, seeds, sources).flatMap(e => e.facts)).toEqual([old]);
  const correction = fact("Corrected place", { replaces: [storyFactIdentity(old)] }); facts.push(correction);
  expect(storyEpisodes(facts, [...seeds, seed(correction, sources[12]!)], sources).flatMap(e => e.facts)).toEqual([correction]);
  facts.splice(0); expect(storyEpisodes(facts, seeds, sources)).toEqual([]);
});

it("does not attach role identity merely because a source belongs to an episode", () => {
  const f = fact("She promised to help", { kind: "promise" });
  const payload = JSON.parse(storyFactPayload([f], undefined, createEpisodeReader([seed(f, sources[0]!)], sources)).json)[0];
  expect(payload.episodeSource.episode).toBe(1); expect(payload).not.toHaveProperty("sourceRoles");
});
