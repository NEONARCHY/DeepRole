import { expect, test } from "@playwright/test";
import { assistantText } from "../../src/core/assistant-i18n";
import { experienceText } from "../../src/core/experience-i18n";

for (const locale of ["ru", "en"] as const) for (const width of [320, 900]) test("native lore explanation, no duplicate popup, safe blocked states " + locale + " " + width, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  await page.goto("/tests/fixtures/page-widget.html?composer-action&locale=" + locale);
  await page.evaluate(() => (window as any).setWidgetState({ canAnalyzeChat: true }));
  const button = page.locator(".dr-composer-action"), label = assistantText(locale, "chatAnalyze"), help = assistantText(locale, "chatAnalyzeHelp");
  await expect(button).toHaveAttribute("aria-label", label); await expect(button).toHaveAttribute("title", label + "\n" + help); await expect(button).toHaveAttribute("aria-description", help);
  await button.hover(); await page.waitForTimeout(1100);
  await expect(page.getByRole("tooltip")).toHaveCount(0); expect(await page.evaluate(() => (window as any).analysisCalls ?? 0)).toBe(0);
  await button.focus(); await expect(button).toBeFocused(); await button.press("Enter");
  expect(await page.evaluate(() => (window as any).analysisCalls)).toBe(1);
  for (const state of [{ generating: true, activity: null }, { generating: false, activity: { phase: "waiting", type: "memory-analysis" } }]) {
    await page.evaluate(patch => (window as any).setWidgetState(patch), state);
    await expect(button).toHaveAttribute("aria-disabled", "true");
    await expect(button).toHaveAttribute("title", label + "\n" + help + "\n" + experienceText(locale, state.generating ? "generating" : "waiting"));
    await button.hover(); await button.evaluate((node: HTMLButtonElement) => node.click()); expect(await page.evaluate(() => (window as any).analysisCalls)).toBe(1);
  }
  await page.evaluate(() => (window as any).setWidgetState({ generating: false, activity: null }));
  await expect(button).toHaveAttribute("aria-disabled", "false"); await expect(button).toHaveAttribute("title", label + "\n" + help);
  const box = await button.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  await page.evaluate(() => (window as any).setWidgetState({ vaultLocked: true })); await expect(button).toHaveCount(0);
});
