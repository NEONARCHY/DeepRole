import { expect, it } from "vitest";
import { addedContextTokens, compileGameContext, type GameContextInput } from "../src/core/game-context";
import { storyWorld } from "./fixtures/story-worlds";
import type { StoryFact } from "../src/core/story-update";

it.each(["ru", "en"] as const)("selects paraphrases before 2000 newer mentions and keeps their full evidence: %s", locale => {
  const w = storyWorld(locale, 1), ru = locale === "ru";
  const wanted: StoryFact = { kind: "promise", text: ru ? "Нора обещала ремонт ворот при открытой дороге." : "Nora promised to mend the gate if the road opens.", quote: ru ? "Нора сказала: «Я обещаю починить ворота, если дорогу откроют»." : "Nora said: “I promise to mend the gate if the road opens.”", task: { key: "gate", title: ru ? "Ремонт ворот" : "Mend gate", status: "cancelled" } };
  const facts = [wanted, ...Array.from({ length: 2000 }, (_, i) => { const text = (ru ? "Нора осмотрела ворота. " : "Nora inspected the gate. ") + i; return { kind: "event" as const, text, quote: text }; })];
  const before = structuredClone(facts);
  const input: GameContextInput = { draft: ru ? "Восстановить ворота" : "Fix the gate", recentMessages: [], entries: [], books: [], entities: w.entities, worlds: [w.world], activeBookId: null, scene: { worldId: w.world.id, bookId: null, focusIds: [] }, settings: { contextBudget: 4000, relevanceThreshold: 6 }, story: { world: w.world, chat: w.binding.chatId, branch: "a", facts, sheetsEnabled: false } };
  const out = compileGameContext(input), block = out.text.split("<deeprole_story_memory>")[1]!.split("</deeprole_story_memory>")[0]!;
  const payload = JSON.parse(block.split("\n").find(line => line.startsWith("["))!);
  expect(payload[0]).toMatchObject({ kind: "promise", text: wanted.text, sourceQuote: wanted.quote, task: wanted.task });
  expect(payload[0]).not.toHaveProperty("sourceRoles");
  expect(out.report.total).toBe(addedContextTokens(out.text)); expect(out.report.total).toBeLessThanOrEqual(input.settings.contextBudget);
  expect(out.report.omitted.facts).toBeGreaterThan(1900);
  input.settings.contextBudget = out.report.total; expect(compileGameContext(input).text).toBe(out.text);
  input.settings.contextBudget = out.report.required;
  expect(compileGameContext(input).text).not.toContain(wanted.quote);
  expect(facts).toEqual(before);
});

it.each(["promise", "plan", "belief", "secret"] as const)("keeps a matching %s as its accepted kind, not a played event", kind => {
  const w = storyWorld("en", 1), f: StoryFact = { kind, text: "Someone could mend the clock if the road opens.", quote: "He did not agree to repair it unless the road opens." };
  const before = structuredClone(f);
  const out = compileGameContext({ draft: "Fix the clock", recentMessages: [], entries: [], books: [], entities: w.entities, worlds: [w.world], activeBookId: null, settings: { contextBudget: 4000, relevanceThreshold: 6 }, story: { world: w.world, chat: w.binding.chatId, branch: "a", facts: [f], sheetsEnabled: false } });
  expect(out.text).toContain(`"kind":"${kind}"`); expect(out.text).toContain(f.quote); expect(out.text).not.toContain('"sourceRoles":'); expect(f).toEqual(before);
});
