import type { StoryFact } from "./story-update";
import type { MemoryEntry } from "./types";
import { deriveKeywords } from "./text";

type PreparedFact = { text: string; claimKey: string; taskTitle: string; entry: MemoryEntry };
// Query-independent lexical projection only. No branch selections, task status,
// quotes, sources or world-wide ID table are cached here.
const indexes = new WeakMap<StoryFact, PreparedFact>();

export function storyFactSearchEntry(fact: StoryFact): MemoryEntry {
  const text = fact.text, claimKey = fact.claim?.key ?? "", taskTitle = fact.task?.title ?? "";
  const previous = indexes.get(fact);
  if (previous && previous.text === text && previous.claimKey === claimKey && previous.taskTitle === taskTitle) return previous.entry;
  const entry: MemoryEntry = { id: "fact-search", bookId: null, title: text.slice(0, 90), content: text, keywords: deriveKeywords(text, claimKey + " " + taskTitle), activation: "smart", priority: "normal", enabled: true, source: { type: "manual" }, createdAt: 0, updatedAt: 0 };
  indexes.set(fact, { text, claimKey, taskTitle, entry });
  return entry;
}
