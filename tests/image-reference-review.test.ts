import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_CHARACTER } from "../src/core/characters";
import { DEFAULT_IMAGE_SETTINGS, validImageSettings, validCharacterImagePrompt } from "../src/core/image-generation";
import { planImageInput, validImageAttempts, validImagePlanReview, validImageReplay } from "../src/core/image-plan";
import { imageReviewContextKey, resolveImageReferences, validImageReferenceOverrides } from "../src/core/image-references";
import { selfieImageKey } from "../src/core/selfies";
import type { ChatBinding, SceneEntity } from "../src/core/types";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { ImageJobs } from "../src/storage/image-jobs";
import { saveImageSettings } from "../src/storage/image-settings";
import { saveProviderKey } from "../src/storage/image-keys";
import { createBackup, parseBackup } from "../src/storage/backup";
import { cloneWorldPackage } from "../src/storage/worlds";
import * as codec from "../src/adapters/image/image-codec";
import { profile, tinyImage, realPng, world } from "./image-fixtures";

const neutral = "data:image/png;base64," + realPng, alternate = "data:image/jpeg;base64,/9j/AAAA";
const imageProfile = { canonical: "Copper hair.", sceneDelta: "", prefix: "", suffix: "", format: "prose" as const, referenceKey: selfieImageKey(neutral), suggestiveReferenceKey: selfieImageKey(alternate), referenceContext: "Everyday jacket", suggestiveReferenceContext: "Alternate evening coat" };
const person: SceneEntity = { id: "mira", worldId: world.id, kind: "character", name: "Mira", description: "UNCHANGED LORE", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1, characterSheet: { ...EMPTY_CHARACTER, appearance: "Copper hair.", portraitLibrary: [neutral, alternate], imageGeneration: imageProfile } };
const target = { worldId: world.id, chatId: "a", chatUrl: "https://chat.deepseek.com/chat/s/a", messageKey: "review-reply" };
const config = { ...profile, maxReferences: 6 };
const settings = { ...DEFAULT_IMAGE_SETTINGS, enabled: true, contentLevel: "suggestive" as const, profiles: [config], profileByLevel: { off: config.id, suggestive: config.id } };
const plan = { scene: "Mira speaks near the observatory in her everyday jacket.", characters: [{ id: "mira", reference: "neutral" as const, look: "ordinary" as const, appearance: "Everyday jacket", referenceReason: "The current scene establishes her everyday jacket." }] };
const review = () => ({ plan, sceneText: "Mira speaks near the observatory.", contextKey: imageReviewContextKey(plan, world.id, [person], settings) });
const dbs: DeepRoleDatabase[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dbs.map(db => db.delete())); dbs.length = 0; });
async function setup() {
  const db = new DeepRoleDatabase("image-review-" + crypto.randomUUID()); dbs.push(db); const repo = new DeepRoleRepository(db);
  await repo.put("world", world); await repo.put("entity", person);
  await repo.put("binding", { id: "binding:a", chatId: "a", chatUrl: target.chatUrl, worldId: world.id, bookId: null, messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 1 } satisfies ChatBinding);
  await saveImageSettings(settings); await saveProviderKey(profile.id, "SYNTHETIC-REVIEW-KEY");
  vi.spyOn(codec, "normalizeImage").mockImplementation(async blob => blob.type === "image/jpeg" ? alternate : neutral);
  const provider = { generate: vi.fn(async () => ({ image: tinyImage, headers: {} })), edit: vi.fn(async (_input: import("../src/core/image-generation").EditInput) => ({ image: tinyImage, headers: {} })), listModels: async () => [] };
  const factory = vi.fn(() => provider), jobs = new ImageJobs(repo, async () => true, factory);
  return { repo, jobs, provider, factory };
}
describe("reference selection", () => {
  it.each(["ordinary", "alternate", "unknown"] as const)("uses the factual %s look rather than a conflicting legacy flag", look => {
    const revised = { ...plan, characters: [{ ...plan.characters[0]!, look, reference: look === "alternate" ? "neutral" as const : "suggestive" as const }] };
    expect(planImageInput(revised, target, [person], settings).referenceKeys).toEqual([look === "alternate" ? imageProfile.suggestiveReferenceKey : imageProfile.referenceKey]);
  });
  it("persistent preferences and frame overrides take precedence without editing the profile", () => {
    const fixed = { ...person, characterSheet: { ...person.characterSheet!, imageGeneration: { ...imageProfile, referencePolicy: "suggestive" as const } } }, original = structuredClone(fixed);
    expect(planImageInput(plan, target, [fixed], settings).referenceKeys).toEqual([imageProfile.suggestiveReferenceKey]);
    expect(planImageInput(plan, target, [fixed], settings, { mira: "neutral" }).referenceKeys).toEqual([imageProfile.referenceKey]);
    expect(planImageInput(plan, target, [fixed], settings, { mira: "auto" }).referenceKeys).toEqual([imageProfile.referenceKey]);
    expect(fixed).toEqual(original);
  });
  it("keeps ordinary preset, missing-reference fallback and reference limits", () => {
    expect(planImageInput(plan, target, [person], { ...settings, contentLevel: "off" }, { mira: "suggestive" }).referenceKeys).toEqual([imageProfile.referenceKey]);
    const missing = { ...person, characterSheet: { ...person.characterSheet!, portraitLibrary: [neutral] } };
    expect(resolveImageReferences(plan, world.id, [missing], settings, { mira: "suggestive" })[0]).toMatchObject({ reference: "neutral", reason: "referenceFallback" });
    const second = { ...person, id: "noah", name: "Noah" }, group = { ...plan, characters: [...plan.characters, { ...plan.characters[0]!, id: "noah" }] };
    const input = planImageInput(group, target, [person, second], { ...settings, profiles: [{ ...config, maxReferences: 1 }] });
    expect(input.referenceChoices).toEqual([{ entityId: "mira", reference: "neutral" }, { entityId: "noah", reference: "none" }]); expect(input.prompt).toContain("Noah");
    expect(planImageInput(plan, target, [person], settings).references).toHaveLength(1);
  });
  it("accepts old settings and profiles while rejecting invalid preferences", () => {
    const { reviewBeforeGeneration: unused, ...legacy } = settings;
    expect(validImageSettings(legacy)).toBe(true); expect(validImageSettings({ ...legacy, reviewBeforeGeneration: true })).toBe(true);
    expect(validImageSettings({ ...legacy, reviewBeforeGeneration: "yes" })).toBe(false);
    expect(validCharacterImagePrompt({ ...imageProfile, referencePolicy: "auto" })).toBe(true);
    expect(validCharacterImagePrompt({ ...imageProfile, referencePolicy: "unknown" })).toBe(false);
    expect(validImageReferenceOverrides(JSON.parse('{"__proto__":"auto"}'))).toBe(false);
    expect(() => planImageInput(plan, target, [person], settings, { absent: "neutral" })).toThrow("invalidPlan");
  });
});
describe("review before a provider request", () => {
  it("persists a review through reload/backup without contacting the provider", async () => {
    const { repo, jobs, provider, factory } = await setup(), attempt = await jobs.start(target);
    await jobs.review(target, attempt.id, review());
    const stored = (await repo.get<ChatBinding>("binding", "binding:a"))!.illustrationAttempts!;
    expect(validImageAttempts(stored)).toBe(true); expect(stored[0]).toMatchObject({ status: "review", review: review() });
    const payload = await createBackup(undefined, repo), restored = await parseBackup(JSON.stringify(payload));
    expect((restored.records.find(r => r.kind === "binding")!.data as ChatBinding).illustrationAttempts).toEqual(stored);
    await expect(new ImageJobs(repo, async () => true, factory).start(target)).rejects.toMatchObject({ code: "busy" });
    await expect(jobs.render(target, attempt.id, plan)).rejects.toMatchObject({ code: "changed" });
    expect(provider.edit).not.toHaveBeenCalled(); expect(factory).not.toHaveBeenCalled();
  });
  it("manual alternate selection is enforced even when the revised plan returns ordinary", async () => {
    const { repo, jobs, provider, factory } = await setup(), attempt = await jobs.start(target);
    await jobs.review(target, attempt.id, review()); await jobs.claimReview(target, attempt.id, { mira: "suggestive" });
    const result = await jobs.render(target, attempt.id, { ...plan, scene: "Revised identity guidance for the same observatory scene." });
    expect(provider.edit.mock.calls[0]![0]).toMatchObject({ images: [alternate], aspectRatio: "16:9" });
    expect(result.request!.input.referenceChoices).toEqual([{ entityId: "mira", reference: "suggestive" }]); expect(validImageReplay(result.request)).toBe(true);
    expect(result.prompt).toContain("Alternate evening coat");
    expect(await repo.get("entity", person.id)).toEqual(person);
    await saveImageSettings({ ...settings, stylePrefix: "Changed style" });
    await new ImageJobs(repo, async () => true, factory).repeat(target, result.id);
    expect(provider.edit.mock.calls[1]).toEqual(provider.edit.mock.calls[0]);
  });
  it("blocks changes after confirmation before making a provider request", async () => {
    const { jobs, factory } = await setup(), attempt = await jobs.start(target);
    await jobs.review(target, attempt.id, review()); await jobs.claimReview(target, attempt.id, { mira: "suggestive" });
    await saveImageSettings({ ...settings, styleSuffix: "A new style" });
    await expect(jobs.render(target, attempt.id, plan)).rejects.toMatchObject({ code: "changed" }); expect(factory).not.toHaveBeenCalled();
  });
  it("keeps an unconfirmed review pending beyond the service timeout", async () => {
    const { jobs, factory } = await setup(), attempt = await jobs.start(target);
    await jobs.review(target, attempt.id, review());
    vi.spyOn(Date, "now").mockReturnValue(attempt.updatedAt + 10 * 60_000);
    await expect(jobs.start(target)).rejects.toMatchObject({ code: "busy" }); expect(factory).not.toHaveBeenCalled();
  });
  it("cancel removes the review and does not create a provider request", async () => {
    const { repo, jobs, factory } = await setup(), attempt = await jobs.start(target);
    await jobs.review(target, attempt.id, review()); await jobs.cancelReview(target, attempt.id);
    expect((await repo.get<ChatBinding>("binding", "binding:a"))!.illustrationAttempts).toEqual([]);
    expect(factory).not.toHaveBeenCalled(); await expect(jobs.start(target)).resolves.toMatchObject({ status: "preparing" });
  });
  it.each(["style", "reference"] as const)("refuses a %s changed since preview before sending anything", async change => {
    const { repo, jobs, factory } = await setup(), attempt = await jobs.start(target);
    await jobs.review(target, attempt.id, review());
    if (change === "style") await saveImageSettings({ ...settings, stylePrefix: "Changed" });
    else await repo.put("entity", { ...person, characterSheet: { ...person.characterSheet!, portraitLibrary: [neutral] } });
    await expect(jobs.claimReview(target, attempt.id, { mira: "neutral" })).rejects.toMatchObject({ code: "changed" });
    expect(factory).not.toHaveBeenCalled();
  });
  it("claims exactly once and rejects a revised cast or injected override", async () => {
    const { jobs, factory } = await setup(), attempt = await jobs.start(target);
    await jobs.review(target, attempt.id, review());
    await expect(jobs.claimReview(target, attempt.id, { absent: "neutral" })).rejects.toThrow("invalidPlan");
    await jobs.claimReview(target, attempt.id, { mira: "neutral" });
    await expect(jobs.claimReview(target, attempt.id, { mira: "neutral" })).rejects.toMatchObject({ code: "changed" });
    await expect(jobs.render(target, attempt.id, { ...plan, characters: [] })).rejects.toMatchObject({ code: "changed" });
    expect(factory).not.toHaveBeenCalled();
  });
  it("requires a review when the setting is enabled, including an ordinary landscape", async () => {
    const { jobs, factory } = await setup(); await saveImageSettings({ ...settings, reviewBeforeGeneration: true });
    const bypass = await jobs.start(target); await expect(jobs.render(target, bypass.id, plan)).rejects.toMatchObject({ code: "changed" }); expect(factory).not.toHaveBeenCalled();
    const attempt = await jobs.start(target), landscape = { ...plan, characters: [] }, preview = { ...review(), plan: landscape, contextKey: imageReviewContextKey(landscape, world.id, [person], settings) };
    await jobs.review(target, attempt.id, preview); await jobs.claimReview(target, attempt.id, {});
    await expect(jobs.render(target, attempt.id, landscape)).resolves.toMatchObject({ aspectRatio: "16:9" });
  });
  it("validates review fields and remaps saved reference labels when cloning a world", async () => {
    expect(validImagePlanReview({ ...review(), sceneText: "x".repeat(12001) })).toBe(false);
    expect(validImagePlanReview({ ...review(), overrides: { absent: "auto" } })).toBe(false);
    const { repo, jobs } = await setup(), attempt = await jobs.start(target), result = await jobs.render(target, attempt.id, plan);
    const copy = cloneWorldPackage({ format: "deeprole-world", version: 1, records: (await repo.rawRecords()).filter(r => r.kind !== "binding") });
    const entity = copy.find(r => r.kind === "entity")!, image = copy.find(r => r.kind === "illustration")!.data as typeof result;
    expect(image.request!.input.referenceChoices![0]!.entityId).toBe(entity.id); expect(validImageReplay(image.request)).toBe(true);
  });
});
