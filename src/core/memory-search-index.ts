import { loreTitleParts } from "./lore-categories";
import { normalizeText, uniqueTokens } from "./text";
import type { MemoryEntry } from "./types";

type KeywordIndex = { original: string; normalized: string; tokens: ReadonlySet<string> };
export interface MemorySearchIndex {
  title: string;
  content: string;
  keywords: readonly KeywordIndex[];
  titleTokens: ReadonlySet<string>;
  contentTokens: ReadonlySet<string>;
}

// Weak ownership: no persisted private text, ID-global cache, or selection cache.
// A replaced/deleted record can be collected with its index. Scope and policy
// must still be checked by the caller on EVERY query.
const indexes = new WeakMap<MemoryEntry, MemorySearchIndex>();

export function memorySearchIndex(entry: MemoryEntry): MemorySearchIndex {
  return prepareMemorySearchIndex(entry, indexes.get(entry));
}

function prepareMemorySearchIndex(entry: MemoryEntry, previous?: MemorySearchIndex): MemorySearchIndex {
  const keywordsUnchanged = previous?.keywords.length === entry.keywords.length
    && previous.keywords.every((keyword, index) => keyword.original === entry.keywords[index]);
  if (previous && previous.title === entry.title && previous.content === entry.content && keywordsUnchanged) { indexes.set(entry, previous); return previous; }
  const index: MemorySearchIndex = {
    title: entry.title,
    content: entry.content,
    titleTokens: previous?.title === entry.title ? previous.titleTokens : uniqueTokens(loreTitleParts(entry.title).join(" ")),
    contentTokens: previous?.content === entry.content ? previous.contentTokens : uniqueTokens(entry.content),
    keywords: keywordsUnchanged ? previous!.keywords : entry.keywords.map(original => ({ original, normalized: normalizeText(original), tokens: uniqueTokens(original) })),
  };
  indexes.set(entry, index);
  return index;
}

/** One live compiler owns these pure lexical views across storage clones.
 * Reconcile the COMPLETE current scoped set; no selection/policy is retained. */
export class MemorySearchIndexOwner {
  private rows = new Map<string, MemorySearchIndex>();
  private titleOwner = {};
  /** Weak aggregate-cache key, replaced on clear so private title snapshots
   * are released as well. The workspace still verifies exact membership. */
  get titleCacheOwner() { return this.titleOwner; }
  prepare(entries: MemoryEntry[]) {
    const next = new Map<string, MemorySearchIndex>();
    let built = 0, reused = 0;
    for (const entry of entries) {
      const key = JSON.stringify([entry.worldId ?? null, entry.id]);
      const previous = this.rows.get(key), index = prepareMemorySearchIndex(entry, previous);
      if (index === previous) reused++; else built++;
      next.set(key, index);
    }
    const removed = [...this.rows.keys()].filter(key => !next.has(key)).length;
    this.rows = next;
    return { built, reused, removed, size: next.size };
  }
  clear() { this.rows.clear(); this.titleOwner = {}; }
  get size() { return this.rows.size; }
}
