import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { imageText } from "../../src/core/image-i18n";
for (const locale of ["ru", "en"] as const) for (const width of [320, 1100]) test("reference review setting remains optional and saves with keyboard, " + locale + " " + width, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto("/tests/fixtures/image-generation.html?locale=" + locale);
  const settings = page.locator("#app"), toggle = settings.getByRole("switch", { name: imageText(locale, "reviewSetting"), exact: true });
  await expect(toggle).not.toBeChecked();
  await settings.getByText(imageText(locale, "reviewSetting"), { exact: true }).click(); await expect(toggle).not.toBeChecked();
  await toggle.focus(); await page.keyboard.press("Space"); await expect(toggle).toBeChecked();
  await expect.poll(() => page.evaluate(async () => (await (window as any).chrome.storage.local.get("deeprole_image_settings")).deeprole_image_settings.reviewBeforeGeneration)).toBe(true);
  await expect(toggle).toBeEnabled(); expect(await page.evaluate(() => (window as any).requests)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  expect((await new AxeBuilder({ page }).include("#app").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await toggle.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath("reference-setting-" + locale + "-" + width + ".png") });
  await toggle.click(); await expect(toggle).not.toBeChecked();
  await expect.poll(() => page.evaluate(async () => (await (window as any).chrome.storage.local.get("deeprole_image_settings")).deeprole_image_settings.reviewBeforeGeneration)).toBe(false);
});
