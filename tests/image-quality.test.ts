import { afterEach, expect, it, vi } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import { normalizeImage, dataImageBlob } from "../src/adapters/image/image-codec";
import { requestBody } from "../src/adapters/image/transport";
import { validIllustration } from "../src/core/image-generation";
import { validPortrait } from "../src/core/portrait-variations";
import { illustration, profile, realPng, world } from "./image-fixtures";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { saveIllustration, worldImageUsage } from "../src/storage/illustrations";
import { exportWorld, parseWorldPackage, cloneWorldPackage } from "../src/storage/worlds";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { type Illustration } from "../src/core/image-generation";
import type { WorldProfile } from "../src/core/types";
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
    const pack = parseWorldPackage(JSON.stringify(await exportWorld(world.id, repo)));
    expect(pack.records.filter(r => r.kind === "illustration").map(r => (r.data as Illustration).image)).toEqual([source, source]);
    expect(cloneWorldPackage(pack).filter(r => r.kind === "illustration").every(r => (r.data as Illustration).image === source)).toBe(true);
    const backup = await parseBackup(JSON.stringify(await createBackup(undefined, repo)));
    await repo.clear(); await restoreBackup(backup, "replace", repo);
    expect(await repo.list("illustration")).toHaveLength(2); expect((await repo.get<WorldProfile>("world", world.id))?.description).toBe(world.description);
  } finally { await repo.clear(); db.close(); await db.delete(); }
});
it("preserves large provider images without recompression", async () => {
  vi.stubGlobal("Blob", NodeBlob); const close = vi.fn(), canvas = vi.fn();
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 3840, height: 2160, close })));
  vi.stubGlobal("OffscreenCanvas", canvas);
  const bytes = new Uint8Array(8_000_000); bytes.set([0xff, 0xd8, 0xff]);
  const source = new NodeBlob([bytes], {type:"image/jpeg"});
  const image = await normalizeImage(source as Blob);
  expect(dataImageBlob(image).size).toBe(bytes.length);
  expect(Buffer.from(await dataImageBlob(image).arrayBuffer()).equals(Buffer.from(bytes))).toBe(true);
  expect(canvas).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledOnce();
}, 60_000);
it.each(["16:9", "9:16"] as const)("preserves a provider result at its actual resolution without canvas cropping: %s", async aspect => {
  vi.stubGlobal("Blob", NodeBlob); const close = vi.fn(), canvas = vi.fn();
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 12000, height: 9000, close })));
  vi.stubGlobal("OffscreenCanvas", canvas);
  const source = "data:image/png;base64," + realPng;
  expect(await normalizeImage(dataImageBlob(source), false, aspect)).toBe(source);
  expect(canvas).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledOnce();
});
it("accepts large portraits and illustrations without local quotas", () => {
  const source = "data:image/jpeg;base64," + "A".repeat(2_000_000);
  expect(validIllustration({ ...illustration, image: source })).toBe(true); expect(validPortrait(source)).toBe(true);
  expect(validIllustration({ ...illustration, image: "data:image/jpeg;base64," + "A".repeat(10_000_000) })).toBe(true);
});
it.each(["openai-images", "venice-native"] as const)("passes explicit sizing and resolution unchanged: %s", kind => {
  const params = kind === "openai-images" ? { size: "2048x2048", quality: "high", future: ["literal"] } : { width: 2048, height: 1152, aspect_ratio: "16:9", resolution: "2K", future: ["literal"] };
  const before = structuredClone(params), body = requestBody({ ...profile, kind, extraParams: params }, { prompt: "An observatory", aspectRatio: "9:16" });
  for (const [key, value] of Object.entries(params)) expect(body[key]).toEqual(value);
  expect(params).toEqual(before);
});
