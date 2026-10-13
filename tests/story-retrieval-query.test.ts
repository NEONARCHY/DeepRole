import { describe, expect, it } from "vitest";
import { storyRetrievalQuery } from "../src/core/story-retrieval-query";
import { rankStoryFacts } from "../src/core/story-fact-context";
import type { SceneEntity } from "../src/core/types";
import type { StoryFact } from "../src/core/story-update";
const person = (id: string, name: string, aliases: string[] = [], worldId = "w"): SceneEntity => ({ id, name, aliases, worldId, kind: "character", description: "", memberIds: [], createdAt: 0, updatedAt: 0 });
const fact = (text: string, kind: StoryFact["kind"] = "event"): StoryFact => ({ text, kind, quote: text });
const people = [person("a", "Mira", ["Keeper"]), person("b", "Nora", ["Guide"])];
const scope = { worldId: "w", entities: people };

describe("local story query assistance without identity guessing", () => {
  it.each(["Keeper's promise", "What did Keeper promise?", "Обещание Keeper", "План Keeper"])("finds an old canonical-name fact through an exact unique alias: %s", query => {
    const wanted = fact("Mira agreed to repair the western gate.", "promise");
    const newer = Array.from({ length: 30 }, (_, n) => fact("Nora promised a different delivery " + n + ".", "promise"));
    expect(rankStoryFacts([wanted, ...newer], query)[0]!.fact).not.toEqual(wanted);
    expect(rankStoryFacts([wanted, ...newer], query, scope)[0]!.fact).toEqual(wanted);
  });

  it.each([
    ["Её обещание", "promise"], ["Her promise", "promise"],
    ["Его план", "plan"], ["His plan", "plan"],
    ["Её мнение", "belief"], ["Her opinion", "belief"],
    ["Его секрет", "secret"], ["His secret", "secret"],
  ] as const)("prioritizes the requested fact type, not a guessed person: %s", (query, kind) => {
    const wanted = fact("A previously established detail.", kind);
    const other = Array.from({ length: 30 }, (_, n) => fact("Recent unrelated room " + n + "."));
    const prepared = storyRetrievalQuery(query, scope);
    expect(prepared.unresolvedReference).toBe(true);
    expect(prepared.query).toBe(query); // no person inferred/appended
    expect(rankStoryFacts([wanted, ...other], query)[0]!.fact).not.toEqual(wanted);
    expect(rankStoryFacts([wanted, ...other], query, scope)[0]!.fact).toEqual(wanted);
  });

  it("keeps terminal task status searchable through promise wording", () => {
    const done: StoryFact = { ...fact("Mira finished the gate repair."), task: { key: "gate", title: "repair gate", status: "completed" } };
    expect(rankStoryFacts([done, fact("Recent unrelated scene.")], "Her promise", scope)[0]!.fact.task?.status).toBe("completed");
  });

  it("does not expand shared aliases, foreign worlds, substrings or ambiguous canonical names", () => {
    const shared = { worldId: "w", entities: [...people, person("c", "Alex", ["Keeper"]), person("foreign", "Hidden person", ["Oracle"], "other")] };
    expect(storyRetrievalQuery("Keeper promise", shared).query).not.toContain("Mira");
    expect(storyRetrievalQuery("Oracle promise", shared).query).not.toContain("Hidden person");
    expect(storyRetrievalQuery("Keepersmith promise", scope).query).not.toContain("Mira");
    const ambiguous = { worldId: "w", entities: [person("a", "Alex", ["Keeper"]), person("b", "Alex", ["Guide"])] };
    expect(storyRetrievalQuery("Keeper promise", ambiguous).query).not.toContain("Alex");
  });

  it("does not use order, gender stereotypes, recent prose or alias ownership after edits", () => {
    expect(storyRetrievalQuery("Her promise", { ...scope, entities: [...people].reverse() }).query).not.toContain("Mira");
    const mutable = structuredClone(people);
    expect(storyRetrievalQuery("Keeper promise", { ...scope, entities: mutable }).query).toContain("Mira");
    mutable[0]!.aliases = [];
    expect(storyRetrievalQuery("Keeper promise", { ...scope, entities: mutable }).query).not.toContain("Mira");
  });

  it("prefers a complete longer name over a nested short name, but keeps a separate short-name occurrence", () => {
    const overlap = { worldId: "w", entities: [person("short", "Ann", ["Short"]), person("long", "Anna Lee", ["Ann Lee"])] };
    expect(storyRetrievalQuery("Ann Lee's promise", overlap).query).toBe("Ann Lee's promise\nAnna Lee");
    expect(storyRetrievalQuery("Ann Lee and Ann", overlap).query).toContain("\nAnn\nAnna Lee");
  });

  it("does not resolve an ambiguous longer name through an unrelated nested short name", () => {
    const overlap = { worldId: "w", entities: [person("short", "Ann"), person("long1", "Ann Lee"), person("long2", "Ann Lee")] };
    expect(storyRetrievalQuery("Ann Lee's promise", overlap).query).toBe("Ann Lee's promise");
  });

  it("does not give a short-name subject boost to a different full name in the fact", () => {
    const overlap = { worldId: "w", entities: [person("short", "Ann", ["Short"]), person("long", "Ann Lee")] };
    const wanted = fact("Ann agreed to repair the gate.", "promise"), other = fact("Ann Lee agreed to repair the gate.", "promise");
    expect(rankStoryFacts([wanted, other], "Short's promise", overlap)[0]!.fact).toEqual(wanted);
    expect(storyRetrievalQuery("Short's promise", overlap).score(other)).toBe(4);
  });

  it("never mutates the query, entities, facts, claims or source quotes", () => {
    const facts = [fact("Mira agreed to repair the gate.", "promise")], before = structuredClone({ people, facts });
    rankStoryFacts(facts, "Keeper's promise", scope);
    expect({ people, facts }).toEqual(before);
  });

  it.each(["Анна", "Анны", "Анне", "Анной"])("accepts a unique given name without requiring a surname: %s", short => {
    const one = { worldId: "w", entities: [person("a", "Анна Ли"), person("b", "Нора Уэйн")] };
    expect(storyRetrievalQuery("Обещание " + short, one).query).toContain("\nАнна Ли");
  });

  it("supports unique English given names and declared nicknames without saving inferred aliases", () => {
    const one = { worldId: "w", entities: [person("a", "Anna Lee", ["Annie"])] }, before = structuredClone(one);
    expect(storyRetrievalQuery("Anna's promise", one).query).toContain("\nAnna Lee");
    expect(storyRetrievalQuery("Annie's promise", one).query).toContain("\nAnna Lee");
    expect(one).toEqual(before);
  });

  it("does not choose between duplicate given names or an explicit short-name character", () => {
    const same = { worldId: "w", entities: [person("a", "Anna Lee"), person("b", "Anna Smith")] };
    expect(storyRetrievalQuery("Anna's promise", same).query).toBe("Anna's promise");
    expect(storyRetrievalQuery("Anna Lee's promise", same).query).toBe("Anna Lee's promise\nAnna Lee");
    same.entities[1] = person("b", "Anna");
    expect(storyRetrievalQuery("Anna's promise", same).query).toBe("Anna's promise");
  });

  it("does not infer titles as given names", () => {
    expect(storyRetrievalQuery("The promise", { worldId: "w", entities: [person("a", "The Keeper")] }).query).toBe("The promise");
  });

  it("does not bind pronouns even when an author used one as a character name or alias", () => {
    const unusual = { worldId: "w", entities: [person("a", "Mira", ["Her", "She"]), person("b", "He", ["Oracle"])] };
    expect(storyRetrievalQuery("Her promise", unusual).query).toBe("Her promise");
    expect(storyRetrievalQuery("Oracle's promise", unusual).query).not.toContain("\nHe");
    expect(storyRetrievalQuery("Mira's promise", unusual).score(fact("She agreed to repair the gate.", "promise"))).toBe(4);
  });
});
