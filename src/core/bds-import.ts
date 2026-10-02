import { createId } from "./id";
import type { DataRecord, MemoryBook, MemoryEntry, WorldProfile } from "./types";

export interface BdsItem { title: string; content: string; importance: "always" | "called" }
export function parseBds(text: string): BdsItem[] {
  if (text.length > 10_000_000) throw new Error("bdsInvalid");
  let value: unknown;
  try { value = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { throw new Error("bdsInvalid"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("bdsInvalid");
  const rows = Object.entries(value);
  if (!rows.length || rows.length > 10000) throw new Error("bdsInvalid");
  return rows.map(([title, item]) => {
    if (!title.trim() || !item || typeof item !== "object" || Array.isArray(item)) throw new Error("bdsInvalid");
    const row = item as Record<string, unknown>;
    // Reject unsupported data rather than silently dropping fields or entries.
    if (Object.keys(row).some((key) => !["value", "importance"].includes(key)) || typeof row.value !== "string" || !row.value.trim() || !["always", "called"].includes(String(row.importance))) throw new Error("bdsInvalid");
    return { title, content: row.value, importance: row.importance as BdsItem["importance"] };
  });
}

export function buildBdsImport(items: BdsItem[], name: string, calledMode: "smart" | "manual", targetWorldId?: string): DataRecord[] {
  const now = Date.now();
  const world: WorldProfile = { id: targetWorldId ?? createId("world"), name, description: "", color: "#64b5f6", contextBudget: 2000, relevanceThreshold: 6, createdAt: now, updatedAt: now };
  const book: MemoryBook = { id: createId("book"), worldId: world.id, name, description: "", color: world.color, active: true, createdAt: now, updatedAt: now };
  const entries: MemoryEntry[] = items.map((item) => ({
    id: createId("memory"), worldId: world.id, bookId: book.id, entityIds: [],
    title: item.title, content: item.content, keywords: [],
    activation: item.importance === "always" ? "always" : calledMode,
    priority: "normal", enabled: true,
    source: { type: "import", originalImportance: item.importance, originalTitle: item.title },
    createdAt: now, updatedAt: now,
  }));
  return [
    ...(!targetWorldId ? [{ kind: "world" as const, id: world.id, data: world }] : []),
    { kind: "book", id: book.id, data: book },
    ...entries.map((entry) => ({ kind: "entry" as const, id: entry.id, data: entry })),
  ];
}
