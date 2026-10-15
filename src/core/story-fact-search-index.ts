import type { StoryFact } from "./story-update";
import type { MemoryEntry } from "./types";
import { deriveKeywords } from "./text";

type PreparedFact = { text: string; claimKey: string; taskTitle: string; entry: MemoryEntry };
// Query-independent lexical projection only. No branch selections, task status,
// quotes, sources or world-wide ID table are cached here.
const indexes = new WeakMap<StoryFact, PreparedFact>();

/** A ranked result owns fresh source metadata but can retain its source's
 * lexical projection. No strong reference from the index to either fact. */
export function inheritStoryFactSearchEntry(source: StoryFact, copy: StoryFact) {
  const prepared = indexes.get(source);
  if (prepared && prepared.text === copy.text && prepared.claimKey === (copy.claim?.key ?? "") && prepared.taskTitle === (copy.task?.title ?? "")) indexes.set(copy, prepared);
}

export function storyFactSearchEntry(fact: StoryFact): MemoryEntry {
  const text = fact.text, claimKey = fact.claim?.key ?? "", taskTitle = fact.task?.title ?? "";
  const previous = indexes.get(fact);
  if (previous && previous.text === text && previous.claimKey === claimKey && previous.taskTitle === taskTitle) return previous.entry;
  const prepared = prepareFact(text, claimKey, taskTitle);
  indexes.set(fact, prepared);
  return prepared.entry;
}

const prepareFact = (text: string, claimKey: string, taskTitle: string): PreparedFact => ({ text, claimKey, taskTitle,
  entry: { id: "fact-search", bookId: null, title: text.slice(0, 90), content: text, keywords: deriveKeywords(text, claimKey + " " + taskTitle), activation: "smart", priority: "normal", enabled: true, source: { type: "manual" }, createdAt: 0, updatedAt: 0 },
});

/** Exact lexical equality only: identical projections can be shared even by
 * independent facts. Quotes, kind, IDs, source bindings and status NEVER live
 * here; every rank/compaction/render still reads the current supplied facts. */
export class StoryFactSearchIndexOwner {
  private rows = new Map<string, PreparedFact>();
  prepare(facts: StoryFact[]) {
    const next = new Map<string, PreparedFact>();
    let built = 0, reused = 0;
    for (const fact of facts) {
      const text = fact.text, claimKey = fact.claim?.key ?? "", taskTitle = fact.task?.title ?? "";
      const key = JSON.stringify([text, claimKey, taskTitle]);
      let prepared = next.get(key) ?? this.rows.get(key);
      if (prepared) reused++; else { prepared = prepareFact(text, claimKey, taskTitle); built++; }
      next.set(key, prepared); indexes.set(fact, prepared);
    }
    const removed = [...this.rows.keys()].filter(key => !next.has(key)).length;
    this.rows = next;
    return { built, reused, removed, size: next.size };
  }
  clear() { this.rows.clear(); }
  get size() { return this.rows.size; }
}
