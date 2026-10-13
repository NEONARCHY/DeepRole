import { describe, expect, it } from "vitest";
import { rankStoryFacts, storyFactContext } from "../src/core/story-fact-context";
import { storyFactSearchEntry } from "../src/core/story-fact-search-index";
import { compactStoryFacts, type StoryFact } from "../src/core/story-update";
import { storyFactIdentity } from "../src/core/story-memory-lifecycle";
import { scoreMemory } from "../src/core/memory-engine";
import { deriveKeywords, normalizeText, uniqueTokens } from "../src/core/text";

const fact = (text: string, extra: Partial<StoryFact> = {}): StoryFact => ({ text, kind: "event", quote: text, ...extra });
// The previous implementation is the reference, independent of cache lifetime.
const coldRank = (facts: StoryFact[], query: string) => compactStoryFacts(facts).map((f, index) => ({ fact: f, index, score: (f.task?.status === "open" ? 2 : 0) + (query ? scoreMemory({ id: "fact:" + index, bookId: null, title: f.text.slice(0, 90), content: f.text, keywords: deriveKeywords(f.text, (f.claim?.key ?? "") + " " + (f.task?.title ?? "")), activation: "smart", priority: "normal", enabled: true, source: { type: "manual" }, createdAt: 0, updatedAt: index }, normalizeText(query), uniqueTokens(query)).score : 0) })).sort((a,b) => b.score-a.score || b.index-a.index);

describe("incremental played-fact search", () => {
  it("reuses 1000 lexical projections across questions and changes only the edited record", () => {
    const facts = Array.from({ length: 1000 }, (_, index) => fact(`Medallion ${index} is in the vault.`));
    rankStoryFacts(facts, "medallion");
    const before = facts.map(storyFactSearchEntry);
    rankStoryFacts(facts, "vault");
    facts[300]!.text = "The copper bell is in the attic.";
    rankStoryFacts(facts, "bell");
    facts.forEach((f, index) => index === 300 ? expect(storyFactSearchEntry(f)).not.toBe(before[index]) : expect(storyFactSearchEntry(f)).toBe(before[index]));
  });

  it.each(["", "медальон", "repair", "clock key", "обещала", "Keeper"])("preserves cold order, score, kind and metadata for %s", query => {
    const facts = [fact("Keeper placed the medallion in the vault."), fact("Мира обещала ремонт ворот.", { kind: "promise", task: { key: "gate", title: "repair gate", status: "open" } }), fact("The clock key is in the blue box.", { claim: { key: "clock key", value: "blue box", scope: "state" } })];
    rankStoryFacts(facts, query);
    expect(rankStoryFacts(facts, query)).toEqual(coldRank(facts, query));
  });

  it("rebuilds search text, claim keys and task titles after edits without changing source records", () => {
    const f = fact("The object is here.", { claim: { key: "medallion", value: "here", scope: "state" } });
    const first = storyFactSearchEntry(f);
    f.claim!.key = "copper bell";
    expect(storyFactSearchEntry(f)).not.toBe(first);
    expect(rankStoryFacts([f], "copper bell")).toEqual(coldRank([f], "copper bell"));
    delete f.claim; f.task = { key: "one", title: "repair gate", status: "open" }; f.kind = "promise";
    const next = storyFactSearchEntry(f); f.task.title = "find medallion";
    expect(storyFactSearchEntry(f)).not.toBe(next);
    const saved = structuredClone(f);
    rankStoryFacts([f], "medallion"); expect(f).toEqual(saved);
  });

  it("rechecks completion and quotes on warm queries and returns isolated copies", () => {
    const f = fact("The gate repair was discussed.", { kind: "promise", task: { key: "gate", title: "repair gate", status: "open" } });
    const open = rankStoryFacts([f], "repair"), index = storyFactSearchEntry(f);
    f.task!.status = "completed"; f.kind = "event"; f.quote = "Played repair was completed.";
    const done = rankStoryFacts([f], "repair");
    expect(done[0]!.score).toBe(open[0]!.score - 2);
    expect(storyFactSearchEntry(f)).toBe(index);
    expect(done[0]!.fact.quote).toBe(f.quote);
    done[0]!.fact.task!.status = "cancelled";
    expect(f.task!.status).toBe("completed");
    expect(open[0]!.fact.task!.status).toBe("open");
  });

  it("recomputes latest claims, explicit replacements and undo in the same array", () => {
    const old = fact("The key is in the blue box.", { claim: { key: "key location", value: "blue box", scope: "state" } });
    const facts = [old]; rankStoryFacts(facts, "key");
    const latest = fact("The key is in the pocket.", { claim: { key: "key location", value: "pocket", scope: "state", transition: "progress" } });
    facts.push(latest); expect(rankStoryFacts(facts, "key").map(r => r.fact.text)).toEqual([latest.text]);
    facts.pop(); expect(rankStoryFacts(facts, "key").map(r => r.fact.text)).toEqual([old.text]);
    const correction = fact("The key is in the drawer.", { replaces: [storyFactIdentity(old)] });
    facts.push(correction); expect(rankStoryFacts(facts, "key").map(r => r.fact.text)).toEqual([correction.text]);
    correction.replaces!.splice(0); expect(rankStoryFacts(facts, "key")).toHaveLength(2);
  });

  it("never carries selected facts between supplied branches or same-text different objects", () => {
    const a = fact("The medallion is in the cellar."), b = fact("The medallion is in the attic.");
    rankStoryFacts([a], "medallion");
    expect(storyFactContext([b], 2000, "medallion")).not.toContain("cellar");
    expect(storyFactContext([], 2000, "medallion")).toBe("");
    expect(storyFactSearchEntry(structuredClone(a))).not.toBe(storyFactSearchEntry(a));
  });
});
