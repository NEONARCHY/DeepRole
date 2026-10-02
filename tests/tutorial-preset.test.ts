import { describe, expect, it } from "vitest";
import { buildTutorialPresetCopy, getTutorialPreset } from "../src/core/tutorial-preset";

describe("tutorial preset", () => {
  it("is available in both supported languages", () => {
    expect(getTutorialPreset("ru").profileName).toBeTruthy();
    expect(getTutorialPreset("en").plotTitle).toBeTruthy();
  });

  it("creates an active, isolated world copy only after the user asks for it", () => {
    const copy = buildTutorialPresetCopy("ru", 1_000);
    expect(copy.book.active).toBe(true);
    expect(copy.book.worldId).toBe(copy.world.id);
    expect(copy.entries).toHaveLength(3);
    expect(copy.entries.every((entry) => entry.bookId === copy.book.id)).toBe(true);
    expect(copy.entries.every((entry) => entry.worldId === copy.world.id)).toBe(true);
    expect(new Set(copy.entries.map((entry) => entry.activation))).toEqual(new Set(["always", "smart", "manual"]));
  });
});
