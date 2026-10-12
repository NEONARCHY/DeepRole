import { createId } from "../core/id";
import { normalizeActionRecord } from "../core/action-compat";
import { hasInternalPhotoAddresses } from "../core/photo-assets";
import { validDataRecord } from "../core/record-validation";
import { memoryWorld } from "../core/scene";
import type { DataRecord, MemoryBook, MemoryEntry, SceneEntity, ChatBinding, HandoffSnapshot, WorldProfile } from "../core/types";
import { repository, type DeepRoleRepository } from "./repository";
import { actionsFor } from "../core/characters";
import { getSettings } from "./settings";
import { importFileTooLarge } from "../core/import-limits";
import type { Illustration } from "../core/image-generation";
import { validPortablePhotos, type PortablePhoto } from "../core/portable-photos";
import { worldGamePeople } from "../core/world-game";

export interface WorldPackage { format: "deeprole-world"; version: 1 | 2; photos?: PortablePhoto[]; records: DataRecord[] }

export async function exportWorld(worldId: string, repo: DeepRoleRepository = repository): Promise<WorldPackage> { return createWorldContent(worldId,repo,true); }
export async function createWorldContent(worldId: string, repo: DeepRoleRepository = repository, expandPhotos = true): Promise<WorldPackage> {
  const all = await repo.rawRecords();
  const books = all.filter((r) => r.kind === "book").map((r) => r.data as MemoryBook);
  const liveWorld = all.find(r => r.kind === "world" && r.id === worldId)?.data as WorldProfile | undefined;
  const roster = worldGamePeople(all.filter(r => r.kind === "entity" && (r.data as SceneEntity).worldId === worldId).map(r => r.data as SceneEntity), liveWorld, all.filter(r => r.kind === "story").map(r => r.data as import("../core/story-records").StoryRecord));
  const people = new Map(roster.map(p => [p.id,p])), merged = new Map(Object.values(liveWorld?.sharedGame?.mergeSeeds ?? {}).flatMap(m => m.sourceIds.map(id => [id,m.mergedId] as const)));
  const remap = (ids: string[]) => [...new Set(ids.map(id => merged.get(id) ?? id))];
  const selected = all.filter((r) => r.kind === "world" ? r.id === worldId : r.kind === "entry" ? memoryWorld(r.data as MemoryEntry, books) === worldId : ["book", "entity", "template", "illustration"].includes(r.kind) && "worldId" in r.data && r.data.worldId === worldId && (r.kind !== "entity" || people.has(r.id))).map(r => r.kind === "entity" ? { ...r, data: people.get(r.id)! } : r);
  const records = expandPhotos ? await repo.portableRecords(selected) : structuredClone(selected);
  for (const r of records) { if ("entityIds" in r.data && r.data.entityIds) r.data.entityIds = remap(r.data.entityIds); if ("memberIds" in r.data) r.data.memberIds = remap(r.data.memberIds); if ("focusIds" in r.data && r.data.focusIds) r.data.focusIds = remap(r.data.focusIds); if (r.kind === "illustration" && (r.data as Illustration).entityId) (r.data as Illustration).entityId = merged.get((r.data as Illustration).entityId!) ?? (r.data as Illustration).entityId; }
  // An explicit world export is a reusable canon package, not a live playthrough.
  // Full backups retain this origin; a portable world must work in a new chat.
  for (const row of records) if (row.kind === "entity") delete (row.data as SceneEntity).playthroughChatId;
  for (const row of records) if (row.kind === "world") { delete (row.data as WorldProfile).sharedGame; delete (row.data as WorldProfile).sharedGameArchives; }
  if (!records.some((r) => r.kind === "world")) throw new Error("invalidBackup");
  const entryIds = new Set(records.filter((r) => r.kind === "entry").map((r) => r.id));
  const world = records.find(r => r.kind === "world")!.data as WorldProfile;
  const actions = actionsFor(world.characterActions ?? (await getSettings()).characterActions);
  return { format: "deeprole-world", version: 1, records: records.map((r) => r.kind === "world" ? { ...r, data: { ...r.data, characterActions: [...actions] } } : r.kind === "entry" ? { ...r, data: { ...r.data, worldId, links: (r.data as MemoryEntry).links?.filter((link) => entryIds.has(link.targetId) && link.targetId !== r.id) } } : r) };
}

export function parseWorldPackage(text: string): WorldPackage {
  const bytes = new Blob([text]).size;
  if (importFileTooLarge(bytes, "world")) throw new Error("worldTooLarge");
  return parseWorldPackageData(JSON.parse(text.replace(/^\uFEFF/, "")), bytes);
}

/** The file picker already parsed the format once; validate it without reparsing large image JSON. */
export function parseWorldPackageData(input: unknown, bytes: number): WorldPackage {
  if (importFileTooLarge(bytes, "world")) throw new Error("worldTooLarge");
  const raw = input as WorldPackage;
  const value = raw && Array.isArray(raw.records) ? { ...raw, records: raw.records.map(normalizeActionRecord) } : raw;
  if (value?.format !== "deeprole-world" || ![1,2].includes(value.version) || !Array.isArray(value.records)) throw new Error("invalidBackup");
  if (value.version === 2 && !validPortablePhotos(value.photos,value.records) || value.version === 1 && value.photos !== undefined) throw Error("invalidBackup");
  if (value.records.some((r) => !validDataRecord(r) || value.version !== 2 && hasInternalPhotoAddresses(r.kind, r.data))) throw new Error("invalidBackup");
  const worldRecords = value.records.filter((r) => r.kind === "world");
  if (worldRecords.length !== 1) throw new Error("invalidBackup");
  const worldId = worldRecords[0]!.id;
  const ids = new Set<string>();
  for (const r of value.records) {
    if (!r || typeof r.id !== "string" || !r.id || ids.has(r.id) || !r.data || r.data.id !== r.id) throw new Error("invalidBackup");
    ids.add(r.id);
    const d = r.data as unknown as Record<string, unknown>;
    if (!["world", "book", "entry", "entity", "template", "illustration"].includes(r.kind)) throw new Error("invalidBackup");
    if (r.kind !== "world" && d.worldId !== worldId) throw new Error("invalidBackup");
  }
  const byId = new Map(value.records.map((r) => [r.id, r.kind]));
  for (const r of value.records) {
    const d = r.data;
    if (r.kind === "illustration" && (d as Illustration).entityId && byId.get((d as Illustration).entityId!) !== "entity") throw new Error("invalidBackup");
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
    if (r.kind === "world") (data as WorldProfile).autoPrepareCharacters = false;
    if (r.kind === "world") { (data as WorldProfile).storyMemoryBatch && ((data as WorldProfile).storyMemoryBatch = { ...(data as WorldProfile).storyMemoryBatch!, mode: "paused", revision: createId("memory-imported") }); delete (data as WorldProfile).sharedGame; delete (data as WorldProfile).sharedGameArchives; }
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
    if (r.kind === "illustration") {
      const image = data as Illustration;
      if (image.entityId) image.entityId = ids.get(image.entityId);
      if (image.request) {
        const input = image.request.input; input.worldId = image.worldId;
        if (input.entityId) input.entityId = ids.get(input.entityId);
        if (input.entityIds) input.entityIds = input.entityIds.map(id => ids.get(id) ?? id);
        if (input.references) input.references = input.references.map(r => ({ ...r, entityId: ids.get(r.entityId) ?? r.entityId }));
        if (input.referenceChoices) input.referenceChoices = input.referenceChoices.map(r => ({ ...r, entityId: ids.get(r.entityId) ?? r.entityId }));
      }
    }
    if ("bookId" in data && data.bookId) data.bookId = ids.get(data.bookId) ?? null;
    if ("entityIds" in data) data.entityIds = (data.entityIds ?? []).flatMap((id) => ids.has(id) ? [ids.get(id)!] : []);
    if ("memberIds" in data) data.memberIds = data.memberIds.flatMap((id) => ids.has(id) ? [ids.get(id)!] : []);
    if ("focusIds" in data) data.focusIds = (data.focusIds ?? []).flatMap((id) => ids.has(id) ? [ids.get(id)!] : []);
    data.createdAt = Date.now();
    if ("updatedAt" in data) data.updatedAt = data.createdAt;
    return { kind: r.kind, id: data.id, data };
  });
}

// Default: remove the organization, retain lore. Explicit deleteLore purges its scope.
export async function removeWorld(worldId: string, repo: DeepRoleRepository = repository, options: { deleteLore?: boolean } = {}) {
  await repo.updateRecords((all) => {
    const books = all.filter((r) => r.kind === "book").map((r) => r.data as MemoryBook);
    if(options.deleteLore && !all.some(r => r.kind === "world" && r.id === worldId)) throw new Error("memory-conflict");
    const bookIds = new Set(books.filter(b => b.worldId === worldId).map(b => b.id));
    const removed = all.filter((r) => r.kind === "world" ? r.id === worldId : options.deleteLore && r.kind !== "binding"
      ? r.kind === "entry" ? memoryWorld(r.data as MemoryEntry,books) === worldId
        : "worldId" in r.data && r.data.worldId === worldId || "bookId" in r.data && !!r.data.bookId && bookIds.has(r.data.bookId)
      : ["entity","template", "proposal", "change", "illustration", "cast"].includes(r.kind) && "worldId" in r.data && r.data.worldId === worldId);
    const changed: DataRecord[] = all.filter((r) => !removed.includes(r) && (r.kind === "entry" ? memoryWorld(r.data as MemoryEntry, books) === worldId : "worldId" in r.data && r.data.worldId === worldId)).map((r) => r.kind === "story" || r.kind === "service" || r.kind === "dispatch"
      // Detach the immutable historical scope; never erase historical participants.
      ? { ...r, data: { ...(r.data as import("../core/story-records").StoryRecord | import("../core/service-operations").ServiceOperation | import("../core/story-dispatch-capture").StoryDispatchCapture), worldId: null, updatedAt: Math.max((r.data as { updatedAt: number }).updatedAt, Date.now()) } }
      : { ...r, data: { ...(r.data as MemoryBook | MemoryEntry | ChatBinding | HandoffSnapshot), worldId: null, entityIds: [], focusIds: [], updatedAt: Date.now() } });
    for (const r of all.filter(r => r.kind === "binding")) {
      const binding = r.data as ChatBinding;
      if (!binding.characterScenes?.[worldId] && !binding.portraitLayouts?.[worldId] && !binding.illustrationAttempts?.some(a => a.worldId === worldId) && !binding.scenePhotos?.some(p => p.worldId === worldId)) continue;
      const target = changed.find(c => c.id === r.id) ?? { ...r, data: { ...binding } };
      const scenes = { ...binding.characterScenes }; delete scenes[worldId];
      (target.data as ChatBinding).characterScenes = scenes;
      const layouts = { ...binding.portraitLayouts }; delete layouts[worldId];
      (target.data as ChatBinding).portraitLayouts = layouts;
      if (binding.illustrationAttempts) (target.data as ChatBinding).illustrationAttempts = binding.illustrationAttempts.filter(a => a.worldId !== worldId);
      if (binding.scenePhotos) (target.data as ChatBinding).scenePhotos = binding.scenePhotos.filter(p => p.worldId !== worldId);
      if (!changed.some(c => c.id === r.id)) changed.push(target as typeof changed[number]);
    }
    if(options.deleteLore) {
      const entryIds = new Set(removed.filter(r=>r.kind==='entry').map(r=>r.id));
      const entityIds = new Set(removed.filter(r=>r.kind==='entity').map(r=>r.id));
      const snapshotIds = new Set(removed.filter(r=>r.kind==='snapshot').map(r=>r.id));
      for(const record of all.filter(r=>!removed.includes(r))) {
        const target = changed.find(r=>r.kind===record.kind && r.id===record.id) ?? { ...record, data: { ...record.data } };
        let dirty = changed.includes(target);
        if(record.kind==='entry') {
          const e=target.data as MemoryEntry;
          if(e.links?.some(l=>entryIds.has(l.targetId))) { e.links=e.links.filter(l=>!entryIds.has(l.targetId));dirty=true; }
          if(e.entityIds?.some(id=>entityIds.has(id))) { e.entityIds=e.entityIds.filter(id=>!entityIds.has(id));dirty=true; }
        }
        if(record.kind==='binding') {
          const b=target.data as ChatBinding;
          if(b.bookId && bookIds.has(b.bookId)) { b.bookId=null;dirty=true; }
          if(b.focusIds?.some(id=>entityIds.has(id))) { b.focusIds=b.focusIds.filter(id=>!entityIds.has(id));dirty=true; }
          if(b.continuationSnapshotId && snapshotIds.has(b.continuationSnapshotId)) { delete b.continuationSnapshotId;dirty=true; }
          if(b.memoryOverrides) {
            const ids=[...b.memoryOverrides.includedIds,...b.memoryOverrides.excludedIds];
            if(ids.some(id=>entryIds.has(id))) { b.memoryOverrides={includedIds:b.memoryOverrides.includedIds.filter(id=>!entryIds.has(id)),excludedIds:b.memoryOverrides.excludedIds.filter(id=>!entryIds.has(id))};dirty=true; }
          }
        }
        if(dirty) { if('updatedAt' in target.data) target.data.updatedAt=Date.now(); if(!changed.includes(target)) changed.push(target); }
      }
    }
    return { records: changed, removed, result: undefined, deleteOrphanedPhotos:options.deleteLore === true };
  });
}

export async function removeEntity(id: string, repo: DeepRoleRepository = repository) {
  await repo.updateRecords((all) => {
    const changed = all.filter((r) => r.id !== id).flatMap((r): DataRecord[] => {
      const data = { ...r.data };
      let dirty = false;
      if (r.kind === "illustration" && (data as Illustration).entityId === id) { delete (data as Illustration).entityId; dirty = true; }
      if (r.kind === "binding") {
        const binding = data as ChatBinding;
        if (binding.characterScenes) {
          binding.characterScenes = structuredClone(binding.characterScenes);
          for (const scene of Object.values(binding.characterScenes)) {
            if (scene.portraitCycles?.[id]) { delete scene.portraitCycles[id]; dirty = true; }
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
