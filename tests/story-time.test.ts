import { expect, it } from "vitest";
import { GAME_TIME_KEY, gameTimeLabel, gameTimeEvidence, createStoryTimeReader, STORY_TIME_INSTRUCTION, STORY_TIME_COMPACT } from "../src/core/story-time";
import { createEpisodeReader } from "../src/core/story-episodes";
import { validStoryFact, cleanStoryFact, parseStoryUpdate, type StoryFact } from "../src/core/story-update";
import { storyFactIdentity } from "../src/core/story-memory-lifecycle";
import { roleSeed } from "../src/core/story-role-binding";
import { factAutomationReason, storyAutomationInstruction } from "../src/core/story-automation";
import { memoryBatchPrompt, parseMemoryBatch } from "../src/core/story-memory-batch";
import { storyWorld } from "./fixtures/story-worlds";
import { addedContextTokens, compileGameContext } from "../src/core/game-context";
import { DEFAULT_ACTIONS } from "../src/core/characters";

const clock = (label: string): StoryFact => ({ kind: "event", text: label, quote: label, claim: { key: GAME_TIME_KEY, value: label, scope: "state", transition: "progress" } });
const state = (lifetime?: "scene" | "persistent"): StoryFact => ({ kind: "event", text: "Nora is at the bridge", quote: "Nora is at the bridge", claim: { key: "nora-place", value: "Nora is at the bridge", scope: "state", ...(lifetime ? { lifetime } : {}) } });
const sources = ["s0", "s1", "s2", "s3"];
const seed = (f: StoryFact, source: string) => roleSeed(f, { version: 1, sourceRevisionId: source, quote: f.quote, roles: {} });
const read = (facts: StoryFact[], positions: number[]) => createStoryTimeReader(facts, createEpisodeReader(facts.map((f, i) => seed(f, sources[positions[i]!]!)), sources));
it.each(["Day 12", "День 3", "2026-10-13", "2024-02-29", "Three days later.", "3 weeks later", "Прошло три дня.", "Два года спустя", "Ten months have passed"])("accepts an explicit supported label: %s", label => {
  expect(gameTimeLabel(label)).toBeDefined(); expect(validStoryFact(clock(label))).toBe(true); expect(gameTimeEvidence(clock(label), label + "\nNora wakes up.")).toBe(true);
});
it.each(["Day 0", "2026-02-29", "2026-13-01", "Tomorrow", "Maybe Day 12", "3 days until", "Через три дня", "День 12?", "episode 5", "Last Tuesday", "three days later than planned"])("does not manufacture time from unsupported/invalid values: %s", label => {
  expect(gameTimeLabel(label)).toBeUndefined(); expect(validStoryFact(clock(label))).toBe(false);
});
it.each(["Nora said: Day 12", '“Day 12”', "If Day 12 arrives, leave.", "Tomorrow is Day 12", "Yesterday was Day 12", "Day 123", "Day 12 might come"])("rejects a label merely contained in prose: %s", prose => expect(gameTimeEvidence(clock("Day 12"), prose)).toBe(false));
it("checks paragraph evidence in both inline and batch parsing", () => {
  const w = storyWorld(), fact = clock("Day 12"), scope = { world: w.world.id, chat: w.binding.chatId, branch: "a", base: "base", entities: w.entities };
  const meta = `<deeprole_characters>${JSON.stringify({ version: 2, world: scope.world, chat: scope.chat, branch: "a", facts: [fact] })}</deeprole_characters>`;
  expect(parseStoryUpdate('Nora said: Day 12\n' + meta, scope).facts).toEqual([]);
  expect(parseStoryUpdate('Day 12. Nora wakes up.\n' + meta, scope).facts).toEqual([fact]);
  const part = { id: "s1", revisionId: "r", role: "assistant" as const, start: 0, end: 17, text: "Nora said: Day 12" };
  const raw = JSON.stringify({ requestId: "req", results: [{ source: "s1", complete: true, facts: [{ ...fact, risk: "ordinary" }], people: [] }] });
  expect(() => parseMemoryBatch(raw, "req", [part])).toThrow("invalid-evidence");
  expect(parseMemoryBatch(raw, "req", [{ ...part, text: "Day 12. Nora wakes up." }])[0]!.facts[0]).toMatchObject(fact);
});
it("keeps legacy identities identical and copies optional lifetime independently", () => {
  const f = state(); expect(storyFactIdentity(f)).toBe(JSON.stringify([f.kind, f.text, f.claim!.key, f.claim!.value, "state", "", "", "", ""]));
  expect(storyFactIdentity(state("scene"))).not.toBe(storyFactIdentity(f));
  const original = state("scene"), copy = cleanStoryFact(original); copy.claim!.lifetime = "persistent"; expect(original.claim!.lifetime).toBe("scene");
  expect(validStoryFact({ ...state("scene"), claim: { ...state("scene").claim, scope: "event" } })).toBe(false);
  expect(validStoryFact({ ...clock("Day 12"), claim: { ...clock("Day 12").claim, lifetime: "scene" } })).toBe(false);
  expect(validStoryFact({ ...state(), claim: { ...state().claim, lifetime: "forever" } })).toBe(false);
});
it("marks old temporary state after a jump, while lasting knowledge and task statuses survive", () => {
  const temp = state("scene"), lasting = { ...state("persistent"), text: "Nora knows the password", quote: "Nora knows the password", claim: { ...state("persistent").claim!, key: "password", value: "Nora knows the password" } };
  const promise: StoryFact = { kind: "promise", text: "I will help tomorrow", quote: "I will help tomorrow", task: { key: "help", title: "help tomorrow", status: "open" } };
  const time = read([temp, lasting, promise, clock("Three days later")], [0, 0, 0, 3]);
  expect(time.anchor).toMatchObject({ label: "Three days later", kind: "elapsed", revisionId: "s3" });
  expect(time.read(temp)).toBe("earlier-scene"); expect(time.read(lasting)).toBe("persistent"); expect(time.read(promise)).toBeUndefined(); expect(promise.task!.status).toBe("open");
  expect(read([temp, clock("Day 12")], [3, 3]).read(temp)).toBe("last-known");
  expect(read([temp], [0]).read(temp)).toBe("last-known");
});
it("uses proven source order, never fact insertion, and treats unlinked markers as unknown", () => {
  const temp = state("scene"), newer = clock("Day 12"), older = clock("Day 3");
  expect(read([newer, older, temp], [3, 0, 0]).anchor!.label).toBe("Day 12");
  const unknown = createStoryTimeReader([temp, newer], createEpisodeReader()); expect(unknown.anchor).toBeUndefined(); expect(unknown.read(temp)).toBe("unknown");
  const changedQuote = { ...temp, quote: temp.quote + "." }, reader = read([temp, newer], [0, 3]); expect(reader.read(changedQuote)).toBe("unknown");
  expect(reader.read(state())).toBeUndefined(); // No guessed lifetime for old imports.
});
it("recomputes the view after rejecting a clock or undoing the latest scene", () => {
  const temp = state("scene"), time = clock("Day 12"), before = structuredClone([temp, time]);
  expect(read([temp, time], [0, 3]).read(temp)).toBe("earlier-scene"); expect(read([temp], [0]).read(temp)).toBe("last-known");
  const partial = createStoryTimeReader([temp, time], createEpisodeReader([seed(temp, "s0"), seed(time, "s3")], ["s0"])); expect(partial.anchor).toBeUndefined();
  expect([temp, time]).toEqual(before);
});
it("repeated elapsed labels are new transitions; backwards absolute time and lifetime changes need review", () => {
  const elapsed = clock("Three days later"), day = clock("Day 12"), dated = clock("2026-10-13");
  expect(factAutomationReason(elapsed, "ordinary", [elapsed], [])).toBe("new");
  expect(factAutomationReason(day, "ordinary", [day], [])).toBe("duplicate");
  expect(factAutomationReason(clock("Day 3"), "ordinary", [day], [])).toBe("conflict");
  expect(factAutomationReason(clock("2026-10-12"), "ordinary", [dated], [])).toBe("conflict");
  expect(factAutomationReason(state("persistent"), "ordinary", [state("scene")], [])).toBe("uncertain");
  expect(factAutomationReason(state(), "ordinary", [state("scene")], [])).toBe("uncertain");
});
it.each(["ru", "en"] as const)("puts time, old state and an overdue but open promise in the whole budget: %s", locale => {
  const w = storyWorld(locale), temp = state("scene"), fact = clock(locale === "ru" ? "Прошло три дня." : "Three days later."), task: StoryFact = { kind: "promise", text: "I will help tomorrow", quote: "I will help tomorrow", task: { key: "help", title: "help tomorrow", status: "open" } }, facts = [temp, task, fact];
  const input = { draft: "Nora bridge help", recentMessages: [], entries: [], books: [], entities: w.entities, worlds: [w.world], activeBookId: null, settings: { contextBudget: 6000, relevanceThreshold: 6 }, story: { world: w.world, chat: w.binding.chatId, branch: "a", facts, roleSeeds: facts.map((f, i) => seed(f, i === 2 ? "s3" : "s0")), episodeSources: sources, sheetsEnabled: false } };
  const out = compileGameContext(input), payload = JSON.parse(out.text.split("<deeprole_story_memory>")[1]!.split("\n").find(x => x.startsWith("["))!);
  expect(out.text).toContain("<deeprole_story_time>"); expect(out.text).toContain(fact.text); expect(payload.find((f: any) => f.text === temp.text).timeStatus).toBe("earlier-scene"); expect(payload.find((f: any) => f.task).task.status).toBe("open");
  expect(out.report.total).toBe(addedContextTokens(out.text)); input.settings.contextBudget = out.report.total; expect(compileGameContext(input).text).toBe(out.text);
  input.settings.contextBudget = out.report.required; const minimal = compileGameContext(input); expect(minimal.text).toContain(fact.text); expect(minimal.report.total).toBeLessThanOrEqual(input.settings.contextBudget); expect(facts).toEqual([temp, task, fact]);
});
it("teaches both accompaniment paths, and does not enable accompaniment when off", () => {
  const w = storyWorld().world; w.storyAutomation = { mode: "automatic", revision: "r" };
  expect(storyAutomationInstruction(w, true, true)).toContain(STORY_TIME_COMPACT); expect(storyAutomationInstruction(w, false, true)).toContain(STORY_TIME_INSTRUCTION);
  expect(memoryBatchPrompt("req", [], [], [], "en")).toContain(STORY_TIME_INSTRUCTION);
  expect(storyAutomationInstruction(w, true)).not.toContain(STORY_TIME_COMPACT);
  w.storyAutomation.mode = "off"; expect(storyAutomationInstruction(w, true, true)).not.toContain(STORY_TIME_COMPACT);
});
it("keeps one source-linked temporary fact useful alongside the clock in the default 2000-token game request", () => {
  const w=storyWorld("en",3);w.entities[0]!.name="Nora";w.world.storyAutomation={mode:"automatic",revision:"policy"};const temp=state("scene"),time=clock("Three days later.");
  const out=compileGameContext({draft:"Where is Nora at the bridge?",recentMessages:[],entries:[w.entry],books:[],entities:w.entities,worlds:[w.world],scene:{worldId:w.world.id,bookId:null,focusIds:[]},activeBookId:null,settings:{contextBudget:2000,relevanceThreshold:6},character:[w.world.id,w.binding.chatId,w.entities,w.binding.characterScenes![w.world.id],DEFAULT_ACTIONS,[],"Where is Nora at the bridge?","request",true,false,false],story:{world:w.world,chat:w.binding.chatId,branch:"a",sheetsEnabled:true,facts:[temp,time],episodeSources:sources,roleSeeds:[seed(temp,"s0"),seed(time,"s3")]},choices:true});
  expect(out.report.total,JSON.stringify(out.report)).toBeLessThanOrEqual(2000);expect(out.text,JSON.stringify(out.report)).toContain(temp.text);expect(out.text).toContain('"timeStatus":"earlier-scene"');expect(out.text).toContain("<deeprole_story_time>");
});
