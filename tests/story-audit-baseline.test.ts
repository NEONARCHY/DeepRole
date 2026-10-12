import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bindCharacterTurn, characterInstruction, characterRevision, EMPTY_STATUS, parseCharacterTurn, validCharacterSheet, type CharacterTurn } from "../src/core/characters";
import { CAST_MAX_SOURCE, castParts } from "../src/core/cast-initialization";
import { compileMemoryWorkspace } from "../src/core/memory-workspace";
import { formatMemoryContext } from "../src/core/context";
import { sceneChoiceInstruction } from "../src/core/scene-choices";
import { estimateTokens } from "../src/core/text";
import { validDataRecord } from "../src/core/record-validation";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { applyCharacterTurn } from "../src/storage/characters";
import { runStoryGame } from "../src/storage/story-game";
import { nativeStoryMessageKey } from "../src/core/story-transport";
import { parseStoryUpdate } from "../src/core/story-update";
import type { ChatBinding, SceneEntity } from "../src/core/types";
import { detailedStoryWorld, storyVariants, storyWorld } from "./fixtures/story-worlds";

// Characterization is not a fix. Acceptance tests marked TODO below must become
// ordinary passing tests in their named stage, without weakening security checks.
const databases: DeepRoleDatabase[] = [];
afterAll(async () => { await Promise.all(databases.map(db => db.delete())); });
async function setup() {
  const fixture = storyWorld();
  const db = new DeepRoleDatabase("rp00-audit-" + crypto.randomUUID()); databases.push(db);
  const repo = new DeepRoleRepository(db); await repo.mergeRecords(fixture.records);
  const scene = fixture.binding.characterScenes![fixture.world.id]!;
  const scope = { worldId: fixture.world.id, chatId: fixture.binding.chatId, chatUrl: fixture.binding.chatUrl, base: characterRevision(fixture.entities, scene) };
  const turn: CharacterTurn = { world: scope.worldId, chat: scope.chatId, base: scope.base, present: [], updates: [] };
  return { ...fixture, repo, scope, turn };
}
const block = (value: unknown) => `<deeprole_characters>${JSON.stringify(value)}</deeprole_characters>`;

describe("RP-00 synthetic fixtures", () => {
  it.each(["ru", "en"] as const)("validates every %s setting, including 1000 people and distinct alternatives", locale => {
    const variants = storyVariants(locale);
    for (const fixture of Object.values(variants)) expect(fixture.records.every(validDataRecord)).toBe(true);
    expect(variants.large.entities).toHaveLength(1000);
    expect(variants.heroes.entities.filter(e => e.characterSheet!.protagonist)).toHaveLength(2);
    expect(variants.ambiguous.entities[0]!.name).toBe(variants.ambiguous.entities[1]!.name);
    expect(variants.ambiguous.entities[0]!.id).not.toBe(variants.ambiguous.entities[1]!.id);
    const bindings = variants.branches.records.filter(r => r.kind === "binding").map(r => r.data as ChatBinding);
    expect(bindings[0]!.characterScenes).not.toEqual(bindings[1]!.characterScenes);
    expect(variants.ordinary.world.description).not.toBe(variants.fantasy.world.description);
  });
});

describe("RP-00 known gaps from the audit, not repaired in this stage", () => {
  it("[RP-03] new scene character gets only the limited initial profile", async () => {
    const { repo, scope, turn } = await setup();
    const parsed = parseCharacterTurn(block({ ...turn, present: ["new:Visitor"], updates: [{ id: "new:Visitor", name: "Visitor", appearance: "Gray coat", personality: "Patient", goals: "Deliver a letter", background: "A courier", state: { ...EMPTY_STATUS, goal: "Deliver a letter" } }] }));
    expect(parsed).not.toBeNull();
    await applyCharacterTurn(scope, parsed!, undefined, repo);
    const visitor = (await repo.list<SceneEntity>("entity")).find(e => e.name === "Visitor")!;
    expect(visitor.characterSheet).toMatchObject({ appearance: "Gray coat", personality: "Patient", goals: "", background: "", protagonist: false });
  });
  it.todo("[RP-03] populate a new profile from verified evidence, without allowing model-assigned protagonist or invented facts");

  it("[RP-03] live update does not fill even an empty existing profile", async () => {
    const { repo, scope, turn, entities } = await setup();
    const person = entities[1]!; person.characterSheet!.appearance = ""; person.characterSheet!.personality = "";
    await repo.put("entity", person);
    await applyCharacterTurn(scope, { ...turn, updates: [{ id: person.id, appearance: "Gray coat", personality: "Patient", state: EMPTY_STATUS }] }, undefined, repo);
    expect((await repo.get<SceneEntity>("entity", person.id))!.characterSheet).toMatchObject({ appearance: "", personality: "" });
  });
  it.todo("[RP-03] enrich an existing profile through verified proposals while preserving manual fields");

  it("[RP-01] saved first answer prevents binding its regenerated alternative to the changed scene", async () => {
    const { repo, scope, turn, binding, world, entities } = await setup();
    const first = { ...turn, request: "request-synthetic-001", updates: [{ id: entities[0]!.id, state: { ...EMPTY_STATUS, goal: "Repair the clock" } }] };
    const receipt = { id: first.request, worldId: scope.worldId, chatId: scope.chatId, base: scope.base, accepted: true, createdAt: 20 };
    expect(bindCharacterTurn(first, receipt, scope)).not.toBeNull();
    await applyCharacterTurn(scope, first, undefined, repo);
    const scene = (await repo.get<ChatBinding>("binding", binding.id))!.characterScenes![world.id]!;
    const nextScope = { ...scope, base: characterRevision(entities, scene) };
    expect(nextScope.base).not.toBe(scope.base);
    expect(bindCharacterTurn({ ...first, updates: [{ id: entities[0]!.id, state: { ...EMPTY_STATUS, goal: "Sell the clock" } }] }, receipt, nextScope)).toBeNull();
  });
  it("[RP-01] selects alternatives by native lineage while the legacy receipt remains strict", async () => {
    const f = await setup(), key = nativeStoryMessageKey;
    const message = (id: string, parent: string | null, role: "user" | "assistant", content: string) => ({ identity: { nativeMessageKey: key(id), nativeParentKey: parent === null ? null : key(parent), role }, completion: "complete" as const, content });
    const snapshot = { chatId: f.binding.chatId, selectedNativeKey: key("2"), messages: [message("1", null, "user", "Begin"), message("2", "1", "assistant", "Workshop")] };
    const play = async (operation: "start" | "sync") => { const binding = (await f.repo.get<ChatBinding>("binding", f.binding.id))!; return runStoryGame({ chatId: binding.chatId, worldId: f.world.id, expectedBase: characterRevision(f.entities, binding.characterScenes![f.world.id]), operation, snapshot, nativeParentKey: null, manual: "stop" }, (await import("../src/core/defaults")).DEFAULT_SETTINGS, f.repo); };
    await play("start"); const first = { ...f.turn, request: "request-synthetic-001", updates: [{ id: f.entities[0]!.id, state: { ...EMPTY_STATUS, goal: "Repair" } }] }, alternative = { ...first, updates: [{ id: f.entities[0]!.id, state: { ...EMPTY_STATUS, goal: "Sell" } }] };
    snapshot.messages.push(message("3", "2", "user", "Choose"), message("4", "3", "assistant", block(first)), message("5", "3", "assistant", block(alternative))); snapshot.selectedNativeKey = key("4"); await play("sync"); snapshot.selectedNativeKey = key("5"); await play("sync");
    const scene = (await f.repo.get<ChatBinding>("binding", f.binding.id))!.characterScenes![f.world.id]!; expect(scene.states[f.entities[0]!.id]!.goal).toBe("Sell");
    expect(bindCharacterTurn(alternative, { id: first.request, worldId: f.world.id, chatId: f.binding.chatId, base: f.scope.base, accepted: true, createdAt: 20 }, { ...f.scope, base: characterRevision(f.entities, scene) })).toBeNull();
  });

  it("[RP-02] one invalid independent item causes loss of the whole parsed block", async () => {
    const { turn, entities } = await setup();
    const good = { id: entities[0]!.id, state: EMPTY_STATUS };
    expect(parseCharacterTurn(block({ ...turn, updates: [good] }))).not.toBeNull();
    expect(parseCharacterTurn(block({ ...turn, updates: [good, { id: entities[1]!.id, state: { ...EMPTY_STATUS, condition: 123 } }] }))).toBeNull();
  });
  it("[RP-02] accepts independent updates only after validating the complete destination", async () => {
    const f = await setup(), scope = { world: f.world.id, chat: f.binding.chatId, branch: "native-branch", base: f.scope.base, entities: f.entities, scene: f.binding.characterScenes![f.world.id] };
    const value = { ...f.turn, branch: scope.branch, updates: [{ id: f.entities[0]!.id, state: { condition: "Valid" } }, { id: f.entities[1]!.id, state: { condition: 42 } }] };
    const result = parseStoryUpdate(block(value), scope); expect(result.turn!.updates[0]!.state.condition).toBe("Valid"); expect(result.diagnostic.skipped).toBe(1);
    expect(parseStoryUpdate(block({ ...value, world: "foreign" }), scope).turn).toBeNull();
  });

  it.each(["ru", "en"] as const)("[RP-05] a %s pronoun-only query has no inferred link to a relevant fact", locale => {
    const fixture = storyWorld(locale);
    const compile = (draft: string, focusIds: string[] = []) => compileMemoryWorkspace({ draft, recentMessages: [], entries: [fixture.entry], activeBookId: null, entities: fixture.entities, worlds: [fixture.world], scene: { worldId: fixture.world.id, bookId: null, focusIds }, settings: fixture.world }).selection;
    expect(compile(locale === "ru" ? "Ключ от часов" : "clock key").entries).toHaveLength(1);
    expect(compile(locale === "ru" ? "Где она его оставила?" : "Where did she leave it?").entries).toHaveLength(0);
    expect(compile(locale === "ru" ? "Где она его оставила?" : "Where did she leave it?", fixture.entry.entityIds).entries).toHaveLength(1);
  });
  it.todo("[RP-05] retrieve pronoun-linked facts using observed participants or safe disambiguation, not guessed identity");

  it("[RP-03] explicit focus reaches person 41 in a bounded request", () => {
    const fixture = storyWorld("en", 41), last = fixture.entities[40]!;
    last.characterSheet!.background = "UNIQUE_FOCUSED_PROFILE";
    const prompt = characterInstruction(fixture.world.id, fixture.binding.chatId, fixture.entities, undefined, ["neutral"], [last.id], "");
    expect(prompt).toContain(fixture.entities[0]!.id);
    expect(prompt).toContain(last.id); expect(prompt).toContain("UNIQUE_FOCUSED_PROFILE");
  });

  it("[RP-03] preparation rejects a large complete source instead of processing it incrementally", () => {
    const source = { id: "synthetic-source", title: "Archive", text: "A".repeat(CAST_MAX_SOURCE), at: 20 };
    expect(() => castParts([source])).toThrow("world-too-large");
    expect(castParts([{ ...source, text: "Small synthetic archive" }]).join("")).toBe(JSON.stringify([{ ...source, text: "Small synthetic archive" }]));
  });
  it.todo("[RP-03] resumably prepare large lore in bounded source slices without discarding original text");

  it("[RP-05] six valid profiles exhaust memory budget and choice instructions are absent from the displayed total", () => {
    const fixture = detailedStoryWorld();
    expect(fixture.entities.every(e => validCharacterSheet(e.characterSheet))).toBe(true);
    const characterText = characterInstruction(fixture.world.id, fixture.binding.chatId, fixture.entities, fixture.binding.characterScenes![fixture.world.id], ["neutral"], fixture.binding.focusIds!, "clock key");
    const compile = (budget: number) => compileMemoryWorkspace({ draft: "clock key", recentMessages: [], entries: [fixture.entry], worlds: [fixture.world], entities: fixture.entities, activeBookId: null, scene: { worldId: fixture.world.id, bookId: null, focusIds: fixture.binding.focusIds! }, settings: { ...fixture.world, contextBudget: budget } }).selection;
    expect(compile(fixture.world.contextBudget).entries).toHaveLength(1);
    expect(estimateTokens(characterText)).toBeGreaterThan(fixture.world.contextBudget);
    const selection = compile(Math.max(0, fixture.world.contextBudget - estimateTokens(characterText)));
    expect(selection.entries).toHaveLength(0);
    const memoryText = formatMemoryContext(selection);
    // Mirrors content.tsx's present accounting; the acceptance test must move
    // to the unified runtime compiler in RP-05, not merely duplicate a new formula.
    const displayed = (memoryText ? estimateTokens(memoryText) : 0) + estimateTokens(characterText);
    const actuallySent = [memoryText, characterText, sceneChoiceInstruction()].filter(Boolean).join("\n\n");
    expect(estimateTokens(actuallySent)).toBeGreaterThan(displayed);
  });
  it.todo("[RP-05] budget the complete outgoing context and reserve useful memory before compressing optional profiles");
});

describe("RP-00 security guards for future fixes", () => {
  let fixture: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => { fixture = await setup(); });
  it("rejects a forged request even when its story text is plausible", () => {
    const receipt = { id: "request-synthetic-001", worldId: fixture.world.id, chatId: fixture.binding.chatId, base: fixture.scope.base, accepted: true, createdAt: 20 };
    expect(bindCharacterTurn({ ...fixture.turn, request: "request-synthetic-forged" }, receipt, fixture.scope)).toBeNull();
    expect(bindCharacterTurn({ ...fixture.turn, request: receipt.id }, { ...receipt, chatId: "other-chat" }, fixture.scope)).toBeNull();
    expect(bindCharacterTurn({ ...fixture.turn, request: receipt.id }, { ...receipt, accepted: false }, fixture.scope)).toBeNull();
  });
  it("does not choose one of two characters sharing an alias and leaves the database unchanged", async () => {
    for (const person of fixture.entities.slice(0, 2)) await fixture.repo.put("entity", { ...person, aliases: ["Maker"] });
    const before = await fixture.repo.rawRecords();
    await expect(applyCharacterTurn(fixture.scope, { ...fixture.turn, updates: [{ id: "Maker", state: EMPTY_STATUS }] }, undefined, fixture.repo, true)).rejects.toThrow("character-unknown");
    expect(await fixture.repo.rawRecords()).toEqual(before);
  });
});
