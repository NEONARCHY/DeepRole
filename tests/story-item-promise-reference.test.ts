import { expect, it } from "vitest";
import { promiseReferenceEvidence } from "../src/core/story-promise-reference";
import { createStoryRoleReader } from "../src/core/story-source-roles";
import type { StoryFact } from "../src/core/story-update";
import { storyWorld } from "./fixtures/story-worlds";

const world = storyWorld("en");
world.entities.forEach((person, i) => { person.name = ["Ada", "Mara", "Lea"][i]!; });
const scope = { worldId: world.world.id, entities: world.entities };
const promise = (text: string): StoryFact => ({ kind: "promise", text, quote: text });
const first = promise("Ada promised Lea the green cloth for the theatre after the festival.");
const second = promise("Mara promised Lea the blue cloth for the gallery after the rehearsal.");
const spare = promise("Lea promised Ada the gallery key.");
const query = "Which parcel does that one mean? Remind me what she was promised.";
const discussion = "Lea mentioned two parcels meant for different places.";
function select(draft: string, recent: string[], facts = [first, second, spare]) {
  const r = createStoryRoleReader(scope, draft);
  return promiseReferenceEvidence(facts, draft, recent, scope, { ...r, status: f => r.read(f) ? "bound" : "unknown" },
    { read: f => ({ revisionId: "rev-" + facts.indexOf(f), episode: 1, period: "earlier-turn" }), position: f => facts.indexOf(f) });
}
it("offers both source-backed alternatives for an informal item label", () => {
  expect(select(query, [discussion])).toEqual({ facts: [first, second], certain: false });
});
it("uses the destination to narrow only the alternatives discussed", () => {
  expect(select(query, [discussion, "I mean the gallery."])).toEqual({ facts: [second], certain: true });
});
it("requires the same item discussion, compatible subjects and an unambiguous recipient", () => {
  expect(select(query, ["Lea mentioned two letters."])).toEqual({ facts: [], certain: false });
  expect(select(query, ["Lea and Mara mentioned two parcels."])).toEqual({ facts: [], certain: false });
  expect(select(query, [discussion], [first, promise("Mara promised Lea a lamp after the festival.")])).toEqual({ facts: [], certain: false });
});
it("ignores a shared recipient introduced only by a paraphrase", () => {
  const disputed = { ...second, quote: "Mara promised Ada the blue cloth for the gallery." };
  expect(select(query, [discussion], [first, disputed])).toEqual({ facts: [], certain: false });
});
it("does not borrow the object from another promise's prerequisite", () => {
  const parcel = promise("Ada promised Lea a parcel after the festival.");
  const key = promise("Mara promised Lea a key after the parcel was inspected.");
  expect(select("That same parcel. Who was it promised to?", [], [parcel, key]))
    .toEqual({ facts: [parcel], certain: true });
});
