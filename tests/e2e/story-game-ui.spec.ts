import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { storyReviewText as text } from "../../src/core/story-review-i18n";
for (const locale of ["ru", "en"] as const) for (const width of [320, 900]) test(`playable story controls ${locale} ${width}px`, async ({ page }, info) => {
  const t = (key: Parameters<typeof text>[1]) => text(locale, key), errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width, height: 1100 }); await page.goto(`/tests/fixtures/story-game-ui.html?locale=${locale}`);
  const start = page.getByRole("button", { name: t("startGame"), exact: true }); await expect(start).toBeVisible(); await start.focus(); await page.keyboard.press("Enter");
  const sync = page.getByRole("button", { name: t("syncGame"), exact: true }); await expect(sync).toBeVisible(); await page.getByRole("button", { name: t("undo"), exact: true }).click(); await expect(page.getByText(t("paused"), { exact: true })).toBeVisible(); await sync.click();
  await page.getByText(t("nonStory"), { exact: true }).click(); await page.getByRole("button", { name: t("markNonStory"), exact: true }).click(); await expect(page.getByRole("button", { name: t("clearNonStory"), exact: true })).toBeVisible();
  await page.evaluate(() => { (window as any).storyGameFixture.mode = "conflict"; }); await sync.click(); await expect(page.getByText(t("conflict"), { exact: true })).toBeVisible(); await page.getByRole("button", { name: t("keepManual"), exact: true }).click();
  expect(await page.evaluate(() => (window as any).storyGameFixture.calls)).toEqual([{ operation: "start", manual: "stop" }, { operation: "undo", manual: "stop" }, { operation: "sync", manual: "stop" }, { operation: "out-of-character", manual: "stop" }, { operation: "sync", manual: "stop" }, { operation: "sync", manual: "keep" }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]); expect(errors).toEqual([]);
  if (info.project.name === "chromium" && width === 320) await page.screenshot({ path: info.outputPath(`story-controls-${locale}.png`), fullPage: true });
});
