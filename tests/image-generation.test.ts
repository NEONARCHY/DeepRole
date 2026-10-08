import { describe, expect, it } from "vitest";
import { browser } from "wxt/browser";
import { DEFAULT_IMAGE_SETTINGS, IMAGE_CONTENT_LEVELS, imageContentLabel, validExtraParams, validImageBaseUrl, validImageContentLevel, validImageProviderConfig, validImageProviders, validImageSettings, validIllustration } from "../src/core/image-generation";
import { IMAGE_STRINGS } from "../src/core/image-i18n";
import { imageReferences, buildImagePrompt, imageDeltaInstruction, sceneDeltaInstruction } from "../src/core/image-prompt";
import { characterFieldPrompt, validCharacterTextRequest } from "../src/core/character-text";
import { EMPTY_CHARACTER } from "../src/core/characters";
import { getProviderKey, saveProviderKey, removeProviderKey, providerKeyHint } from "../src/storage/image-keys";
import { getImageSettings, saveImageSettings } from "../src/storage/image-settings";
import { createBackup, parseBackup } from "../src/storage/backup";
import { exportWorld, parseWorldPackage, cloneWorldPackage } from "../src/storage/worlds";
import { DeepRoleRepository } from "../src/storage/repository";
import { DeepRoleDatabase } from "../src/storage/database";
import { saveIllustration, validateWorldImageBudgets } from "../src/storage/illustrations";
import type { DataRecord } from "../src/core/types";
import { profile, tinyImage, world, illustration } from "./image-fixtures";
describe("image generation skeleton", () => {
  it("derives types, labels and strict validation from one level catalog", () => {
    for (const entry of IMAGE_CONTENT_LEVELS) { expect(validImageContentLevel(entry.id)).toBe(true); expect(imageContentLabel(entry.id, "ru")).toBe(entry.ru); expect(imageContentLabel(entry.id, "en")).toBe(entry.en); }
    expect(validImageContentLevel("adult")).toBe(true);
    for (const value of [undefined, "unknown", "explicit", "nsfw", null, 1]) expect(validImageContentLevel(value)).toBe(false);
  });
  it("accepts profiles as user data without a model inventory", () => { expect(validImageProviderConfig(profile)).toBe(true); expect(validImageProviderConfig({ ...profile, modelId: "future-model-from-api" })).toBe(true); expect(validImageProviders([profile, profile])).toBe(false); expect(validImageProviders(Array.from({ length: 9 }, (_, i) => ({ ...profile, id: `11111111-1111-4111-8111-${String(i).padStart(12, "0")}` })))).toBe(false); });
  it.each(["file:///a", "https://name:password@example.test/v1", "https://example.test/?key=secret", "javascript:alert(1)", "http://remote.test", " https://example.test", "https://example.test/#secret"])("rejects unsafe API address %s", value => expect(validImageBaseUrl(value)).toBe(false));
  it.each(["https://images.example.test/api/v1", "http://localhost:8000/v1", "http://127.0.0.1:8000"])("accepts %s", value => expect(validImageBaseUrl(value)).toBe(true));
  it("accepts any finite JSON model parameters, but rejects transport overrides", () => {
    expect(validExtraParams({ future_provider_feature: { array: [false, null, 1.5, "verbatim"] } })).toBe(true);
    for (const name of ["model", "modelId", "prompt", "images", "image", "Authorization", "api_key", "headers"]) expect(validExtraParams({ [name]: "override" })).toBe(false);
    for (const value of [{ x: NaN }, { x: undefined }, { x: () => true }, JSON.parse('{"__proto__":{}}'), Object.fromEntries(Array.from({ length: 33 }, (_, i) => [i, true]))]) expect(validExtraParams(value)).toBe(false);
  });
  it("stores validated settings separately, disabled by default", async () => { expect(await getImageSettings()).toEqual(DEFAULT_IMAGE_SETTINGS); const value = { ...DEFAULT_IMAGE_SETTINGS, profiles: [profile], profileByLevel: { off: profile.id } }; await saveImageSettings(value); expect(await getImageSettings()).toEqual(value); expect(validImageSettings({ ...value, contentLevel: "explicit" })).toBe(false); expect(validImageSettings({ ...value, profileByLevel: { off: "unknown" } })).toBe(false); await expect(saveImageSettings({ ...value, stylePrefix: "x".repeat(1201) })).rejects.toThrow(); });
  it("stores the explicit preset only together with the age confirmation", async () => {
    const value = { ...DEFAULT_IMAGE_SETTINGS, profiles: [profile], profileByLevel: { adult: profile.id } };
    // The explicit level without confirmation is refused, before any network request could exist.
    expect(validImageSettings({ ...value, contentLevel: "adult" })).toBe(false);
    expect(validImageSettings({ ...value, contentLevel: "adult", adultConfirmed: false })).toBe(false);
    expect(validImageSettings({ ...value, contentLevel: "off", adultConfirmed: true })).toBe(true);
    await expect(saveImageSettings({ ...value, contentLevel: "adult" })).rejects.toThrow("image-settings-invalid");
    const confirmed = { ...value, contentLevel: "adult" as const, adultConfirmed: true };
    expect(validImageSettings(confirmed)).toBe(true); await saveImageSettings(confirmed);
    expect((await getImageSettings()).contentLevel).toBe("adult");
    // Dropping the confirmation in storage also drops the explicit level, never leaving it half-set.
    await expect(saveImageSettings({ ...confirmed, adultConfirmed: false })).rejects.toThrow("image-settings-invalid");
    await saveImageSettings({ ...DEFAULT_IMAGE_SETTINGS, profiles: [profile], profileByLevel: { off: profile.id } });
  });
  it("keeps keys out of settings, backup and portable worlds", async () => {
    const repo = new DeepRoleRepository(new DeepRoleDatabase("image-export-test-" + crypto.randomUUID())); await repo.put("world", world); await saveIllustration(illustration, repo);
    const secret = "SYNTHETIC-SECRET-DO-NOT-EXPORT"; await saveProviderKey(profile.id, secret); await saveImageSettings({ ...DEFAULT_IMAGE_SETTINGS, profiles: [profile] });
    expect(await getProviderKey(profile.id)).toBe(secret); expect(await providerKeyHint(profile.id)).toBe("PORT");
    const backup = JSON.stringify(await createBackup(undefined, repo)); const portable = JSON.stringify(await exportWorld(world.id, repo)); expect(backup).not.toContain(secret); expect(portable).not.toContain(secret); expect(JSON.stringify(await getImageSettings())).not.toContain(secret);
    expect((await parseBackup(backup)).records.some(r => r.kind === "illustration")).toBe(true); const parsed = parseWorldPackage(portable); expect(parsed.records.some(r => r.kind === "illustration")).toBe(true); expect(cloneWorldPackage(parsed).find(r => r.kind === "illustration")?.data).toMatchObject({ chatId: illustration.chatId, messageKey: illustration.messageKey });
    await removeProviderKey(profile.id); expect(await getProviderKey(profile.id)).toBeNull(); await repo.clear();
  });
  it("rejects invalid stored settings, not silently repairing them", async () => { await browser.storage.local.set({ deeprole_image_settings: { enabled: true, contentLevel: "unknown" } }); await expect(getImageSettings()).rejects.toThrow("image-settings-invalid"); });
  it("validates the image record and response headers", () => { expect(validIllustration(illustration)).toBe(true); expect(validIllustration({ ...illustration, image: "https://external.test/image" })).toBe(false); expect(validIllustration({ ...illustration, headers: { authorization: "secret" } })).toBe(false); });
  it("refuses quota overflow atomically, keeping all old images and lore", async () => {
    const repo = new DeepRoleRepository(new DeepRoleDatabase("image-quota-test-" + crypto.randomUUID())); await repo.put("world", world);
    const records: DataRecord[] = Array.from({ length: 60 }, (_, i) => ({ kind: "illustration", id: `image-${i}`, data: { ...illustration, id: `image-${i}` } })); await repo.mergeRecords(records);
    await expect(saveIllustration(illustration, repo)).rejects.toThrow("image-full"); expect((await repo.list("illustration")).length).toBe(60); expect(await repo.get("world", world.id)).toEqual(world);
    expect(validateWorldImageBudgets([{ kind: "world", id: world.id, data: world }, { kind: "illustration", id: illustration.id, data: { ...illustration, image: "x".repeat(50_000_001) } }])).toBe(false); await repo.clear();
  });
  it("uses all uploaded portraits without sending bytes to DeepSeek", () => { const sheet = { ...EMPTY_CHARACTER, sprites: { neutral: tinyImage, happy: [tinyImage, "data:image/png;base64,Yg=="] }, portraitLibrary: ["data:image/webp;base64,Yw=="] }; expect(imageReferences(sheet)).toHaveLength(3); const canonical = "Hair: copper.  Keep double spaces."; expect(buildImagePrompt({ canonical, sceneDelta: "At dusk", prefix: "", suffix: "", format: "prose" }, DEFAULT_IMAGE_SETTINGS)).toBe(canonical + "\n\nAt dusk"); expect(imageDeltaInstruction(canonical, "Dusk")).not.toContain("data:image"); });
  it("has paired meaningful RU/EN copy without question-mark controls", () => { for (const values of Object.values(IMAGE_STRINGS)) { expect(values).toHaveLength(2); expect(values.every(value => value.trim().length > 1)).toBe(true); expect(values).not.toContain("?"); } });
  it("words the optional scene helper by the requested level, never filtering the user's own text", () => {
    // The level changes wording only. The user's own description always passes through verbatim.
    expect(sceneDeltaInstruction("off")).toContain("non-explicit");
    expect(sceneDeltaInstruction("suggestive")).toContain("never explicit");
    expect(sceneDeltaInstruction("adult")).toContain("explicit adult illustration");
    expect(sceneDeltaInstruction()).toBe(sceneDeltaInstruction("off"));
    for (const level of IMAGE_CONTENT_LEVELS) { expect(sceneDeltaInstruction(level.id)).toContain("Do not continue the story"); expect(imageDeltaInstruction("Copper hair", "Observatory", level.id)).not.toContain("data:image"); }
    const explicit = { canonical: "Copper hair", sceneDelta: "Text the user wrote is kept verbatim", prefix: "", suffix: "", format: "prose" as const };
    expect(buildImagePrompt(explicit, DEFAULT_IMAGE_SETTINGS)).toBe("Copper hair\n\nText the user wrote is kept verbatim");
  });
  it("passes the selected level to the scene helper and rejects an unknown one", () => {
    const request = { field: { key: "image-scene", label: "Current scene", scope: "scene" as const, maxLength: 1200, contentLevel: "adult" as const }, currentText: "", reference: { name: "Mira", appearance: "Copper hair", completedScene: "An observatory" } };
    expect(validCharacterTextRequest(request)).toBe(true);
    const prompt = characterFieldPrompt(request, [], "en");
    expect(prompt).toContain("explicit adult illustration");
    expect(prompt).not.toContain("non-explicit romance");
    expect(validCharacterTextRequest({ ...request, field: { ...request.field, contentLevel: "unknown" } })).toBe(false);
    // Without a level the helper stays neutral; nothing else in the request changes.
    const neutral = characterFieldPrompt({ ...request, field: { ...request.field, contentLevel: undefined } }, [], "en");
    expect(neutral).toContain("ordinary illustration");
  });
});
