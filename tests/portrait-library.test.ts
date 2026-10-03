import { describe, expect, it } from "vitest";
import { EMPTY_CHARACTER, validCharacterSheet, characterInstruction } from "../src/core/characters";
import { assignLibraryImages, libraryImages, unassignPortrait, validPortraitLibrary, withPortraitLibrary } from "../src/core/portrait-library";
const images = Array.from({ length: 257 }, (_, i) => `data:image/png;base64,${btoa(`image-${i}`)}`);

describe("local portrait library", () => {
  it("accepts an optional bounded collection and rejects unsafe, duplicate and oversized images", () => {
    expect(validCharacterSheet(EMPTY_CHARACTER)).toBe(true);
    expect(validCharacterSheet({ ...EMPTY_CHARACTER, portraitLibrary: images.slice(0, 256) })).toBe(true);
    for (const value of [null, "x", images, [images[0], images[0]], ["https://test/image.png"], ["data:image/svg+xml;base64,AAAA"]]) expect(validPortraitLibrary(value)).toBe(false);
  });
  it("stores batches without emotion assignments, deduplicates and reuses assigned images", () => {
    const first = withPortraitLibrary(EMPTY_CHARACTER, images.slice(0, 20));
    expect(first.sprites).toEqual({}); expect(first.portraitLibrary).toHaveLength(20);
    const duplicate = withPortraitLibrary(first, [...libraryImages(first), ...images.slice(0, 5)]);
    expect(duplicate).toEqual(first);
    const assigned = assignLibraryImages(first, "happy", images.slice(0, 3));
    expect(assigned.sprites.happy).toEqual(images.slice(0, 3)); expect(assigned.portraitLibrary).toEqual(images.slice(3, 20));
    const again = assignLibraryImages(assigned, "neutral", images.slice(0, 3));
    expect(libraryImages(again)).toHaveLength(20); expect(again.portraitLibrary).toHaveLength(17);
    expect(first.sprites).toEqual({});
  });
  it("unassigns without losing an image and never partially assigns an overfull selection", () => {
    const first = withPortraitLibrary(EMPTY_CHARACTER, images.slice(0, 20));
    expect(() => assignLibraryImages(first, "happy", images.slice(0, 13))).toThrow("portrait-variation-full");
    const assigned = assignLibraryImages(first, "happy", images.slice(0, 2));
    const next = unassignPortrait(assigned, "happy", 0);
    expect(next.sprites.happy).toEqual([images[1]]); expect(next.portraitLibrary).toContain(images[0]); expect(libraryImages(next)).toHaveLength(20);
    expect(() => assignLibraryImages(first, "__proto__", [images[0]!])).toThrow();
    expect(() => assignLibraryImages(first, "happy", [images[255]!])).toThrow();
  });
  it("does not send the library or images to the model", () => {
    const sheet = withPortraitLibrary(EMPTY_CHARACTER, images.slice(0, 20));
    const prompt = characterInstruction("w", "a", [{ id: "mira", worldId: "w", kind: "character", name: "Mira", description: "", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1, characterSheet: sheet }], undefined, ["neutral"], [], "Mira");
    expect(prompt).not.toContain("portraitLibrary"); expect(prompt).not.toContain("data:image");
  });
});
