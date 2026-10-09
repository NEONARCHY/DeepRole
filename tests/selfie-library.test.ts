import { describe, expect, it } from "vitest";
import { addSelfieLibraryImages } from "../src/core/selfies";
import { libraryImages } from "../src/core/portrait-library";
import { EMPTY_CHARACTER } from "../src/core/characters";
import type { SelfieCategory } from "../src/core/types";

const image = "data:image/png;base64,AAAA", other = "data:image/png;base64,BBBB";
const category: SelfieCategory = { id: "regular", name: "Regular", description: "At home", default: true, minTrust: 40, minAffinity: 30, images: [image] };
const categories = [category, { ...category, id: "home", default: false, images: [] }];

describe("ready selfie library assignment", () => {
  it("adds assigned and unassigned library photos without touching portraits or references", () => {
    const sheet = { ...EMPTY_CHARACTER, sprites: { neutral: image, happy: [image] }, portraitLibrary: [other], selfieCategories: categories, imageGeneration: { canonical: "Known appearance", sceneDelta: "", prefix: "", suffix: "", format: "prose" as const, referenceKey: "keep-reference" } };
    const original = structuredClone(sheet), sources = libraryImages(sheet);
    const next = addSelfieLibraryImages(categories, "home", sources, [image, other]);
    expect(next[1]).toEqual({ ...categories[1], images: [image, other] });
    expect(next[0]).toBe(category); expect(next[1]).not.toBe(categories[1]);
    expect(sheet).toEqual(original); expect(sources).toEqual([other, image]);
  });
  it("deduplicates both already assigned and repeatedly selected images", () => {
    const next = addSelfieLibraryImages(categories, "regular", [image, other, other], [other, image, other]);
    expect(next[0]?.images).toEqual([image, other]); expect(category.images).toEqual([image]);
  });
  it("does not dirty a category for empty or already assigned selection", () => {
    expect(addSelfieLibraryImages(categories, "regular", [image], [])).toBe(categories);
    expect(addSelfieLibraryImages(categories, "regular", [image], [image, image])).toBe(categories);
  });
  it("does not require a category name to be filled before selecting photos", () => {
    expect(addSelfieLibraryImages([{ ...category, name: "" }], category.id, [other], [other])[0]?.images).toEqual([image, other]);
  });
  it("rejects a deleted category", () => {
    expect(() => addSelfieLibraryImages(categories, "deleted", [image], [image])).toThrow("selfie-category-missing");
  });
  it("rejects photos missing from the current character library atomically", () => {
    expect(() => addSelfieLibraryImages(categories, "home", [image], [image, other])).toThrow("selfie-library-missing");
    expect(categories[1]?.images).toEqual([]);
  });
  it.each(["https://example.com/photo.png", "data:image/svg+xml;base64,AAAA", "not-an-image"])("rejects invalid sources even if listed in the library: %s", source => {
    expect(() => addSelfieLibraryImages(categories, "home", [source], [source])).toThrow("selfie-library-missing");
  });
  it("accepts more than 48 photos without changing the source", () => {
    const images = Array.from({ length: 49 }, (_, i) => "data:image/png;base64," + btoa("photo-" + i));
    const empty = [{ ...category, images: [] }];
    expect(addSelfieLibraryImages(empty, category.id, images, images.slice(0, 48))[0]?.images).toHaveLength(48);
    expect(addSelfieLibraryImages(empty, category.id, images, images)[0]?.images).toHaveLength(49);
    expect(empty[0]?.images).toEqual([]);
    const full = addSelfieLibraryImages(empty, category.id, images, images.slice(0, 48));
    expect(addSelfieLibraryImages(full, category.id, images, images.slice(0, 48))).toBe(full);
    expect(addSelfieLibraryImages(full, category.id, images, images.slice(48))[0]?.images).toHaveLength(49);
  });
});
