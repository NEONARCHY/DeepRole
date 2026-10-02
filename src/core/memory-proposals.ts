import { createId } from "./id";
import { loreTitleParts } from "./lore-categories";
import { normalizeText } from "./text";
import type { MemoryCandidate, MemoryEntry, MemoryProposalBatch, ServiceRequest } from "./types";

export async function memoryFingerprint(entry: MemoryEntry): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(entry)));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Model output is an untrusted proposal, never a database command. */
export async function prepareMemoryProposals(items: MemoryCandidate[], existing: MemoryEntry[], request: ServiceRequest): Promise<MemoryProposalBatch> {
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  const titleKey = (title: string) => normalizeText(loreTitleParts(title).join(" "));
  const prepared: MemoryCandidate[] = [];
  const targets = new Set<string>(); const newTitles = new Set<string>();
  for (const item of items.slice(0, 100)) {
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
  return { id: request.id, worldId: request.worldId ?? null, bookId: request.bookId, focusIds: request.focusIds ?? [], chatId: request.chatId ?? null, requestType: request.type === "lore-draft" ? "lore-draft" : "memory-analysis", items: prepared, createdAt: request.createdAt, updatedAt: now };
}

export function newMemoryFromCandidate(candidate: MemoryCandidate, worldId: string | null, chatId: string | null, now: number): MemoryEntry {
  return { id: createId("memory"), worldId, bookId: candidate.bookId, entityIds: candidate.entityIds ?? [], title: candidate.title, content: candidate.content, keywords: candidate.keywords, activation: candidate.activation, priority: candidate.priority, enabled: true, source: { type: "suggestion", chatId: chatId ?? undefined }, createdAt: now, updatedAt: now };
}
