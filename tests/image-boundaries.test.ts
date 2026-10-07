import { afterEach, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { ImageJobs } from "../src/storage/image-jobs";
import { ImageApiError } from "../src/adapters/image/transport";
import { imageWorkerOperation } from "../src/adapters/image/worker-operation";
import * as codec from "../src/adapters/image/image-codec";
import { DEFAULT_IMAGE_SETTINGS, type ImageProvider } from "../src/core/image-generation";
import { EMPTY_CHARACTER } from "../src/core/characters";
import { characterFieldPrompt, validCharacterTextRequest } from "../src/core/character-text";
import { saveImageSettings } from "../src/storage/image-settings";
import { saveProviderKey } from "../src/storage/image-keys";
import { DeepRoleRepository } from "../src/storage/repository";
import { DeepRoleDatabase } from "../src/storage/database";
import { restoreBackup } from "../src/storage/backup";
import { profile, illustration, tinyImage, world } from "./image-fixtures";
const key = "SYNTHETIC-PRIVATE-KEY";
const input = { worldId: world.id, chatId: "a", chatUrl: "https://chat.deepseek.com/chat/s/a", messageKey: "reply", providerId: profile.id, prompt: "Private midnight scene", referenceKeys: [] };
async function setup(provider: ImageProvider) {
  const repo = new DeepRoleRepository(new DeepRoleDatabase("image-boundary-" + crypto.randomUUID())); await repo.put("world", world);
  await saveProviderKey(profile.id, key); await saveImageSettings({ ...DEFAULT_IMAGE_SETTINGS, enabled: true, profiles: [profile] });
  const factory = vi.fn(() => provider), jobs = new ImageJobs(repo, async () => true, factory); return { repo, jobs, factory };
}
function provider(generate = vi.fn(async () => ({ image: tinyImage, headers: {} }))) { return { generate, edit: vi.fn(), listModels: vi.fn(async () => []) }; }
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it.each([false, true])("keeps only an active bounded worker operation alive and clears its timer (failure=%s)", async failure => {
  vi.useFakeTimers(); const keepAlive = vi.fn(async () => undefined); let finish!: () => void;
  const operation = imageWorkerOperation(() => new Promise<void>((resolve, reject) => { finish = failure ? () => reject(new Error("synthetic")) : resolve; }), keepAlive);
  const outcome = operation.catch(error => error); await vi.advanceTimersByTimeAsync(50_000); expect(keepAlive).toHaveBeenCalledTimes(2); finish(); await outcome; await vi.advanceTimersByTimeAsync(50_000); expect(keepAlive).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
});
it("resumes a cross-host finished-image download without a second generation or authorization", async () => {
  const generate = vi.fn(async () => { throw new ImageApiError("downloadOrigin", { "x-venice-model-deprecation-warning": key }, "https://cdn.example.test/image.png"); });
  const { repo, jobs } = await setup(provider(generate));
  const error = await jobs.run(input).catch(e => e as ImageApiError); if (!(error instanceof ImageApiError)) throw new Error("Expected a download ticket"); expect(error.ticketId).toBeTruthy(); expect(JSON.stringify(error)).not.toContain(key);
  vi.spyOn(codec, "normalizeImage").mockResolvedValue(tinyImage);
  const fetchMock = vi.fn(async () => new Response("image", { headers: { "content-type": "image/png" } })); vi.stubGlobal("fetch", fetchMock);
  const result = await jobs.download(error.ticketId!); expect(await repo.get("illustration", result.id)).toEqual(result); expect(generate).toHaveBeenCalledOnce();
  expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]).toMatchObject({ credentials: "omit", redirect: "error" });
  expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toBeUndefined();
  await expect(jobs.ticket(error.ticketId!)).rejects.toMatchObject({ code: "expired" }); await repo.clear();
});
it("encrypts pending download descriptions with the vault and refuses access while locked", async () => {
  const generate = vi.fn(async () => { throw new ImageApiError("downloadOrigin", {}, "https://cdn.example.test/image.png"); });
  const { repo, jobs } = await setup(provider(generate)); await repo.enableVault("synthetic test password");
  const error = await jobs.run(input).catch(e => e as ImageApiError); if (!(error instanceof ImageApiError)) throw new Error("Expected a download ticket"); const stored = await browser.storage.session.get("deeprole_image_download_" + error.ticketId);
  expect(JSON.stringify(stored)).not.toContain(input.prompt); expect((await jobs.ticket(error.ticketId!)).input.prompt).toBe(input.prompt);
  await repo.lockVault(); await expect(jobs.ticket(error.ticketId!)).rejects.toMatchObject({ code: "changed" }); await repo.unlockVault("synthetic test password"); await repo.clear();
});
it("expires download tickets without any provider request", async () => {
  const { repo, jobs, factory } = await setup(provider()); const id = crypto.randomUUID(); await browser.storage.session.set({ ["deeprole_image_download_" + id]: { input, url: "https://cdn.example.test/image.png", createdAt: Date.now() - 16 * 60_000 } });
  await expect(jobs.download(id)).rejects.toMatchObject({ code: "expired" }); expect(factory).not.toHaveBeenCalled(); await repo.clear();
});
it("blocks duplicate paid requests for one story turn", async () => {
  let finish!: (value: { image: string; headers: {} }) => void; const generate = vi.fn(() => new Promise<{ image: string; headers: {} }>(resolve => { finish = resolve; }));
  const { repo, jobs } = await setup(provider(generate)); const first = jobs.run(input); await expect(jobs.run(input)).rejects.toMatchObject({ code: "busy" }); await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce()); finish({ image: tinyImage, headers: {} }); await first; await repo.clear();
});
it("refuses a full world before constructing or charging a provider", async () => {
  const { repo, jobs, factory } = await setup(provider()); await repo.mergeRecords(Array.from({ length: 60 }, (_, i) => ({ kind: "illustration" as const, id: `image-${i}`, data: { ...illustration, id: `image-${i}` } })));
  await expect(jobs.run(input)).rejects.toMatchObject({ code: "full" }); expect(factory).not.toHaveBeenCalled(); expect(await repo.get("world", world.id)).toEqual(world); await repo.clear();
});
it("redacts credentials from provider-controlled model metadata and errors", async () => {
  const api = provider(); api.listModels.mockResolvedValue([{ id: "synthetic", label: key, constraints: { unknown: key } }] as never);
  const { repo, jobs } = await setup(api); expect(JSON.stringify(await jobs.models(profile))).not.toContain(key);
  api.listModels.mockRejectedValue(new ImageApiError("unauthorized", { "x-venice-model-deprecation-warning": key })); const error = await jobs.models(profile).catch(e => e); expect(JSON.stringify(error)).not.toContain(key); await repo.clear();
});
it("keeps backup merging atomic when combined illustrations exceed the world quota", async () => {
  const { repo } = await setup(provider()); await repo.mergeRecords(Array.from({ length: 30 }, (_, i) => ({ kind: "illustration" as const, id: `old-${i}`, data: { ...illustration, id: `old-${i}` } })));
  const payload = await import("../src/storage/backup").then(async m => m.createBackup(undefined, repo)); if (payload.format !== "deeprole-backup") throw new Error("fixture");
  payload.records = Array.from({ length: 40 }, (_, i) => ({ kind: "illustration", id: `new-${i}`, data: { ...illustration, id: `new-${i}` } })); payload.records.unshift({ kind: "world", id: world.id, data: world });
  await expect(restoreBackup(payload, "merge", repo)).rejects.toThrow("image-full"); expect(await repo.list("illustration")).toHaveLength(30); expect(await repo.get("world", world.id)).toEqual(world); await repo.clear();
});
it("saves only the image profile and rejects a stale appearance edit", async () => {
  const { repo, jobs } = await setup(provider()); const entity = { id: "mira", worldId: world.id, kind: "character" as const, name: "Mira", description: "Preserve lore", aliases: [], memberIds: [], characterSheet: { ...EMPTY_CHARACTER }, createdAt: 1, updatedAt: 1 }; await repo.put("entity", entity);
  const value = { canonical: "Copper hair", sceneDelta: "Observatory", prefix: "", suffix: "", format: "prose" as const }; await jobs.saveProfile(input, entity.id, value, null);
  await expect(jobs.saveProfile(input, entity.id, { ...value, canonical: "Changed" }, null)).rejects.toMatchObject({ code: "changed" }); expect(await repo.get("entity", entity.id)).toMatchObject({ description: entity.description, characterSheet: { imageGeneration: value } }); await repo.clear();
});
it("requests a visual scene delta separately, without rewriting stable appearance or sending image bytes", () => {
  const request = { field: { key: "image-scene", label: "Current scene", scope: "scene" as const, maxLength: 1200 }, currentText: "", reference: { name: "Mira", appearance: "Copper hair", completedScene: "An observatory" } };
  expect(validCharacterTextRequest(request)).toBe(true); const prompt = characterFieldPrompt(request, [], "en"); expect(prompt).toContain("short visual scene description"); expect(prompt).toContain("Do not repeat or rewrite the stable appearance"); expect(prompt).not.toContain("data:image");
});
