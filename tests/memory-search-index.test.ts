import { describe, expect, it } from "vitest";
import { memorySearchIndex } from "../src/core/memory-search-index";
import { rankMemories, scoreMemory } from "../src/core/memory-engine";
import { compileMemoryWorkspace } from "../src/core/memory-workspace";
import { normalizeText, uniqueTokens } from "../src/core/text";
import type { MemoryEntry } from "../src/core/types";

const entry = (id: string, patch: Partial<MemoryEntry> = {}): MemoryEntry => ({ id, worldId: "w", bookId: null, title: "Silver medallion", content: "The medallion is locked in the cellar.", keywords: ["medallion"], activation: "smart", priority: "normal", enabled: true, source: { type: "manual" }, createdAt: 1, updatedAt: 1, ...patch });
const score = (e: MemoryEntry, query: string) => scoreMemory(e, normalizeText(query), uniqueTokens(query));
const input = (entries: MemoryEntry[], draft = "medallion") => ({ entries, draft, recentMessages: [], activeBookId: null, books: [], scene: { worldId: "w", bookId: null, focusIds: [] }, settings: { contextBudget: 2000, relevanceThreshold: 6 } });

describe("incremental local lexical index", () => {
  it("reuses 1000 unchanged record indexes, rebuilding only the edited text component", () => {
    const records = Array.from({ length: 1000 }, (_, id) => entry(String(id)));
    const before = records.map(memorySearchIndex);
    records[500]!.content = "The medallion was returned to the owner.";
    records.forEach((record, id) => {
      const after = memorySearchIndex(record);
      if (id !== 500) expect(after).toBe(before[id]);
      else {
        expect(after).not.toBe(before[id]);
        expect(after.titleTokens).toBe(before[id]!.titleTokens);
        expect(after.keywords).toBe(before[id]!.keywords);
        expect(after.contentTokens).not.toBe(before[id]!.contentTokens);
      }
    });
  });

  it("detects title, content and in-place keyword edits even without an updated timestamp", () => {
    const e = entry("same"); memorySearchIndex(e);
    e.title = "Copper bell"; e.content = "The bell is in the attic."; e.keywords[0] = "bell";
    expect(score(e, "medallion").score).toBe(0);
    expect(score(e, "bell")).toEqual(score(structuredClone(e), "bell"));
    e.keywords.push("a hidden passage");
    expect(score(e, "a hidden passage").reasons).toContain("keyword:a hidden passage");
    e.keywords.splice(0);
    expect(score(e, "a hidden passage").score).toBe(0);
  });

  it("does not share an index between different records with the same ID", () => {
    const first = entry("same"), second = entry("same", { title: "Foreign tower", content: "A dragon lives here.", keywords: ["dragon"], worldId: "other" });
    memorySearchIndex(first);
    expect(score(second, "medallion").score).toBe(0);
    expect(memorySearchIndex(second)).not.toBe(memorySearchIndex(first));
  });

  it.each(["медальон", "драконами", "running", "синий дракон", "Mira", "hidden key"])("warm ranking preserves cold scores and reasons for %s", query => {
    const e = entry("one", { title: "Медальон Mira", content: "Синий дракон running towards the hidden key.", keywords: ["медальон", "синий дракон", "running", "hidden key"] });
    score(e, query);
    expect(score(e, query)).toEqual(score(structuredClone(e), query));
  });

  it("reevaluates scope, disabled records, exclusions and manual activation on warm queries", () => {
    const e = entry("one"), args = input([e]);
    expect(rankMemories(args).entries).toHaveLength(1);
    e.enabled = false; expect(rankMemories(args).entries).toHaveLength(0);
    e.enabled = true; e.worldId = "other"; expect(rankMemories(args).entries).toHaveLength(0);
    e.worldId = "w"; expect(rankMemories({ ...args, excludedIds: [e.id] }).entries).toHaveLength(0);
    e.activation = "manual"; expect(rankMemories(args).entries).toHaveLength(0);
    expect(rankMemories({ ...args, manualIds: [e.id] }).entries).toHaveLength(1);
  });

  it("invalidates inferred title-name associations after in-place renaming and disabling", () => {
    const e = entry("person", { title: "Mira appearance", content: "Green coat.", keywords: [] }), records = [e];
    const compile = (query: string) => compileMemoryWorkspace({ ...input(records, query), worlds: [] }).selection.entries;
    expect(compile("Mira").map(item => item.entry.id)).toEqual([e.id]);
    e.title = "Nora appearance";
    expect(compile("Mira")).toHaveLength(0);
    expect(compile("Nora").map(item => item.entry.id)).toEqual([e.id]);
    e.enabled = false; expect(compile("Nora")).toHaveLength(0);
  });

  it("matches a fresh workspace after replacing, adding and removing records in the same array", () => {
    const records = [entry("person", { title: "Mira appearance", content: "Green coat.", keywords: [] })];
    const compile = (entries: MemoryEntry[], query: string) => compileMemoryWorkspace({ ...input(entries, query), worlds: [] }).selection;
    compile(records, "Mira");
    records[0] = entry("person", { title: "Nora appearance", content: "Yellow coat.", keywords: [] });
    records.push(entry("friend", { title: "Mira personality", content: "Patient.", keywords: [] }));
    expect(compile(records, "Mira")).toEqual(compile(structuredClone(records), "Mira"));
    records.pop();
    expect(compile(records, "Mira")).toEqual(compile(structuredClone(records), "Mira"));
  });
});
