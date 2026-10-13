import { expect, it } from "vitest";
import { createStoryRoleReader, STORY_SOURCE_ROLES } from "../src/core/story-source-roles";
import { formatStoryFacts, rankStoryFacts, storyFactPayload } from "../src/core/story-fact-context";
import { validStoryFact, type StoryFact } from "../src/core/story-update";
import { compileGameContext, addedContextTokens, type GameContextInput } from "../src/core/game-context";
import { storyWorld } from "./fixtures/story-worlds";

const fact = (quote: string, text = "A stated commitment.", kind: StoryFact["kind"] = "promise"): StoryFact => ({ text, quote, kind });
const scope = (...names: string[]) => {
  const w = storyWorld("en", names.length);
  w.entities.forEach((e, i) => e.name = names[i]!);
  return { worldId: w.world.id, entities: w.entities };
};
const person = (id: number, name: string) => ({ id: `person-${id}`, name });

it.each([
  ["Nora told Mira: “I promise to bring tools if the road opens.”", "Nora", "Mira"],
  ["Nora said to Mira: I promise not to leave before dawn.", "Nora", "Mira"],
  ["Нора сказала Мире: «Я обещаю принести инструменты, если дорогу откроют».", "Нора", "Мира"],
])("separates explicit speaker, recipient and promisor: %s", (quote, speaker, recipient) => {
  const s = scope(speaker, recipient), f = fact(quote), before = structuredClone(f);
  expect(createStoryRoleReader(s).read(f)).toEqual({ speaker: person(1, speaker), recipient: person(2, recipient), promisor: person(1, speaker) });
  expect(f).toEqual(before);
});
it.each([
  ["Nora promised to help Mira if the road opens.", "promisor"],
  ["Nora plans to help Mira only after permission.", "planner"],
  ["Nora believes Mira repaired the clock, but no one checked.", "believer"],
  ["Нора обещала помочь Мире.", "promisor"],
  ["Нора планирует помочь Мире.", "planner"],
  ["Нора считает, что Мира починила часы.", "believer"],
])("binds only the explicitly named owner of the statement: %s", (quote, role) => {
  const names = quote.startsWith("Nora") ? ["Nora", "Mira"] : ["Нора", "Мира"];
  expect(createStoryRoleReader(scope(...names)).read(fact(quote))).toEqual({ [role]: person(1, names[0]!) });
});
it.each([
  ["Nora: “I plan to ask Mira.”", "planner"],
  ["Nora: I believe the road is open.", "believer"],
  ["Нора: «Я обещаю не уходить».", "promisor"],
])("reads a named dialogue header and keeps its first-person role: %s", (quote, role) => {
  const name = quote.startsWith("Nora") ? "Nora" : "Нора";
  expect(createStoryRoleReader(scope(name, "Mira")).read(fact(quote))).toEqual({ speaker: person(1, name), [role]: person(1, name) });
});
it("does not turn an outer speaker into the owner of a reported promise", () => {
  const r = createStoryRoleReader(scope("Nora", "Mira"));
  for (const quote of ["Nora said Mira promised to help.", "Nora told Mira: “Mira promised to help.”", "Nora: “I promise,” wrote Mira in the letter.", "Nora: «“I promise”»"]) {
    expect(r.read(fact(quote))?.promisor).toBeUndefined();
  }
  expect(r.read(fact("Nora said Mira promised to help."))).toEqual({ speaker: person(1, "Nora") });
});
it.each([
  "She promised to help Nora.", "Someone believes Nora.", "If Nora promised, Mira would wait.",
  "Nora and Mira promised to help.", "Nora did not promise to help.", "Nora never promised to help.",
  "Nora promised? Mira did.", "Nora. Promised to help.", "Nora, promised to help.",
  "“Nora promised to help” was written on paper.", "Nora's sister promised to help.",
  "Мире обещала помочь Нора.", "Она обещала помочь Норе.", "Нора не обещала помочь.",
])("leaves unsupported grammar and ambiguous ownership unknown: %s", quote => {
  expect(createStoryRoleReader(scope("Nora", "Mira", "Нора", "Мира")).read(fact(quote))).toBeUndefined();
});
it("does not infer an owner from text, task key, role, roster order or the benefited person", () => {
  const f = fact("They agreed to wait.", "Nora promised to help Mira.");
  f.task = { key: "nora-promise", title: "Nora helps Mira", status: "open" };
  expect(createStoryRoleReader(scope("Nora", "Mira")).read(f)).toBeUndefined();
});
it.each([
  "Nora told Mira: “I promise to wait.” Mira told Nora: “I promise to bring tools.”",
  "Nora promised to wait. Mira promised to bring tools.",
  "Nora: I promise to wait. Mira: I promise to bring tools.",
  "Нора сказала Мире: «Я обещаю ждать». Мира сказала Норе: «Я обещаю принести инструменты».",
])("does not assign every summary in a shared multi-voice source to its first promisor: %s", quote => {
  const r = createStoryRoleReader(scope("Nora", "Mira", "Нора", "Мира"), "What did Nora promise?");
  const f = fact(quote, "Bring tools.");
  expect(r.read(f)).toBeUndefined(); expect(r.score(f)).toBe(0);
});
it("requires an exact recipient header rather than a relation or another clause", () => {
  const r = createStoryRoleReader(scope("Nora", "Mira", "Нора", "Мира"));
  for (const quote of ["Nora told Mira's sister: “I promise.”", "Nora said Mira: “I promise.”", "Нора сказала матери Миры: «Я обещаю»." ]) expect(r.read(fact(quote))).not.toHaveProperty("recipient");
  expect(r.read(fact("Nora promised to Mira: “I will wait.”"))).toEqual({ promisor: person(1, "Nora"), recipient: person(2, "Mira") });
});
it("resolves unique aliases and short names but never ambiguous or shorter overlapping names", () => {
  const s = scope("Ann", "Ann Lee", "Ann Lee", "Nora Vale");
  s.entities[3]!.aliases = ["Maker"];
  const r = createStoryRoleReader(s);
  expect(r.read(fact("Ann Lee promised to help."))).toBeUndefined();
  expect(r.read(fact("Ann promised to help."))).toBeUndefined();
  expect(r.read(fact("Maker promised to help."))?.promisor).toEqual(person(4, "Nora Vale"));
  expect(r.read(fact("Nora promised to help."))?.promisor).toEqual(person(4, "Nora Vale"));
  expect(createStoryRoleReader({ ...s, entities: [...s.entities].reverse() }).read(fact("Ann Lee promised to help."))).toBeUndefined();
});
it("rejects ambiguous inflected forms, pronoun aliases and characters from other worlds", () => {
  const s = scope("Нора", "Мира", "Мире", "She", "Clockmakers", "Nora");
  s.entities[1]!.aliases = ["она"];
  s.entities[4]!.kind = "group";
  s.entities[5]!.worldId = "another-world";
  const r = createStoryRoleReader(s);
  expect(r.read(fact("Нора сказала Мире: «Я обещаю»."))).not.toHaveProperty("recipient");
  for (const quote of ["She promised to help.", "она обещала помочь.", "Clockmakers promised to help.", "Nora promised to help."]) expect(r.read(fact(quote))).toBeUndefined();
});
it("rebuilds identity links after alias edits, removal, renaming or collision, without changing facts", () => {
  const s = scope("Nora", "Mira"), f = fact("Nora promised to help.");
  const old = createStoryRoleReader(s);
  s.entities[0]!.name = "Nora Vale"; s.entities[0]!.aliases = ["Nora"];
  expect(createStoryRoleReader(s).read(f)?.promisor).toEqual(person(1, "Nora Vale"));
  expect(old.read(f)?.promisor).toEqual(person(1, "Nora"));
  s.entities[1]!.aliases = ["Nora"];
  expect(createStoryRoleReader(s).read(f)).toBeUndefined();
  s.entities = [];
  expect(createStoryRoleReader(s).read(f)).toBeUndefined();
  expect(f.quote).toBe("Nora promised to help.");
});
it("isolates returned values and checks in-place quote edits in its request-local cache", () => {
  const r = createStoryRoleReader(scope("Nora", "Mira")), f = fact("Nora promised to help.");
  r.read(f)!.promisor!.name = "Poisoned";
  expect(r.read(f)?.promisor).toEqual(person(1, "Nora"));
  f.quote = "Mira promised to help.";
  expect(r.read(f)?.promisor).toEqual(person(2, "Mira"));
});
it.each(["What did Nora promise?", "Что обещала Нора?", "Что Нора обещала?"])("ranks the promisor above the recipient for %s", query => {
  const ru = query.startsWith("Что"), names = ru ? ["Нора", "Мира"] : ["Nora", "Mira"];
  const own = fact(ru ? "Нора сказала Мире: «Я обещаю принести инструменты»." : "Nora told Mira: “I promise to bring tools.”", "Bring tools.");
  const other = fact(ru ? "Мира сказала Норе: «Я обещаю ждать»." : "Mira told Nora: “I promise to wait.”", ru ? "Мира обещала Норе ждать." : "Mira promised Nora to wait.");
  const s = scope(...names), r = createStoryRoleReader(s, query);
  expect(r.question).toEqual({ role: "promisor", personId: "person-1" });
  expect(r.score(own)).toBe(40); expect(r.score(other)).toBe(-12);
  expect(rankStoryFacts([own, other], query, s)[0]!.fact.quote).toBe(own.quote);
});
it.each([["What did Nora plan?", "planner"], ["What did Nora believe?", "believer"], ["What did Nora think?", "believer"]])("supports an explicit owner query: %s", (query, role) => {
  expect(createStoryRoleReader(scope("Nora", "Mira"), query).question).toEqual({ role, personId: "person-1" });
});
it.each(["What did she promise?", "Что она обещала?", "Что обещала Нора и Мира?", "Tell me about Nora", "What did Ann promise?"])("does not manufacture an owner query: %s", query => {
  const r = createStoryRoleReader(scope("Nora", "Mira", "Ann Lee", "Ann Brown"), query);
  expect(r.question).toBeUndefined(); expect(r.score(fact("Nora promised to help."))).toBe(0);
});
it.each([false, true])("carries exact evidence and role guide in compact=%s without persisting metadata", compact => {
  const f = fact("  Nora told Mira: “I promise to wait if the road opens.”\n"), before = structuredClone(f);
  const r = createStoryRoleReader(scope("Nora", "Mira")), out = formatStoryFacts([f], compact, false, r);
  const payload = JSON.parse(out.split("\n")[compact ? 1 : 2]!)[0];
  expect(payload.sourceQuote).toBe(f.quote); expect(payload.sourceRoles.promisor).toEqual(person(1, "Nora"));
  expect(out).toContain(STORY_SOURCE_ROLES); expect(f).toEqual(before);
  expect(validStoryFact(f)).toBe(true); expect(validStoryFact({ ...f, sourceRoles: payload.sourceRoles })).toBe(false);
  expect(formatStoryFacts([f], compact)).not.toContain("sourceRoles");
});
it("shares exact quotes within the same array while keeping per-fact role links", () => {
  const quote = "Nora told Mira: “I promise to wait if the road opens.” " + "Exact scene evidence. ".repeat(80);
  const f = [fact(quote, "A promise."), fact(quote, "A condition.")], r = createStoryRoleReader(scope("Nora", "Mira"));
  const p = storyFactPayload(f, r), h = JSON.parse(p.json);
  expect(h[1].sourceQuoteRef).toBe(0); expect(h[0].sourceRoles).toEqual(h[1].sourceRoles);
  expect(h[h[1].sourceQuoteRef].sourceQuote).toBe(quote); expect(p.guide).toContain(STORY_SOURCE_ROLES);
});
it("counts role JSON and guide in the whole-request budget and rebuilds each request", () => {
  const w = storyWorld("en", 2); w.entities[0]!.name = "Nora"; w.entities[1]!.name = "Mira";
  const input: GameContextInput = { draft: "What did Nora promise?", recentMessages: [], entries: [], books: [], entities: w.entities, worlds: [w.world], activeBookId: null, scene: { worldId: w.world.id, bookId: null, focusIds: [] }, settings: { contextBudget: 4000, relevanceThreshold: 6 }, story: { world: w.world, chat: w.binding.chatId, branch: "a", facts: [fact("Nora told Mira: “I promise to wait.”")], sheetsEnabled: false } };
  const out = compileGameContext(input); expect(out.report.selected.facts).toBe(1); expect(out.text).toContain(STORY_SOURCE_ROLES);
  expect(out.report.total).toBe(addedContextTokens(out.text));
  input.settings.contextBudget = out.report.total; expect(compileGameContext(input).text).toBe(out.text);
  input.settings.contextBudget = out.report.total - 1;
  const limited = compileGameContext(input); expect(limited.report.selected.facts).toBe(0); expect(limited.text).not.toContain("sourceRoles"); expect(limited.report.total).toBeLessThanOrEqual(input.settings.contextBudget);
  input.settings.contextBudget = 4000; input.entities = [];
  expect(compileGameContext(input).text).not.toContain("sourceRoles");
});
