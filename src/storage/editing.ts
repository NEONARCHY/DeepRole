import { validDataRecord } from "../core/record-validation";
import { memoryWorld } from "../core/scene";
import type { MemoryBook, MemoryEntry, StoryTemplate } from "../core/types";
import { repository, MemoryConflictError, type DeepRoleRepository } from "./repository";

/** An open editor keeps its original version and cannot save into deleted parents. */
export async function saveEditorRecord(kind: "book" | "entry" | "template", value: MemoryBook | MemoryEntry | StoryTemplate, expected: MemoryBook | MemoryEntry | StoryTemplate | null, repo: DeepRoleRepository = repository) {
  if (!validDataRecord({ kind, id: value.id, data: value })) throw new Error("invalid-record");
  await repo.updateRecords((all) => {
    const current = all.find((r) => r.kind === kind && r.id === value.id)?.data ?? null;
    if (JSON.stringify(current) !== JSON.stringify(expected)) throw new MemoryConflictError();
    const worldId = value.worldId ?? null;
    if (worldId && !all.some((r) => r.kind === "world" && r.id === worldId)) throw new MemoryConflictError();
    const validEntity = (id: string) => all.some((r) => r.kind === "entity" && r.id === id && "worldId" in r.data && r.data.worldId === worldId);
    if (kind === "template" && !(value as StoryTemplate).focusIds.every(validEntity)) throw new MemoryConflictError();
    if (kind === "entry") {
      const entry = value as MemoryEntry;
      const books = all.filter((r) => r.kind === "book").map((r) => r.data as MemoryBook);
      if (entry.bookId && !books.some((b) => b.id === entry.bookId && (b.worldId ?? null) === worldId)) throw new MemoryConflictError();
      if (!(entry.entityIds ?? []).every(validEntity)) throw new MemoryConflictError();
      for (const link of entry.links ?? []) {
        const target = all.find((r) => r.kind === "entry" && r.id === link.targetId)?.data as MemoryEntry | undefined;
        // Older entries can have references to deleted records. Preserve them,
        // but never create new dangling or cross-world relationships.
        const prior = (expected as MemoryEntry | null)?.links?.some((old) => old.targetId === link.targetId);
        if (!target && !prior || target && memoryWorld(target, books) !== worldId) throw new MemoryConflictError();
      }
    }
    return { records: [{ kind, id: value.id, data: value }], removed: [], result: undefined };
  });
}
