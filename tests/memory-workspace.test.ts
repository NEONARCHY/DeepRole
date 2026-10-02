import { describe, expect, it } from "vitest";
import { changeMemoryOverride, compileMemoryWorkspace, EMPTY_OVERRIDES } from "../src/core/memory-workspace";
import { formatMemoryContext } from "../src/core/context";
import { estimateTokens } from "../src/core/text";
import type { MemoryEntry, SceneEntity, WorldProfile } from "../src/core/types";

const world: WorldProfile = { id: "w", name: "World", description: "The moon never sets.", useDescriptionInContext: true, color: "blue", contextBudget: 2000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
const mira: SceneEntity = { id: "mira", worldId: "w", kind: "character", name: "Мира", aliases: ["Mira"], description: "She remembers every promise.", useDescriptionInContext: true, memberIds: [], createdAt: 1, updatedAt: 1 };
const entry = (id: string, patch: Partial<MemoryEntry> = {}): MemoryEntry => ({ id, worldId: "w", bookId: null, title: id, content: "A fact", keywords: [], activation: "smart", priority: "normal", enabled: true, source: { type: "manual" }, createdAt: 1, updatedAt: 1, ...patch });
const compile = (entries: MemoryEntry[], extra: Partial<Parameters<typeof compileMemoryWorkspace>[0]> = {}) => compileMemoryWorkspace({ entries, worlds: [world], books: [], entities: [mira], scene: { worldId: "w", focusIds: [], bookId: null }, draft: "", recentMessages: [], activeBookId: null, settings: world, ...extra });

describe("one canonical memory workspace", () => {
  it("never sends legacy private notes without explicit description consent", () => {
    const result = compile([], { worlds: [{ ...world, useDescriptionInContext: undefined }], entities: [{ ...mira, useDescriptionInContext: false }], scene: { worldId: "w", bookId: null, focusIds: ["mira"] } });
    expect(result.selection.entries).toEqual([]);
  });
  it("projects approved descriptions without creating saved entry clones", () => {
    const originals = [entry("rule", { activation: "always" })]; const before = JSON.stringify(originals);
    const result = compile(originals, { scene: { worldId: "w", focusIds: ["mira"], bookId: null } });
    expect(result.selection.entries.map((item) => item.origin?.kind)).toEqual(["entry", "world", "entity"]);
    expect(formatMemoryContext(result.selection)).toContain(mira.description);
    expect(JSON.stringify(originals)).toBe(before);
    expect(result.selection.estimatedTokens).toBe(estimateTokens(formatMemoryContext(result.selection)));
  });
  it("matches RU inflected names and English aliases without selecting another world", () => {
    for (const draft of ["Я разговариваю с Мирой", "Talk with Mira"]) {
      const result = compile([entry("personal", { entityIds: ["mira"] }), entry("foreign", { worldId: "elsewhere", activation: "always" })], { draft });
      expect(result.selection.entries.map((item) => item.entry.id)).toContain("personal");
      expect(result.selection.entries.some((item) => item.entry.id === "foreign")).toBe(false);
      expect(result.selection.entries.some((item) => item.origin?.kind === "entity")).toBe(true);
    }
  });
  it("uses shared title normalization for CamelCase and underscore names", () => {
    const records = [entry("a", { title: "MiraBlue_Eyes", content: "Blue eyes" }), entry("b", { title: "MiraBlue_Promise", content: "A promise" })];
    const ids = compile(records, { draft: "Mira Blue is here" }).selection.entries.map((item) => item.entry.id);
    expect(ids).toEqual(expect.arrayContaining(["a", "b"]));
  });
  it("keeps manual, excluded, disabled and inactive-book rules in every view", () => {
    const records = [entry("manual", { activation: "manual" }), entry("excluded", { activation: "always" }), entry("disabled", { enabled: false, activation: "always" }), entry("inactive", { bookId: "book", activation: "always" })];
    const result = compile(records, { manualIds: ["manual", "disabled", "inactive"], excludedIds: ["excluded", "profile:world:w"], books: [{ id: "book", worldId: "w", name: "Book", description: "", color: "blue", active: false, createdAt: 1, updatedAt: 1 }] });
    expect(result.selection.entries.map((item) => item.entry.id)).toEqual(["manual"]);
  });
  it.each([
    ["Алекс_характер", "Расскажи об Алексе"],
    ["AlexPersonality", "Tell me about Alex"],
    ["Biography: Mary Jane", "Tell me about Mary Jane"],
  ])("finds a single named BDS-style character record: %s", (title, draft) => {
    const record = entry("character", { title, content: "Original immutable lore", keywords: [] });
    const before = structuredClone(record);
    expect(compile([record], { draft, entities: [] }).selection.entries.some((item) => item.entry.id === record.id)).toBe(true);
    expect(record).toEqual(before);
    expect(compile([record], { draft, entities: [], scene: { worldId: null, focusIds: [], bookId: null } }).selection.entries).toEqual([]);
    expect(compile([{ ...record, activation: "manual" }], { draft, entities: [] }).selection.entries.some((item) => item.entry.id === record.id)).toBe(false);
    expect(compile([{ ...record, enabled: false }], { draft, entities: [] }).selection.entries.some((item) => item.entry.id === record.id)).toBe(false);
  });
  it("preserves explicitly attached profile descriptions after removing scene focus", () => {
    const result = compile([], { manualIds: ["profile:entity:mira"] });
    expect(result.selection.entries.map((item) => item.entry.id)).toContain("profile:entity:mira");
  });
  it("reports oversized always memory without silently removing it", () => {
    const result = compile([entry("huge", { activation: "always", content: "rule ".repeat(2000) })], { settings: { contextBudget: 500, relevanceThreshold: 6 } });
    expect(result.selection.overBudgetTokens).toBeGreaterThan(0);
    expect(result.selection.entries.some((item) => item.entry.id === "huge")).toBe(true);
  });
  it("uses context links but never reference-only links or map geometry for retrieval", () => {
    const records = [entry("root", { activation: "always", links: [{ targetId: "linked", label: "possible next step", mode: "context" }, { targetId: "reference", label: "reference", mode: "reference" }] }), entry("linked"), entry("reference")];
    const first = compile(records);
    expect(first.selection.entries.map((item) => item.entry.id)).toEqual(expect.arrayContaining(["root", "linked"]));
    expect(first.selection.entries.some((item) => item.entry.id === "reference")).toBe(false);
    const second = compile(records, { worlds: [{ ...world, mapLayout: { positions: { "entry:root": { x: 900, y: -200 } }, expandedIds: [], customCategories: [] } }] });
    expect(formatMemoryContext(second.selection)).toBe(formatMemoryContext(first.selection));
  });
  it("updates override sets immutably and reset restores normal activation", () => {
    const included = changeMemoryOverride(EMPTY_OVERRIDES, "one", "include");
    const excluded = changeMemoryOverride(included, "one", "exclude");
    expect(included).toEqual({ includedIds: ["one"], excludedIds: [] });
    expect(excluded).toEqual({ includedIds: [], excludedIds: ["one"] });
    expect(changeMemoryOverride(excluded, "one", "reset")).toEqual(EMPTY_OVERRIDES);
  });
});
