import { normalizeText, tokenize, uniqueTokens } from "./text";
import type { MemoryEntry } from "./types";
import { loreTitleParts } from "./lore-categories";

/** Literal title mentions are suggestions, never inferred lore facts. */
export function suggestEntryLinks(source: Pick<MemoryEntry, "id" | "content" | "links">, candidates: MemoryEntry[]): MemoryEntry[] {
  const text = ` ${normalizeText(source.content)} `;
  const linked = new Set((source.links ?? []).map((link) => link.targetId));
  return candidates.filter((entry) => {
    const title = normalizeText(entry.title);
    return entry.id !== source.id && !linked.has(entry.id) && title.length >= 4 && text.includes(` ${title} `);
  }).slice(0, 20);
}

export interface LoreLinkSuggestion { entry: MemoryEntry; reason: "mention" | "keywords" | "profile"; evidence: string[]; score: number }
/** High precision proposals only. Shared generic prose alone is never a connection. */
export function suggestLoreConnections(source: MemoryEntry, candidates: MemoryEntry[]): LoreLinkSuggestion[] {
  const generic = uniqueTokens("персонаж тело внешность характер сцена день неделя событие правило связь отношения мысли чувства память мир сюжет человек character body scene day week event rule memory world story person relationship");
  const specific = (text: string) => new Set([...uniqueTokens(text.replaceAll("_", " "))].filter((word) => word.length >= 3 && !generic.has(word)));
  const contentTokens = tokenize(loreTitleParts(source.content.slice(0, 20000)).join(" "));
  const sourceKeywords = specific(source.keywords.join(" "));
  const linked = new Set((source.links ?? []).map((link) => link.targetId));
  return candidates.flatMap((entry): LoreLinkSuggestion[] => {
    if (entry.id === source.id || linked.has(entry.id)) return [];
    const title = [...specific(entry.title)];
    const titleTokens = tokenize(loreTitleParts(entry.title).join(" "));
    const literal = title.length >= 1 && titleTokens.length >= 2 && titleTokens.length <= 15 && contentTokens.some((word, index) => word === titleTokens[0] && titleTokens.every((token, offset) => contentTokens[index + offset] === token));
    const shared = [...specific(entry.keywords.join(" "))].filter((word) => sourceKeywords.has(word));
    const profile = (entry.entityIds ?? []).some((id) => source.entityIds?.includes(id));
    if (literal) return [{ entry, reason: "mention", evidence: title.slice(0, 4), score: 20 + title.length }];
    if (shared.length >= 2) return [{ entry, reason: "keywords", evidence: shared.slice(0, 4), score: 12 + shared.length }];
    if (profile && shared.length >= 1) return [{ entry, reason: "profile", evidence: shared, score: 8 }];
    return [];
  }).sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id)).slice(0, 5);
}
