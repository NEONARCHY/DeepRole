import { describe, expect, it } from "vitest";
import { rankMemories, scoreMemory } from "../src/core/memory-engine";
import { normalizeText, uniqueTokens } from "../src/core/text";
import type { MemoryEntry } from "../src/core/types";
import { formatMemoryContext } from "../src/core/context";
import { estimateTokens } from "../src/core/text";

const now = 1_700_000_000_000;
function memory(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: overrides.id ?? "m1",
    bookId: null,
    title: "Башня мага",
    content: "В старой башне живёт синий дракон.",
    keywords: ["синий дракон", "башня"],
    activation: "smart",
    priority: "normal",
    enabled: true,
    source: { type: "manual" },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("local memory ranking", () => {
  it("normalizes Russian letter forms and English verb forms", () => {
    expect(uniqueTokens("с драконами")).toContain("дракон");
    expect(uniqueTokens("дракон")).toContain("дракон");
    expect(uniqueTokens("running")).toEqual(uniqueTokens("runs"));
  });

  it("uses the documented score weights", () => {
    const result = scoreMemory(memory(), normalizeText("Мы вернулись в синюю башню к синему дракону"), uniqueTokens("Мы вернулись в синюю башню к синему дракону"));
    expect(result.score).toBeGreaterThanOrEqual(8);
    expect(result.reasons).toContain("title");
  });

  it("selects always, relevant and manually attached records in the right order", () => {
    const result = rankMemories({
      draft: "Идём к синему дракону: синий дракон рядом",
      recentMessages: [],
      entries: [
        memory({ id: "smart" }),
        memory({ id: "always", activation: "always", title: "Правило" }),
        memory({ id: "manual", activation: "manual", title: "Секрет" }),
      ],
      activeBookId: null,
      manualIds: ["manual"],
      settings: { contextBudget: 2000, relevanceThreshold: 6 },
    });
    expect(result.entries.map((item) => item.entry.id)).toEqual(["manual", "always", "smart"]);
  });

  it("respects active books, exclusions, priorities and the token budget", () => {
    const text = "dragon ".repeat(120);
    const high = memory({ id: "high", title: "Dragon", content: text, keywords: ["dragon"], priority: "high" });
    const oneEntryBudget = estimateTokens(formatMemoryContext({ entries: [{ entry: high, score: 10, reasons: [], estimatedTokens: 0, manuallySelected: false }], estimatedTokens: 0, omittedCount: 0 }));
    const result = rankMemories({
      draft: "dragon",
      recentMessages: [],
      entries: [
        high,
        memory({ id: "low", title: "Dragon", content: text, keywords: ["dragon"], priority: "low" }),
        memory({ id: "other-book", bookId: "book-b", keywords: ["dragon"] }),
      ],
      activeBookId: "book-a",
      excludedIds: ["low"],
      settings: { contextBudget: oneEntryBudget, relevanceThreshold: 6 },
    });
    expect(result.entries.map((item) => item.entry.id)).toEqual(["high"]);
    expect(result.entries.some((item) => item.entry.id === "other-book")).toBe(false);
  });

  it("never silently drops an always record even when it exceeds the budget", () => {
    const result = rankMemories({
      draft: "",
      recentMessages: [],
      entries: [memory({ activation: "always", content: "важно ".repeat(2000) })],
      activeBookId: null,
      settings: { contextBudget: 50, relevanceThreshold: 6 },
    });
    expect(result.entries).toHaveLength(1);
    expect(result.estimatedTokens).toBeGreaterThan(50);
  });
});
