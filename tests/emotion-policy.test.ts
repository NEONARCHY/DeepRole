import { afterEach, expect, it } from "vitest";
import { allowedCharacterActions, characterStatusForSheet, MAX_BLOCKED_ACTIONS, resolveCharacterAction, validBlockedActions } from "../src/core/character-actions";
import { characterInstruction, characterRevision, DEFAULT_ACTIONS, EMPTY_CHARACTER, EMPTY_STATUS, parseCharacterTurn, portraitSources, validCharacterSheet, type CharacterTurn } from "../src/core/characters";
import { characterEditBaseline, mergeCharacterEdit } from "../src/core/character-edit";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { applyCharacterTurn, saveCharacter } from "../src/storage/characters";
import { cloneWorldPackage, duplicateEntity, exportWorld, parseWorldPackage } from "../src/storage/worlds";
import { createBackup, parseBackup } from "../src/storage/backup";
import type { CharacterScene, ChatBinding, SceneEntity, WorldProfile } from "../src/core/types";

const sheet = { ...EMPTY_CHARACTER, blockedActions: ["angry", "retired"], sprites: { neutral: "data:image/png;base64,AAAA", angry: ["data:image/png;base64,BBBB"] }, portraitLibrary: ["data:image/png;base64,CCCC"] };
const entity: SceneEntity = { id: "mira", worldId: "w", name: "Mira", kind: "character", description: "Keep ALL original lore", aliases: ["Friend"], memberIds: [], createdAt: 1, updatedAt: 1, characterSheet: sheet };
const scene: CharacterScene = { revision: "r1", presentIds: [entity.id], states: { mira: { ...EMPTY_STATUS, action: "happy", condition: "Safe" } }, updatedAt: 1 };
const world: WorldProfile = { id: "w", name: "Harbor", description: "Unchanged", color: "#123456", contextBudget: 2000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
const binding: ChatBinding = { id: "binding:a", chatId: "a", chatUrl: "https://chat.deepseek.com/chat/s/a", worldId: "w", bookId: null, focusIds: [], messageCountAtAnalysis: 0, characterScenes: { w: scene }, createdAt: 1, updatedAt: 1 };
const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { await Promise.all(dbs.splice(0).map(db => db.delete())); });
async function setup() {
  const db = new DeepRoleDatabase("action-policy-" + crypto.randomUUID()); dbs.push(db); const repo = new DeepRoleRepository(db);
  await repo.mergeRecords([{ kind: "world", id: "w", data: world }, { kind: "entity", id: entity.id, data: entity }, { kind: "binding", id: binding.id, data: binding }, { kind: "binding", id: "binding:b", data: { ...binding, id: "binding:b", chatId: "b", chatUrl: "https://chat.deepseek.com/chat/s/b" } }]); return repo;
}
const scope = { worldId: "w", chatId: "a", chatUrl: binding.chatUrl, base: characterRevision([entity], scene) };
const turn = (action = "angry"): CharacterTurn => ({ world: "w", chat: "a", base: scope.base, present: ["mira"], partners: ["mira"], updates: [{ id: "mira", state: { ...EMPTY_STATUS, action, goal: "Open the gate", condition: "Tired", stats: [{ label: "Energy", value: "Low" }] } }] });

it("allows all legacy actions and automatically allows newly added world keys", () => {
  expect(allowedCharacterActions(EMPTY_CHARACTER, DEFAULT_ACTIONS)).toEqual(DEFAULT_ACTIONS);
  expect(allowedCharacterActions(sheet, [...DEFAULT_ACTIONS, "focused"])).toEqual([...DEFAULT_ACTIONS.filter(key => key !== "angry"), "focused"]);
  expect(allowedCharacterActions(sheet, ["neutral", "retired"])).toEqual(["neutral"]);
  expect(validCharacterSheet(EMPTY_CHARACTER)).toBe(true);
});
it.each([null, "happy", ["neutral"], ["angry", "angry"], [""], [" happy"], ["__proto__"], ["constructor"], ["prototype"], ["a".repeat(33)], Array.from({ length: MAX_BLOCKED_ACTIONS + 1 }, (_, i) => `old${i}`)])("rejects an invalid local rule %j", blockedActions => {
  expect(validBlockedActions(blockedActions)).toBe(false); expect(validCharacterSheet({ ...EMPTY_CHARACTER, blockedActions })).toBe(false);
});
it("accepts empty, multilingual and retired exclusions within the bounded limit", () => {
  expect(validBlockedActions([])).toBe(true); expect(validBlockedActions(["смех", "laughter", "集中"])).toBe(true);
  expect(validBlockedActions(Array.from({ length: MAX_BLOCKED_ACTIONS }, (_, i) => `old${i}`))).toBe(true);
});
it("keeps an allowed previous action, otherwise neutral; unknown global keys are not previous fallbacks", () => {
  expect(resolveCharacterAction(sheet, "angry", "happy", DEFAULT_ACTIONS)).toBe("happy");
  expect(resolveCharacterAction(sheet, "angry", "retired", DEFAULT_ACTIONS)).toBe("neutral");
  expect(resolveCharacterAction(sheet, "angry", "old-unblocked", DEFAULT_ACTIONS)).toBe("neutral");
  expect(resolveCharacterAction(sheet, "sad", "happy", DEFAULT_ACTIONS)).toBe("sad");
});
it("protects imported states and game portraits without modifying images or narrative fields", () => {
  const state = { ...EMPTY_STATUS, action: "angry", goal: "Keep this" };
  expect(characterStatusForSheet(sheet, state)).toEqual({ ...state, action: "neutral" }); expect(state.action).toBe("angry");
  expect(portraitSources(sheet, "angry")[0]).toBe(sheet.sprites.neutral);
  expect(portraitSources(sheet, "angry", 0, true)[0]).toBe(sheet.sprites.angry[0]);
  expect(sheet.sprites.angry).toEqual(["data:image/png;base64,BBBB"]);
});
it.each(["normal", "service", "unbound"])("supplies off-focus personal rules and safe state in %s prompts", mode => {
  const people = Array.from({ length: 9 }, (_, i) => ({ ...entity, id: `person${i}`, name: `Person ${i}`, characterSheet: i === 8 ? sheet : EMPTY_CHARACTER }));
  const imported = { ...scene, presentIds: people.map(p => p.id), states: { person8: { ...EMPTY_STATUS, action: "angry" } } };
  const prompt = characterInstruction("w", mode === "unbound" ? "" : "a", people, imported, DEFAULT_ACTIONS, [], "", "request_id", false, mode === "service");
  const rules = JSON.parse(prompt.match(/Personal action rules: (.+)\n/)![1]!);
  expect(rules).toContainEqual({ id: "Person 8", allowed: DEFAULT_ACTIONS.filter(key => key !== "angry"), portraits: ["neutral"] });
  expect(prompt).not.toContain('"action":"angry"');
});
it("does not repeat unrestricted lists or send images and local deny keys", () => {
  const normal = characterInstruction("w", "a", [{ ...entity, characterSheet: EMPTY_CHARACTER }], scene, DEFAULT_ACTIONS, [], "");
  const rules = JSON.parse(normal.match(/Personal action rules: (.+)\n/)![1]!);
  expect(rules).toEqual([{ id: "mira", portraits: [] }]);
  expect(normal.match(/Action catalog:/g)).toHaveLength(1);
  const restricted = characterInstruction("w", "a", [entity], scene, DEFAULT_ACTIONS, [], "", "request_id");
  expect(restricted).not.toContain("data:image"); expect(restricted).not.toContain("blockedActions"); expect(restricted).not.toContain('"retired"');
});
it("accepts other fields when the model violates the rule, without deleting portraits or other chats", async () => {
  const repo = await setup(); await applyCharacterTurn(scope, turn(), DEFAULT_ACTIONS, repo);
  const saved = (await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!;
  expect(saved.states.mira).toMatchObject({ action: "happy", goal: "Open the gate", condition: "Tired", stats: [{ label: "Energy", value: "Low" }] });
  expect((await repo.get<SceneEntity>("entity", "mira"))).toEqual(entity);
  expect((await repo.get<ChatBinding>("binding", "binding:b"))!.characterScenes!.w).toEqual(scene);
});
it("an unknown action preserves an allowed previous action without dropping other valid fields", async () => {
  const repo = await setup();
  await applyCharacterTurn(scope, turn("invented"), DEFAULT_ACTIONS, repo);
  expect((await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!.states.mira).toMatchObject({ action: "happy", goal: "Open the gate" });
  expect(await repo.get("entity", entity.id)).toEqual(entity);
});
it("a blocked action does not discard updates for an unrestricted character in the same reply", async () => {
  const repo = await setup(); const friend = { ...entity, id: "leon", name: "Leon", aliases: [], characterSheet: EMPTY_CHARACTER };
  await repo.put("entity", friend);
  const base = characterRevision([entity, friend], scene);
  await applyCharacterTurn({ ...scope, base }, { ...turn(), base, present: ["mira", "leon"], updates: [...turn().updates, { id: "leon", state: { ...EMPTY_STATUS, action: "angry", goal: "Protect the harbor" } }] }, DEFAULT_ACTIONS, repo);
  const saved = (await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!;
  expect(saved.states.mira!.action).toBe("happy"); expect(saved.states.leon).toMatchObject({ action: "angry", goal: "Protect the harbor" });
});
it("handles a removed blocked key as a action violation rather than losing an otherwise valid update", async () => {
  const repo = await setup(); await applyCharacterTurn(scope, turn("retired"), DEFAULT_ACTIONS, repo);
  expect((await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!.w!.states.mira).toMatchObject({ action: "happy", goal: "Open the gate" });
});
it("does not grant the model authority to change personal rules", async () => {
  const repo = await setup(); const parsed = parseCharacterTurn(`<deeprole_characters>${JSON.stringify({ ...turn(), updates: [{ ...turn().updates[0], blockedActions: [], characterSheet: { blockedActions: [] } }] })}</deeprole_characters>`)!;
  await applyCharacterTurn(scope, parsed, DEFAULT_ACTIONS, repo);
  expect((await repo.get<SceneEntity>("entity", "mira"))!.characterSheet).toEqual(sheet);
});
it("merges separate rule toggles without undoing a live reply or other fields", async () => {
  const repo = await setup(); const original = characterEditBaseline(entity, [entity], scene);
  const edit = { ...scope, ...original, original, entityId: "mira", sheet: { ...sheet, blockedActions: [...sheet.blockedActions, "sad"] } };
  await applyCharacterTurn(scope, turn("worried"), DEFAULT_ACTIONS, repo);
  const first = await saveCharacter(edit, repo); expect(first.original.state).toMatchObject({ action: "worried", goal: "Open the gate" });
  const merged = mergeCharacterEdit(original, { ...original, sheet: { ...sheet, blockedActions: [...sheet.blockedActions, "happy"] } }, first.original);
  expect(new Set(merged.sheet.blockedActions)).toEqual(new Set(["angry", "retired", "sad", "happy"]));
});
it("saving a rule falls back locally but keeps old chat facts, images and raw backups", async () => {
  const repo = await setup(); const original = characterEditBaseline(entity, [entity], scene);
  const saved = await saveCharacter({ ...scope, ...original, original, entityId: "mira", sheet: { ...sheet, blockedActions: [...sheet.blockedActions, "happy"] } }, repo);
  expect(saved.original.state).toMatchObject({ ...scene.states.mira, action: "neutral" }); expect(saved.original.sheet.sprites).toEqual({ neutral: sheet.sprites.neutral });
  expect(saved.original.sheet.portraitLibrary).toEqual([sheet.portraitLibrary[0], sheet.sprites.angry[0]]);
  const person = (await repo.get<SceneEntity>("entity", "mira"))!; expect(person.description).toBe(entity.description);
  const pack = parseWorldPackage(JSON.stringify(await exportWorld("w", repo)));
  expect((cloneWorldPackage(pack).find(row => row.kind === "entity")!.data as SceneEntity).characterSheet).toEqual(person.characterSheet);
  await duplicateEntity(person, "Mira copy", repo); expect((await repo.list<SceneEntity>("entity")).find(p => p.name === "Mira copy")!.characterSheet).toEqual(person.characterSheet);
  expect((await parseBackup(JSON.stringify(await createBackup(undefined, repo)))).records).toEqual(await repo.rawRecords());
});
