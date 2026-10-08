import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { IMAGE_STRINGS } from "../../src/core/image-i18n";
import { IMAGE_CONTENT_LEVELS } from "../../src/core/image-generation";
import { realPng } from "../image-fixtures";

const copy = (key: keyof typeof IMAGE_STRINGS, locale: "ru" | "en") => IMAGE_STRINGS[key][locale === "ru" ? 0 : 1];
const scenario = (locale: "ru" | "en", width: number) => `${locale} ${width}px`;

for (const locale of ["ru", "en"] as const) for (const width of [320, 360]) {
  test(`explicit preset needs the age confirmation, ${scenario(locale, width)}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/tests/fixtures/image-generation.html?locale=${locale}`);
    const app = page.locator("#app");
    const levelSelect = app.getByRole("combobox", { name: copy("level", locale), exact: true });
    await levelSelect.selectOption("adult");
    // Selecting the preset alone must not store it: the age confirmation appears first.
    await expect(app.getByRole("alert")).toHaveText(copy("adultGate", locale));
    await expect(levelSelect).toHaveValue("off");
    expect(await page.evaluate(async () => (await (window as any).chrome.storage.local.get("deeprole_image_settings")).deeprole_image_settings.contentLevel)).toBe("off");
    const confirmation = app.getByRole("switch", { name: copy("adultToggle", locale), exact: true });
    await confirmation.check();
    await expect(levelSelect).toHaveValue("adult");
    await expect(app.getByRole("alert")).toHaveCount(0);
    // Withdrawing the confirmation falls back to ordinary images instead of leaving a half-set preset.
    await confirmation.uncheck();
    await expect(levelSelect).toHaveValue("off");
    expect(await page.evaluate(async () => (await (window as any).chrome.storage.local.get("deeprole_image_settings")).deeprole_image_settings.adultConfirmed)).toBe(false);
    // The catalog offers exactly the three documented presets and the full 18+ label stays readable.
    await expect(levelSelect.locator("option")).toHaveText(IMAGE_CONTENT_LEVELS.map(entry => entry[locale]));
    await confirmation.check();
    await levelSelect.selectOption("adult");
    await expect(levelSelect).toHaveValue("adult");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`image-adult-settings-${locale}-${width}.png`) });
  });
}

test("an explicit turn is generated, scoped to its reply and restored with its preset recorded", async ({ page }) => {
  await page.route("https://images.example.test/**", async route => {
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
    if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
    await route.fulfill({ json: { data: [{ b64_json: realPng }] }, headers });
  });
  // The fixture applies the confirmed preset and its connection before the page script runs, so this
  // scenario never shares a stored record with another test.
  await page.goto("/tests/fixtures/image-generation.html?locale=en&preset=adult");
  const host = page.locator('[data-message-id="reply-1"] [data-deeprole-illustrations]');
  await host.getByRole("button", { name: copy("generate", "en"), exact: true }).click();
  const editor = page.getByRole("dialog", { name: copy("generate", "en"), exact: true });
  await expect(editor.getByRole("combobox", { name: copy("selected", "en"), exact: true })).toHaveValue(/./);
  await editor.getByRole("textbox", { name: copy("delta", "en"), exact: true }).fill("In the observatory at dusk, wearing a coat.");
  await editor.getByRole("button", { name: copy("generate", "en"), exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(host.locator("img")).toHaveCount(1);
  const records = await page.evaluate(async () => (await (window as any).repo.list("illustration")).map((record: any) => ({ contentLevel: record.contentLevel, messageKey: record.messageKey })));
  expect(records).toEqual([{ contentLevel: "adult", messageKey: '["message","reply-1"]' }]);
  await page.reload();
  await expect(host.locator("img")).toHaveCount(1);
});
