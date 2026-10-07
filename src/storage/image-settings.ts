import { browser } from "wxt/browser";
import { DEFAULT_IMAGE_SETTINGS, validImageSettings, type ImageSettings } from "../core/image-generation";
export const IMAGE_SETTINGS_KEY = "deeprole_image_settings";
/** Network profiles are device-local. Restoring lore never silently enables a destination. */
export async function getImageSettings(): Promise<ImageSettings> {
  const value = (await browser.storage.local.get(IMAGE_SETTINGS_KEY))[IMAGE_SETTINGS_KEY];
  if (value === undefined) return structuredClone(DEFAULT_IMAGE_SETTINGS);
  if (!validImageSettings(value)) throw new Error("image-settings-invalid");
  return structuredClone(value);
}
export async function saveImageSettings(value: ImageSettings): Promise<void> {
  if (!validImageSettings(value)) throw new Error("image-settings-invalid");
  await browser.storage.local.set({ [IMAGE_SETTINGS_KEY]: structuredClone(value) });
}
