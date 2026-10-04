import { createId } from "../core/id";
import { memoryFingerprint, newMemoryFromCandidate } from "../core/memory-proposals";
import { memoryWorld } from "../core/scene";
import { normalizeText } from "../core/text";
import { EMPTY_CHARACTER } from "../core/characters";
import type { DataRecord, LoreChange, MemoryBook, MemoryCandidate, MemoryEntry, MemoryProposalBatch, SceneEntity, WorldProfile } from "../core/types";
import { repository, MemoryConflictError, type DeepRoleRepository } from "./repository";

export async function applyMemoryProposals(batchId: string, choices: MemoryCandidate[], repo: DeepRoleRepository = repository, profileChoice?: { description: string; appearance: string; personality: string; goals: string; background: string }): Promise<LoreChange | null> {
  const batch = await repo.get<MemoryProposalBatch>("proposal", batchId); if (!batch) throw new MemoryConflictError();
  const [books, library, entities] = await Promise.all([repo.list<MemoryBook>("book"), repo.list<MemoryEntry>("entry"), repo.list<SceneEntity>("entity")]);
  const world = batch.worldId ? await repo.get<WorldProfile>("world", batch.worldId) : null;
  if (batch.worldId && !world) throw new MemoryConflictError();
  const now = Date.now(); const pairs: LoreChange["entries"] = [];
  const expected: { kind: DataRecord["kind"]; id: string; data: DataRecord["data"] | null }[] = [{ kind: "proposal", id: batch.id, data: batch }];
  if (world) expected.push({ kind: "world", id: world.id, data: world });
  if (batch.scanVersions) {
    const scoped = library.filter((entry) => memoryWorld(entry, books) === batch.worldId);
    if (scoped.length !== Object.keys(batch.scanVersions).length) throw new MemoryConflictError();
    for (const entry of scoped) {
      if (batch.scanVersions[entry.id] !== await memoryFingerprint(entry)) throw new MemoryConflictError();
      expected.push({ kind: "entry", id: entry.id, data: entry });
    }
  }
  const profileSelected = profileChoice !== undefined;
  if (profileSelected && (!batch.profileChange || typeof profileChoice.description !== "string" || profileChoice.description.length > 30000 || !(["appearance", "personality", "goals", "background"] as const).every((key) => typeof profileChoice[key] === "string" && profileChoice[key].length <= 1200))) throw new MemoryConflictError();
  const profile = batch.profileChange;
  const entity = profileSelected && profile ? entities.find((item) => item.id === profile.entityId && item.kind === "character" && item.worldId === batch.worldId) : undefined;
  if (profileSelected && (!entity || entity.updatedAt !== profile!.beforeUpdatedAt || entity.description !== profile!.beforeDescription || !!entity.characterSheet !== profile!.hadCharacterSheet || (["appearance", "personality", "goals", "background"] as const).some((key) => (entity.characterSheet?.[key] ?? "") !== profile![`before${key[0]!.toUpperCase()}${key.slice(1)}` as "beforeAppearance"]))) throw new MemoryConflictError();
  const changedEntity = entity && profileChoice ? { ...entity, description: profileChoice.description, characterSheet: { ...(entity.characterSheet ?? EMPTY_CHARACTER), appearance: profileChoice.appearance, personality: profileChoice.personality, goals: profileChoice.goals, background: profileChoice.background }, updatedAt: Math.max(now, entity.updatedAt + 1) } : undefined;
  if (entity) expected.push({ kind: "entity", id: entity.id, data: entity });
  const seen = new Set<string>();
  for (const choice of choices.filter((item) => item.selected)) {
    const original = batch.items.find((item) => item.id === choice.id);
    if (!original || choice.issue || !choice.title.trim() || !choice.content.trim() || choice.content.length > 30000 || choice.title.length > 240) throw new MemoryConflictError();
    // A UI can turn a proposal into a new entry, but cannot redirect it to another record.
    if (choice.targetEntryId && choice.targetEntryId !== original.targetEntryId) throw new MemoryConflictError();
    if (batch.scanVersions && (!choice.targetEntryId || choice.targetEntryId !== original.targetEntryId)) throw new MemoryConflictError();
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
      pairs.push({ before, after }); if (!expected.some((record) => record.kind === "entry" && record.id === before.id)) expected.push({ kind: "entry", id: before.id, data: before }); seen.add(before.id);
    } else {
      const key = normalizeText(choice.title);
      if (library.some((entry) => memoryWorld(entry, books) === batch.worldId && normalizeText(entry.title) === key) || pairs.some(({ after }) => normalizeText(after.title) === key)) throw new MemoryConflictError();
      const after = newMemoryFromCandidate(choice, batch.worldId, batch.chatId, now);
      pairs.push({ before: null, after }); expected.push({ kind: "entry", id: after.id, data: null });
    }
  }
  const profileChange: LoreChange["profileChange"] | undefined = changedEntity && profile ? { entityId: changedEntity.id, beforeDescription: profile.beforeDescription, beforeAppearance: profile.beforeAppearance, beforePersonality: profile.beforePersonality, beforeGoals: profile.beforeGoals, beforeBackground: profile.beforeBackground, beforeUpdatedAt: profile.beforeUpdatedAt, hadCharacterSheet: profile.hadCharacterSheet, afterDescription: changedEntity.description, afterAppearance: changedEntity.characterSheet.appearance, afterPersonality: changedEntity.characterSheet.personality, afterGoals: changedEntity.characterSheet.goals, afterBackground: changedEntity.characterSheet.background, afterUpdatedAt: changedEntity.updatedAt } : undefined;
  const change: LoreChange | null = pairs.length || profileChange ? { id: createId("change"), worldId: batch.worldId, proposalId: batch.id, entries: pairs, ...(profileChange ? { profileChange } : {}), createdAt: now, updatedAt: now } : null;
  const creates = pairs.some((pair) => !pair.before);
  // Prevent two simultaneously approved batches from creating the same title.
  if (creates) for (const entry of library.filter((entry) => memoryWorld(entry, books) === batch.worldId)) {
    if (!expected.some((record) => record.kind === "entry" && record.id === entry.id)) expected.push({ kind: "entry", id: entry.id, data: entry });
  }
  await repo.commitChecked([
    ...pairs.map(({ after }) => ({ kind: "entry" as const, id: after.id, data: after })),
    ...(changedEntity ? [{ kind: "entity" as const, id: changedEntity.id, data: changedEntity }] : []),
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
  const profile = change.profileChange;
  const entity = profile ? await repo.get<SceneEntity>("entity", profile.entityId) : null;
  if (profile && (!entity || entity.worldId !== change.worldId || entity.updatedAt !== profile.afterUpdatedAt || entity.description !== profile.afterDescription || !entity.characterSheet || entity.characterSheet.appearance !== profile.afterAppearance || entity.characterSheet.personality !== profile.afterPersonality || entity.characterSheet.goals !== profile.afterGoals || entity.characterSheet.background !== profile.afterBackground)) throw new MemoryConflictError();
  await repo.commitChecked([
    ...change.entries.flatMap(({ before }) => before ? [{ kind: "entry" as const, id: before.id, data: before }] : []),
    ...(profile && entity ? [{ kind: "entity" as const, id: entity.id, data: { ...entity, description: profile.beforeDescription, characterSheet: profile.hadCharacterSheet ? { ...entity.characterSheet!, appearance: profile.beforeAppearance, personality: profile.beforePersonality, goals: profile.beforeGoals, background: profile.beforeBackground } : undefined, updatedAt: Math.max(now, entity.updatedAt + 1) } }] : []),
    { kind: "change", id, data: { ...change, undoneAt: now, updatedAt: now } },
  ], change.entries.filter(({ before }) => !before).map(({ after }) => ({ kind: "entry", id: after.id })), [
    { kind: "change", id, data: change },
    ...change.entries.map(({ after }) => ({ kind: "entry" as const, id: after.id, data: after })),
    ...(entity ? [{ kind: "entity" as const, id: entity.id, data: entity }] : []),
    ...(world ? [{ kind: "world" as const, id: world.id, data: world }] : []),
  ]);
}

export async function discardMemoryProposals(id: string, repo: DeepRoleRepository = repository) { await repo.delete("proposal", id); }
