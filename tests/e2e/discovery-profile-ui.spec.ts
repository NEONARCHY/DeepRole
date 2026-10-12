import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { characterDiscoveryText as text } from "../../src/core/character-discovery-i18n";
import { characterText } from "../../src/core/characters";
import { profileCopy } from "../../src/core/character-profile-i18n";
for (const locale of ["ru", "en"] as const) for (const width of [320, 900]) test(`discovery profile ${locale} ${width}: filled protection, edits, keyboard and approval`, async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message)); const t = (k: Parameters<typeof text>[1]) => text(locale, k), p = profileCopy(locale), custom = locale === "ru" ? "Автор выбрал синее пальто." : "Author chose a blue coat.";
  await page.setViewportSize({ width, height: 1000 }); await page.goto(`/tests/fixtures/character-discovery.html?locale=${locale}`); expect(await page.evaluate(() => (window as any).discoveryFixture.calls)).toEqual([]); await page.getByRole("button", { name: t("read"), exact: true }).click();
  const card = page.locator(".dr-character-discovery article").first(); await card.getByText(t("edit"), { exact: true }).click(); const appearance = card.getByLabel(characterText(locale, "appearance"), { exact: true }); await appearance.fill(custom);
  await card.getByRole("button", { name: t("prepare"), exact: true }).click(); await expect(card.getByText(p.review, { exact: true })).toBeVisible(); await expect(appearance).toHaveValue(custom); const select = card.getByRole("checkbox", { name: p.select + " · " + characterText(locale, "appearance"), exact: true }); await expect(select).not.toBeChecked();
  await select.check(); await card.getByLabel(p.proposal + ": " + characterText(locale, "appearance"), { exact: true }).fill(custom + " Updated."); await card.getByRole("button", { name: t("profileApply"), exact: true }).click(); await expect(appearance).toHaveValue(custom + " Updated.");
  await expect(card.getByText(p.missing, { exact: true })).toHaveCount(3); expect(await page.evaluate(() => (window as any).discoveryFixture.calls.filter((c: any) => c.action === "approve").length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]); expect(errors).toEqual([]);
  if (width === 320 && info.project.name === "chromium") await card.screenshot({ path: info.outputPath(`profile-review-${locale}.png`) });
  const add = card.getByRole("button", { name: t("approve"), exact: true }); await add.focus(); await page.keyboard.press("Enter"); await expect(card.getByText(t("added"), { exact: true })).toBeVisible(); expect(await page.evaluate(() => (window as any).discoveryFixture.calls.find((c: any) => c.action === "approve").input.values.appearance)).toBe(custom + " Updated.");
});
for (const locale of ["ru", "en"] as const) test(`discovery profile ${locale}: preparation keeps a later catalog page`, async ({ page }) => {
 const t = (k: Parameters<typeof text>[1]) => text(locale, k); await page.goto(`/tests/fixtures/character-discovery.html?locale=${locale}`); await page.getByRole("button", { name: t("read"), exact: true }).click(); await page.getByRole("button", { name: t("next"), exact: true }).click(); const cards = page.locator(".dr-character-discovery article"); await expect(cards).toHaveCount(7);
 await cards.first().getByRole("button", { name: t("prepare"), exact: true }).click(); await expect(cards.first().getByText(profileCopy(locale).review, { exact: true })).toBeVisible(); await expect(cards).toHaveCount(7); expect(await page.evaluate(() => (window as any).discoveryFixture.calls.at(-1).input.offset)).toBe(20);
});
