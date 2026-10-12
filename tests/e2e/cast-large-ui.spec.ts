import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { castText as text } from "../../src/core/cast-i18n";
for (const locale of ["ru", "en"] as const) for (const width of [320, 900]) test("large cast " + locale + " " + width + ": progress, completed review and keyboard", async ({ page }, info) => {
 const t = (k: Parameters<typeof text>[1]) => text(locale, k);
 await page.setViewportSize({ width, height: 1000 }); await page.goto("/tests/fixtures/cast.html?large=1&stage=scan&phase=reading&locale=" + locale); await expect(page.getByText(t("largeScan"), { exact: true })).toBeVisible(); await expect(page.getByText(t("largeHint"), { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: t("review"), exact: true })).toHaveCount(0);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
 if (width === 320 && info.project.name === "chromium") await page.screenshot({ path: info.outputPath("large-" + locale + ".png") });
 await page.goto("/tests/fixtures/cast.html?large=1&stage=done&phase=ready&locale=" + locale); const review = page.getByRole("button", { name: t("review"), exact: true }); await review.focus(); await page.keyboard.press("Enter"); await expect(page.getByRole("dialog").getByText(t("largePartial"), { exact: true })).toBeVisible(); await expect(page.getByRole("dialog").getByRole("button", { name: t("save") + " · 2", exact: true })).toBeEnabled();
});
for (const locale of ["ru", "en"] as const) test("large cast " + locale + ": cancelled progress offers explicit resume, stale sources offer restart", async ({ page }) => {
 const t = (k: Parameters<typeof text>[1]) => text(locale, k); await page.goto("/tests/fixtures/cast.html?large=1&phase=cancelled&locale=" + locale); await expect(page.getByRole("button", { name: t("resume"), exact: true })).toBeVisible(); expect(await page.evaluate(() => (window as any).castMessages.some((m: any) => m.action === "start"))).toBe(false);
 await page.goto("/tests/fixtures/cast.html?large=1&phase=error&error=lore-changed&locale=" + locale); await expect(page.getByRole("button", { name: t("largeReset"), exact: true })).toBeVisible(); expect(await page.evaluate(() => (window as any).castMessages.some((m: any) => m.action === "start"))).toBe(false);
});
