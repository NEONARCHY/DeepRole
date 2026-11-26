import { expect, it } from "vitest";
import { createStoryJournal, filterStoryJournal } from "../src/core/story-journal";
import { isRoutineStoryFact } from "../src/core/story-memory-admission";
import { bindStoryRoles, roleSeed, sourceRoleRoster } from "../src/core/story-role-binding";
import type { StoryRevision } from "../src/core/story-records";
import type { StoryFact } from "../src/core/story-update";
import contract from "./fixtures/story-journal-contract.json";

const row = (text: string, kind: StoryFact["kind"] = "event"): StoryFact => ({ text, quote: text, kind });

it.each(contract.scenarios)("keeps the frozen order and shared links across $turnCount sources · $name", scenario => {
  const episodeSources = Array.from({ length: scenario.turnCount }, (_, index) => "revision:" + (index + 1));
  const identities = new Map(scenario.candidates.map(candidate => [candidate.text, candidate.id]));
  const sourceFor = (id: string, text: string): StoryRevision => ({
    format: "deeprole-story", contractVersion: 1, type: "revision", worldId: "journal-world", playthroughId: "journal-game", branchId: "selected",
    id, createdAt: 1, updatedAt: 1, messageId: id, nativeMessageKey: id, requestId: null, parentRevisionId: null, role: "assistant",
    completion: "complete", content: text, roleRoster: sourceRoleRoster(scenario.roster, "journal-world", text),
  });
  const facts = scenario.candidates.map(candidate => row(candidate.text, candidate.kind as StoryFact["kind"]));
  const factRoleSeeds = scenario.candidates.flatMap((candidate, index) => candidate.order === null ? [] : [
    roleSeed(facts[index]!, bindStoryRoles(facts[index]!, sourceFor(episodeSources[candidate.order - 1]!, candidate.text))),
  ]);
  const filler = row(scenario.filler);
  const fillers = episodeSources.filter((_, index) => !scenario.candidates.some(candidate => candidate.order === index + 1)).map(() => filler);
  expect(fillers.filter(fact => !isRoutineStoryFact(fact))).toEqual([]);
  const game = { facts, factRoleSeeds, episodeSources };
  const original = structuredClone(game);
  const journal = createStoryJournal(game);
  const flatten = (source: typeof journal, person = "", includeRoutine = false) => {
    const selected = filterStoryJournal(source, "", person, includeRoutine);
    return [...selected.filter(group => group.number !== null).reverse(), ...selected.filter(group => group.number === null)].flatMap(group => group.entries);
  };
  const ids = (entries: ReturnType<typeof flatten>) => entries.map(entry => identities.get(entry.fact.text));
  expect(ids(flatten(journal))).toEqual(scenario.expected.importantOrder);
  const all = flatten(journal, "", true);
  expect(ids(all)).toEqual(scenario.expected.allOrder);
  expect(Object.fromEntries(all.map(entry => [identities.get(entry.fact.text), entry.people.map(person => person.id).sort()]))).toEqual(scenario.expected.people);
  for (const candidate of scenario.candidates) {
    const entry = all.find(entry => entry.fact.text === candidate.text)!;
    expect(entry.order).toBe(candidate.order);
    expect(entry.sourceRevisionId).toBe(candidate.order === null ? null : episodeSources[candidate.order - 1]);
    expect(entry.fact.quote).toBe(candidate.text);
  }
  for (const [person, wanted] of Object.entries(scenario.expected.personViews)) expect(ids(flatten(journal, person))).toEqual(wanted);
  expect(game).toEqual(original);

  const target = scenario.candidates.find(candidate => candidate.id === scenario.expected.replacement.target)!;
  const replacement = row(scenario.expected.replacement.text);
  const activeSources = episodeSources.map((id, index) => index === target.order! - 1 ? id + ":edit" : id);
  const chosen = createStoryJournal({
    facts: facts.map(fact => fact.text === target.text ? replacement : fact),
    episodeSources: activeSources,
    factRoleSeeds: [...factRoleSeeds, roleSeed(replacement, bindStoryRoles(replacement, sourceFor(activeSources[target.order! - 1]!, replacement.text)))],
  });
  identities.set(replacement.text, target.id);
  expect(ids(flatten(chosen))).toEqual(scenario.expected.importantOrder);
  expect(flatten(chosen).some(entry => entry.fact.text === target.text)).toBe(false);
  expect(flatten(chosen).find(entry => entry.fact.text === replacement.text)?.order).toBe(target.order);
  const replacementPeople = Object.entries(scenario.expected.people).find(([id]) => id === target.id)?.[1];
  expect(flatten(chosen).find(entry => entry.fact.text === replacement.text)?.people.map(person => person.id).sort()).toEqual(replacementPeople);
});

it("preserves negation, exact time and structured changes when screening routine activity", () => {
  const ordinary = row("Мира встала утром.");
  expect(isRoutineStoryFact(ordinary)).toBe(true);
  expect(isRoutineStoryFact(row("Мира не встала утром."))).toBe(false);
  expect(isRoutineStoryFact(row("Мира встала."))).toBe(false);
  expect(isRoutineStoryFact(row("Mira woke up at 04:17."))).toBe(false);
  expect(isRoutineStoryFact({ ...ordinary, claim: { key: "waking-window", value: "утром", scope: "state" } })).toBe(false);
  expect(isRoutineStoryFact({ ...ordinary, quote: "Мира встала утром, чтобы проверить сигнал." })).toBe(false);
});
