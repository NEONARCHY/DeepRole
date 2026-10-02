import { describe, expect, it } from "vitest";
import { arrangeVisibleLore, buildLoreGraph, loreBranchEntryIds, loreExpandedIds, visibleLoreNodes } from "../src/core/lore-map";
import { rankMemories } from "../src/core/memory-engine";
import type { MemoryEntry, WorldProfile } from "../src/core/types";

const world: WorldProfile = { id: "w", name: "World", description: "Private", color: "#64b5f6", contextBudget: 2000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
const entry = (id: string): MemoryEntry => ({ id, worldId: "w", bookId: null, title: id, content: `Original ${id}`, keywords: [], activation: "smart", priority: "normal", enabled: true, source: { type: "manual" }, createdAt: 1, updatedAt: 1 });
const labels = { memory: "Memory", characters: "Characters", locations: "Places", groups: "Groups", templates: "Starters" };
describe("RPG lore map layout", () => {
  it("manual overlap and parent movement never displace unselected neighbours", () => {
    const model = buildLoreGraph({ world, books: [], entities: [], templates: [], entries: Array.from({ length: 24 }, (_, i) => entry("Mira_body_" + i)), labels });
    const all = loreExpandedIds(model); const baseline = arrangeVisibleLore(model, all, {});
    const card = baseline.nodes.find((node) => node.kind === "entry")!;
    const neighbour = baseline.nodes.find((node) => node.kind === "entry" && node.id !== card.id)!;
    const branch = baseline.nodes.find((node) => node.id === "branch:characters")!;
    const moved = arrangeVisibleLore(model, all, { [card.id]: { x: neighbour.x, y: neighbour.y }, [branch.id]: { x: branch.x + 110, y: branch.y + 150 } });
    for (const node of baseline.nodes) { const now = moved.nodes.find((value) => value.id === node.id)!; if (![card.id, branch.id].includes(node.id)) expect([now.x, now.y]).toEqual([node.x, node.y]); }
    expect(moved.nodes.find((node) => node.id === card.id)).toMatchObject({ x: neighbour.x, y: neighbour.y });
    expect(arrangeVisibleLore(model, all, {}).nodes).toEqual(baseline.nodes);
  });
  it("keeps geometry stable across input order and decorative branch renaming", () => {
    const entries = [entry("Mira_body"), entry("Mira_personality"), entry("Mira_thoughts"), entry("Scene_Mira_arrival"), entry("World_rules")];
    const input = { world, entries, books: [], entities: [], templates: [], labels };
    const points = (graph: ReturnType<typeof buildLoreGraph>) => Object.fromEntries(graph.nodes.map((node) => [node.id, [node.x, node.y, node.parentId]]).sort());
    expect(points(buildLoreGraph({ ...input, entries: [...entries].reverse() }))).toEqual(points(buildLoreGraph(input)));
    const renamed = { ...world, mapLayout: { positions: {}, expandedIds: [], customCategories: [], categoryNames: { characters: "Z personal label", "person:mira": "My arbitrary folder" } } };
    expect(points(buildLoreGraph({ ...input, world: renamed }))).toEqual(points(buildLoreGraph(input)));
    const arrange = (graph: ReturnType<typeof buildLoreGraph>) => points(arrangeVisibleLore(graph, loreExpandedIds(graph), {}));
    expect(arrange(buildLoreGraph({ ...input, world: renamed }))).toEqual(arrange(buildLoreGraph(input)));
    expect(buildLoreGraph({ ...input, world: renamed }).nodes.find((node) => node.recordId === "person:mira")?.title).toBe("My arbitrary folder");
  });
  it("returns the complete branch's entries, never follow-up lore links", () => {
    const entries = [entry("Mira_body"), { ...entry("Mira_personality"), links: [{ targetId: "World_rules", label: "reference", mode: "reference" as const }] }, entry("World_rules")];
    const graph = buildLoreGraph({ world, entries, books: [], entities: [], templates: [], labels });
    expect(loreBranchEntryIds(graph, "branch:characters")).toEqual(["Mira_body", "Mira_personality"]);
    expect(loreBranchEntryIds(graph, "missing")).toEqual([]);
  });
  it("never changes chat selection when organizing or naming a folder", () => {
    const entries = [entry("Mira_body"), entry("Mira_personality"), { ...entry("World_rules"), activation: "always" as const }];
    const input = { draft: "Tell me about Mira", recentMessages: [], activeBookId: null, scene: { worldId: "w", bookId: null, focusIds: [] }, books: [], entities: [], entries, settings: { contextBudget: 2000, relevanceThreshold: 6 } };
    const a = rankMemories(input);
    const b = rankMemories({ ...input, entries: entries.map((entry) => ({ ...entry, mapCategory: "custom-storytelling" })) });
    expect(b.entries.map((item) => [item.entry.id, item.reasons, item.score])).toEqual(a.entries.map((item) => [item.entry.id, item.reasons, item.score]));
    expect(b.estimatedTokens).toBe(a.estimatedTokens);
    expect(b.entries).toHaveLength(3);
  });
  it("expands all nested character details and dense-entry pages without mutating data", () => {
    const input = { world: { ...world, mapLayout: { positions: {}, expandedIds: [], customCategories: [] } }, books: [], entities: [], templates: [], entries: Array.from({ length: 60 }, (_, i) => entry("Мира_тело_" + i)), labels };
    const original = structuredClone(input);
    const graph = buildLoreGraph(input);
    const expanded = loreExpandedIds(graph);
    expect(expanded.some((id) => id.startsWith("branch:page:"))).toBe(true);
    expect(visibleLoreNodes(graph, expanded).size).toBe(graph.nodes.length);
    expect(expanded).not.toContain("world:w");
    expect(expanded.every((id) => graph.nodes.some((node) => node.parentId === id))).toBe(true);
    expect(input).toEqual(original);
  });

  it("closing one branch does not close its siblings or forget nested expansion", () => {
    const graph = buildLoreGraph({ world, books: [], entities: [], templates: [], entries: [entry("Мира_тело_1"), entry("Мира_тело_2"), entry("Правила_мира")], labels });
    const expanded = loreExpandedIds(graph);
    const folded = expanded.filter((id) => id !== "branch:characters");
    const visible = visibleLoreNodes(graph, folded);
    expect(visible.has("entry:Мира_тело_1")).toBe(false);
    expect(visible.has("entry:Правила_мира")).toBe(true);
    expect(visibleLoreNodes(graph, [...folded, "branch:characters"]).size).toBe(graph.nodes.length);
  });

  it("handles an empty graph without creating expansion state", () => {
    expect(loreExpandedIds({ nodes: [], edges: [], width: 0, height: 0 })).toEqual([]);
  });
  it("represents entries once, preserves directed cycles and never rewrites records", () => {
    const a = { ...entry("a"), links: [{ targetId: "b", label: "possible", mode: "context" as const }] };
    const b = { ...entry("b"), links: [{ targetId: "a", label: "reference", mode: "reference" as const }, { targetId: "missing", label: "dangling", mode: "context" as const }] };
    const input = { world, books: [], entities: [], templates: [], entries: [a, b], labels };
    const original = structuredClone(input);
    const graph = buildLoreGraph(input);
    expect(graph.nodes.filter((node) => node.kind === "entry")).toHaveLength(2);
    expect(graph.nodes[0]?.id).toBe("world:w");
    expect(graph.edges).toContainEqual({ id: "context:entry:a:entry:b", from: "entry:a", to: "entry:b", kind: "context", label: "possible" });
    expect(graph.edges.filter((edge) => edge.kind === "reference")).toHaveLength(1);
    const ids = new Set(graph.nodes.map((node) => node.id));
    expect(graph.edges.every((edge) => ids.has(edge.from) && ids.has(edge.to))).toBe(true);
    expect(input).toEqual(original);
    expect(buildLoreGraph(input)).toEqual(graph);
  });
  it("assigns separate positions to all 60 entries and scopes IDs by kind", () => {
    const graph = buildLoreGraph({ world, books: [], entities: [], templates: [], entries: Array.from({ length: 60 }, (_, i) => entry(String(i))), labels });
    const nodes = graph.nodes.filter((node) => node.kind === "entry");
    expect(new Set(nodes.map((n) => `${n.x}:${n.y}`)).size).toBe(60);
    expect(graph.height).toBeGreaterThan(3000);
    expect(graph.width).toBeGreaterThan(1000);
  });
});
