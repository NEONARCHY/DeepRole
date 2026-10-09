import { describe, expect, it } from "vitest";
import { EMPTY_CHARACTER, EMPTY_STATUS, validCharacterSheet, characterInstruction, portraitSource, emotionOptionLabel, validEmotions } from "../src/core/characters";
import { assignLibraryImages, assignLibraryEmotions, libraryImages, unassignPortrait, validPortraitLibrary, withPortraitLibrary } from "../src/core/portrait-library";
const images = Array.from({ length: 513 }, (_, i) => `data:image/png;base64,${btoa(`image-${i}`)}`);

describe("local portrait library", () => {
  it("assigns one image to multiple exact emotion names atomically", () => {
    const first = withPortraitLibrary(EMPTY_CHARACTER, images.slice(0, 14));
    const names = ["screaming", "shouting", "scarry", "смех"];
    const next = assignLibraryEmotions(first, names, [images[0]!]);
    for (const name of names) expect(next.sprites[name]).toEqual([images[0]]);
    expect(next.portraitLibrary).toHaveLength(13); expect(first.sprites).toEqual({});
    const capacity = withPortraitLibrary(EMPTY_CHARACTER, images.slice(0, 49));
    const full = assignLibraryImages(capacity, "shouting", images.slice(0, 48));
    expect(assignLibraryEmotions(full, ["screaming", "shouting"], [images[48]!]).sprites.shouting).toHaveLength(49);
    expect(full.sprites.screaming).toBeUndefined();
    expect(() => assignLibraryEmotions(first, ["screaming", "__proto__"], [images[0]!])).toThrow();
    for (const emotion of names) expect(portraitSource({ id: "mira", worldId: "w", name: "Mira", kind: "character", description: "", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1, characterSheet: next }, { ...EMPTY_STATUS, emotion })).toBe(images[0]);
  });
  it("shows translated built-in labels alongside exact keys without translating custom names", () => {
    expect(emotionOptionLabel("ru", "happy")).toBe("Радость · happy");
    expect(emotionOptionLabel("en", "happy")).toBe("Happy · happy");
    expect(emotionOptionLabel("en", "смех")).toBe("смех");
    expect(emotionOptionLabel("ru", "screaming")).toBe("screaming");
    expect(validEmotions(["neutral", "screaming/shouting"])).toBe(true); // one literal key, not aliases
  });
  it("accepts an optional bounded collection and rejects unsafe, duplicate and oversized images", () => {
    expect(validCharacterSheet(EMPTY_CHARACTER)).toBe(true);
    expect(validCharacterSheet({ ...EMPTY_CHARACTER, portraitLibrary: images })).toBe(true);
    for (const value of [null, "x", [images[0], images[0]], ["https://test/image.png"], ["data:image/svg+xml;base64,AAAA"]]) expect(validPortraitLibrary(value)).toBe(false);
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
    const capacity = withPortraitLibrary(EMPTY_CHARACTER, images.slice(0, 49));
    expect(assignLibraryImages(capacity, "happy", images.slice(0, 49)).sprites.happy).toHaveLength(49);
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
