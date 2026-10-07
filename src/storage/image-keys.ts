import { browser } from "wxt/browser";
import { object, validProviderId } from "../core/image-generation";
import { withLibraryLock } from "./library-lock";
export const IMAGE_KEYS_KEY = "deeprole_image_keys";
async function keys(): Promise<Record<string, string>> {
  const value = (await browser.storage.local.get(IMAGE_KEYS_KEY))[IMAGE_KEYS_KEY];
  if (value === undefined) return {};
  if (!object(value) || !Object.entries(value).every(([id, key]) => validProviderId(id) && typeof key === "string" && key.length <= 4096)) throw new Error("image-key-invalid");
  return { ...value } as Record<string, string>;
}
export async function getProviderKey(id: string): Promise<string | null> { if (!validProviderId(id)) throw new Error("image-key-invalid"); return (await keys())[id] ?? null; }
export async function saveProviderKey(id: string, key: string): Promise<void> {
  if (!validProviderId(id) || !key || key !== key.trim() || key.length > 4096 || /[\r\n]/.test(key)) throw new Error("image-key-invalid");
  await withLibraryLock("exclusive", async () => { await browser.storage.local.set({ [IMAGE_KEYS_KEY]: { ...await keys(), [id]: key } }); });
}
export async function removeProviderKey(id: string): Promise<void> {
  if (!validProviderId(id)) throw new Error("image-key-invalid");
  await withLibraryLock("exclusive", async () => { const value = await keys(); delete value[id]; await browser.storage.local.set({ [IMAGE_KEYS_KEY]: value }); });
}
export async function providerKeyHint(id: string): Promise<string | null> { const key = await getProviderKey(id); return key ? key.slice(-4) : null; }
