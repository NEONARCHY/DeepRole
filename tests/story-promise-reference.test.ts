import { expect, it } from "vitest";
import { promiseReferenceEvidence } from "../src/core/story-promise-reference";
import { createStoryRoleReader } from "../src/core/story-source-roles";
import type { StoryFact } from "../src/core/story-update";
import { storyWorld } from "./fixtures/story-worlds";

const world = storyWorld("en");
world.entities.forEach((p, i) => { p.name = ["Rosa", "Cora", "Dina"][i]!; });
const scope = { worldId: world.world.id, entities: world.entities };
const promise = (text: string): StoryFact => ({ text, quote: text, kind: "promise" });
const amber = promise("Rosa promised Cora the amber seal.");
const iron = promise("Dina promised the library the iron seal.");
const bell = promise("Cora promised the school a bell.");
const discussion = "They discussed the amber seal and the iron seal.";
const query = "Who was that promised to?";

function recall(draft: string, recent: string[], current = [amber, iron, bell], past: StoryFact[] = [], missing?: StoryFact) {
  const reader = createStoryRoleReader(scope, draft);
  const order = [...past, ...current];
  return promiseReferenceEvidence(current, draft, recent, scope, { ...reader, status: f => reader.read(f) ? "bound" : "unknown" }, {
    read: f => f === missing ? undefined : { revisionId: "source-" + order.indexOf(f), period: "earlier-turn", episode: 1 },
    position: f => order.indexOf(f),
  }, past);
}

it("keeps both candidates through a pause and an interrogative 'do I mean' clause", () => {
  expect(recall("That promise. Which of the two do I mean again?", [discussion, "They waited quietly."]))
    .toEqual({ facts: [amber, iron], certain: false });
  expect(recall("Что там с тем самым обещанием?", [discussion])).toEqual({ facts: [amber, iron], certain: false });
});
it("resolves a standalone answer to the clarifying question", () => {
  expect(recall("I mean the iron seal.", ["Which promise, the amber seal or the iron seal?"]))
    .toEqual({ facts: [iron], certain: true });
});
it("never promotes a bare person's name or missing evidence to a proven promise", () => {
  expect(recall("I mean Cora. Who was that promised to?", [discussion])).toEqual({ facts: [], certain: false });
  expect(recall(query, [discussion], [amber, iron, bell], [], iron)).toEqual({ facts: [], certain: false });
});
it("keeps the closing record when the indicated promise is archived", () => {
  const past: StoryFact = { ...amber, task: { key: "amber-seal", title: "Amber seal", status: "open" } };
  const text = "The library cancelled the amber seal order.";
  const closed: StoryFact = { kind: "event", text, quote: text, task: { ...past.task!, status: "cancelled" } };
  expect(recall("I mean the amber seal. Who was that promised to?", [discussion], [closed, iron, bell], [past]))
    .toEqual({ facts: [past, closed], certain: true });
});
