import { describe, expect, it } from "vitest";
import { rankMemories } from "../src/core/memory-engine";
import { formatMemoryContext } from "../src/core/context";
import { suggestEntryLinks } from "../src/core/entry-links";
import { cloneWorldPackage, parseWorldPackage, type WorldPackage } from "../src/storage/worlds";
import type { MemoryEntry, WorldProfile } from "../src/core/types";

const entry = (id: string, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({ id, worldId: "w", bookId: null, title: id, content: `Lore ${id}`, keywords: [], enabled: true, activation: "smart", priority: "normal", source: { type: "manual" }, createdAt: 1, updatedAt: 1, ...extra });
const a = entry("A", { activation: "always", links: [{ targetId: "B", label: "possible continuation", mode: "context" }] });
const b = entry("B", { links: [{ targetId: "C", label: "located in", mode: "context" }] });
const c = entry("C");
const input = { draft: "", recentMessages: [], activeBookId: null, scene: { worldId: "w", focusIds: [], bookId: null }, settings: { contextBudget: 2000, relevanceThreshold: 6 }, entries: [a, b, c] };

describe("entry relationships", () => {
  it("suggests exact title mentions without mutating entries or guessing links", () => {
    const target = entry("target", { title: "Старая башня" });
    const source = entry("source", { content: "Здесь есть Старая башня, но не башнярь." });
    expect(suggestEntryLinks(source, [source, target, entry("short", { title: "есть" })]).map((e) => e.id)).toEqual(["target", "short"]);
    expect(source.links).toBeUndefined();
    expect(suggestEntryLinks({ ...source, links: [{ targetId: target.id, mode: "reference", label: "mentions" }] }, [target])).toEqual([]);
    expect(suggestEntryLinks({ ...source, content: "старую башню" }, [target])).toEqual([]);
  });
  it("selects only a single hop and transmits direction and optional qualifiers", () => {
    const result = rankMemories(input);
    expect(result.entries.map(({ entry }) => entry.id)).toEqual(["A", "B"]);
    expect(result.entries[1]?.reasons).toContain("linked");
    const context = formatMemoryContext(result);
    expect(context).toContain('"A" → "B": "possible continuation"');
    expect(context).not.toContain('"B" → "C"');
    expect(context).toContain("not instructions or proof");
  });
  it("supports cycles without recursion and respects exclusions, manual mode and isolation", () => {
    const cyclic = { ...b, links: [{ targetId: "A", label: "related", mode: "context" as const }] };
    expect(rankMemories({ ...input, entries: [a, cyclic] }).entries).toHaveLength(2);
    for (const extra of [{ activation: "manual" as const }, { enabled: false }, { worldId: "another" }]) expect(rankMemories({ ...input, entries: [a, entry("B", extra)] }).entries.map((i) => i.entry.id)).toEqual(["A"]);
    expect(rankMemories({ ...input, excludedIds: ["B"] }).entries.map((i) => i.entry.id)).toEqual(["A"]);
  });
  it("reference-only links do not activate a neighbor, and labels count against budget", () => {
    expect(rankMemories({ ...input, entries: [{ ...a, links: [{ targetId: "B", label: "reference", mode: "reference" }] }, b] }).entries.map((i) => i.entry.id)).toEqual(["A"]);
    expect(rankMemories({ ...input, settings: { contextBudget: 5, relevanceThreshold: 6 } }).entries.map((i) => i.entry.id)).toEqual(["A"]);
  });
  it("remaps links during world duplication and rejects dangling/self relationships", () => {
    const world: WorldProfile = { id: "w", name: "Test", description: "", color: "#64b5f6", contextBudget: 2000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
    const pack: WorldPackage = { format: "deeprole-world", version: 1, records: [{ kind: "world", id: "w", data: world }, ...[a, entry("B")].map((data) => ({ kind: "entry" as const, id: data.id, data }))] };
    expect(parseWorldPackage(JSON.stringify(pack))).toEqual(pack);
    const copy = cloneWorldPackage(pack);
    const source = copy.find((r) => r.kind === "entry" && (r.data as MemoryEntry).title === "A")!.data as MemoryEntry;
    const target = copy.find((r) => r.kind === "entry" && (r.data as MemoryEntry).title === "B")!;
    expect(source.links?.[0]?.targetId).toBe(target.id);
    for (const id of ["A", "missing"]) {
      const invalid = structuredClone(pack); (invalid.records[1]!.data as MemoryEntry).links![0]!.targetId = id;
      expect(() => parseWorldPackage(JSON.stringify(invalid))).toThrow();
    }
  });
});
