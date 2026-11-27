import { describe, expect, it } from "vitest";
import { parseStoryUpdate, validStoryUpdateDiagnostic } from "../src/core/story-update";
import { storyUpdateNotice, storyUpdateText } from "../src/core/story-update-i18n";
import { storyWorld } from "./fixtures/story-worlds";
import wrappedPresence from "./fixtures/story-wrapped-presence.json";
const f = storyWorld(), scope = { world: f.world.id, chat: f.binding.chatId, branch: "branch-a", base: "current", entities: f.entities, scene: f.binding.characterScenes![f.world.id]! };
const block = (value: unknown, narrative = "Мира передала медный ключ. Мира обещала починить ворота завтра.") => narrative + `\n<deeprole_characters>${JSON.stringify(value)}</deeprole_characters>`;
const turn = (patch: Record<string, unknown>) => ({ version: 2, world: scope.world, chat: scope.chat, branch: scope.branch, ...patch });
describe("safe independent game updates", () => {
  it("missing fields and legacy empty values keep known state; clearing is explicit", () => {
    const scene = structuredClone(scope.scene); scene.states["person-1"]!.goal = "Keep the key";
    const result = parseStoryUpdate(block(turn({ updates: [{ id: "person-1", state: { condition: { op: "set", value: "At the gate" }, goal: "" } }] })), { ...scope, scene });
    expect(result.turn!.updates[0]!.state).toMatchObject({ condition: "At the gate", goal: "Keep the key" });
    expect(parseStoryUpdate(block(turn({ updates: [{ id: "person-1", state: { goal: { op: "clear" } } }] })), { ...scope, scene }).turn!.updates[0]!.state.goal).toBe("");
  });
  it("one broken field and one broken person do not lose the valid state", () => {
    const result = parseStoryUpdate(block(turn({ updates: [{ id: "person-1", state: { condition: "At the gate", goal: 42 } }, { id: "unknown", state: { condition: "Elsewhere" } }] })), scope);
    expect(result.turn!.updates).toHaveLength(1); expect(result.turn!.updates[0]!.state.condition).toBe("At the gate"); expect(result.diagnostic.status).toBe("partial"); expect(validStoryUpdateDiagnostic(result.diagnostic)).toBe(true);
    expect(JSON.stringify(result.diagnostic)).not.toContain("unknown");
  });
  it.each(["world", "chat", "branch"])("wrong %s rejects the complete metadata, including otherwise valid facts", field => {
    const result = parseStoryUpdate(block(turn({ [field]: "foreign", updates: [{ id: "person-1", state: { condition: "Bad" } }], facts: [{ text: "Key received", kind: "event", quote: "Мира передала медный ключ." }] })), scope);
    expect(result.turn).toBeNull(); expect(result.facts).toEqual([]); expect(result.diagnostic.issues[0]!.rule).toBe("scope");
  });
  it("an invalid new-person reference leaves the complete scene membership intact", () => {
    const result = parseStoryUpdate(block(turn({ present: ["new:Visitor"], partners: ["new:Visitor"], updates: [{ id: "new:Visitor", state: { condition: "At the door" } }, { id: "person-1", state: { goal: "Find key" } }] })), scope);
    expect(result.turn!.present).toEqual(scope.scene.presentIds); expect(result.turn!.updates[0]!.state.goal).toBe("Find key");
  });
  it("ambiguous aliases and duplicated targets are not silently overwritten", () => {
    const result = parseStoryUpdate(block(turn({ updates: [{ id: "person-1", state: { goal: "A" } }, { id: f.entities[0]!.name, state: { goal: "B" } }] })), scope);
    expect(result.turn?.updates ?? []).toHaveLength(0); expect(result.diagnostic.issues.some(i => i.rule === "duplicate")).toBe(true);
  });
  it("reads the observed Mistral presence list without applying nested state", () => {
    const entities = scope.entities.map((person, index) => ({ ...person, name: wrappedPresence.names[index] ?? person.name }));
    const scene = { ...scope.scene, presentIds: ["person-1"] };
    const facts = [{ kind: "event", risk: "ordinary", sentence: 1 }];
    const present = ["person-1", wrappedPresence.present[1]];
    const result = parseStoryUpdate(block(turn({ present, partners: ["Mira"], facts }), wrappedPresence.reply), { ...scope, entities, scene });
    expect(result.turn).toMatchObject({ present: wrappedPresence.expectedPresent, partners: ["person-2"], updates: [] });
    expect(result.facts).toEqual([{ kind: "event", text: wrappedPresence.reply, quote: wrappedPresence.reply }]);
    expect(result.diagnostic.issues).toEqual([]);
  });
  it.each([
    [{ id: "person-3", name: "Resident 2" }],
    [{ id: "new:Visitor", name: "Visitor" }],
    [{ id: "person-3", name: "Resident 3", state: "standing" }],
    [{ id: "person-3", name: "Resident 3", worldId: "other-world" }],
    [{ id: "Courier" }],
    ["person-3", { id: "person-3" }],
  ])("holds saved presence when a membership object is invalid (%j)", (...present) => {
    const entities = scope.entities.map(person => ({ ...person, aliases: ["Courier"] }));
    const updates = [{ id: "person-1", state: { goal: "Take the key" } }];
    const result = parseStoryUpdate(block(turn({ present, updates })), { ...scope, entities });
    expect(result.turn?.present).toEqual(scope.scene.presentIds);
    expect(result.turn?.updates[0]?.state.goal).toBe("Take the key");
    expect(result.diagnostic.issues).toMatchObject([{ path: "present", rule: "reference" }]);
  });
  it("keeps plans and promises separate, requires exact evidence and never auto-approves them", () => {
    const result = parseStoryUpdate(block(turn({ facts: [{ text: "Мира передала медный ключ", kind: "event", quote: "Мира передала медный ключ." }, { text: "Мира обещала ремонт завтра", kind: "promise", quote: "Мира обещала починить ворота завтра." }, { text: "Ремонт выполнен", kind: "event", quote: "Несуществующая цитата" }] })), scope);
    expect(result.facts.map(f => f.kind)).toEqual(["event", "promise"]); expect(result.diagnostic.skipped).toBe(1); expect(validStoryUpdateDiagnostic(result.diagnostic)).toBe(true);
  });
  it("does not use a quote present only inside its own metadata", () => {
    expect(parseStoryUpdate(block(turn({ facts: [{ text: "Made up", kind: "event", quote: "Private invented text" }] })), scope).facts).toEqual([]);
    expect(parseStoryUpdate(block(turn({ facts: [{ kind: "event", quote: "Мира положила ключ в ящик.", risk: "ordinary" }] })), scope).facts).toEqual([]);
  });
  it("keeps the Russian source verbatim and rejects its English translation", () => {
    const quote = "Мира обнаружила на дверном косяке вогнутый ромб.";
    const translated = "Mira found a concave diamond on the door frame.";
    const facts = [quote, translated].map(quote => ({ kind: "event", risk: "ordinary", quote }));
    const result = parseStoryUpdate(block(turn({ facts }), quote), scope);
    expect(result.facts).toEqual([{ kind: "event", text: quote, quote }]);
    expect(result.diagnostic.issues).toMatchObject([{ path: "facts[1]", rule: "quote" }]);
  });
  it("reads a real sentence by position and rejects pointers to a question or hidden text", () => {
    const quote = "Мира обнаружила на дверном косяке вогнутый ромб.";
    const facts = [1, 2, 3, "2"].map(sentence => ({ kind: "event", risk: "ordinary", sentence }));
    const result = parseStoryUpdate(block(turn({ facts }), `Это дверь? ${quote}<deeprole_choices>Секретный ход.</deeprole_choices>`), scope);
    expect(result.facts).toEqual([{ kind: "event", text: quote, quote }]);
    expect(result.diagnostic).toMatchObject({ skipped: 3, facts: 1 });
  });
  it("stores the numbered source when the model also returns a translated summary", () => {
    const quote = "Мира обнаружила на дверном косяке вогнутый ромб.";
    const row = { kind: "event", risk: "ordinary", sentence: 1, text: "Mira found a concave diamond." };
    const result = parseStoryUpdate(block(turn({ facts: [row, { ...row, claim: { key: "bad" } }] }), quote), scope);
    expect(result.facts).toEqual([{ kind: "event", text: quote, quote }]);
    expect(result.diagnostic).toMatchObject({ skipped: 1, facts: 1 });
  });
  it("recognizes numbered events in the observed Mistral packet and prefers an explicit facts list", () => {
    const quote = "На дверном косяке обнаружился вогнутый ромб.";
    const events = [{ kind: "event", risk: "ordinary", sentence: 1 }];
    expect(parseStoryUpdate(block(turn({ events }), quote), scope).facts).toEqual([{ kind: "event", text: quote, quote }]);
    expect(parseStoryUpdate(block(turn({ events, facts: [] }), quote), scope).facts).toEqual([]);
  });
  it.each([
    "Мира вспомнила, что это всего лишь рисунок.",
    "Ключ лежит под зелёной лампой?",
    "Ключ лежит под зелёной лампой. Под зелёной лампой лежит и письмо. Ключ блестит под зелёной лампой.",
    "Ключ лежит под зелёной лампой",
  ])("rejects an absent, repeated, or non-statement fact anchor in %s", prose => {
    const value = turn({ facts: [{ kind: "event", anchor: "под зелёной лампой", risk: "ordinary" }] });
    expect(parseStoryUpdate(block(value, prose), scope).facts).toEqual([]);
  });
  it("does not use an anchor crossing a sentence or starting inside another word", () => {
    const prose = "The note reads spring gate code. Mira closes the ledger.";
    const facts = ["ring gate code", "gate code. Mira"].map(anchor => ({ kind: "event", anchor, risk: "ordinary" }));
    expect(parseStoryUpdate(block(turn({ facts }), prose), scope).facts).toEqual([]);
  });
  it("keeps a statement from an emphasized note without stray Markdown", () => {
    const quote = '"Amber compass in drawer 47 behind the jade sextant."';
    const facts = [{ kind: "event", anchor: "behind the jade sextant", risk: "ordinary" }];
    const result = parseStoryUpdate(block(turn({ facts }), `You read:\n\n**${quote}**\n\nYou fold the note.`), scope);
    expect(result.facts).toEqual([{ kind: "event", text: quote, quote }]);
  });
  it("keeps conditions in the whole sourced sentence and rejects anchors for claims", () => {
    const quote = "Если Артур согласится, ключ останется под зелёной лампой.";
    const event = { kind: "event", anchor: "под зелёной лампой", risk: "ordinary" };
    const claim = { ...event, claim: { scope: "state", key: "key.location", value: "зелёная лампа" } };
    const result = parseStoryUpdate(block(turn({ facts: [event, claim] }), quote), scope);
    expect(result.facts).toEqual([{ kind: "event", text: quote, quote }]);
    expect(result.diagnostic.skipped).toBe(1);
  });
  it("keeps multiline evidence exact and excludes choices and paraphrased whitespace", () => {
    const prose = "Мира\nпередала ключ.", data = turn({ facts: [{ text: "Ключ передан", kind: "event", quote: prose }, { text: "Не точная цитата", kind: "event", quote: "Мира передала ключ." }, { text: "Не сыграно", kind: "event", quote: "Пройти в дом" }] });
    const result = parseStoryUpdate(block(data, prose + '<deeprole_choices>{"text":"Пройти в дом"}</deeprole_choices>'), scope);
    expect(result.facts).toEqual([{ text: "Ключ передан", kind: "event", quote: prose }]); expect(result.diagnostic.skipped).toBe(2);
  });
  it("explains skipped fact quotes independently of valid character updates", () => {
    const result = parseStoryUpdate(block(turn({
      updates: [{ id: "person-1", state: { condition: "Standing by the gate" } }],
      facts: [
        { text: "The player promised to carry the key", kind: "promise", quote: "Я отнесу ключ.", risk: "ordinary" },
        { text: "Mira sorted the papers", kind: "event", quote: "Мира подошла к столу... и разобрала бумаги.", risk: "ordinary" },
        { text: "Mira opened the window", kind: "event", quote: "Мира открыла окно.", risk: "ordinary" },
      ],
    }), "Мира подошла к столу, зажгла лампу и разобрала бумаги. Мира открыла окно."), scope);
    expect(result.diagnostic).toMatchObject({ status: "partial", skipped: 2, facts: 1 });
    expect(result.turn?.updates[0]?.state.condition).toBe("Standing by the gate");
    expect(result.facts[0]?.quote).toBe("Мира открыла окно.");
    expect(storyUpdateNotice("ru", result.diagnostic)).toBe(storyUpdateText("ru", "factQuotesSkipped"));
    expect(storyUpdateNotice("en", result.diagnostic)).toBe(storyUpdateText("en", "factQuotesSkipped"));
  });
  it("broken JSON is reported without exposing its text", () => {
    const result = parseStoryUpdate('PRIVATE <deeprole_characters>{invalid SECRET}</deeprole_characters>', scope);
    expect(result.diagnostic.status).toBe("rejected"); expect(validStoryUpdateDiagnostic(result.diagnostic)).toBe(true); expect(JSON.stringify(result.diagnostic)).not.toMatch(/PRIVATE|SECRET/);
  });
  it("requested legacy metadata needs an exact local source receipt when destination fields are absent", () => {
    const text = block({ request: "request-abcd", updates: [{ id: "person-1", state: { goal: "Known" } }] });
    expect(parseStoryUpdate(text, scope).turn).toBeNull(); expect(parseStoryUpdate(text, { ...scope, requestId: "request-abcd" }).turn).not.toBeNull();
  });
});
