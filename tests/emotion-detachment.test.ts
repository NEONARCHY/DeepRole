import { afterEach, expect, it } from "vitest";
import { cleanCharacterEmotionImages, withCharacterEmotionRules } from "../src/core/character-emotions";
import { assignLibraryEmotions, libraryImages, unassignPortraitEmotions } from "../src/core/portrait-library";
import { DEFAULT_EMOTIONS, EMPTY_CHARACTER, EMPTY_STATUS, characterRevision } from "../src/core/characters";
import { saveWorldEmotionList, detachDefaultEmotionImages } from "../src/storage/emotion-settings";
import { saveCharacter } from "../src/storage/characters";
import { characterEditBaseline } from "../src/core/character-edit";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import type { CharacterSheet, ChatBinding, SceneEntity, WorldProfile } from "../src/core/types";

const images = Array.from({ length: 513 }, (_, i) => "data:image/png;base64," + btoa("portrait-" + i));
const sheet: CharacterSheet = { ...EMPTY_CHARACTER, sprites: { neutral: images[0]!, happy: [images[1]!, images[2]!], sad: [images[2]!] }, initialStatus: { ...EMPTY_STATUS, emotion: "happy", goal: "Keep goal" } };
const world: WorldProfile = { id: "w", name: "Harbor", description: "Keep lore", color: "#123456", contextBudget: 2000, relevanceThreshold: 6, characterEmotions: DEFAULT_EMOTIONS, createdAt: 1, updatedAt: 1 };
const person: SceneEntity = { id: "mira", worldId: "w", kind: "character", name: "Mira", description: "Keep profile", aliases: [], memberIds: [], characterSheet: sheet, createdAt: 1, updatedAt: 1 };
const scene = { revision: "scene", presentIds: [person.id], states: { mira: { ...EMPTY_STATUS, emotion: "happy", condition: "Safe", stats: [{ label: "Energy", value: "Rested" }] } }, updatedAt: 1 };
const binding: ChatBinding = { id: "binding:a", chatId: "a", chatUrl: "https://chat.deepseek.com/a/chat/s/a", worldId: "w", bookId: null, messageCountAtAnalysis: 0, characterScenes: { w: scene }, createdAt: 1, updatedAt: 1 };
const databases: DeepRoleDatabase[] = [];
async function setup() {
  const db = new DeepRoleDatabase("emotion-detach-" + crypto.randomUUID()); databases.push(db); const repo = new DeepRoleRepository(db);
  await repo.mergeRecords([{ kind: "world", id: world.id, data: structuredClone(world) }, { kind: "entity", id: person.id, data: structuredClone(person) }, { kind: "binding", id: binding.id, data: structuredClone(binding) }, { kind: "binding", id: "binding:b", data: { ...structuredClone(binding), id: "binding:b", chatId: "b" } }]); return repo;
}
afterEach(async () => { await Promise.all(databases.splice(0).map(db => db.delete())); });

it("turning off detaches the entire emotion, retains shared assignments and never mutates the input", () => {
  const before = structuredClone(sheet), next = withCharacterEmotionRules(sheet, ["happy"]);
  expect(next.sprites).toEqual({ neutral: images[0], sad: [images[2]] }); expect(next.portraitLibrary).toEqual([images[1]]);
  expect(next.initialStatus).toMatchObject({ emotion: "neutral", goal: "Keep goal" }); expect(sheet).toEqual(before);
  expect(libraryImages(next)).toEqual(expect.arrayContaining(libraryImages(sheet)));
  const enabled = withCharacterEmotionRules(next, []); expect(enabled.blockedEmotions).toBeUndefined(); expect(enabled.sprites.happy).toBeUndefined(); expect(enabled.portraitLibrary).toEqual([images[1]]);
});
it("cleans retired and already-blocked legacy assignments without touching references or collections", () => {
  const enriched = { ...sheet, blockedEmotions: ["happy"], imageGeneration: { canonical: "Blue coat", sceneDelta: "", prefix: "", suffix: "", format: "prose" as const, referenceKey: "neutral-reference" }, selfieCategories: [] };
  const next = cleanCharacterEmotionImages(enriched, ["neutral"]);
  expect(next.sprites).toEqual({ neutral: images[0] }); expect(next.portraitLibrary).toEqual([images[1], images[2]]);
  expect(next.imageGeneration).toBe(enriched.imageGeneration); expect(next.selfieCategories).toBe(enriched.selfieCategories);
});
it("deduplicates bulk detachment and blocks assignments to disabled emotions atomically", () => {
  const next = unassignPortraitEmotions(sheet, ["happy", "sad", "happy"]); expect(next.portraitLibrary).toEqual([images[1], images[2]]);
  const blocked = withCharacterEmotionRules(sheet, ["happy"]);
  expect(() => assignLibraryEmotions(blocked, ["sad", "happy"], [images[1]!])).toThrow("portrait-emotion-blocked");
  expect(blocked.sprites.sad).toEqual([images[2]]);
});
it("never loses images when the unassigned library exceeds the former capacity", () => {
  const full = { ...EMPTY_CHARACTER, portraitLibrary: images.slice(0, 512), sprites: { happy: images[512]! } }, before = structuredClone(full);
  expect(withCharacterEmotionRules(full, ["happy"]).portraitLibrary).toHaveLength(513); expect(full).toEqual(before);
});
it("rejects invalid rules rather than blocking neutral or accepting unsafe keys", () => {
  for (const blocked of [["neutral"], ["__proto__"], ["happy", "happy"]]) expect(() => withCharacterEmotionRules(sheet, blocked)).toThrow("character-invalid");
});
it("world removal detaches images and old cycles in all its chats, preserves other worlds and narrative facts", async () => {
  const repo = await setup(); const other: WorldProfile = { ...world, id: "other" }; const otherPerson = { ...person, id: "other-person", worldId: "other" };
  await repo.put("world", other); await repo.put("entity", otherPerson);
  const removed = DEFAULT_EMOTIONS.filter(key => key !== "happy"); await saveWorldEmotionList(world, removed, repo);
  expect((await repo.get<SceneEntity>("entity", "mira"))!.characterSheet).toMatchObject({ sprites: { neutral: images[0], sad: [images[2]] }, portraitLibrary: [images[1]], initialStatus: { emotion: "neutral", goal: "Keep goal" } });
  for (const id of ["binding:a", "binding:b"]) {
    const state = (await repo.get<ChatBinding>("binding", id))!.characterScenes!.w!;
    expect(state.states.mira).toEqual({ ...scene.states.mira, emotion: "neutral" }); expect(state.presentIds).toEqual(scene.presentIds); expect(state.revision).not.toBe(scene.revision);
    expect(state.portraitCycles?.mira?.happy).toBeUndefined();
  }
  expect(await repo.get("world", "other")).toEqual(other); expect(await repo.get("entity", otherPerson.id)).toEqual(otherPerson);
  expect((await repo.get<WorldProfile>("world", "w"))!.description).toBe(world.description);
  const latest = (await repo.get<WorldProfile>("world", "w"))!; await saveWorldEmotionList(latest, DEFAULT_EMOTIONS, repo);
  expect((await repo.get<SceneEntity>("entity", "mira"))!.characterSheet!.sprites.happy).toBeUndefined();
});
it("world-list save repairs historical orphan assignments even when the active list is unchanged", async () => {
  const repo = await setup(); await repo.put("entity", { ...person, characterSheet: { ...sheet, sprites: { ...sheet.sprites, retired: images[3]! } } });
  await saveWorldEmotionList(world, DEFAULT_EMOTIONS, repo);
  const next = (await repo.get<SceneEntity>("entity", "mira"))!.characterSheet!; expect(next.sprites.retired).toBeUndefined(); expect(next.portraitLibrary).toContain(images[3]);
});
it("conflicts abort atomically and large libraries detach successfully", async () => {
  const repo = await setup(); await repo.put("world", { ...world, updatedAt: 2 }); let before = await repo.rawRecords();
  await expect(saveWorldEmotionList(world, ["neutral"], repo)).rejects.toThrow("memory-conflict"); expect(await repo.rawRecords()).toEqual(before);
  await repo.put("world", world); await repo.put("entity", { ...person, id: "full", characterSheet: { ...EMPTY_CHARACTER, portraitLibrary: images.slice(0, 512), sprites: { happy: images[512]! } } }); before = await repo.rawRecords();
  await saveWorldEmotionList(world, ["neutral"], repo); expect((await repo.get<SceneEntity>("entity", "full"))!.characterSheet!.portraitLibrary).toHaveLength(513);
});
it("a stale character editor cannot resurrect an emotion deleted from its world", async () => {
  const repo = await setup(), original = characterEditBaseline(person, [person], scene);
  await saveWorldEmotionList(world, DEFAULT_EMOTIONS.filter(key => key !== "happy"), repo);
  const saved = await saveCharacter({ ...original, original, sheet: { ...original.sheet, appearance: "Green coat" }, entityId: person.id, worldId: "w", chatId: "a", chatUrl: binding.chatUrl, base: characterRevision([person], scene) }, repo);
  expect(saved.original.sheet.sprites.happy).toBeUndefined(); expect(saved.original.sheet.portraitLibrary).toContain(images[1]); expect(saved.original.sheet.appearance).toBe("Green coat"); expect(saved.original.state.emotion).toBe("neutral");
});
it("character save respects the current global list in a world without its own list", async () => {
  const repo = await setup(); await repo.put("world", { ...world, characterEmotions: undefined });
  const original = characterEditBaseline(person, [person], scene);
  const saved = await saveCharacter({ ...original, original, entityId: person.id, worldId: "w", chatId: "a", chatUrl: binding.chatUrl, base: characterRevision([person], scene) }, repo, ["neutral", "sad"]);
  expect(saved.original.sheet.sprites).toEqual({ neutral: images[0], sad: [images[2]] });
  expect(saved.original.sheet.portraitLibrary).toEqual([images[1]]); expect(saved.original.state.emotion).toBe("neutral");
});
it("global removal touches inherited worlds only", async () => {
  const repo = await setup(); const inherited: WorldProfile = { ...world, id: "inherited", characterEmotions: undefined };
  await repo.put("world", inherited); await repo.put("entity", { ...person, id: "inherited-person", worldId: inherited.id });
  await detachDefaultEmotionImages(DEFAULT_EMOTIONS, ["neutral"], repo);
  expect(await repo.get("entity", person.id)).toEqual(person);
  expect((await repo.get<SceneEntity>("entity", "inherited-person"))!.characterSheet!.sprites).toEqual({ neutral: images[0] });
});
it("global removal preserves every inherited world scene retained by the same chat", async () => {
  const repo = await setup(); await repo.put("world", { ...world, characterEmotions: undefined });
  await repo.put("world", { ...world, id: "other", characterEmotions: undefined });
  await repo.put("entity", { ...person, id: "other-person", worldId: "other" });
  const otherScene = { ...scene, presentIds: ["other-person"], states: { "other-person": scene.states.mira! } };
  await repo.put("binding", { ...binding, characterScenes: { w: scene, other: otherScene } });
  await detachDefaultEmotionImages(DEFAULT_EMOTIONS, ["neutral"], repo);
  const scenes = (await repo.get<ChatBinding>("binding", binding.id))!.characterScenes!;
  expect(scenes.w!.states.mira).toEqual({ ...scene.states.mira, emotion: "neutral" });
  expect(scenes.other!.states["other-person"]).toEqual({ ...scene.states.mira, emotion: "neutral" });
  for (const id of ["mira", "other-person"]) {
    const next = (await repo.get<SceneEntity>("entity", id))!.characterSheet!;
    expect(next.sprites).toEqual({ neutral: images[0] }); expect(next.portraitLibrary).toEqual([images[1], images[2]]);
  }
});
