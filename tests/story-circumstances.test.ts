import { expect, it } from "vitest";
import { validStoryFact, cleanStoryFact, compactStoryFacts, parseStoryUpdate, type StoryFact } from "../src/core/story-update";
import { factAutomationReason } from "../src/core/story-automation";
import { storyFactIdentity } from "../src/core/story-memory-lifecycle";
import { createEpisodeReader } from "../src/core/story-episodes";
import { createStoryTimeReader } from "../src/core/story-time";
import { roleSeed } from "../src/core/story-role-binding";
import { formatStoryFacts } from "../src/core/story-fact-context";
import { compileGameContext, addedContextTokens } from "../src/core/game-context";
import { DEFAULT_ACTIONS } from "../src/core/characters";
import { storyWorld } from "./fixtures/story-worlds";
import { parseMemoryBatch } from "../src/core/story-memory-batch";

const active: StoryFact = { kind: "event", text: "Nora waits at the bridge.", quote: "Nora waits at the bridge.", claim: { key: "nora-waiting", value: "Nora waits at the bridge.", scope: "state", lifetime: "scene" } };
const end = (text = "Nora left the bridge."): StoryFact => ({ kind: "event", text, quote: text, claim: { ...active.claim!, value: text, transition: "progress", status: "ended" } });
const seed = (f: StoryFact, id: string) => roleSeed(f, { version: 1, sourceRevisionId: id, quote: f.quote, roles: {} });
it.each(["Nora left the bridge.", "Nora stopped waiting.", "Nora finished reading.", "Nora took off the coat.", "Нора ушла с моста.", "Нора перестала ждать.", "Нора сняла пальто.", "Нора больше не ждёт."])("admits a literal ordinary ending with the known exact temporary key: %s", text => {
  const f = end(text); expect(validStoryFact(f)).toBe(true); expect(factAutomationReason(f, "ordinary", [active], [])).toBe("new");
});
it.each(["Nora will leave the bridge.", "Nora would have stopped waiting.", "If Nora left the bridge, Mira would follow.", "Nora said she left the bridge.", "Nora remembers she left the bridge.", "Nora did not leave the bridge.", "Nora never stopped waiting.", "Нора не ушла с моста.", "Нора сказала, что перестала ждать.", "Нора хочет уйти с моста.", "Three days passed.", "The next scene begins."])("holds uncertain/future/reported/negated/unrecognized endings for review: %s", text => {
  expect(factAutomationReason(end(text), "ordinary", [active], [])).toBe("uncertain");
});
it("requires a known temporary property and exact key, retaining model uncertainty", () => {
  expect(factAutomationReason(end(), "ordinary", [], [])).toBe("uncertain");
  expect(factAutomationReason(end(), "ordinary", [{ ...active, claim: { ...active.claim!, lifetime: "persistent" } }], [])).toBe("uncertain");
  expect(factAutomationReason({ ...end(), claim: { ...end().claim!, key: "NORA-WAITING" } }, "ordinary", [active], [])).toBe("uncertain");
  expect(factAutomationReason(end(), "uncertain", [active], [])).toBe("uncertain");
  expect(factAutomationReason(end(), "conflict", [active], [])).toBe("conflict");
});
it.each([
  { status: "expired" }, { lifetime: "persistent" }, { scope: "event" }, { transition: undefined }, { value: "left" }, { lifetime: undefined },
])("rejects malformed status or endings of persistent/event/clock claims: %j", patch => expect(validStoryFact({ ...end(), claim: { ...end().claim!, ...patch } })).toBe(false));
it("does not attach circumstance status to promises or game time", () => {
  expect(validStoryFact({ ...end(), kind: "promise" })).toBe(false);
  expect(validStoryFact({ ...end("Day 12"), claim: { ...end("Day 12").claim!, key: "deeprole:game-time" } })).toBe(false);
});
it("retains old identities, copies status and distinguishes an explicit restart from stale active data", () => {
  const f = end(), copy = cleanStoryFact(f); copy.claim!.status = "active"; expect(f.claim!.status).toBe("ended");
  expect(storyFactIdentity(active)).toBe(JSON.stringify(["event",active.text,active.claim!.key,active.text,"state","","","","","scene"]));
  expect(storyFactIdentity(copy)).not.toBe(storyFactIdentity(f));
  expect(factAutomationReason(f, "ordinary", [f], [])).toBe("duplicate");
  expect(factAutomationReason(active, "ordinary", [f], [])).toBe("uncertain");
  const resumed = { ...active, claim: { ...active.claim!, status: "active" as const, transition: "progress" as const } };
  expect(factAutomationReason(resumed, "ordinary", [f], [])).toBe("new");
  expect(compactStoryFacts([active,f,resumed])).toEqual([resumed]);
});
it("keeps ending history, never closes tasks, and recomputes after rejecting the ending", () => {
  const f = end(), promise: StoryFact = { kind: "promise", text: "I will help tomorrow.", quote: "I will help tomorrow.", task: { key: "help", title: "help tomorrow", status: "open" } };
  const all = [active,promise,f], before = structuredClone(all), facts = compactStoryFacts(all);
  expect(facts).toEqual([promise,f]); expect(facts[0]!.task!.status).toBe("open"); expect(all).toEqual(before);
  const sources = ["s0","s1"], episodes = createEpisodeReader([seed(active,"s0"),seed(f,"s1")],sources);
  const reader = createStoryTimeReader(facts, episodes); expect(reader.read(f)).toBe("ended");
  expect(createStoryTimeReader(facts,createEpisodeReader()).read(f)).toBe("unknown");
  expect(createStoryTimeReader(compactStoryFacts([active,promise]),episodes).read(active)).toBe("last-known");
  expect(formatStoryFacts(facts,true,true,undefined,episodes,reader)).toContain('"timeStatus":"ended"');
  expect(formatStoryFacts(facts)).toContain("NOT current activity");
});
it("validates exact ending quotes in inline and batch paths", () => {
  const w=storyWorld(),f=end(),scope={world:w.world.id,chat:w.binding.chatId,branch:"a",base:"base",entities:w.entities};
  const meta='<deeprole_characters>'+JSON.stringify({version:2,world:scope.world,chat:scope.chat,branch:"a",facts:[f]})+'</deeprole_characters>';
  expect(parseStoryUpdate(f.quote+meta,scope).facts).toEqual([f]);expect(parseStoryUpdate("Nora waits."+meta,scope).facts).toEqual([]);
  const part={id:"s1",revisionId:"r",role:"assistant" as const,start:0,end:40,text:f.quote},raw=JSON.stringify({requestId:"req",results:[{source:"s1",complete:true,facts:[{...f,risk:"ordinary"}],people:[]}]});
  expect(parseMemoryBatch(raw,"req",[part])[0]!.facts[0]).toMatchObject(f);expect(()=>parseMemoryBatch(raw,"req",[{...part,text:"Nora waits."}])).toThrow("invalid-evidence");
});
it.each(["ru","en"] as const)("keeps the ended property usable in a default-budget request with three characters: %s", locale => {
  const w=storyWorld(locale,3);w.entities[0]!.name="Nora";w.world.storyAutomation={mode:"automatic",revision:"policy"};const f=end();
  const out=compileGameContext({draft:"Is Nora still waiting?",recentMessages:[],entries:[],books:[],entities:w.entities,worlds:[w.world],scene:{worldId:w.world.id,bookId:null,focusIds:[]},activeBookId:null,settings:{contextBudget:2000,relevanceThreshold:6},character:[w.world.id,w.binding.chatId,w.entities,w.binding.characterScenes![w.world.id],DEFAULT_ACTIONS,[],"Is Nora still waiting?","request",true,false,false],story:{world:w.world,chat:w.binding.chatId,branch:"a",sheetsEnabled:true,facts:[active,f],episodeSources:["s0","s1"],roleSeeds:[seed(active,"s0"),seed(f,"s1")]},choices:true});
  expect(out.report.total,JSON.stringify(out.report)).toBeLessThanOrEqual(2000);expect(out.report.total).toBe(addedContextTokens(out.text));expect(out.text,JSON.stringify(out.report)).toContain(f.text);expect(out.text).not.toContain(active.text);expect(out.text).toContain('"timeStatus":"ended"');expect(out.text).toContain("NOT current activity");
});
