import { expect, it } from "vitest";
import { storyConceptSearch } from "../src/core/story-retrieval-concepts";
import { storyRetrievalQuery } from "../src/core/story-retrieval-query";
import { rankStoryFacts } from "../src/core/story-fact-context";
import { storyWorld } from "./fixtures/story-worlds";
import type { StoryFact } from "../src/core/story-update";

const fact = (text: string, extra: Partial<StoryFact> = {}): StoryFact => ({ kind: "event", text, quote: text, ...extra });

it.each(["helpdesk", "unhelpful", "repairman", "returninghome", "concealment", "meetinghouse", "deliveryman", "waiter", "departureland", "assistanceville", "помощник", "встречный", "ремонтник", "ожидательно", "left glove", "left hand", "return to the tower", "returned from the tower", "bring up the topic", "brought back memories", "bring down the mood", "bring out the idea", "leave behind the note", "leave out a detail"])("abstains from unsupported words and known phrasal ambiguities: %s", query => {
  expect(storyConceptSearch(query).concepts).toEqual([]);
});

it.each(["Help", "Fix", "Return", "Wait", "Встреча", "Помощь"])("does not treat a current name or alias as an action: %s", name => {
  const w = storyWorld("en", 2); w.entities[0]!.name = name; w.entities[1]!.aliases = [name];
  const scope = { worldId: w.world.id, entities: w.entities };
  expect(storyRetrievalQuery(name, scope).ambiguousName).toBe(true);
  expect(storyRetrievalQuery(name, scope).score(fact("A character will help and repair and return and wait and meet."))).toBe(0);
  expect(storyConceptSearch("Repair the gate", ["Repair"]).concepts).toEqual([]);
});

it("only searches independent readable fields, never quotes or opaque keys", () => {
  const search = storyConceptSearch("Give back the book");
  expect(search.score(fact("Give", { task: { key: "return", title: "back", status: "open" } }))).toBe(0);
  expect(search.score(fact("An object", { quote: "Give back the book", claim: { key: "return", value: "give back", scope: "state" } }))).toBe(0);
  expect(search.score(fact("An object", { task: { key: "return", title: "Give back the book", status: "cancelled" } }))).toBe(14);
  for (const query of ["give. back", "give; back", "give\nback", "give Ann back"]) expect(storyConceptSearch(query, ["Ann"]).concepts).toEqual([]);
});

it("bounds multiple actions, repetition and mutable returned query metadata", () => {
  const search = storyConceptSearch("repair repair return conceal meet deliver wait depart help");
  search.concepts.splice(0);
  expect(search.score(fact("Fix, give back, hide, rendezvous, bring, await, leave, assist."))).toBe(28);
  expect(storyConceptSearch("Fix fix fix").score(fact("Repair repair repair."))).toBe(14);
});

it("invalidates the weak projection after text, task title and roster changes", () => {
  const f = fact("Mend the clock."), search = storyConceptSearch("Fix the clock");
  expect(search.score(f)).toBe(14);
  f.text = "Inspect the clock."; expect(search.score(f)).toBe(0);
  f.task = { key: "x", title: "Repair the clock", status: "open" }; expect(search.score(f)).toBe(14);
  f.task.title = "Inspect the clock"; expect(search.score(f)).toBe(0);
  f.text = "Help described the clock.";
  expect(storyConceptSearch("Assist", ["Help"]).score(f)).toBe(0);
  expect(storyConceptSearch("Assist").score(f)).toBe(14);
});

it.each(["open", "completed", "cancelled"] as const)("preserves task status, negation and conditions: %s", status => {
  const w = storyWorld("en", 1), f = fact("Nora did not promise to mend the gate unless the road opens.", { kind: "promise", task: { key: "gate", title: "Mend gate", status } });
  const before = structuredClone(f), scope = { worldId: w.world.id, entities: w.entities };
  const ranked = rankStoryFacts([f, fact("A newer unrelated scene.")], "Fix the gate", scope);
  expect(ranked[0]!.fact).toEqual(before); expect(f).toEqual(before);
});
