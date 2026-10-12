import { beforeEach, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { contentRepository } from "../src/storage/content-repository";
import { EMPTY_CHARACTER, EMPTY_STATUS } from "../src/core/characters";
import { isPhotoAddress } from "../src/core/photo-assets";
import { uncachedSelfieImageKey } from "../src/core/selfies";
const requests = vi.hoisted(() => [] as any[]);
vi.mock("../src/storage/repository-stream", () => ({ REPOSITORY_PORT: "test-photos", requestJsonPort: async (_port: unknown, request: any) => {
  requests.push(request);
  return { ok: true, data: request.operation === "storePhoto" ? "deeprole-photo:" + "a".repeat(64) + ":" + uncachedSelfieImageKey(request.image) : { entityId: "p", base: "saved", original: {} } };
} }));
const address = "deeprole-photo:" + "b".repeat(64) + ":100:abc:def";
const baseline = { name: "Mira", sheet: { ...EMPTY_CHARACTER, sprites: { neutral: address }, portraitLibrary: [address], selfieCategories: [{ id: "c", name: "Home", description: "", minTrust: 0, minAffinity: 0, images: [address] }] }, state: EMPTY_STATUS, present: false, interlocutor: false, protagonists: [] };
const scope = { worldId: "w", chatId: "c", chatUrl: "https://chat.deepseek.com/a/chat/s/c", base: "before", entityId: "p" };
beforeEach(() => { requests.length = 0; Object.assign(browser.runtime, { connect: vi.fn(() => ({})) }); });
it("name-only saves omit unchanged image collections and upload no originals", async () => {
  await contentRepository.saveCharacter({ ...scope, ...baseline, name: "New name", original: baseline });
  expect(requests).toHaveLength(1); const edit = requests[0].edit;
  expect(edit.sheet.sprites).toEqual({}); expect(edit.original.sheet.sprites).toEqual({});
  expect(edit.sheet.portraitLibrary).toBeUndefined(); expect(edit.original.sheet.portraitLibrary).toBeUndefined();
  expect(edit.sheet.selfieCategories).toBeUndefined(); expect(JSON.stringify(requests)).not.toContain(address);
});
it("new photos travel separately, while the final edit contains immutable addresses only", async () => {
  const image = "data:image/png;base64," + "A".repeat(1024 * 1024);
  await contentRepository.saveCharacter({ ...scope, ...baseline, sheet: { ...baseline.sheet, sprites: { neutral: address, happy: image } }, original: baseline });
  expect(requests.map(r => r.operation)).toEqual(["storePhoto", "saveCharacter"]);
  expect(requests[0].image).toBe(image); expect(isPhotoAddress(requests[1].edit.sheet.sprites.happy)).toBe(true);
  expect(JSON.stringify(requests[1])).not.toContain("data:image"); expect(requests[1].edit.original.sheet.sprites.neutral).toBe(address);
  expect(baseline.sheet.sprites).toEqual({ neutral: address });
});
