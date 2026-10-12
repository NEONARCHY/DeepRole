import { describe, expect, it } from "vitest";
import { parseStoryUpdate, validStoryUpdateDiagnostic } from "../src/core/story-update";
import { storyWorld } from "./fixtures/story-worlds";
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
  it("keeps plans and promises separate, requires exact evidence and never auto-approves them", () => {
    const result = parseStoryUpdate(block(turn({ facts: [{ text: "Мира передала медный ключ", kind: "event", quote: "Мира передала медный ключ." }, { text: "Мира обещала ремонт завтра", kind: "promise", quote: "Мира обещала починить ворота завтра." }, { text: "Ремонт выполнен", kind: "event", quote: "Несуществующая цитата" }] })), scope);
    expect(result.facts.map(f => f.kind)).toEqual(["event", "promise"]); expect(result.diagnostic.skipped).toBe(1); expect(validStoryUpdateDiagnostic(result.diagnostic)).toBe(true);
  });
  it("does not use a quote present only inside its own metadata", () => {
    expect(parseStoryUpdate(block(turn({ facts: [{ text: "Made up", kind: "event", quote: "Private invented text" }] })), scope).facts).toEqual([]);
  });
  it("keeps multiline evidence exact and excludes choices and paraphrased whitespace", () => {
    const prose = "Мира\nпередала ключ.", data = turn({ facts: [{ text: "Ключ передан", kind: "event", quote: prose }, { text: "Не точная цитата", kind: "event", quote: "Мира передала ключ." }, { text: "Не сыграно", kind: "event", quote: "Пройти в дом" }] });
    const result = parseStoryUpdate(block(data, prose + '<deeprole_choices>{"text":"Пройти в дом"}</deeprole_choices>'), scope);
    expect(result.facts).toEqual([{ text: "Ключ передан", kind: "event", quote: prose }]); expect(result.diagnostic.skipped).toBe(2);
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
