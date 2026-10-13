import { expect, it } from "vitest";
import { rankStoryFacts } from "../src/core/story-fact-context";
import { storyWorld } from "./fixtures/story-worlds";
import { paraphraseCases } from "./fixtures/story-paraphrases";

const w = storyWorld("en", 1);
w.entities[0]!.name = "Nora"; w.entities[0]!.aliases = ["Нора"];
const scope = { worldId: w.world.id, entities: w.entities };

it.each(paraphraseCases)("retrieves the action before a newer incidental mention: $label — $query", ({ query, wanted, distractor }) => {
  const facts = [wanted, ...Array.from({ length: 30 }, (_, i) => ({ ...distractor, text: distractor.text + " " + i, quote: distractor.quote + " " + i }))];
  expect(rankStoryFacts(facts, query, scope)[0]!.fact).toEqual(wanted);
});

it("reports fixed paraphrase coverage before and after query assistance", () => {
  const hits = (scoped: boolean) => paraphraseCases.filter(({ query, wanted, distractor }) => rankStoryFacts([wanted, distractor], query, scoped ? scope : undefined)[0]!.fact.text === wanted.text).length;
  console.info(`RP243 fixed paraphrases: lexical ${hits(false)}, assisted ${hits(true)}/${paraphraseCases.length}`);
  expect(hits(false)).toBe(3);
  expect(hits(true)).toBe(48);
});
