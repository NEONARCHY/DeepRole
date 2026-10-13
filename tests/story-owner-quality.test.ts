import { expect, it } from "vitest";
import { createStoryRoleReader, createStoryRoleReaderV1, type OwnerRole } from "../src/core/story-source-roles";
import { rankStoryFacts } from "../src/core/story-fact-context";
import { bindStoryRoles, captureRoleRoster, roleSeed, storedRoleReader } from "../src/core/story-role-binding";
import { addedContextTokens, compileGameContext, type GameContextInput } from "../src/core/game-context";
import type { StoryRevision } from "../src/core/story-records";
import type { StoryFact } from "../src/core/story-update";
import { storyWorld } from "./fixtures/story-worlds";
import { ownerQueries, sourceQuality, unknownOwnerQueries } from "./fixtures/story-owner-quality";

const scope = (...names: string[]) => {
  const w = storyWorld("en", names.length); w.entities.forEach((e, i) => e.name = names[i]!);
  return { worldId: w.world.id, entities: w.entities };
};
const facts = (role: OwnerRole, ru: boolean): StoryFact[] => {
  const verb = { promisor: ru ? "обещала" : "promised", planner: ru ? "планирует" : "plans", believer: ru ? "считает" : "believes" }[role];
  const kind = { promisor: "promise", planner: "plan", believer: "belief" }[role] as StoryFact["kind"];
  return [
    { kind, text: "A statement.", quote: `${ru ? "Нора" : "Nora"} ${verb} ${ru ? "помочь Мире." : "to help Mira."}` },
    { kind, text: ru ? `Мира ${verb} Норе помочь.` : `Mira ${verb} to help Nora.`, quote: `${ru ? "Мира" : "Mira"} ${verb} ${ru ? "помочь Норе." : "to help Nora."}` },
    { kind, text: ru ? "Нора — обещания, планы, мнение." : "Nora's promises, plans and beliefs.", quote: "They discussed it." },
  ];
};
it.each(ownerQueries)("retrieves the explicit $role first: $query", ({ query, role, ru }) => {
  const s = scope(...(ru ? ["Нора", "Мира"] : ["Nora", "Mira"])), f = facts(role, ru), before = structuredClone(f);
  const reader = createStoryRoleReader(s, query);
  expect(reader.question).toEqual({ role, personId: "person-1" });
  expect(f.map(x => reader.score(x))).toEqual([40, -12, 0]);
  expect(rankStoryFacts(f, query, s)[0]!.fact.quote).toBe(f[0]!.quote);
  expect(f).toEqual(before);
});
it.each(unknownOwnerQueries)("abstains from an unsafe owner query: %s", query => {
  const s = scope("Nora", "Mira", "Нора", "Мира"), r = createStoryRoleReader(s, query);
  expect(r.question).toBeUndefined(); expect(r.score(facts("promisor", false)[0]!)).toBe(0);
});
it.each(sourceQuality)("keeps version-1 source grammar fixed: $quote", ({ quote, role, owner }) => {
  const s = scope("Nora", "Mira", "Нора", "Мира"), f: StoryFact = { kind: "promise", text: "Summary.", quote };
  const original = createStoryRoleReaderV1(s).read(f), current = createStoryRoleReader(s).read(f);
  expect(original?.[role]?.id ?? null).toBe(owner === null ? null : `person-${owner}`);
  expect(current).toEqual(original);
});
it("reports a fixed baseline and current query-corpus coverage", () => {
  const hits = (reader: typeof createStoryRoleReader) => ownerQueries.filter(({ query, role, ru }) => reader(scope(...(ru ? ["Нора", "Мира"] : ["Nora", "Mira"])), query).question?.role === role).length;
  const baseline = hits(createStoryRoleReaderV1), current = hits(createStoryRoleReader);
  console.info(`RP241 fixed corpus: owner queries ${baseline} -> ${current}/${ownerQueries.length}; abstentions ${unknownOwnerQueries.length}; source cases ${sourceQuality.length}`);
  expect(current).toBe(42); expect(baseline).toBe(10);
});
it("checks all inferred aliases for collisions and uses the longest name", () => {
  const s = scope("Нора", "Норы", "Ann", "Ann Lee", "Ann Lee", "Nora Vale");
  s.entities[5]!.aliases = ["Maker", "she"];
  for (const query of ["Планы Норы", "What did Ann promise?", "List Ann Lee's promises.", "What did she plan?"]) expect(createStoryRoleReader(s, query).question).toBeUndefined();
  expect(createStoryRoleReader(s, "Show me Maker's plans.").question).toEqual({ role: "planner", personId: "person-6" });
  expect(createStoryRoleReader({ ...s, entities: [...s.entities].reverse() }, "List Ann Lee's promises.").question).toBeUndefined();
  s.entities[5]!.worldId = "other"; expect(createStoryRoleReader(s, "What did Maker promise?").question).toBeUndefined();
});
it("does not promote a query match into proof for old unbound managed facts", () => {
  const s = scope("Nora", "Mira"), f = facts("promisor", false)[0]!;
  const r = createStoryRoleReader(s, "Remind me what Nora promised Mira.", storedRoleReader([], s.entities, s.worldId, {}, true));
  expect(r.question).toEqual({ role: "promisor", personId: "person-1" });
  expect(r.read(f)).toBeUndefined(); expect(r.status!(f)).toBe("unknown"); expect(r.score(f)).toBe(0);
});
it.each(["ru", "en"] as const)("keeps exact bound evidence and the common budget in a natural %s query", locale => {
  const w = storyWorld(locale, 2), ru = locale === "ru", names = ru ? ["Нора", "Мира"] : ["Nora", "Mira"];
  w.entities.forEach((e, i) => e.name = names[i]!);
  const f = facts("promisor", ru), before = structuredClone(f);
  const source: StoryRevision = { format: "deeprole-story", contractVersion: 1, type: "revision", id: "source", worldId: w.world.id, playthroughId: "game", branchId: "a", createdAt: 1, updatedAt: 1, role: "assistant", messageId: "message", nativeMessageKey: "key", parentRevisionId: null, requestId: null, completion: "complete", content: f[0]!.quote, roleRoster: captureRoleRoster(w.entities, w.world.id) };
  const seeds = [roleSeed(f[0]!, bindStoryRoles(f[0]!, source))];
  w.entities[0]!.name = ru ? "Ева" : "Eva";
  const query = ru ? "Напомни, что Ева обещала Мире." : "Remind me what Eva promised Mira.";
  const input: GameContextInput = { draft: query, recentMessages: [], entries: [], books: [], entities: w.entities, worlds: [w.world], activeBookId: null, scene: { worldId: w.world.id, bookId: null, focusIds: [] }, settings: { contextBudget: 6000, relevanceThreshold: 6 }, story: { world: w.world, chat: w.binding.chatId, branch: "a", facts: f, roleSeeds: seeds, sheetsEnabled: false } };
  const out = compileGameContext(input), block = out.text.split("<deeprole_story_memory>")[1]!.split("</deeprole_story_memory>")[0]!;
  const payload = JSON.parse(block.split("\n").find(line => line.startsWith("["))!);
  expect(payload.find((x: any) => x.sourceQuote === f[0]!.quote).sourceRoles.promisor).toEqual({ id: "person-1", name: w.entities[0]!.name, sourceName: names[0] });
  expect(out.report.total).toBe(addedContextTokens(out.text));
  input.settings.contextBudget = out.report.total; expect(compileGameContext(input).text).toBe(out.text);
  expect(f).toEqual(before); expect(seeds[0]!.binding.roles.promisor!.name).toBe(names[0]);
});
