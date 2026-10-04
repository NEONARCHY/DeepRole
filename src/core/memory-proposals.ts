import { createId } from "./id";
import { loreTitleParts } from "./lore-categories";
import { normalizeText } from "./text";
import type { MemoryCandidate, MemoryEntry, MemoryProposalBatch, SceneEntity, ServiceRequest } from "./types";

export async function memoryFingerprint(entry: MemoryEntry): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(entry)));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function characterFactFingerprint(entity: SceneEntity): Promise<string> {
  const data = JSON.stringify([entity.id, entity.updatedAt, entity.description, entity.characterSheet?.appearance ?? "", entity.characterSheet?.personality ?? "", entity.characterSheet?.goals ?? "", entity.characterSheet?.background ?? ""]);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Model output is an untrusted proposal, never a database command. */
export async function prepareMemoryProposals(items: MemoryCandidate[], existing: MemoryEntry[], request: ServiceRequest, profile?: { description: string; appearance: string; personality: string; goals: string; background: string }, character?: SceneEntity): Promise<MemoryProposalBatch> {
  if (request.targetEntityId && !profile) throw new Error("character-fact-profile-missing");
  if (request.targetEntityId && (!character || character.id !== request.targetEntityId || character.worldId !== request.worldId || !request.baseEntityVersion || request.baseEntityVersion !== await characterFactFingerprint(character))) throw new Error("character-fact-stale");
  if (request.targetEntityId && (existing.length !== Object.keys(request.baseVersions ?? {}).length || (await Promise.all(existing.map(async (entry) => request.baseVersions?.[entry.id] === await memoryFingerprint(entry)))).some((same) => !same))) throw new Error("character-fact-stale");
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  const titleKey = (title: string) => normalizeText(loreTitleParts(title).join(" "));
  const prepared: MemoryCandidate[] = [];
  const targets = new Set<string>(); const newTitles = new Set<string>();
  for (const item of items.slice(0, 100)) {
    // A targeted correction may only replace records from the complete scanned
    // world snapshot. It must never create a loose duplicate of an old fact.
    if (request.targetEntityId && (!item.targetEntryId || !byId.has(item.targetEntryId))) throw new Error("character-fact-target");
    const matches = existing.filter((entry) => titleKey(entry.title) === titleKey(item.title));
    const target = item.targetEntryId ? byId.get(item.targetEntryId) : matches.length === 1 ? matches[0] : undefined;
    let issue: MemoryCandidate["issue"];
    if (item.targetEntryId && !target) issue = "unknown-target";
    else if (!item.targetEntryId && matches.length > 1) issue = "ambiguous";
    if (target && !issue && request.type === "memory-analysis") {
      if (!request.baseVersions?.[target.id] || request.baseVersions[target.id] !== await memoryFingerprint(target)) issue = "stale";
    }
    if (target && !issue && target.content.trim() === item.content.trim() && target.title === item.title) continue;
    if (target && targets.has(target.id)) continue;
    if (!target && !issue && newTitles.has(titleKey(item.title))) continue;
    if (target) targets.add(target.id); else newTitles.add(titleKey(item.title));
    prepared.push({ ...item, worldId: request.worldId ?? null, bookId: target?.bookId ?? request.bookId, entityIds: target?.entityIds ?? request.focusIds ?? [], targetEntryId: target?.id ?? item.targetEntryId, expectedEntry: target ? structuredClone(target) : undefined, activation: target?.activation ?? item.activation, priority: target?.priority ?? item.priority, keywords: target?.keywords ?? item.keywords, issue, selected: !issue });
  }
  const now = Date.now();
  const sheet = character?.characterSheet;
  const profileChange = request.targetEntityId && character && profile && (profile.description !== character.description || profile.appearance !== (sheet?.appearance ?? "") || profile.personality !== (sheet?.personality ?? "") || profile.goals !== (sheet?.goals ?? "") || profile.background !== (sheet?.background ?? ""))
    ? { entityId: character.id, name: character.name, beforeDescription: character.description, beforeAppearance: sheet?.appearance ?? "", beforePersonality: sheet?.personality ?? "", beforeGoals: sheet?.goals ?? "", beforeBackground: sheet?.background ?? "", beforeUpdatedAt: character.updatedAt, hadCharacterSheet: !!sheet, afterDescription: profile.description, afterAppearance: profile.appearance, afterPersonality: profile.personality, afterGoals: profile.goals, afterBackground: profile.background }
    : undefined;
  return { id: request.id, worldId: request.worldId ?? null, bookId: request.bookId, focusIds: request.focusIds ?? [], chatId: request.chatId ?? null, requestType: request.type === "lore-draft" ? "lore-draft" : "memory-analysis", items: prepared, ...(request.targetEntityId ? { scanVersions: request.baseVersions ?? {} } : {}), ...(profileChange ? { profileChange } : {}), createdAt: request.createdAt, updatedAt: now };
}

export function newMemoryFromCandidate(candidate: MemoryCandidate, worldId: string | null, chatId: string | null, now: number): MemoryEntry {
  return { id: createId("memory"), worldId, bookId: candidate.bookId, entityIds: candidate.entityIds ?? [], title: candidate.title, content: candidate.content, keywords: candidate.keywords, activation: candidate.activation, priority: candidate.priority, enabled: true, source: { type: "suggestion", chatId: chatId ?? undefined }, createdAt: now, updatedAt: now };
}
