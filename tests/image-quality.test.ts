import { afterEach, expect, it, vi } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import { normalizeImage, dataImageBlob } from "../src/adapters/image/image-codec";
import { requestBody } from "../src/adapters/image/transport";
import { validIllustration } from "../src/core/image-generation";
import { validPortrait } from "../src/core/portrait-variations";
import { MAX_PORTRAIT_IMAGE_LENGTH } from "../src/core/portrait-upload";
import { illustration, profile, realPng, world } from "./image-fixtures";
import { MAX_GENERATED_IMAGE_BYTES } from "../src/core/generated-images";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { saveIllustration, worldImageUsage, validateWorldImageBudgets } from "../src/storage/illustrations";
import { exportWorld, parseWorldPackage, cloneWorldPackage } from "../src/storage/worlds";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { ImageJobs } from "../src/storage/image-jobs";
import { saveImageSettings } from "../src/storage/image-settings";
import { saveProviderKey } from "../src/storage/image-keys";
import { DEFAULT_IMAGE_SETTINGS, type Illustration } from "../src/core/image-generation";
import type { WorldProfile } from "../src/core/types";
import * as imageStorage from "../src/storage/illustrations";
import { ImageTransport } from "../src/adapters/image/transport";
import { VeniceNativeProvider } from "../src/adapters/image/venice-native";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it.each(["json", "binary-edit", "binary-multi"] as const)("preserves provider pixels and headers through the documented Venice %s pipeline", async mode => {
  vi.stubGlobal("Blob", NodeBlob); vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1920, height: 1080, close: vi.fn() })));
  const headers = { "x-venice-is-blurred": "false", "x-venice-is-content-violation": "false", "x-venice-model-deprecation-warning": "Synthetic warning" };
  vi.stubGlobal("fetch", vi.fn(async () => mode === "json" ? new Response(JSON.stringify({ images: [realPng] }), { headers: { ...headers, "content-type": "application/json" } }) : new Response(Uint8Array.from(atob(realPng), c => c.charCodeAt(0)), { headers: { ...headers, "content-type": "image/png" } })));
  const config = { ...profile, kind: "venice-native" as const, maxReferences: 2, editModelId: profile.modelId }, transport = new ImageTransport(config, "SYNTHETIC-KEY", async () => true), provider = new VeniceNativeProvider(config, transport);
  const result = mode === "json" ? await provider.generate({ prompt: illustration.prompt, aspectRatio: "9:16" }) : await provider.edit({ prompt: illustration.prompt, images: Array(mode === "binary-multi" ? 2 : 1).fill("data:image/png;base64," + realPng), aspectRatio: "9:16" });
  expect(result.image).toBe("data:image/png;base64," + realPng); expect(result.headers).toEqual(headers);
});
it("retains larger illustrations and scoped history in persistence, world export and full backup", async () => {
  const db = new DeepRoleDatabase("hd-image-" + crypto.randomUUID()), repo = new DeepRoleRepository(db);
  try {
    await repo.put("world", world);
    const source = "data:image/jpeg;base64," + "A".repeat(400_000), first = { ...illustration, image: source }, next = { ...first, id: "new-generation", createdAt: 2, updatedAt: 2 };
    await saveIllustration(first, repo); await saveIllustration(next, repo);
    expect(worldImageUsage(await repo.rawRecords(), world.id).bytes).toBe(source.length * 2);
    expect(validateWorldImageBudgets(await repo.rawRecords())).toBe(true);
    const pack = parseWorldPackage(JSON.stringify(await exportWorld(world.id, repo)));
    expect(pack.records.filter(r => r.kind === "illustration").map(r => (r.data as Illustration).image)).toEqual([source, source]);
    expect(cloneWorldPackage(pack).filter(r => r.kind === "illustration").every(r => (r.data as Illustration).image === source)).toBe(true);
    const backup = await parseBackup(JSON.stringify(await createBackup(undefined, repo)));
    await repo.clear(); await restoreBackup(backup, "replace", repo);
    expect(await repo.list("illustration")).toHaveLength(2); expect((await repo.get<WorldProfile>("world", world.id))?.description).toBe(world.description);
  } finally { await repo.clear(); db.close(); await db.delete(); }
});
it("reserves room for high-resolution results before making any paid provider call", async () => {
  const db = new DeepRoleDatabase("hd-budget-" + crypto.randomUUID()), repo = new DeepRoleRepository(db), provider = vi.fn();
  try {
    await repo.put("world", world); await saveProviderKey(profile.id, "SYNTHETIC-KEY");
    await saveImageSettings({ ...DEFAULT_IMAGE_SETTINGS, enabled: true, profiles: [profile] });
    vi.spyOn(imageStorage, "worldImageUsage").mockReturnValue({ illustrations: 5, bytes: 40_000_001 });
    await expect(new ImageJobs(repo, async () => true, provider).run({ worldId: world.id, chatId: illustration.chatId, chatUrl: "https://chat.deepseek.com/a/chat/s/test", messageKey: illustration.messageKey, providerId: profile.id, prompt: illustration.prompt, referenceKeys: [] })).rejects.toMatchObject({ code: "full" });
    expect(provider).not.toHaveBeenCalled(); expect(await repo.list("illustration")).toHaveLength(0);
  } finally { await repo.clear(); db.close(); await db.delete(); }
});
it("compresses an oversized result only at high quality, keeping every source pixel", async () => {
  vi.stubGlobal("Blob", NodeBlob); const close = vi.fn(), sizes: number[][] = [], qualities: number[] = [], draw = vi.fn();
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 3840, height: 2160, close })));
  vi.stubGlobal("OffscreenCanvas", class {
    constructor(public width: number, public height: number) { sizes.push([width, height]); }
    getContext() { return { fillRect: vi.fn(), drawImage: draw }; }
    async convertToBlob(options: { quality: number }) { qualities.push(options.quality); return new NodeBlob([Uint8Array.of(0xff, 0xd8, 0xff)], { type: "image/jpeg" }); }
  });
  const image = await normalizeImage(new NodeBlob([new Uint8Array(MAX_GENERATED_IMAGE_BYTES + 1)], { type: "image/png" }) as Blob, false, "9:16");
  expect(image).toMatch(/^data:image\/jpeg;base64,/); expect(sizes).toEqual([[3840, 2160]]); expect(qualities).toEqual([.94]);
  expect(draw.mock.calls[0]!.slice(1)).toEqual([0, 0, 3840, 2160]); expect(close).toHaveBeenCalledOnce();
});
it("rejects an oversized result instead of degrading it to thumbnail quality", async () => {
  vi.stubGlobal("Blob", NodeBlob); const close = vi.fn(), qualities: number[] = [];
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 3840, height: 2160, close })));
  const huge = new NodeBlob([new Uint8Array(MAX_GENERATED_IMAGE_BYTES + 1)], { type: "image/jpeg" });
  vi.stubGlobal("OffscreenCanvas", class {
    getContext() { return { fillRect: vi.fn(), drawImage: vi.fn() }; }
    async convertToBlob(options: { quality: number }) { qualities.push(options.quality); return huge; }
  });
  await expect(normalizeImage(huge as Blob)).rejects.toThrow("image-too-large"); expect(qualities).toEqual([.94, .90, .86]); expect(close).toHaveBeenCalledOnce();
});
it.each(["16:9", "9:16"] as const)("preserves a provider result at its actual resolution without canvas cropping: %s", async aspect => {
  vi.stubGlobal("Blob", NodeBlob); const close = vi.fn(), canvas = vi.fn();
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 3840, height: 2160, close })));
  vi.stubGlobal("OffscreenCanvas", canvas);
  const source = "data:image/png;base64," + realPng;
  expect(await normalizeImage(dataImageBlob(source), false, aspect)).toBe(source);
  expect(canvas).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledOnce();
});
it("keeps separate size budgets for high-quality portraits and larger illustrations", () => {
  const source = "data:image/jpeg;base64," + "A".repeat(MAX_PORTRAIT_IMAGE_LENGTH);
  expect(validIllustration({ ...illustration, image: source })).toBe(true); expect(validPortrait(source)).toBe(false);
  expect(validIllustration({ ...illustration, image: "data:image/jpeg;base64," + "A".repeat(10_000_000) })).toBe(false);
});
it.each(["openai-images", "venice-native"] as const)("passes explicit sizing and resolution unchanged: %s", kind => {
  const params = kind === "openai-images" ? { size: "2048x2048", quality: "high", future: ["literal"] } : { width: 2048, height: 1152, aspect_ratio: "16:9", resolution: "2K", future: ["literal"] };
  const before = structuredClone(params), body = requestBody({ ...profile, kind, extraParams: params }, { prompt: "An observatory", aspectRatio: "9:16" });
  for (const [key, value] of Object.entries(params)) expect(body[key]).toEqual(value);
  expect(params).toEqual(before);
});
