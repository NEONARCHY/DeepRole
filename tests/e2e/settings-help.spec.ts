import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openSettingsSection } from "./helpers/settings";
for (const locale of ["ru", "en"] as const) for (const width of [320, 900]) test("compact settings help " + locale + " " + width, async ({ page }, info) => {
 await page.setViewportSize({ width, height: 1000 }); await page.goto("/tests/fixtures/sidepanel.html?world&locale=" + locale);
 await page.locator(".bottom-nav").getByRole("button", { name: locale === "ru" ? "Настройки" : "Settings", exact: true }).click();
 const prefix = locale === "ru" ? "Подсказка: " : "Help: ";
 for (const name of ["characters","appearance","app","memory"] as const) {
  await openSettingsSection(page,name,locale);
  const visible = page.locator(".dr-settings-page:visible");
  const helpers = visible.locator(".dr-settings-help-button"); expect(await helpers.count()).toBeGreaterThan(0);
  await expect(visible.getByRole("note")).toHaveCount(0);
  const before = await visible.locator('input[type="checkbox"]').evaluateAll(nodes => nodes.map(n => (n as HTMLInputElement).checked));
  const helper = helpers.first(); await expect(helper).toHaveAttribute("aria-label", new RegExp("^" + prefix)); await helper.focus(); await page.keyboard.press("Enter");
  await expect(visible.getByRole("note")).toHaveCount(1);
  const after = await visible.locator('input[type="checkbox"]').evaluateAll(nodes => nodes.map(n => (n as HTMLInputElement).checked)); expect(after).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape"); await expect(visible.getByRole("note")).toHaveCount(0);
  if (info.project.name === "chromium") await page.screenshot({ path: info.outputPath("settings-" + locale + "-" + width + "-" + name + ".png"), fullPage: true });
 }
});
