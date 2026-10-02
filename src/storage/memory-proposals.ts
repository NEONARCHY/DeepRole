import { createId } from "../core/id";
import { newMemoryFromCandidate } from "../core/memory-proposals";
import { memoryWorld } from "../core/scene";
import { normalizeText } from "../core/text";
import type { DataRecord, LoreChange, MemoryBook, MemoryCandidate, MemoryEntry, MemoryProposalBatch, SceneEntity, WorldProfile } from "../core/types";
import { repository, MemoryConflictError, type DeepRoleRepository } from "./repository";

export async function applyMemoryProposals(batchId: string, choices: MemoryCandidate[], repo: DeepRoleRepository = repository): Promise<LoreChange | null> {
  const batch = await repo.get<MemoryProposalBatch>("proposal", batchId); if (!batch) throw new MemoryConflictError();
  const [books, library, entities] = await Promise.all([repo.list<MemoryBook>("book"), repo.list<MemoryEntry>("entry"), repo.list<SceneEntity>("entity")]);
  const world = batch.worldId ? await repo.get<WorldProfile>("world", batch.worldId) : null;
  if (batch.worldId && !world) throw new MemoryConflictError();
  const now = Date.now(); const pairs: LoreChange["entries"] = [];
  const expected: { kind: DataRecord["kind"]; id: string; data: DataRecord["data"] | null }[] = [{ kind: "proposal", id: batch.id, data: batch }];
  if (world) expected.push({ kind: "world", id: world.id, data: world });
  const seen = new Set<string>();
  for (const choice of choices.filter((item) => item.selected)) {
    const original = batch.items.find((item) => item.id === choice.id);
    if (!original || choice.issue || !choice.title.trim() || !choice.content.trim() || choice.content.length > 30000 || choice.title.length > 240) throw new MemoryConflictError();
    // A UI can turn a proposal into a new entry, but cannot redirect it to another record.
    if (choice.targetEntryId && choice.targetEntryId !== original.targetEntryId) throw new MemoryConflictError();
    if (choice.bookId) {
      const book = books.find((item) => item.id === choice.bookId);
      if (!book || (book.worldId ?? null) !== batch.worldId) throw new MemoryConflictError();
      if (!expected.some((r) => r.kind === "book" && r.id === book.id)) expected.push({ kind: "book", id: book.id, data: book });
    }
    if (!("always smart manual".split(" ").includes(choice.activation)) || !["low", "normal", "high"].includes(choice.priority)) throw new MemoryConflictError();
    if ((choice.entityIds ?? []).some((id) => !entities.some((entity) => entity.id === id && entity.worldId === batch.worldId))) throw new MemoryConflictError();
    for (const id of choice.entityIds ?? []) {
      const entity = entities.find((entity) => entity.id === id)!;
      if (!expected.some((r) => r.kind === "entity" && r.id === id)) expected.push({ kind: "entity", id, data: entity });
    }
    if (choice.targetEntryId) {
      const before = original.expectedEntry;
      if (!before || original.issue || memoryWorld(before, books) !== batch.worldId || seen.has(before.id)) throw new MemoryConflictError();
      const after = { ...before, title: choice.title, content: choice.content, updatedAt: now };
      // An update preserves activation, keywords, source provenance, category and relationships.
      pairs.push({ before, after }); expected.push({ kind: "entry", id: before.id, data: before }); seen.add(before.id);
    } else {
      const key = normalizeText(choice.title);
      if (library.some((entry) => memoryWorld(entry, books) === batch.worldId && normalizeText(entry.title) === key) || pairs.some(({ after }) => normalizeText(after.title) === key)) throw new MemoryConflictError();
      const after = newMemoryFromCandidate(choice, batch.worldId, batch.chatId, now);
      pairs.push({ before: null, after }); expected.push({ kind: "entry", id: after.id, data: null });
    }
  }
  const change: LoreChange | null = pairs.length ? { id: createId("change"), worldId: batch.worldId, proposalId: batch.id, entries: pairs, createdAt: now, updatedAt: now } : null;
  const creates = pairs.some((pair) => !pair.before);
  // Prevent two simultaneously approved batches from creating the same title.
  if (creates) for (const entry of library.filter((entry) => memoryWorld(entry, books) === batch.worldId)) {
    if (!expected.some((record) => record.kind === "entry" && record.id === entry.id)) expected.push({ kind: "entry", id: entry.id, data: entry });
  }
  await repo.commitChecked([
    ...pairs.map(({ after }) => ({ kind: "entry" as const, id: after.id, data: after })),
    ...(change ? [{ kind: "change" as const, id: change.id, data: change }] : []),
  ], [{ kind: "proposal", id: batch.id }], expected, creates ? { kind: "entry", ids: library.map((entry) => entry.id) } : undefined);
  return change;
}

export async function undoLoreChange(id: string, repo: DeepRoleRepository = repository): Promise<void> {
  const change = await repo.get<LoreChange>("change", id);
  if (!change || change.undoneAt) throw new MemoryConflictError();
  const world = change.worldId ? await repo.get<WorldProfile>("world", change.worldId) : null;
  if (change.worldId && !world) throw new MemoryConflictError();
  const now = Date.now();
  await repo.commitChecked([
    ...change.entries.flatMap(({ before }) => before ? [{ kind: "entry" as const, id: before.id, data: before }] : []),
    { kind: "change", id, data: { ...change, undoneAt: now, updatedAt: now } },
  ], change.entries.filter(({ before }) => !before).map(({ after }) => ({ kind: "entry", id: after.id })), [
    { kind: "change", id, data: change },
    ...change.entries.map(({ after }) => ({ kind: "entry" as const, id: after.id, data: after })),
    ...(world ? [{ kind: "world" as const, id: world.id, data: world }] : []),
  ]);
}

export async function discardMemoryProposals(id: string, repo: DeepRoleRepository = repository) { await repo.delete("proposal", id); }
