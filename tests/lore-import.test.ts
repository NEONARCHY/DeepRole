import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildLoreImport, parseLoreImport } from "../src/core/lore-import";
import { validDataRecord } from "../src/core/record-validation";
import { parseWorldPackage } from "../src/storage/worlds";
import type { MemoryEntry } from "../src/core/types";

describe("portable JSON lore", () => {
  it("imports the documented starter without changing its facts or memory modes", () => {
    const source = JSON.parse(readFileSync("examples/observatory.json", "utf8"));
    const parsed = parseLoreImport(JSON.stringify(source));
    const records = buildLoreImport(parsed, parsed.name ?? "Observatory", "smart");
    const entries = records.filter((record) => record.kind === "entry").map((record) => record.data as MemoryEntry);
    expect(records.every(validDataRecord)).toBe(true);
    expect(entries).toHaveLength(5);
    expect(entries.map(({ content, activation }) => ({ content, activation }))).toEqual(source.entries.map(({ content, activation }: MemoryEntry) => ({ content, activation })));
  });
  it.each([
    [{ title: "Mira", content: "  Mira is 32.\r\nThe tower opened on day 3.  " }],
    { entries: [{ name: "Mira", text: "  Mira is 32.\r\nThe tower opened on day 3.  " }] },
    { entries: { first: { comment: "Mira", content: "  Mira is 32.\r\nThe tower opened on day 3.  " } } },
    { Mira: { value: "  Mira is 32.\r\nThe tower opened on day 3.  " } },
    { Mira: "  Mira is 32.\r\nThe tower opened on day 3.  " },
  ])("recognizes memory containers and preserves every text byte", (source) => {
    const before = JSON.stringify(source); const parsed = parseLoreImport(before);
    expect(parsed.items[0]).toMatchObject({ title: "Mira", content: "  Mira is 32.\r\nThe tower opened on day 3.  ", activation: "smart", enabled: true });
    const records = buildLoreImport(parsed, "Test", "smart");
    expect(records.every(validDataRecord)).toBe(true);
    expect(() => parseWorldPackage(JSON.stringify({ format: "deeprole-world", version: 1, records }))).not.toThrow();
    expect((records.find((row) => row.kind === "entry")!.data as MemoryEntry).content).toBe(parsed.items[0]!.content);
    expect(JSON.stringify(source)).toBe(before);
    expect(records.filter((row) => row.kind === "entity")).toEqual([]);
  });
  it("preserves keys, modes, priority and disabled status without manufacturing BDS importance", () => {
    const lore = parseLoreImport(JSON.stringify({ name: "Observatory", entries: [
      { title: "Rules", content: "Keep facts", constant: true },
      { title: "Mira", content: "Navigator", keys: ["Mira", "silver compass"], activation: "called", priority: "high", disabled: true },
      { title: "Possible route", content: "Not yet visited", mode: "manual", keywords: "northern route" },
    ] }));
    const entries = buildLoreImport(lore, lore.name!, "manual").filter((row) => row.kind === "entry").map((row) => row.data as MemoryEntry);
    expect(entries.map((entry) => entry.activation)).toEqual(["always", "smart", "manual"]);
    expect(entries[1]).toMatchObject({ keywords: ["Mira", "silver compass"], enabled: false, priority: "high" });
    expect(entries[2]!.keywords).toEqual(["northern route"]);
    expect(entries.every((entry) => entry.source.originalImportance === undefined)).toBe(true);
    expect(lore.unsupportedFields).toEqual([]);
  });
  it("keeps strict BDS mapping, including an explicit manual called mode", () => {
    const lore = parseLoreImport(JSON.stringify({ "  Mira_appearance  ": { value: "Exact\ntext", importance: "called" }, Rule: { value: "Rule text", importance: "always" } }));
    expect(lore.format).toBe("bds");
    expect(buildLoreImport(lore, "World", "manual").filter((row) => row.kind === "entry").map((row) => (row.data as MemoryEntry).activation)).toEqual(["manual", "always"]);
    expect(lore.items[0]!.title).toBe("  Mira_appearance  ");
  });
  it("reads extended memory dictionaries without silently losing settings or source importance", () => {
    const parsed = parseLoreImport(JSON.stringify({ "Mira_appearance": { value: "Unchanged", importance: "called", enabled: false, tag: "extra" } }));
    expect(parsed.unsupportedFields).toEqual(["tag"]);
    const entry = buildLoreImport(parsed, "Test", "smart").find((row) => row.kind === "entry")!.data as MemoryEntry;
    expect(entry).toMatchObject({ enabled: false, activation: "smart", source: { originalImportance: "called" }, content: "Unchanged" });
  });
  it("reports unsupported fields instead of silently transferring their semantics", () => {
    const lore = parseLoreImport(JSON.stringify({ name: "World", settings: { depth: 2 }, entries: [{ title: "Gate", content: "Closed", secondary_keys: ["key"], probability: 30 }] }));
    expect(lore.unsupportedFields).toEqual(["probability", "secondary_keys", "settings"]);
    expect(lore.items[0]!.activation).toBe("smart");
  });
  it.each([
    null, [], {}, { users: [{ name: "Not a memory file" }] },
    [{ title: "A", content: "A", text: "B" }], [{ title: "A", name: "B", content: "A" }],
    [{ title: "A", content: "A", activation: "scheduled" }], [{ title: "A", content: "A", activation: "manual", constant: true }],
    [{ title: "A", content: "A", enabled: true, disabled: true }], [{ title: "A", content: "A", keys: [42] }],
    [{ title: "A", content: "A" }, { title: "Empty", content: "" }], { format: "deeprole-backup", entries: [{ title: "A", content: "A" }] },
  ])("rejects malformed or ambiguous input atomically: %j", (value) => expect(() => parseLoreImport(JSON.stringify(value))).toThrow());
  it("rejects oversize input before parsing", () => expect(() => parseLoreImport(" ".repeat(10_000_001))).toThrow());
  it.each(["json", "bds"])("preserves all 10,000 entries at the %s limit and rejects overflow atomically", format => {
    const entries = Array.from({ length: 10_000 }, (_, i) => ({ title: `Fact ${i + 1}`, content: `  Exact fact ${i + 1}.\r\nSecond line.  `, activation: "manual", enabled: false, keywords: [`key-${i + 1}`] }));
    const source = format === "json" ? { entries } : Object.fromEntries(entries.map(entry => [entry.title, { value: entry.content, importance: "called" }]));
    const text = JSON.stringify(source); const lore = parseLoreImport(text);
    expect(lore.items).toHaveLength(10_000);
    const records = buildLoreImport(lore, "Large world", "manual");
    const saved = records.filter(record => record.kind === "entry").map(record => record.data as MemoryEntry);
    expect(saved).toHaveLength(10_000); expect(records.every(validDataRecord)).toBe(true);
    expect(saved.map(entry => entry.content)).toEqual(entries.map(entry => entry.content));
    expect(saved[9999]).toMatchObject({ title: "Fact 10000", activation: "manual", content: entries[9999]!.content });
    if (format === "json") expect(saved[9999]).toMatchObject({ enabled: false, keywords: ["key-10000"] });
    const overflow = format === "json" ? { entries: [...entries, entries[0]] } : { ...source, Overflow: { value: "Extra", importance: "called" } };
    expect(() => parseLoreImport(JSON.stringify(overflow))).toThrow();
    expect(JSON.stringify(source)).toBe(text);
  });
});
