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
  const previous = indexes.get(entry);
  const keywordsUnchanged = previous?.keywords.length === entry.keywords.length
    && previous.keywords.every((keyword, index) => keyword.original === entry.keywords[index]);
  if (previous && previous.title === entry.title && previous.content === entry.content && keywordsUnchanged) return previous;
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
