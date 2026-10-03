import { expect, it } from "vitest";
import { memoryGuide } from "../src/core/memory-guide";
import { uiText } from "../src/core/ui-i18n";
import { scoreMemory } from "../src/core/memory-engine";
import { normalizeText, uniqueTokens } from "../src/core/text";
import type { MemoryEntry } from "../src/core/types";

it.each(["ru", "en"] as const)("memory manual is complete and uses real mode names: %s", locale => {
  const guide = memoryGuide(locale);
  expect(guide.sections).toHaveLength(6);
  expect(new Set(guide.sections.map(section => section.title)).size).toBe(6);
  expect(guide.sections.every(section => section.lines.length >= 3)).toBe(true);
  for (const mode of ["smart", "always", "manual"] as const) expect(guide.sections[0]!.lines.join(" ")).toContain(uiText(locale, mode));
  expect(guide.current).toContain("{threshold}");
  for (const value of ["+4", "+8", "+9", "+5", "+36", "+16"]) expect(guide.sections.map(section => section.lines.join(" ")).join(" ")).toContain(value);
});

it("the manual’s seven-point keyword and title example agrees with scoring", () => {
  const entry: MemoryEntry = { id: "example", bookId: null, title: "Observatory", content: "A sealed envelope", keywords: ["observatory"], activation: "smart", priority: "normal", enabled: true, source: { type: "manual" }, createdAt: 1, updatedAt: 1 };
  const query = "observatory";
  expect(scoreMemory(entry, normalizeText(query), uniqueTokens(query)).score).toBe(7);
});
