import { formatMemoryContext } from "./context";
import { rankMemories } from "./memory-engine";
import { expandFocus, mentionedEntities, memoryWorld, isMemoryInScene } from "./scene";
import { inferTitlePeople } from "./lore-categories";
import { estimateTokens } from "./text";
import type { RankMemoryInput } from "./memory-engine";
import type { ContextSelection, DataRecord, MemoryBook, MemoryEntry, MemoryOverrides, RecordKind, RecordValue, SceneEntity, WorldProfile } from "./types";

export const EMPTY_OVERRIDES: MemoryOverrides = { includedIds: [], excludedIds: [] };
export const profileMemoryId = (kind: "world" | "entity", id: string) => `profile:${kind}:${id}`;
const titleIndexes = new WeakMap<MemoryEntry[], Map<string, ReturnType<typeof inferTitlePeople>>>();

export function libraryRecords<T extends RecordValue>(records: DataRecord[], kind: RecordKind): T[] {
  return records.filter((r) => r.kind === kind).map((r) => r.data as T).sort((a, b) => ("updatedAt" in b ? b.updatedAt : b.createdAt) - ("updatedAt" in a ? a.updatedAt : a.createdAt));
}

export function changeMemoryOverride(current: MemoryOverrides, id: string, action: "include" | "exclude" | "reset"): MemoryOverrides {
  return {
    includedIds: [...new Set([...current.includedIds.filter((value) => value !== id), ...(action === "include" ? [id] : [])])],
    excludedIds: [...new Set([...current.excludedIds.filter((value) => value !== id), ...(action === "exclude" ? [id] : [])])],
  };
}

/** Descriptions are projections of their original records, not saved entry copies. */
export function runtimeMemoryDocuments(entries: MemoryEntry[], books: MemoryBook[], worlds: WorldProfile[], entities: SceneEntity[], scene: NonNullable<RankMemoryInput["scene"]>, searchText: string) {
  const origins = new Map<string, { kind: "entry" | "world" | "entity"; id: string }>();
  const documents = [...entries];
  entries.forEach((entry) => origins.set(entry.id, { kind: "entry", id: entry.id }));
  const world = worlds.find((w) => w.id === scene.worldId);
  const scopedEntities = entities.filter((e) => e.worldId === scene.worldId);
  const relevant = expandFocus([...scene.focusIds, ...mentionedEntities(searchText, scopedEntities)], scopedEntities, scene.worldId);
  const add = (kind: "world" | "entity", source: WorldProfile | SceneEntity, always: boolean) => {
    if (!source.useDescriptionInContext || !source.description.trim()) return;
    const id = profileMemoryId(kind, source.id);
    // Reserved projection IDs cannot overwrite a real imported entry's identity.
    if (origins.has(id)) return;
    const entry: MemoryEntry = { id, worldId: scene.worldId, bookId: null, entityIds: kind === "entity" ? [source.id] : [], title: source.name, content: source.description, keywords: [], activation: always ? "always" : "smart", priority: "high", enabled: true, source: { type: "manual" }, createdAt: source.createdAt, updatedAt: source.updatedAt };
    documents.push(entry); origins.set(id, { kind, id: source.id });
  };
  if (world) add("world", world, true);
  for (const entity of scopedEntities) if (relevant.has(entity.id)) add("entity", entity, true);
  return { documents, origins };
}

/** The only runtime compiler, independent of the window that edits the source data. */
export function compileMemoryWorkspace(input: RankMemoryInput & { worlds: WorldProfile[] }): { selection: ContextSelection; documents: MemoryEntry[] } {
  const scene = input.scene ?? { worldId: null, bookId: input.activeBookId, focusIds: [] };
  const pinnedProfiles = [...input.manualIds ?? []].filter((id) => id.startsWith("profile:entity:")).map((id) => id.slice("profile:entity:".length));
  const { documents, origins } = runtimeMemoryDocuments(input.entries, input.books ?? [], input.worlds, input.entities ?? [], { ...scene, focusIds: [...scene.focusIds, ...pinnedProfiles] }, [input.draft, ...input.recentMessages.slice(-4)].join("\n"));
  const key = JSON.stringify([scene.worldId, scene.bookId, (input.books ?? []).map((book) => [book.id, book.worldId, book.active])]);
  const indexes = titleIndexes.get(input.entries) ?? new Map(); titleIndexes.set(input.entries, indexes);
  if (!indexes.has(key)) {
    if (indexes.size >= 4) indexes.clear();
    // A single clear character record is useful for retrieval; the map still
    // requires repeated evidence before offering an inferred profile cluster.
    indexes.set(key, inferTitlePeople(input.entries.filter((entry) => entry.enabled && isMemoryInScene(entry, scene, input.books ?? [])), [], 1));
  }
  const selection = rankMemories({ ...input, scene, entries: documents, nameGroups: indexes.get(key) });
  selection.entries = selection.entries.map((item) => ({ ...item, origin: origins.get(item.entry.id) }));
  selection.estimatedTokens = selection.entries.length ? estimateTokens(formatMemoryContext(selection)) : 0;
  selection.overBudgetTokens = Math.max(0, selection.estimatedTokens - input.settings.contextBudget);
  return { selection, documents };
}

export function scopedMemories(entries: MemoryEntry[], books: MemoryBook[], worldId: string | null): MemoryEntry[] {
  return entries.filter((entry) => memoryWorld(entry, books) === worldId);
}
