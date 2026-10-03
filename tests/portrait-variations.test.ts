import { describe, expect, it } from "vitest";
import { advancePortraitCycles, nextPortraitCycle, portraitVariations, scenePortraitIndex, validPortraitCycles } from "../src/core/portrait-variations";
import { characterInstruction, EMPTY_CHARACTER, EMPTY_STATUS, portraitSources, validCharacterSheet, validCharacterScenes } from "../src/core/characters";
import { parseWidgetLayout } from "../src/entrypoints/content/WidgetDeck";
import type { CharacterScene, PortraitCycle, SceneEntity } from "../src/core/types";

const images = ["AAAA", "BBBB", "CCCC"].map(bytes => `data:image/png;base64,${bytes}`);
const person: SceneEntity = { id: "mira", name: "Mira", kind: "character", worldId: "w", description: "", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1, characterSheet: { ...EMPTY_CHARACTER, sprites: { neutral: images, happy: images.slice(0, 2) } } };
const scene = (): CharacterScene => ({ revision: "1", presentIds: ["mira"], states: { mira: { ...EMPTY_STATUS } }, updatedAt: 1 });

describe("portrait variation cycles", () => {
  it("accepts legacy portraits and bounded image arrays, rejects unsafe or duplicate images", () => {
    expect(validCharacterSheet(person.characterSheet)).toBe(true);
    expect(validCharacterSheet({ ...EMPTY_CHARACTER, sprites: { neutral: images[0] } })).toBe(true);
    for (const v of [[], [images[0], images[0]], [...images, "https://tracker/image"], Array.from({ length: 13 }, (_, i) => `data:image/png;base64,AAA${String.fromCharCode(65 + i)}`)]) expect(validCharacterSheet({ ...EMPTY_CHARACTER, sprites: { neutral: v } })).toBe(false);
    expect(portraitVariations(images[0])).toEqual([images[0]]);
  });
  it("consumes every variation once per cycle and avoids repeats across the boundary", () => {
    let previous: PortraitCycle | undefined; const shown: number[] = [];
    for (let i = 0; i < 30; i++) { previous = nextPortraitCycle(images, previous, () => 0); shown.push(previous.order[previous.cursor]!); }
    for (let i = 0; i < shown.length; i += 3) expect(new Set(shown.slice(i, i + 3)).size).toBe(3);
    for (let i = 1; i < shown.length; i++) expect(shown[i]).not.toBe(shown[i - 1]);
  });
  it("one image stays stable and changing the image set safely starts a new cycle", () => {
    const first = nextPortraitCycle([images[0]!]); expect(nextPortraitCycle([images[0]!], first).order).toEqual([0]);
    expect(nextPortraitCycle(images, first).key).not.toBe(first.key);
  });
  it("counts the default displayed image when importing variations without a saved cycle", () => {
    const old = scene(); const current = { ...old, portraitCycles: advancePortraitCycles([person], old, old) };
    expect(scenePortraitIndex(person, old)).toBe(0); expect(scenePortraitIndex(person, current)).not.toBe(0);
    expect(current.portraitCycles.mira!.neutral!.order[0]).toBe(0);
  });
  it("keeps rendering, manual text edits and off-scene characters from consuming variations", () => {
    let current = scene(); current.portraitCycles = advancePortraitCycles([person], current);
    const before = structuredClone(current); const selected = scenePortraitIndex(person, current);
    for (let i = 0; i < 20; i++) expect(scenePortraitIndex(person, current)).toBe(selected);
    expect(advancePortraitCycles([person], current, current, true)).toEqual(current.portraitCycles);
    expect(advancePortraitCycles([person], { ...current, presentIds: [] }, current)).toEqual(current.portraitCycles);
    const next = { ...current, portraitCycles: advancePortraitCycles([person], current, current) };
    expect(scenePortraitIndex(person, next)).not.toBe(selected); expect(current).toEqual(before);
  });
  it("retains separate emotion cycles and shares the default fallback cycle", () => {
    let current = scene(); current.portraitCycles = advancePortraitCycles([person], current);
    const neutral = structuredClone(current.portraitCycles.mira!.neutral);
    const happy = { ...current, states: { mira: { ...EMPTY_STATUS, emotion: "happy" } } };
    happy.portraitCycles = advancePortraitCycles([person], happy, current, true);
    expect(happy.portraitCycles.mira!.neutral).toEqual(neutral); expect(happy.portraitCycles.mira!.happy).toBeDefined();
    const fallback = { ...happy, states: { mira: { ...EMPTY_STATUS, emotion: "worried" } } };
    fallback.portraitCycles = advancePortraitCycles([person], fallback, happy);
    expect(fallback.portraitCycles.mira!.neutral!.cursor).toBe(1);
    expect(portraitSources(person.characterSheet, "worried", scenePortraitIndex(person, fallback))[0]).toBe(images[fallback.portraitCycles.mira!.neutral!.order[1]!]);
  });
  it("validates persisted cycles without including them or image data in the model prompt", () => {
    const current = scene(); current.portraitCycles = advancePortraitCycles([person], current);
    expect(validCharacterScenes({ w: current })).toBe(true);
    const prompt = characterInstruction("w", "a", [person], current, ["neutral", "happy"], [], "Mira");
    expect(prompt).not.toContain("portraitCycles"); expect(prompt).not.toContain("base64");
    for (const cycle of [{ key: "a", order: [0, 0], cursor: 0 }, { key: "a", order: [0, 3], cursor: 0 }, { key: "a", order: [0], cursor: 1 }, null]) expect(validPortraitCycles({ mira: { neutral: cycle } })).toBe(false);
  });
});

it("validates and clamps UI layout without accepting arbitrary keys", () => {
  expect(parseWidgetLayout({ positions: { meter: { x: -2, y: 5 }, scene: { x: "1", y: 0 }, nonsense: { x: 0, y: 0 } }, minimized: ["meter", "meter", "unknown"], together: true })).toEqual({ positions: { meter: { x: 0, y: 1 } }, minimized: ["meter"], together: true });
  expect(parseWidgetLayout(null)).toEqual({ positions: {}, minimized: [], together: false });
});
