import { afterEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { EMPTY_CHARACTER, characterInstruction, characterRevision, characterTurnKey, validCharacterSheet, type CharacterTurn } from "../src/core/characters";
import { DEFAULT_RELATIONSHIP } from "../src/core/relationships";
import { isSelfieRequest, GENERATED_SELFIE, validSelfieEvents, validScenePhotos, selfieImageKey } from "../src/core/selfies";
import { DEFAULT_IMAGE_SETTINGS } from "../src/core/image-generation";
import { imageReferences } from "../src/core/image-prompt";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { applyCharacterTurn } from "../src/storage/characters";
import { approveSelfie } from "../src/storage/selfie-images";
import { ImageJobs } from "../src/storage/image-jobs";
import { saveImageSettings } from "../src/storage/image-settings";
import { saveProviderKey } from "../src/storage/image-keys";
import { updateSettings } from "../src/storage/settings";
import { ImageApiError } from "../src/adapters/image/transport";
import * as codec from "../src/adapters/image/image-codec";
import type { ChatBinding, SceneEntity, ScenePhoto } from "../src/core/types";
import { profile, realPng, tinyImage } from "./image-fixtures";
const reference = "data:image/png;base64," + realPng;
const hero: SceneEntity = { id: "hero", worldId: "w", name: "Leon", kind: "character", description: "", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1, characterSheet: { ...EMPTY_CHARACTER, protagonist: true } };
const mira: SceneEntity = { ...hero, id: "mira", name: "Mira", description: "ORIGINAL LORE", characterSheet: { ...EMPTY_CHARACTER, appearance: "Copper hair, brown eyes.", relationships: { ...structuredClone(DEFAULT_RELATIONSHIP), initial: { trust: 65, affinity: 55 } } } };
const binding: ChatBinding = { id: "binding:a", chatId: "a", chatUrl: "https://chat.deepseek.com/chat/s/a", worldId: "w", bookId: null, messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 1 };
const quote = "Mira smiles and sends Leon a selfie from home.";
const event = { id: "mira", category: GENERATED_SELFIE, quote, scene: "Selfie at home, blue coat, relaxed smile, warm evening light." };
const databases: DeepRoleDatabase[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(databases.map(db => db.delete())); databases.length = 0; });
async function setup(person = mira, authorized = true, text = quote) {
  const db = new DeepRoleDatabase("generated-selfie-" + crypto.randomUUID()); databases.push(db); const repo = new DeepRoleRepository(db);
  await repo.mergeRecords([{ kind: "world", id: "w", data: { id: "w", name: "Harbor", description: "ORIGINAL WORLD", color: "blue", contextBudget: 8000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 } }, { kind: "binding", id: binding.id, data: binding }, { kind: "entity", id: hero.id, data: hero }, { kind: "entity", id: person.id, data: person }]);
  const base = characterRevision([hero, person]), scope = { worldId: "w", chatId: "a", chatUrl: binding.chatUrl, base, replyIdentity: '["message","reply"]', replyText: text };
  const turn: CharacterTurn = { world: "w", chat: "a", base, present: ["hero", "mira"], updates: [], selfies: [{ ...event, quote: text }] };
  await applyCharacterTurn(scope, turn, undefined, repo, false, true, authorized);
  const photo = (await repo.get<ChatBinding>("binding", binding.id))?.scenePhotos?.[0];
  const target = { worldId: "w", chatId: "a", chatUrl: binding.chatUrl, messageKey: scope.replyIdentity };
  await updateSettings({ characterSheetsEnabled: true }); await saveProviderKey(profile.id, "SYNTHETIC-SECRET");
  await saveImageSettings({ ...DEFAULT_IMAGE_SETTINGS, enabled: true, profiles: [{ ...profile, editModelId: "synthetic-qwen-edit" }], profileByLevel: { off: profile.id } });
  const provider = { generate: vi.fn(async (_input: { prompt: string; seed?: number }) => ({ image: tinyImage, headers: {} })), edit: vi.fn(async (_input: { prompt: string; images: string[]; seed?: number }) => ({ image: tinyImage, headers: {} })), listModels: vi.fn(async () => []) };
  const jobs = new ImageJobs(repo, async () => true, () => provider);
  if (photo) await approveSelfie(target, photo);
  vi.spyOn(codec, "normalizeImage").mockResolvedValue(reference);
  return { repo, jobs, provider, photo: photo!, target, turn };
}
describe("requested generated selfies", () => {
  it.each(["Мира, пришли селфи", "Mira, could you send a selfie?", "Покажи свою фотку", "Please send me a photo", "Сфоткай себя"])( "recognizes a plain request: %s", text => expect(isSelfieRequest(text)).toBe(true));
  it.each(["Не отправляй селфи", "Please don\'t generate a selfie", "No selfie, continue"])("does not authorize a negative request: %s", text => expect(isSelfieRequest(text)).toBe(false));
  it("does not authorize an unrelated turn", () => expect(isSelfieRequest("We walk home.")).toBe(false));
  it("supplies names and visual descriptions, never reference bytes or provider secrets", () => {
    const person = { ...mira, characterSheet: { ...mira.characterSheet!, portraitLibrary: [reference], imageGeneration: { canonical: "Copper hair.", sceneDelta: "", prefix: "", suffix: "", format: "prose" as const, referenceKey: selfieImageKey(reference) } } };
    const prompt = characterInstruction("w", "a", [hero, person], undefined, ["neutral"], [], "Mira, selfie?", "request", true, false, true);
    expect(prompt).toContain('category="generated"'); expect(prompt).toContain("location, lighting"); expect(prompt).toContain("Mira"); expect(prompt).not.toContain("data:image");
    expect(validCharacterSheet(person.characterSheet)).toBe(true); expect(imageReferences(person.characterSheet)).toHaveLength(1);
    expect(validSelfieEvents([{ ...event, scene: undefined }])).toBe(false);
  });
  it.each(["Mira will not send Leon a selfie tonight.", "Mira will send Leon a selfie.", "Мира: «Я пришлю тебе селфи позже».", "Mira promises to send a selfie tomorrow."])( "refuses a deferred/rejected quote: %s", async text => {
    const { repo, photo } = await setup(mira, true, text); expect(photo).toBeUndefined(); expect((await repo.list("illustration"))).toHaveLength(0);
  });
  it.each([false, true])("refuses unrequested or insufficient-trust generation (lowTrust=%s)", async lowTrust => {
    const person = lowTrust ? { ...mira, characterSheet: { ...mira.characterSheet!, relationships: { ...DEFAULT_RELATIONSHIP, initial: { trust: 10, affinity: 90 } } } } : mira;
    const { photo, provider } = await setup(person, lowTrust); expect(photo).toBeUndefined(); expect(provider.generate).not.toHaveBeenCalled();
  });
  it("generates from appearance and the actual frame, with a durable reload receipt", async () => {
    const { repo, jobs, photo, target, provider } = await setup();
    expect(validScenePhotos([photo])).toBe(true); const first = await jobs.selfie(target, mira.id, photo.turnKey);
    expect(provider.generate).toHaveBeenCalledOnce(); expect(provider.edit).not.toHaveBeenCalled();
    expect(first.prompt).toContain(mira.characterSheet!.appearance); expect(first.prompt).toContain(event.scene); expect(first.prompt).not.toContain("SYNTHETIC-SECRET");
    const again = await new ImageJobs(repo, async () => true, () => provider).selfie(target, mira.id, photo.turnKey);
    expect(again.id).toBe(first.id); expect(provider.generate).toHaveBeenCalledOnce(); expect(await repo.get("entity", mira.id)).toEqual(mira);
  });
  it("uses the permanent reference automatically, without repeating image bytes in metadata", async () => {
    const person = { ...mira, characterSheet: { ...mira.characterSheet!, portraitLibrary: [reference], imageGeneration: { canonical: "Manual constant appearance", sceneDelta: "OLD SCENE", prefix: "", suffix: "", format: "prose" as const, referenceKey: selfieImageKey(reference) } } };
    const { jobs, photo, target, provider } = await setup(person); const image = await jobs.selfie(target, mira.id, photo.turnKey);
    expect(provider.edit).toHaveBeenCalledOnce(); expect(provider.edit.mock.calls[0]![0]).toMatchObject({ images: [reference] }); expect(provider.generate).not.toHaveBeenCalled();
    expect(image.modelId).toBe("synthetic-qwen-edit"); expect(image.prompt).toContain("Manual constant appearance"); expect(image.prompt).not.toContain("OLD SCENE"); expect(JSON.stringify(image.referenceKeys)).not.toContain("data:image");
  });
  it("uses DeepSeek’s visual appearance only when the profile has no known appearance", async () => {
    const { repo, jobs, target, provider } = await setup({ ...mira, characterSheet: { ...mira.characterSheet!, appearance: "" } });
    const current = (await repo.get<ChatBinding>("binding", binding.id))!; const photo: ScenePhoto = { ...current.scenePhotos![0]!, generation: { ...current.scenePhotos![0]!.generation!, appearance: "Established silver hair, green coat." } };
    await repo.put("binding", { ...current, scenePhotos: [photo] }); await jobs.selfie(target, mira.id, photo.turnKey); expect(provider.generate.mock.calls[0]![0]).toMatchObject({ prompt: expect.stringContaining("silver hair") }); expect((await repo.get<SceneEntity>("entity", mira.id))!.characterSheet!.appearance).toBe("");
  });
  it("falls back to known appearance after a pinned image is removed", async () => {
    const { jobs, photo, target, provider } = await setup({ ...mira, characterSheet: { ...mira.characterSheet!, imageGeneration: { canonical: "Known appearance", sceneDelta: "", prefix: "", suffix: "", format: "prose", referenceKey: "missing" } } });
    await jobs.selfie(target, mira.id, photo.turnKey); expect(provider.generate).toHaveBeenCalledOnce(); expect(provider.edit).not.toHaveBeenCalled();
  });
  it("claims a photo atomically across worker instances and rejects an arbitrary message scope", async () => {
    const { repo, jobs, photo, target, provider } = await setup(); let resolve!: (result: { image: string; headers: {} }) => void;
    provider.generate.mockImplementation(() => new Promise(r => { resolve = r; })); const first = jobs.selfie(target, mira.id, photo.turnKey);
    await vi.waitFor(() => expect(provider.generate).toHaveBeenCalledOnce());
    await expect(new ImageJobs(repo, async () => true, () => provider).selfie(target, mira.id, photo.turnKey)).rejects.toMatchObject({ code: "busy" });
    await expect(jobs.selfie({ ...target, chatId: "b" }, mira.id, photo.turnKey)).rejects.toMatchObject({ code: "changed" });
    resolve({ image: tinyImage, headers: {} }); await first; expect(provider.generate).toHaveBeenCalledOnce();
  });
  it("makes no automatic retry after an uncertain provider failure", async () => {
    const { repo, jobs, photo, target, provider } = await setup(); provider.generate.mockRejectedValueOnce(new ImageApiError("timeout"));
    await expect(jobs.selfie(target, mira.id, photo.turnKey)).rejects.toMatchObject({ code: "timeout" });
    expect((await repo.get<ChatBinding>("binding", binding.id))!.scenePhotos![0]!.generation!.status).toBe("failed");
    await expect(jobs.selfie(target, mira.id, photo.turnKey)).rejects.toMatchObject({ code: "changed" }); expect(provider.generate).toHaveBeenCalledOnce();
    const sent = structuredClone(provider.generate.mock.calls[0]![0]);
    await saveImageSettings({ ...DEFAULT_IMAGE_SETTINGS, enabled: true, stylePrefix: "CHANGED STYLE", profiles: [{ ...profile, modelId: "changed-model" }], profileByLevel: { off: profile.id } });
    await jobs.selfie(target, mira.id, photo.turnKey, true); expect(provider.generate).toHaveBeenCalledTimes(2); expect(provider.generate.mock.calls[1]![0]).toEqual(sent);
    expect((await repo.get<ChatBinding>("binding", binding.id))!.scenePhotos![0]!.generation!.request).toBeUndefined();
  });
  it("does not start a paid request from an imported or expired queued event", async () => {
    const { repo, jobs, target, provider } = await setup(); await browser.storage.session.clear();
    const current = (await repo.get<ChatBinding>("binding", binding.id))!, photo = { ...current.scenePhotos![0]!, createdAt: Date.now() - 60_000 };
    await repo.put("binding", { ...current, scenePhotos: [photo] }); await expect(jobs.selfie(target, mira.id, photo.turnKey)).rejects.toMatchObject({ code: "expired" }); expect(provider.generate).not.toHaveBeenCalled();
  });
  it("stops stale work without a second provider request", async () => {
    const { repo, jobs, target, provider } = await setup();
    const current = (await repo.get<ChatBinding>("binding", binding.id))!, photo = { ...current.scenePhotos![0]!, generation: { ...current.scenePhotos![0]!.generation!, status: "working" as const, updatedAt: Date.now() - 360_000 } };
    await repo.put("binding", { ...current, scenePhotos: [photo] }); await expect(jobs.selfie(target, mira.id, photo.turnKey)).rejects.toMatchObject({ code: "timeout" }); expect(provider.generate).not.toHaveBeenCalled();
  });
  it("counts the selfie fields in the turn identity", () => expect(characterTurnKey({ world: "w", chat: "a", base: "b", present: [], updates: [], selfies: [event] })).not.toBe(characterTurnKey({ world: "w", chat: "a", base: "b", present: [], updates: [] })));
});
