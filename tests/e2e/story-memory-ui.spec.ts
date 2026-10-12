import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { storyUpdateText as text } from "../../src/core/story-update-i18n";
import { storyReviewText } from "../../src/core/story-review-i18n";
for (const locale of ["ru", "en"] as const) for (const width of [320, 900]) test(`story memory review ${locale} ${width}px`, async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message)); const t = (key: Parameters<typeof text>[1]) => text(locale, key);
  await page.setViewportSize({ width, height: 1100 }); await page.goto(`/tests/fixtures/story-memory-ui.html?locale=${locale}`);
  await page.getByRole("button", { name: storyReviewText(locale, "read"), exact: true }).click();
  const fields = page.getByLabel(t("text"), { exact: true }); await expect(fields).toHaveCount(2); await fields.first().fill(locale === "ru" ? "Ключ в кармане героя" : "The key is in the protagonist’s pocket");
  const save = page.getByRole("button", { name: t("save"), exact: true }).first(); await save.focus(); await page.keyboard.press("Enter"); await expect(page.getByText(t("saved"), { exact: true })).toHaveCount(1); await expect(page.getByText(t("edited"), { exact: true })).toHaveCount(1);
  await expect(page.getByText(t("promise"), { exact: true })).toBeVisible(); await page.getByText(t("evidence"), { exact: true }).first().click();
  await page.getByRole("button", { name: t("copy"), exact: true }).click(); const report = await page.evaluate(() => (window as any).storyMemoryFixture.copied.at(-1)); expect(JSON.parse(report)).toMatchObject({ stage: "story-update", result: { skipped: 1 } }); expect(report).not.toMatch(/Мира|Mira|карман|pocket|fact-one|review-assistant|quote/);
  await page.evaluate(() => { (window as any).storyMemoryFixture.clipboardFails = true; }); await page.getByRole("button", { name: t("copy"), exact: true }).click(); await expect(page.getByLabel(t("report"))).toBeVisible();
  await page.getByRole("button", { name: t("repair"), exact: true }).click(); await expect(page.getByText(t("repaired"), { exact: true })).toBeVisible();
  await page.getByRole("button", { name: t("remove"), exact: true }).click(); await expect(page.getByText(t("saved"), { exact: true })).toHaveCount(0);
  expect((await page.evaluate(() => (window as any).storyMemoryFixture.calls)).map((v: any) => v.accept)).toEqual([true, false]); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]); expect(errors).toEqual([]);
  if (info.project.name === "chromium" && width === 320) await page.screenshot({ path: info.outputPath(`reviewed-memory-${locale}.png`), fullPage: true });
});
