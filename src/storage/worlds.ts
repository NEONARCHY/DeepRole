import { createId } from "../core/id";
import { validDataRecord } from "../core/record-validation";
import { memoryWorld } from "../core/scene";
import type { DataRecord, MemoryBook, MemoryEntry, SceneEntity, ChatBinding, HandoffSnapshot, WorldProfile } from "../core/types";
import { repository, type DeepRoleRepository } from "./repository";

export interface WorldPackage { format: "deeprole-world"; version: 1; records: DataRecord[] }

export async function exportWorld(worldId: string, repo: DeepRoleRepository = repository): Promise<WorldPackage> {
  const all = await repo.rawRecords();
  const books = all.filter((r) => r.kind === "book").map((r) => r.data as MemoryBook);
  const records = all.filter((r) => r.kind === "world" ? r.id === worldId : r.kind === "entry" ? memoryWorld(r.data as MemoryEntry, books) === worldId : ["book", "entity", "template"].includes(r.kind) && "worldId" in r.data && r.data.worldId === worldId);
  if (!records.some((r) => r.kind === "world")) throw new Error("invalidBackup");
  const entryIds = new Set(records.filter((r) => r.kind === "entry").map((r) => r.id));
  return { format: "deeprole-world", version: 1, records: records.map((r) => r.kind === "entry" ? { ...r, data: { ...r.data, worldId, links: (r.data as MemoryEntry).links?.filter((link) => entryIds.has(link.targetId) && link.targetId !== r.id) } } : r) };
}

export function parseWorldPackage(text: string): WorldPackage {
  const value = JSON.parse(text.replace(/^\uFEFF/, "")) as WorldPackage;
  if (value?.format !== "deeprole-world" || value.version !== 1 || !Array.isArray(value.records) || value.records.length > 20000) throw new Error("invalidBackup");
  if (value.records.some((r) => !validDataRecord(r))) throw new Error("invalidBackup");
  const worldRecords = value.records.filter((r) => r.kind === "world");
  if (worldRecords.length !== 1) throw new Error("invalidBackup");
  const worldId = worldRecords[0]!.id;
  const ids = new Set<string>();
  for (const r of value.records) {
    if (!r || typeof r.id !== "string" || !r.id || ids.has(r.id) || !r.data || r.data.id !== r.id) throw new Error("invalidBackup");
    ids.add(r.id);
    const d = r.data as unknown as Record<string, unknown>;
    if (!["world", "book", "entry", "entity", "template"].includes(r.kind)) throw new Error("invalidBackup");
    if (r.kind !== "world" && d.worldId !== worldId) throw new Error("invalidBackup");
  }
  const byId = new Map(value.records.map((r) => [r.id, r.kind]));
  for (const r of value.records) {
    const d = r.data;
    if (r.kind === "entry") for (const link of (d as MemoryEntry).links ?? []) if (link.targetId === r.id || byId.get(link.targetId) !== "entry") throw new Error("invalidBackup");
    if ("bookId" in d && d.bookId && byId.get(d.bookId) !== "book") throw new Error("invalidBackup");
    for (const id of ("entityIds" in d ? d.entityIds : "focusIds" in d ? d.focusIds : "memberIds" in d ? d.memberIds : []) ?? []) {
      if (byId.get(id) !== "entity") throw new Error("invalidBackup");
    }
  }
  return value;
}

export function cloneWorldPackage(value: WorldPackage, name?: string): DataRecord[] {
  const ids = new Map(value.records.map((r) => [r.id, createId(r.kind)]));
  return value.records.map((r) => {
    const data = structuredClone(r.data);
    data.id = ids.get(r.id)!;
    if (r.kind === "world" && (data as WorldProfile).mapLayout) {
      const layout = (data as WorldProfile).mapLayout!;
      const remap = (key: string) => key.split(":").map((part) => ids.get(part) ?? part).join(":");
      layout.positions = Object.fromEntries(Object.entries(layout.positions).map(([key, position]) => [remap(key), position]));
      layout.expandedIds = layout.expandedIds.map(remap);
      if (layout.categoryNames) layout.categoryNames = Object.fromEntries(Object.entries(layout.categoryNames).map(([key, name]) => [remap(key), name]));
    }
    if ("links" in data) data.links = data.links?.flatMap((link) => ids.has(link.targetId) ? [{ ...link, targetId: ids.get(link.targetId)! }] : []);
    if (r.kind === "world" && name) (data as WorldProfile).name = name;
    if ("worldId" in data) data.worldId = ids.get(data.worldId!)!;
    if ("bookId" in data && data.bookId) data.bookId = ids.get(data.bookId) ?? null;
    if ("entityIds" in data) data.entityIds = (data.entityIds ?? []).flatMap((id) => ids.has(id) ? [ids.get(id)!] : []);
    if ("memberIds" in data) data.memberIds = data.memberIds.flatMap((id) => ids.has(id) ? [ids.get(id)!] : []);
    if ("focusIds" in data) data.focusIds = (data.focusIds ?? []).flatMap((id) => ids.has(id) ? [ids.get(id)!] : []);
    data.createdAt = Date.now();
    if ("updatedAt" in data) data.updatedAt = data.createdAt;
    return { kind: r.kind, id: data.id, data };
  });
}

// Deleting organizational metadata never deletes or rewrites lore.
export async function removeWorld(worldId: string, repo: DeepRoleRepository = repository) {
  await repo.updateRecords((all) => {
    const books = all.filter((r) => r.kind === "book").map((r) => r.data as MemoryBook);
    const removed = all.filter((r) => r.kind === "world" ? r.id === worldId : ["entity","template", "proposal", "change"].includes(r.kind) && "worldId" in r.data && r.data.worldId === worldId);
    const changed = all.filter((r) => !removed.includes(r) && (r.kind === "entry" ? memoryWorld(r.data as MemoryEntry, books) === worldId : "worldId" in r.data && r.data.worldId === worldId)).map((r) => ({ ...r, data: { ...(r.data as MemoryBook | MemoryEntry | ChatBinding | HandoffSnapshot), worldId: null, entityIds: [], focusIds: [], updatedAt: Date.now() } }));
    for (const r of all.filter(r => r.kind === "binding")) {
      const binding = r.data as ChatBinding;
      if (!binding.characterScenes?.[worldId] && !binding.portraitLayouts?.[worldId]) continue;
      const target = changed.find(c => c.id === r.id) ?? { ...r, data: { ...binding } };
      const scenes = { ...binding.characterScenes }; delete scenes[worldId];
      (target.data as ChatBinding).characterScenes = scenes;
      const layouts = { ...binding.portraitLayouts }; delete layouts[worldId];
      (target.data as ChatBinding).portraitLayouts = layouts;
      if (!changed.some(c => c.id === r.id)) changed.push(target as typeof changed[number]);
    }
    return { records: changed, removed, result: undefined };
  });
}

export async function removeEntity(id: string, repo: DeepRoleRepository = repository) {
  await repo.updateRecords((all) => {
    const changed = all.filter((r) => r.id !== id).flatMap((r): DataRecord[] => {
      const data = { ...r.data };
      let dirty = false;
      if (r.kind === "binding") {
        const binding = data as ChatBinding;
        if (binding.characterScenes) {
          binding.characterScenes = structuredClone(binding.characterScenes);
          for (const scene of Object.values(binding.characterScenes)) {
            if (scene.partnerId === id) { scene.partnerId = null; dirty = true; }
            if (scene.partnerIds?.includes(id)) { scene.partnerIds = scene.partnerIds.filter(partner => partner !== id); scene.partnerId = scene.partnerIds[0] ?? null; dirty = true; }
            if (scene.states[id] || scene.presentIds.includes(id)) { delete scene.states[id]; scene.presentIds = scene.presentIds.filter(v => v !== id); scene.revision = createId("rev"); delete scene.lastReply; dirty = true; }
          }
        }
        if (binding.portraitLayouts) {
          binding.portraitLayouts = structuredClone(binding.portraitLayouts);
          for (const layout of Object.values(binding.portraitLayouts)) if (layout.positions[id]) { delete layout.positions[id]; dirty = true; }
        }
      }
      if ("entityIds" in data && data.entityIds?.includes(id)) { data.entityIds = data.entityIds.filter((v) => v !== id); dirty = true; }
      if ("focusIds" in data && data.focusIds?.includes(id)) { data.focusIds = data.focusIds.filter((v) => v !== id); dirty = true; }
      if ("memberIds" in data && data.memberIds.includes(id)) { data.memberIds = data.memberIds.filter((v) => v !== id); dirty = true; }
      return dirty ? [{ ...r, data }] : [];
    });
    return { records: changed, removed: [{ kind: "entity", id }], result: undefined };
  });
}

export async function duplicateEntity(entity: SceneEntity, name: string, repo: DeepRoleRepository = repository) {
  await repo.updateRecords((all) => {
    const current = all.find((r) => r.kind === "entity" && r.id === entity.id)?.data as SceneEntity | undefined;
    if (!current) throw new Error("memory-conflict");
    const now = Date.now();
    const copy = { ...current, id: createId("entity"), name, createdAt: now, updatedAt: now };
    if (copy.characterSheet) copy.characterSheet = { ...copy.characterSheet, protagonist: false };
    const entries = all.filter((r) => r.kind === "entry").map((r) => r.data as MemoryEntry);
    return { records: [{ kind: "entity", id: copy.id, data: copy }, ...entries.filter((e) => e.entityIds?.includes(current.id)).map((e) => ({ kind: "entry" as const, id: e.id, data: { ...e, entityIds: [...e.entityIds!, copy.id], updatedAt: now } }))], removed: [], result: undefined };
  });
}

export async function assignBookWorld(book: MemoryBook, worldId: string | null, repo: DeepRoleRepository = repository) {
  await repo.updateRecords((all) => {
    const current = all.find((r) => r.kind === "book" && r.id === book.id)?.data as MemoryBook | undefined;
    if (!current || worldId && !all.some((r) => r.kind === "world" && r.id === worldId)) throw new Error("memory-conflict");
    const now = Date.now();
    const changed: DataRecord[] = [{ kind: "book", id: current.id, data: { ...current, worldId, updatedAt: now } }];
    for (const r of all) {
      if (r.kind === "entry" && (r.data as MemoryEntry).bookId === book.id) changed.push({ ...r, data: { ...(r.data as MemoryEntry), worldId, entityIds: [], updatedAt: now } });
      if (r.kind === "binding" && "bookId" in r.data && r.data.bookId === book.id) changed.push({ ...r, data: { ...r.data, bookId: null, updatedAt: now } });
    }
    return { records: changed, removed: [], result: undefined };
  });
}

export async function removeBook(id: string, repo: DeepRoleRepository = repository) {
  await repo.updateRecords((all) => {
    const book = all.find((r) => r.kind === "book" && r.id === id)?.data as MemoryBook | undefined;
    if (!book) return { records: [], removed: [], result: undefined };
    const now = Date.now();
    const records = all.flatMap((r): DataRecord[] => {
      if (r.kind === "entry" && (r.data as MemoryEntry).bookId === id) return [{ ...r, data: { ...(r.data as MemoryEntry), bookId: null, worldId: book.worldId ?? null, updatedAt: now } }];
      if (["binding", "snapshot"].includes(r.kind) && "bookId" in r.data && r.data.bookId === id) return [{ ...r, data: { ...r.data, bookId: null } }];
      return [];
    });
    return { records, removed: [{ kind: "book", id }], result: undefined };
  });
}
