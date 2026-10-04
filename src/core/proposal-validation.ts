import type { LoreChange, MemoryEntry, MemoryProposalBatch } from "./types";

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
const optionalId = (value: unknown) => value === null || typeof value === "string";
export function validMemoryEntry(value: unknown): value is MemoryEntry {
  if (!object(value)) return false;
  return typeof value.id === "string" && typeof value.title === "string" && typeof value.content === "string" && strings(value.keywords) && optionalId(value.bookId) && (value.worldId === undefined || optionalId(value.worldId)) && (value.entityIds === undefined || strings(value.entityIds)) && ["always", "smart", "manual"].includes(String(value.activation)) && ["low", "normal", "high"].includes(String(value.priority)) && typeof value.enabled === "boolean" && object(value.source) && Number.isFinite(value.createdAt) && Number.isFinite(value.updatedAt);
}
export function validMemoryProposal(value: unknown): value is MemoryProposalBatch {
  if (!object(value) || typeof value.id !== "string" || !optionalId(value.worldId) || !optionalId(value.bookId) || !optionalId(value.chatId) || !strings(value.focusIds) || !["memory-analysis", "lore-draft"].includes(String(value.requestType)) || !Number.isFinite(value.createdAt) || !Number.isFinite(value.updatedAt) || !Array.isArray(value.items) || value.items.length > 100) return false;
  if (value.scanVersions !== undefined && (!object(value.scanVersions) || Object.keys(value.scanVersions).length > 100 || !Object.entries(value.scanVersions).every(([id, hash]) => id.length > 0 && typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash)))) return false;
  if (value.profileChange !== undefined) {
    const change = value.profileChange;
    if (!object(change) || typeof change.entityId !== "string" || typeof change.name !== "string" || !["beforeDescription", "afterDescription"].every((key) => typeof change[key] === "string" && change[key].length <= 30000) || !["beforeAppearance", "afterAppearance", "beforePersonality", "afterPersonality", "beforeGoals", "afterGoals", "beforeBackground", "afterBackground"].every((key) => typeof change[key] === "string" && change[key].length <= 1200) || !Number.isFinite(change.beforeUpdatedAt) || typeof change.hadCharacterSheet !== "boolean") return false;
  }
  const ids = new Set<string>();
  return value.items.every((item: unknown) => {
    if (!object(item) || typeof item.id !== "string" || ids.has(item.id)) return false;
    ids.add(item.id);
    return typeof item.title === "string" && item.title.length <= 240 && typeof item.content === "string" && item.content.length <= 30000 && strings(item.keywords) && typeof item.selected === "boolean" && optionalId(item.bookId) && (item.worldId ?? null) === value.worldId && (item.entityIds === undefined || strings(item.entityIds)) && ["always", "smart", "manual"].includes(String(item.activation)) && ["low", "normal", "high"].includes(String(item.priority)) && (item.issue === undefined || ["stale", "unknown-target", "ambiguous", "scope"].includes(String(item.issue))) && (item.targetEntryId === undefined || typeof item.targetEntryId === "string") && (item.expectedEntry === undefined || validMemoryEntry(item.expectedEntry) && item.expectedEntry.id === item.targetEntryId);
  });
}
export function validLoreChange(value: unknown): value is LoreChange {
  if (!object(value) || typeof value.id !== "string" || !optionalId(value.worldId) || typeof value.proposalId !== "string" || !Number.isFinite(value.createdAt) || !Number.isFinite(value.updatedAt) || (value.undoneAt !== undefined && !Number.isFinite(value.undoneAt)) || !Array.isArray(value.entries) || value.entries.length > 100 || !value.entries.every((pair: unknown) => object(pair) && validMemoryEntry(pair.after) && (pair.before === null || validMemoryEntry(pair.before) && pair.before.id === pair.after.id)) || new Set(value.entries.map((pair) => pair.after.id)).size !== value.entries.length) return false;
  if (value.profileChange !== undefined) {
    const change = value.profileChange;
    if (!object(change) || typeof change.entityId !== "string" || !["beforeDescription", "afterDescription"].every((key) => typeof change[key] === "string" && change[key].length <= 30000) || !["beforeAppearance", "afterAppearance", "beforePersonality", "afterPersonality", "beforeGoals", "afterGoals", "beforeBackground", "afterBackground"].every((key) => typeof change[key] === "string" && change[key].length <= 1200) || !Number.isFinite(change.beforeUpdatedAt) || !Number.isFinite(change.afterUpdatedAt) || typeof change.hadCharacterSheet !== "boolean") return false;
  }
  return true;
}
