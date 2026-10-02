import { createId } from "../core/id";
import { inferTitlePeople, validateLoreMapLayout, LORE_CATEGORIES } from "../core/lore-categories";
import { memoryWorld } from "../core/scene";
import type { LoreMapLayout, MemoryEntry, MemoryBook, WorldProfile, SceneEntity, DataRecord, ActivationMode, StoryTemplate } from "../core/types";
import { buildLoreGraph, loreBranchEntryIds } from "../core/lore-map";
import { repository, MemoryConflictError, type DeepRoleRepository } from "./repository";
import type { MapEditHistory, MapTransform } from "./lore-map-history";

function edit<T>(repo: DeepRoleRepository, history: MapEditHistory | undefined, transform: MapTransform<T>) { return history ? history.apply(transform) : repo.updateRecords(transform); }
function entryFrom(all: DataRecord[], id: string, worldId: string) {
  const entry = all.find((r) => r.kind === "entry" && r.id === id)?.data as MemoryEntry | undefined;
  const books = all.filter((r) => r.kind === "book").map((r) => r.data as MemoryBook);
  if (!entry || memoryWorld(entry, books) !== worldId) throw new Error("invalidMap");
  return entry;
}

export async function saveMapLayout(worldId: string, layout: LoreMapLayout, repo: DeepRoleRepository = repository, history?: MapEditHistory) {
  validateLoreMapLayout(layout);
  await edit(repo, history, (all) => {
    const world = all.find((r) => r.kind === "world" && r.id === worldId)?.data as WorldProfile | undefined; if (!world) throw new Error("invalidMap");
    return { records: [{ kind: "world", id: world.id, data: { ...world, mapLayout: layout, updatedAt: Date.now() } }], removed: [], result: undefined };
  });
}

async function scopedEntry(id: string, worldId: string, repo: DeepRoleRepository) {
  const entry = await repo.get<MemoryEntry>("entry", id); if (!entry) throw new Error("invalidMap");
  const book = entry.bookId ? await repo.get<MemoryBook>("book", entry.bookId) : null;
  if (memoryWorld(entry, book ? [book] : []) !== worldId) throw new Error("invalidMap");
  return entry;
}
export async function changeMapCategory(worldId: string, id: string, categoryId: string | null, repo: DeepRoleRepository = repository, history?: MapEditHistory) {
  await edit(repo, history, (all) => {
    const world = all.find((r) => r.kind === "world" && r.id === worldId)?.data as WorldProfile | undefined; if (!world) throw new Error("invalidMap");
    if (categoryId && !LORE_CATEGORIES.some((c) => c.id === categoryId) && !world.mapLayout?.customCategories.some((c) => c.id === categoryId)) throw new Error("invalidMap");
    const entry = entryFrom(all, id, worldId);
    return { records: [{ kind: "entry", id: entry.id, data: { ...entry, mapCategory: categoryId ?? undefined, updatedAt: Date.now() } }], removed: [], result: undefined };
  });
}
/** Dropping a record on a branch is one edit, not two separate undo steps. */
export async function placeMapEntry(worldId: string, id: string, categoryId: string, layout: LoreMapLayout, repo: DeepRoleRepository = repository, history?: MapEditHistory) {
  validateLoreMapLayout(layout);
  await edit(repo, history, (all) => {
    const world = all.find((r) => r.kind === "world" && r.id === worldId)?.data as WorldProfile | undefined;
    if (!world || !LORE_CATEGORIES.some((c) => c.id === categoryId) && !layout.customCategories.some((c) => c.id === categoryId)) throw new Error("invalidMap");
    const entry = entryFrom(all, id, worldId); const now = Date.now();
    return { records: [{ kind: "world", id: world.id, data: { ...world, mapLayout: layout, updatedAt: now } }, { kind: "entry", id: entry.id, data: { ...entry, mapCategory: categoryId, updatedAt: now } }], removed: [], result: undefined };
  });
}
export async function changeMapLink(worldId: string, sourceId: string, targetId: string, link: { label: string; mode: "context" | "reference" } | null, repo: DeepRoleRepository = repository, history?: MapEditHistory) {
  if (sourceId === targetId || (link && (link.label.length > 160 || !["context", "reference"].includes(link.mode)))) throw new Error("invalidMap");
  await edit(repo, history, (all) => {
    const source = entryFrom(all, sourceId, worldId); entryFrom(all, targetId, worldId);
    const links = (source.links ?? []).filter((l) => l.targetId !== targetId);
    if (link) links.push({ targetId, ...link });
    if (links.length > 100) throw new Error("invalidMap");
    return { records: [{ kind: "entry", id: source.id, data: { ...source, links, updatedAt: Date.now() } }], removed: [], result: undefined };
  });
}

/** Explicit mode changes only. Preserve fresh text; refuse stale modes or branch membership. */
export async function changeMapActivations(worldId: string, expected: MemoryEntry[], activation: ActivationMode, repo: DeepRoleRepository = repository, history?: MapEditHistory, branchId?: string) {
  if (!["always", "smart", "manual"].includes(activation) || !expected.length || new Set(expected.map((e) => e.id)).size !== expected.length) throw new Error("invalidMap");
  await edit(repo, history, (all) => {
    const world = all.find((r) => r.kind === "world" && r.id === worldId)?.data as WorldProfile | undefined;
    if (!world) throw new MemoryConflictError();
    const entries = expected.map((old) => { const current = entryFrom(all, old.id, worldId); if (current.activation !== old.activation) throw new MemoryConflictError(); return current; });
    if (branchId) {
      const books = all.filter((r) => r.kind === "book").map((r) => r.data as MemoryBook).filter((b) => b.worldId === worldId);
      const scoped = all.filter((r) => r.kind === "entry").map((r) => r.data as MemoryEntry).filter((e) => memoryWorld(e, books) === worldId);
      const graph = buildLoreGraph({ world, books, entries: scoped, entities: all.filter((r) => r.kind === "entity").map((r) => r.data as SceneEntity).filter((e) => e.worldId === worldId), templates: all.filter((r) => r.kind === "template").map((r) => r.data as StoryTemplate).filter((s) => s.worldId === worldId), labels: { memory: "", characters: "", locations: "", groups: "", templates: "" } });
      if (JSON.stringify(loreBranchEntryIds(graph, branchId)) !== JSON.stringify(expected.map((e) => e.id).sort())) throw new MemoryConflictError();
    }
    return { records: entries.filter((e) => e.activation !== activation).map((e) => ({ kind: "entry" as const, id: e.id, data: { ...e, activation, updatedAt: Date.now() } })), removed: [], result: undefined };
  });
}
export async function confirmMapPerson(worldId: string, name: string, token: string, entryIds: string[], repo: DeepRoleRepository = repository) {
  if (!name.trim() || name.length > 100 || !entryIds.length) throw new Error("invalidMap");
  const entries = await Promise.all(entryIds.map((id) => scopedEntry(id, worldId, repo)));
  const suggestion = inferTitlePeople(entries, []).find((person) => person.token === token);
  const now = Date.now();
  const entity: SceneEntity = { id: createId("entity"), worldId, name: name.trim(), aliases: [...new Set([token, ...(suggestion?.aliases ?? [])])], kind: "character", description: "", memberIds: [], createdAt: now, updatedAt: now };
  await repo.commitChecked([{ kind: "entity", id: entity.id, data: entity }, ...entries.map((entry) => ({ kind: "entry" as const, id: entry.id, data: { ...entry, entityIds: [...new Set([...(entry.entityIds ?? []), entity.id])], updatedAt: now } }))], [], entries.map((entry) => ({ kind: "entry", id: entry.id, data: entry })));
  return entity.id;
}

export async function removeMapBranch(worldId: string, categoryId: string, repo: DeepRoleRepository = repository, history?: MapEditHistory): Promise<LoreMapLayout> {
  return edit(repo, history, (all) => {
  const world = all.find((r) => r.kind === "world" && r.id === worldId)?.data as WorldProfile | undefined;
  if (!world?.mapLayout?.customCategories.some((c) => c.id === categoryId)) throw new Error("invalidMap");
  const layout = structuredClone(world.mapLayout); const removed = new Set([categoryId]);
  for (let i = 0; i < layout.customCategories.length; i++) for (const c of layout.customCategories) if (c.parentId && removed.has(c.parentId)) removed.add(c.id);
  layout.customCategories = layout.customCategories.filter((c) => !removed.has(c.id));
  layout.categoryNames = Object.fromEntries(Object.entries(layout.categoryNames ?? {}).filter(([id]) => !removed.has(id)));
  const keep = (id: string) => !id.split(":").some((part) => removed.has(part));
  layout.positions = Object.fromEntries(Object.entries(layout.positions).filter(([id]) => keep(id)));
  layout.expandedIds = layout.expandedIds.filter(keep);
  const books = all.filter((r) => r.kind === "book").map((r) => r.data as MemoryBook);
  const entries = all.filter((r) => r.kind === "entry").map((r) => r.data as MemoryEntry).filter((e) => e.mapCategory && removed.has(e.mapCategory) && memoryWorld(e, books) === worldId);
  const now = Date.now();
  return { records: [{ kind: "world", id: world.id, data: { ...world, mapLayout: layout, updatedAt: now } }, ...entries.map((e) => ({ kind: "entry" as const, id: e.id, data: { ...e, mapCategory: undefined, updatedAt: now } }))], removed: [], result: layout };
  });
}
