import { describe, expect, it } from "vitest";
import { buildLoreGraph } from "../src/core/lore-map";
import { mapBoxSelection, mapConnectionEntries, mapDropTarget, mapPopover, mapTranslate } from "../src/core/map-ux";
import type { MemoryEntry, WorldProfile } from "../src/core/types";

const world: WorldProfile = { id: "w", name: "Observatory", description: "", color: "#64b5f6", contextBudget: 2000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
const entry = (id: string): MemoryEntry => ({ id, title: id, content: "A neutral fact.", worldId: "w", bookId: null, keywords: [], activation: "smart", priority: "normal", enabled: true, source: { type: "manual" }, createdAt: 1, updatedAt: 1 });
const graph = buildLoreGraph({ world, entries: [{ ...entry("Mira_portrait"), entityIds: ["mira"], links: [{ targetId: "Station", label: "works at", mode: "context" }] }, entry("Mira_personality"), entry("Station")], books: [], templates: [], entities: [{ id: "mira", worldId: "w", kind: "character", name: "Mira", description: "", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1 }], labels: { memory: "Memory", characters: "Characters", locations: "Places", groups: "Groups", templates: "Starters" } });

describe("Contextual world map controls", () => {
  it("frame-selects only visible intersecting cards in either drag direction", () => {
    const a = { ...graph.nodes[0]!, id: "a", x: 500, y: 600 }; const b = { ...a, id: "b", x: 1000, y: 1200 };
    const fixture = { ...graph, nodes: [a, b] };
    expect(mapBoxSelection(fixture, new Set(["a", "b"]), { x: 400, y: 500 }, { x: 650, y: 720 })).toEqual(["a"]);
    expect(mapBoxSelection(fixture, new Set(["a", "b"]), { x: 650, y: 720 }, { x: 400, y: 500 })).toEqual(["a"]);
    expect(mapBoxSelection(fixture, new Set(["b"]), { x: 400, y: 500 }, { x: 650, y: 720 })).toEqual([]);
    expect(mapBoxSelection(fixture, new Set(["a"]), { x: 100, y: 100 }, { x: 200, y: 200 })).toEqual([]);
  });
  it("translates exactly the selection, keeping spacing at every edge", () => {
    const points = { a: { x: 40, y: 80 }, b: { x: 11400, y: 11900 } };
    expect(mapTranslate(points, -200, -200)).toEqual({ a: { x: 0, y: 0 }, b: { x: 11360, y: 11820 } });
    expect(mapTranslate(points, 800, 800)).toEqual({ a: { x: 640, y: 180 }, b: { x: 12000, y: 12000 } });
    expect(mapTranslate(points, 20, 30)).toEqual({ a: { x: 60, y: 110 }, b: { x: 11420, y: 11930 } });
    expect(mapTranslate({}, 1, 2)).toEqual({}); expect(points.a.x).toBe(40);
  });
  for (const width of [320, 600, 1400]) for (const anchor of [{ x: -800, y: -500, halfWidth: 90 }, { x: 180, y: 280, halfWidth: 40 }, { x: 9000, y: 9000, halfWidth: 250 }]) it(`keeps cards inside ${width}px for anchor ${anchor.x}`, () => {
    const result = mapPopover(anchor, { width, height: 620 });
    expect(result.left).toBeGreaterThanOrEqual(12); expect(result.top).toBeGreaterThanOrEqual(12);
    expect(result.left + result.width).toBeLessThanOrEqual(width - 12);
    expect(result.top + result.maxHeight).toBeLessThanOrEqual(608);
    expect(result.width).toBe(Math.min(370, width - 24));
  });
  it("prefers space beside the selected card without scaling the editor", () => {
    expect(mapPopover({ x: 600, y: 300, halfWidth: 100 }, { width: 1200, height: 800 }).left).toBe(716);
    expect(mapPopover({ x: 900, y: 300, halfWidth: 100 }, { width: 1200, height: 800 }).left).toBe(414);
  });
  it("keeps the clicked card uncovered when only vertical space is available", () => {
    const card = mapPopover({ x: 180, y: 300, halfWidth: 100, halfHeight: 40 }, { width: 360, height: 620 });
    expect(card.top >= 356 || card.top + card.maxHeight <= 244).toBe(true);
  });
  it("never falls back onto the selected card when the vertical gap is short", () => {
    const card = mapPopover({ x: 163, y: 104, halfWidth: 108, halfHeight: 36 }, { width: 326, height: 208 });
    expect(card.top >= 156 || card.top + card.maxHeight <= 52).toBe(true);
    expect(card.top + card.maxHeight).toBeLessThanOrEqual(196);
  });
  it("uses book membership even though its entries are organized in other map sections", () => {
    const copy = { ...graph, nodes: [...graph.nodes, { ...graph.nodes[0]!, id: "book:b", kind: "book" as const, recordId: "b" }] };
    expect(mapConnectionEntries(copy, "book:b", [{ ...entry("Mira_portrait"), bookId: "b" }, entry("Station")])).toEqual(["Mira_portrait"]);
  });
  it("resolves folder contents without traversing lore connections", () => {
    expect(mapConnectionEntries(graph, "branch:characters").sort()).toEqual(["Mira_personality", "Mira_portrait"]);
    expect(mapConnectionEntries(graph, "entry:Station")).toEqual(["Station"]);
    expect(mapConnectionEntries(graph, "missing")).toEqual([]);
    expect(mapConnectionEntries(graph, "branch:rules")).toEqual([]);
  });
  it("resolves explicitly attached profile entries, not inferred acquaintances", () => {
    expect(mapConnectionEntries(graph, "character:mira").sort()).toEqual(["Mira_personality", "Mira_portrait"]);
  });
  it("accepts any visible card as a drop target but not blank space or the source", () => {
    const target = graph.nodes.find((node) => node.id === "branch:characters")!;
    expect(mapDropTarget(graph, new Set([target.id]), "entry:Station", target)?.id).toBe(target.id);
    expect(mapDropTarget(graph, new Set(), "entry:Station", target)).toBeUndefined();
    expect(mapDropTarget(graph, new Set([target.id]), target.id, target)).toBeUndefined();
    expect(mapDropTarget(graph, new Set([target.id]), "entry:Station", { x: target.x, y: target.y + 50 })).toBeUndefined();
  });
});
