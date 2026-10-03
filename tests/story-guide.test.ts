import { expect, it } from "vitest";
import { storyGuide } from "../src/core/story-guide";
import { translate } from "../src/core/i18n";
import { assistantText } from "../src/core/assistant-i18n";

it.each(["ru", "en"] as const)("story manual uses current action names and covers all six steps: %s", locale => {
  const guide = storyGuide(locale);
  expect(guide.sections).toHaveLength(6);
  const text = guide.sections.flatMap(section => section.lines).join(" ");
  for (const key of ["saveSnapshot", "continueChat", "apply"] as const) {
    expect(text).toContain(translate(locale, key));
  }
  for (const key of ["review", "saveChanges"] as const) {
    expect(text).toContain(assistantText(locale, key));
  }
  expect(text).toContain("JSON");
  expect(guide.sections.every(section => section.lines.length >= 2)).toBe(true);
});
