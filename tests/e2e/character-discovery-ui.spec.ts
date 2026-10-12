import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { characterDiscoveryText as text } from "../../src/core/character-discovery-i18n";
for (const locale of ["ru", "en"] as const) for (const width of [320, 900]) test(`character discovery ${locale} ${width}: review, edits, paging and no hidden search`, async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message)); const t = (key: Parameters<typeof text>[1]) => text(locale, key);
  await page.setViewportSize({ width, height: 1000 }); await page.goto(`/tests/fixtures/character-discovery.html?locale=${locale}`); expect(await page.evaluate(() => (window as any).discoveryFixture.calls)).toEqual([]);
  await page.getByRole("button", { name: t("read"), exact: true }).click(); const cards = page.locator(".dr-character-discovery article"); await expect(cards).toHaveCount(20);
  await cards.first().getByText(t("edit"), { exact: true }).click(); await cards.first().getByLabel(t("name"), { exact: true }).fill(locale === "ru" ? "Тихон Северный" : "Ash North"); await cards.first().getByLabel(t("background"), { exact: true }).fill(locale === "ru" ? "Курьер северной гильдии." : "Courier of the northern guild.");
  const approve = cards.first().getByRole("button", { name: t("approve"), exact: true }); await approve.focus(); await page.keyboard.press("Enter"); await expect(cards.first().getByText(t("added"), { exact: true })).toBeVisible();
  await cards.nth(1).getByRole("button", { name: t("reject"), exact: true }).click(); await page.getByRole("button", { name: t("next"), exact: true }).click(); await expect(cards).toHaveCount(6); await page.getByRole("button", { name: t("prev"), exact: true }).click(); await expect(cards).toHaveCount(20);
  const calls = await page.evaluate(() => (window as any).discoveryFixture.calls); expect(calls.filter((c: any) => c.action === "run")).toHaveLength(0); expect(calls.filter((c: any) => c.action === "approve").map((c: any) => c.input.accept)).toEqual([true, false]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]); expect(errors).toEqual([]);
  if (info.project.name === "chromium" && width === 320) await page.screenshot({ path: info.outputPath(`discovery-${locale}.png`) });
});
for (const locale of ["ru", "en"] as const) test(`character discovery ${locale}: cancel preserves review results`, async ({ page }) => {
  const t = (key: Parameters<typeof text>[1]) => text(locale, key); await page.goto(`/tests/fixtures/character-discovery.html?locale=${locale}`); await page.evaluate(() => { (window as any).discoveryFixture.stall = true; }); await page.getByRole("button", { name: t("start"), exact: true }).click(); await page.getByRole("button", { name: t("cancel"), exact: true }).click(); await expect(page.getByText(t("partial"), { exact: true })).toBeVisible(); await expect(page.locator(".dr-character-discovery article")).toHaveCount(20);
});
