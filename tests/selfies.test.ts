import { afterEach, describe, expect, it } from "vitest";
import { EMPTY_CHARACTER, EMPTY_STATUS, characterInstruction, characterRevision, characterTurnKey, parseCharacterTurn, validCharacterSheet } from "../src/core/characters";
import { DEFAULT_RELATIONSHIP } from "../src/core/relationships";
import { addSelfieLibraryImages, selfieCategories, selfieGate, selfieImageKey, resolveScenePhoto, validScenePhotos, validSelfieCategories } from "../src/core/selfies";
import { libraryImages } from "../src/core/portrait-library";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { applyCharacterTurn, saveCharacter } from "../src/storage/characters";
import { exportWorld, parseWorldPackage } from "../src/storage/worlds";
import { createBackup, parseBackup } from "../src/storage/backup";
import { characterEditBaseline } from "../src/core/character-edit";
import { validDataRecord } from "../src/core/record-validation";
import type { ChatBinding, CharacterScene, SceneEntity, SelfieCategory } from "../src/core/types";

const image = "data:image/png;base64,AAAA", other = "data:image/png;base64,BBBB";
const regular: SelfieCategory = { id: "regular", name: "Ordinary", description: "Default casual photo", default: true, minTrust: 40, minAffinity: 30, images: [image] };
const home: SelfieCategory = { ...regular, id: "home", name: "At home", description: "At home in a blue sweater", default: false, images: [other] };
const hero: SceneEntity = { id: "hero", worldId: "w", kind: "character", name: "Leon", description: "", aliases: [], memberIds: [], characterSheet: { ...EMPTY_CHARACTER, protagonist: true }, createdAt: 1, updatedAt: 1 };
const person: SceneEntity = { ...hero, id: "mira", name: "Mira", description: "UNTOUCHED LORE", characterSheet: { ...EMPTY_CHARACTER, relationships: { ...DEFAULT_RELATIONSHIP, initial: { trust: 65, affinity: 55 } }, selfieCategories: [regular, home] } };
const binding: ChatBinding = { id: "binding:a", chatId: "a", chatUrl: "https://chat.deepseek.com/chat/s/a", worldId: "w", bookId: null, messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 1 };
const world = { id: "w", name: "Harbor", description: "", color: "#123456", contextBudget: 8000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
const quote = "Mira smiles and sends Leon a selfie from home.";
const databases: DeepRoleDatabase[] = [];
afterEach(async () => { await Promise.all(databases.map(db => db.delete())); databases.length = 0; });
async function setup(mira = person) {
  const db = new DeepRoleDatabase("selfies-" + crypto.randomUUID()); databases.push(db);
  const repo = new DeepRoleRepository(db);
  await repo.mergeRecords([{ kind: "world", id: "w", data: world }, { kind: "binding", id: binding.id, data: binding }, { kind: "entity", id: hero.id, data: hero }, { kind: "entity", id: mira.id, data: mira }]);
  const base = characterRevision([hero, mira]);
  return { repo, scope: { worldId: "w", chatId: "a", chatUrl: binding.chatUrl, base, replyIdentity: '["message","reply-1"]', replyText: quote },
    turn: { world: "w", chat: "a", base, present: [hero.id, mira.id], updates: [], selfies: [{ id: mira.id, category: home.id, quote }] } };
}
describe("local selfie categories", () => {
  it("persists library selfies in exports and backups without detaching sources or changing lore", async () => {
    const sheet = { ...person.characterSheet!, portraitLibrary: [other], sprites: { neutral: image, happy: [image] } };
    const mira = { ...person, characterSheet: sheet }, { repo, scope } = await setup(mira);
    const categories = addSelfieLibraryImages(sheet.selfieCategories!, regular.id, libraryImages(sheet), [image, other]);
    await saveCharacter({ ...scope, original: characterEditBaseline(mira, [hero, mira]), entityId: mira.id, name: mira.name, sheet: { ...sheet, selfieCategories: categories }, state: EMPTY_STATUS, present: false }, repo);
    const saved = (await repo.get<SceneEntity>("entity", mira.id))!;
    expect(saved.characterSheet).toEqual({ ...sheet, selfieCategories: categories });
    expect(saved.description).toBe(mira.description); expect(await repo.get("entity", hero.id)).toEqual(hero);
    const pack = await parseWorldPackage(JSON.stringify(await exportWorld("w", repo)));
    expect((pack.records.find(r => r.kind === "entity" && (r.data as SceneEntity).name === mira.name)!.data as SceneEntity).characterSheet?.selfieCategories?.[0]?.images).toEqual([image, other]);
    expect((await parseBackup(JSON.stringify(await createBackup(undefined, repo)))).records).toEqual(await repo.rawRecords());
    const prompt = characterInstruction("w", "a", [hero, saved], undefined, ["neutral"], [], "Mira, send a selfie", "request-library", true);
    expect(prompt).not.toContain(image); expect(prompt).not.toContain(other); expect(prompt).toContain("may refuse");
  });
  it("validates collections and exports while keeping image bytes out of the model prompt", async () => {
    expect(validSelfieCategories([regular, home])).toBe(true); expect(validCharacterSheet(person.characterSheet)).toBe(true);
    const prompt = characterInstruction("w", "a", [hero, person], undefined, ["neutral"], [], "Mira, send a selfie", "request-001", true);
    expect(prompt).toContain(home.description); expect(prompt).toContain('"default":true'); expect(prompt).toContain("may refuse"); expect(prompt).not.toContain("data:image");
    const { repo, scope } = await setup();
    await saveCharacter({ ...scope, original: characterEditBaseline(person, [hero, person]), entityId: person.id, name: person.name, sheet: person.characterSheet!, state: EMPTY_STATUS, present: false }, repo);
    const pack = await parseWorldPackage(JSON.stringify(await exportWorld("w", repo)));
    expect((pack.records.find(r => r.kind === "entity" && (r.data as SceneEntity).name === "Mira")!.data as SceneEntity).characterSheet?.selfieCategories).toEqual([regular, home]);
    expect((await parseBackup(JSON.stringify(await createBackup(undefined, repo)))).records).toEqual(await repo.rawRecords());
    expect((await repo.get<SceneEntity>("entity", person.id))!.description).toBe("UNTOUCHED LORE");
  });
  it("rejects duplicate defaults, IDs, remote images and out-of-range thresholds", () => {
    expect(validSelfieCategories([regular, { ...home, default: true }])).toBe(false);
    expect(validSelfieCategories([regular, { ...home, id: regular.id }])).toBe(false);
    expect(validSelfieCategories([{ ...regular, images: ["https://example.com/image.png"] }])).toBe(false);
    expect(validSelfieCategories([{ ...regular, minTrust: 101 }])).toBe(false);
  });
  it("recognizes legacy selfie emotions without altering their assignments", () => {
    const sheet = { ...EMPTY_CHARACTER, sprites: { "Селфи": [image], "Селфи: дома": [other], neutral: image } };
    const before = structuredClone(sheet); expect(selfieCategories(sheet).map(c => [c.name, c.default])).toEqual([["Селфи", true], ["Селфи: дома", false]]);
    expect(sheet).toEqual(before);
  });
  it("includes category events in the turn identity and rejects malformed events", () => {
    const turn = { request: "request-001", present: ["Mira"], updates: [], selfies: [{ id: "Mira", category: "home", quote }] };
    expect(parseCharacterTurn("<deeprole_characters>" + JSON.stringify(turn) + "</deeprole_characters>")).toBeTruthy();
    expect(characterTurnKey({ world: "", chat: "", base: "", ...turn })).not.toBe(characterTurnKey({ world: "", chat: "", base: "", ...turn, selfies: [] }));
    expect(parseCharacterTurn("<deeprole_characters>" + JSON.stringify({ ...turn, selfies: [turn.selfies[0], turn.selfies[0]] }) + "</deeprole_characters>")).toBeNull();
  });
  it("keeps low trust separate from high attraction and uses saved closeness", () => {
    const scene: CharacterScene = { revision: "1", presentIds: [], states: { mira: { ...EMPTY_STATUS, bonds: { hero: { trust: 20, affinity: 90, completed: [], locked: false, history: [] } } } }, updatedAt: 1 };
    expect(selfieGate(person, regular, hero, scene)).toBe("trust");
    scene.states.mira!.bonds!.hero!.trust = 80; scene.states.mira!.bonds!.hero!.affinity = 20;
    expect(selfieGate(person, regular, hero, scene)).toBe("affinity");
    expect(selfieGate(person, regular, hero, scene, false)).toBe("story");
    expect(selfieGate(person, regular, undefined, scene)).toBe("story");
  });
});
describe("verified photo receipts", () => {
  it("stores exactly one selected local reference and restores it after reordering", async () => {
    const { repo, scope, turn } = await setup(); await applyCharacterTurn(scope, turn, undefined, repo, false, true);
    const saved = (await repo.get<ChatBinding>("binding", binding.id))!; expect(saved.scenePhotos).toHaveLength(1); expect(validDataRecord({ kind: "binding", id: saved.id, data: saved })).toBe(true);
    const photo = saved.scenePhotos![0]!; expect(photo.categoryId).toBe(home.id); expect(photo.messageKey).toBe(scope.replyIdentity); expect(resolveScenePhoto(photo, person)).toBe(other);
    expect(JSON.stringify(saved.scenePhotos)).not.toContain("data:image"); expect(validScenePhotos(saved.scenePhotos)).toBe(true);
    expect(resolveScenePhoto(photo, { ...person, worldId: "other" })).toBeUndefined();
    expect(resolveScenePhoto(photo, { ...person, characterSheet: { ...person.characterSheet!, selfieCategories: [regular] } })).toBeUndefined();
  });
  it("uses the ordinary category when a requested collection is missing", async () => {
    const { repo, scope, turn } = await setup(); turn.selfies[0]!.category = "not-found";
    await applyCharacterTurn(scope, turn, undefined, repo, false, true);
    expect((await repo.get<ChatBinding>("binding", binding.id))!.scenePhotos![0]!.imageKey).toBe(selfieImageKey(image));
  });
  it("never bypasses a matching category threshold with the ordinary collection", async () => {
    const mira = { ...person, characterSheet: { ...person.characterSheet!, selfieCategories: [regular, { ...home, minTrust: 90 }] } };
    const { repo, scope, turn } = await setup(mira); await applyCharacterTurn(scope, turn, undefined, repo, false, true);
    expect((await repo.get<ChatBinding>("binding", binding.id))!.scenePhotos).toBeUndefined();
  });
  it.each(["Mira will not send Leon a selfie tonight.", "Мира не отправляет фото и просит подождать.", "Mira promises to send a selfie tomorrow."])("does not attach a refused or deferred photo: %s", async refusal => {
    const { repo, scope, turn } = await setup(); scope.replyText = refusal; turn.selfies[0]!.quote = refusal;
    await applyCharacterTurn(scope, turn, undefined, repo, false, true); expect((await repo.get<ChatBinding>("binding", binding.id))!.scenePhotos).toBeUndefined();
  });
  it("ignores unsupported events and a quote found only inside JSON or choices", async () => {
    const { repo, scope, turn } = await setup(); scope.replyText = "Mira is thinking.\n<deeprole_choices>" + JSON.stringify({ quote }) + "</deeprole_choices>\n<deeprole_characters>" + JSON.stringify(turn) + "</deeprole_characters>";
    await applyCharacterTurn(scope, turn, undefined, repo, false, true); expect((await repo.get<ChatBinding>("binding", binding.id))!.scenePhotos).toBeUndefined();
  });
});
