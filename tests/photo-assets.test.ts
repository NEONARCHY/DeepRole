// @vitest-environment node
import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DeepRoleDatabase } from "../src/storage/database";
import { DeepRoleRepository } from "../src/storage/repository";
import { isPhotoAddress } from "../src/core/photo-assets";
import { EMPTY_CHARACTER, EMPTY_STATUS } from "../src/core/characters";
import { characterEditBaseline } from "../src/core/character-edit";
import { selfieImageKey } from "../src/core/selfies";
import { imageReferences } from "../src/core/image-prompt";
import { createBackup, parseBackup } from "../src/storage/backup";
import { exportWorld, parseWorldPackage } from "../src/storage/worlds";
import { saveCharacter } from "../src/storage/characters";
import type { SceneEntity, WorldProfile, ChatBinding } from "../src/core/types";

const databases: DeepRoleDatabase[] = [];
beforeEach(() => vi.stubGlobal("Blob", NodeBlob));
afterEach(async () => { for (const db of databases.splice(0)) await db.delete(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const world: WorldProfile = { id: "w", name: "World", description: "Original lore", color: "#123456", contextBudget: 1000, relevanceThreshold: 6, createdAt: 1, updatedAt: 1 };
const binding: ChatBinding = { id: "b", chatId: "c", chatUrl: "https://chat.deepseek.com/a/chat/s/c", worldId: "w", focusIds: [], bookId: null, messageCountAtAnalysis: 0, createdAt: 1, updatedAt: 1 };
const person: SceneEntity = { id: "p", worldId: "w", kind: "character", name: "Mira", description: "  Unchanged lore\n", aliases: [], memberIds: [], createdAt: 1, updatedAt: 1, characterSheet: { ...EMPTY_CHARACTER, sprites: { neutral: image, sitting: [image] }, portraitLibrary: [image], selfieCategories: [{ id: "home", name: "Home", description: "", minTrust: 0, minAffinity: 0, images: [image] }] } };
async function setup(legacy = false) {
  const db = new DeepRoleDatabase("photos-" + crypto.randomUUID()); databases.push(db);
  const repo = new DeepRoleRepository(db, true);
  if (legacy) await db.records.put({ pk: "entity:p", kind: "entity", id: "p", data: person, updatedAt: 123 });
  else await repo.put("entity", person);
  await repo.put("world", world); await repo.put("binding", binding);
  return { db, repo };
}

it("deduplicates all assignments, reads originals on demand and keeps selfie/reference identity", async () => {
  const { db, repo } = await setup();
  const saved = (await repo.get<SceneEntity>("entity", "p"))!;
  const address = saved.characterSheet!.sprites.neutral as string;
  expect(isPhotoAddress(address)).toBe(true); expect(await db.photos.count()).toBe(1);
  expect(saved.characterSheet!.sprites.sitting).toEqual([address]);
  expect(saved.characterSheet!.selfieCategories![0]!.images).toEqual([address]);
  expect(selfieImageKey(address)).toBe(selfieImageKey(image)); expect(imageReferences(saved.characterSheet)[0]!.key).toBe(selfieImageKey(image));
  expect(await repo.readPhoto(address)).toBe(image);
  expect(JSON.stringify(await repo.rawRecords())).not.toContain("data:image");
});

it("migrates v1 rows idempotently without changing lore, timestamps, actions or pixels", async () => {
  const { db, repo } = await setup(true);
  await repo.migratePhotos(); await repo.migratePhotos();
  const raw = (await db.records.get("entity:p"))!;
  expect(raw.updatedAt).toBe(123); expect(raw.photosVersion).toBe(1); expect(await db.photos.count()).toBe(1);
  const portable = (await repo.portableRecords()).find(r => r.id === "p")!.data;
  expect(portable).toEqual(person);
});

it("keeps complete portable worlds and backups, never exports internal addresses", async () => {
  const { repo } = await setup();
  const pack = JSON.stringify(await exportWorld("w", repo));
  expect(pack).not.toContain("deeprole-photo:");
  expect((parseWorldPackage(pack).records.find(r => r.id === "p")!.data as SceneEntity).characterSheet).toEqual(person.characterSheet);
  const backup = await parseBackup(JSON.stringify(await createBackup(undefined, repo)));
  expect((backup.records.find(r => r.id === "p")!.data as SceneEntity).characterSheet).toEqual(person.characterSheet);
});

it("encrypts separate originals, denies locked reads, then restores exact bytes after disabling", async () => {
  const { db, repo } = await setup(); const address = (await repo.get<SceneEntity>("entity", "p"))!.characterSheet!.sprites.neutral as string;
  await repo.enableVault("photo-password");
  const stored = (await db.photos.get(address))!; expect(stored.data).toBeUndefined(); expect(stored.encrypted).toBeDefined();
  expect(await repo.readPhoto(address)).toBe(image);
  await repo.lockVault(); await expect(repo.readPhoto(address)).rejects.toThrow(); await expect(repo.storePhoto(image)).rejects.toThrow();
  await repo.unlockVault("photo-password"); expect(await repo.readPhoto(address)).toBe(image);
  await repo.disableVault(); expect((await db.photos.get(address))!.encrypted).toBeUndefined(); expect(await repo.readPhoto(address)).toBe(image);
  await repo.clear(); expect(await db.photos.count()).toBe(0);
});

it("saving a name reads only compact metadata, not any existing originals", async () => {
  const { db, repo } = await setup(); const before = (await repo.get<SceneEntity>("entity", "p"))!;
  const read = vi.spyOn(repo, "readPhoto"), photoReads = vi.spyOn(db.photos, "get");
  const fullLibraryRead = vi.spyOn(db.records, "toArray");
  const original = characterEditBaseline(before, [before]);
  const saved = await saveCharacter({ worldId: "w", chatId: "c", chatUrl: binding.chatUrl, base: "ignored-with-baseline", entityId: "p", original, name: "Renamed", sheet: original.sheet, state: EMPTY_STATUS, present: false }, repo);
  expect(saved.original.name).toBe("Renamed"); expect(read).not.toHaveBeenCalled();
  expect(fullLibraryRead).not.toHaveBeenCalled();
  // Address existence checks must not hydrate any full record into the editor.
  expect(photoReads).not.toHaveBeenCalled();
  expect(JSON.stringify(saved).length).toBeLessThan(4000);
  const portable = (await repo.portableRecords()).find(r => r.id === "p")!.data as SceneEntity;
  expect(portable.description).toBe(person.description); expect(portable.characterSheet!.sprites).toEqual(person.characterSheet!.sprites); expect(portable.characterSheet!.selfieCategories).toEqual(person.characterSheet!.selfieCategories);
});

it("a 204 MiB collection stays on disk while a name save has a small metadata result", async () => {
  const { db, repo } = await setup();
  const addresses: string[] = [];
  // Deliberately opaque storage fixtures, not decoded image/quality fixtures.
  for (let i = 0; i < 51; i++) addresses.push(await repo.storePhoto("data:image/png;base64," + btoa(String(i).padStart(6, "0")) + "A".repeat(4 * 1024 * 1024)));
  const sheet = { ...EMPTY_CHARACTER, sprites: { neutral: addresses[0]! }, portraitLibrary: addresses.slice(1) };
  await repo.put("entity", { ...person, characterSheet: sheet });
  const before = (await repo.get<SceneEntity>("entity", "p"))!, original = characterEditBaseline(before, [before]);
  const reads = vi.spyOn(db.photos, "get");
  const saved = await saveCharacter({ worldId: "w", chatId: "c", chatUrl: binding.chatUrl, base: "baseline", entityId: "p", original, name: "Large library", sheet, state: EMPTY_STATUS, present: false }, repo);
  expect(reads).not.toHaveBeenCalled(); expect(saved.original.sheet.portraitLibrary).toHaveLength(50);
  expect(JSON.stringify(saved).length).toBeLessThan(10_000);
  expect(JSON.stringify(await repo.rawRecords()).length).toBeLessThan(12_000);
}, 60000);

it("rolls back a failed vault switch atomically for both profiles and separate originals", async () => {
  const { db, repo } = await setup(); const address=(await repo.get<SceneEntity>("entity","p"))!.characterSheet!.sprites.neutral as string;
  const put=vi.spyOn(db.records,"bulkPut"); put.mockRejectedValueOnce(new Error("idb-switch"));
  await expect(repo.enableVault("photo-password")).rejects.toThrow("idb-switch");
  expect((await db.photos.get(address))!.encrypted).toBeUndefined(); expect(await repo.readPhoto(address)).toBe(image);
  await repo.enableVault("photo-password"); const encrypted=(await db.photos.get(address))!.encrypted;
  put.mockRejectedValueOnce(new Error("idb-switch")); await expect(repo.disableVault()).rejects.toThrow("idb-switch");
  expect((await db.photos.get(address))!.encrypted).toEqual(encrypted); expect((await db.photos.get(address))!.data).toBeUndefined();
  expect(await repo.readPhoto(address)).toBe(image); expect((await repo.get<SceneEntity>("entity","p"))!.description).toBe(person.description);
});

it("rejects device-local addresses in imported worlds and backups instead of creating broken images", async () => {
  const {repo}=await setup(),raw=await repo.rawRecords();
  expect(()=>parseWorldPackage(JSON.stringify({format:"deeprole-world",version:1,records:raw.filter(r=>r.kind!=="binding")}))).toThrow();
  const portable=await createBackup(undefined,repo);
  await expect(parseBackup(JSON.stringify({...portable,records:raw}))).rejects.toThrow();
});
