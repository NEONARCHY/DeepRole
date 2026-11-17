import { expect, it } from "vitest";
import { conflictingStoryText, factAutomationReason, storyFactConflicts } from "../src/core/story-automation";
import type { StoryFact } from "../src/core/story-update";

const fact = (text: string): StoryFact => ({ text, quote: text, kind: "event" });
const unrelated = [
  ["Nora placed the wooden seal inside the green drawer.", "Nora placed the blue ribbon inside the brass casket."],
  ["Nora put the red key in the box.", "Nora put the blue ribbon in the box."],
  ["Нора положила деревянную печать в зелёный ящик.", "Нора положила синюю ленту в латунную шкатулку."],
  ["Нора убрала красный ключ в ящик.", "Нора убрала синюю ленту в ящик."],
];
it.each(unrelated)("does not flag colors of different placed objects: %s / %s", (a, b) => {
  expect(conflictingStoryText(a!, b!)).toBe(false);
  expect(conflictingStoryText(b!, a!)).toBe(false);
  expect(storyFactConflicts(fact(b!), [fact(a!)])).toEqual([]);
  expect(factAutomationReason(fact(b!), "ordinary", [fact(a!)], [])).toBe("new");
  expect(factAutomationReason(fact(b!), "conflict", [fact(a!)], [])).toBe("conflict");
});
it.each([
  ["Nora put the red key in the box.", "Nora put the blue key in the box."],
  ["Nora placed the seal inside the green drawer.", "Nora placed the seal inside the blue drawer."],
  ["Нора положила красный ключ в ящик.", "Нора положила синий ключ в ящик."],
  ["Нора убрала печать в зелёный ящик.", "Нора убрала печать в синий ящик."],
  ["Nora has blue eyes.", "Nora has green eyes."],
  ["У Норы синие глаза.", "У Норы зелёные глаза."],
  ["Nora put 2 red keys in the box.", "Nora put 3 blue ribbons in the box."],
  ["Nora put the red key in the box.", "Nora never put the blue ribbon in the box."],
  ["The key is red.", "The key is blue."],
  ["Ключ красный.", "Ключ синий."],
  ["Nora placed the red one in the box.", "Nora placed the blue ribbon in the box."],
  ["Nora placed red in the box.", "Nora placed the blue ribbon in the box."],
  ["Nora placed the red key in the box and laughed.", "Nora placed the blue ribbon in the box and laughed."],
  ["Нора положила красное в ящик.", "Нора положила синюю ленту в ящик."],
])("keeps conservative review for the same or ambiguous object: %s / %s", (a, b) => {
  expect(conflictingStoryText(a!, b!)).toBe(true);
  expect(storyFactConflicts(fact(b!), [fact(a!)])).toEqual([fact(a!)]);
  expect(factAutomationReason(fact(b!), "ordinary", [fact(a!)], [])).toBe("conflict");
});
