import { expect, it } from "vitest";
import { EMPTY_CHARACTER, validCharacterSheet } from "../src/core/characters";
import { validPortraitCycles, nextPortraitCycle } from "../src/core/portrait-variations";
import { validSelfieCategories } from "../src/core/selfies";
import { createBackup, parseBackup, restoreBackup } from "../src/storage/backup";
import { exportWorld, parseWorldPackage, cloneWorldPackage } from "../src/storage/worlds";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { world } from "./image-fixtures";
import type { SceneEntity } from "../src/core/types";

it("preserves a >50 MB image collection through world, backup, encryption and restore", async () => {
  const db = new DeepRoleDatabase("unlimited-images-" + crypto.randomUUID()), repo = new DeepRoleRepository(db);
  const images = Array.from({ length: 55 }, (_, index) => "data:image/png;base64," + btoa(String(index).padStart(6, "0")) + "A".repeat(1_000_000));
  const sheet = { ...EMPTY_CHARACTER, appearance: "Original appearance", sprites: { neutral: images } };
  const entity: SceneEntity = { id: "mira", worldId: world.id, kind: "character", name: "Mira", description: "Unchanged story", aliases: [], memberIds: [], characterSheet: sheet, createdAt: 1, updatedAt: 1 };
  try {
    expect(images.reduce((sum, value) => sum + value.length, 0)).toBeGreaterThan(50_000_000);
    expect(validCharacterSheet(sheet)).toBe(true);
    expect(validPortraitCycles({ mira: { neutral: nextPortraitCycle(images) } })).toBe(true);
    await repo.put("world", world); await repo.put("entity", entity);
    const pack = parseWorldPackage(JSON.stringify(await exportWorld(world.id, repo)));
    expect((cloneWorldPackage(pack).find(record => record.kind === "entity")!.data as SceneEntity).characterSheet!.sprites.neutral).toEqual(images);
    const encrypted = await createBackup("synthetic-password", repo);
    expect(encrypted.format).toBe("deeprole-encrypted");
    const parsed = await parseBackup(JSON.stringify(encrypted), "synthetic-password");
    await repo.clear(); await restoreBackup(parsed, "replace", repo);
    expect((await repo.get<SceneEntity>("entity", entity.id))!.characterSheet).toEqual(sheet);
    expect(await repo.get("world", world.id)).toEqual(world);
  } finally { await repo.clear(); db.close(); await db.delete(); }
}, 120_000);

it("accepts more than 512 library photos, 64 stored emotion sets and 32 selfie collections", () => {
  const images = Array.from({ length: 600 }, (_, index) => "data:image/png;base64," + btoa("image-" + index));
  const sprites = Object.fromEntries(Array.from({ length: 80 }, (_, index) => ["mood-" + index, images]));
  expect(validCharacterSheet({ ...EMPTY_CHARACTER, portraitLibrary: images, sprites })).toBe(true);
  const categories = Array.from({ length: 40 }, (_, index) => ({ id: "selfie-" + index, name: "Collection " + index, description: "", minTrust: 0, minAffinity: 0, images }));
  expect(validSelfieCategories(categories)).toBe(true);
  expect(validCharacterSheet({ ...EMPTY_CHARACTER, selfieCategories: categories })).toBe(true);
  expect(validCharacterSheet({ ...EMPTY_CHARACTER, portraitLibrary: [images[0], images[0]] })).toBe(false);
});
