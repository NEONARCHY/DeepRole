import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setEnglish } from "./helpers/settings";

for (const locale of ["ru", "en"] as const) for (const width of [320, 900]) for (const surface of ["settings", "chat"] as const) {
  test(`memory manual ${surface} ${locale} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 780 });
    const title = locale === "ru" ? "Как работает подбор памяти" : "How memory selection works";
    const close = locale === "ru" ? "Закрыть памятку" : "Close guide";
    if (surface === "settings") {
      await page.goto("/tests/fixtures/sidepanel.html");
      await page.getByRole("button", { name: "Настройки", exact: true }).click();
      if (locale === "en") await setEnglish(page);
    } else {
      await page.goto(`/tests/fixtures/page-widget.html?locale=${locale}`);
      await page.locator(".dr-context-anchor .dr-context-indicators .dr-pill").click();
    }
    const help = page.getByRole("button", { name: title, exact: true });
    await expect(help).toHaveText("?");
    await expect(help).toHaveAttribute("aria-expanded", "false");
    await help.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`help-location-${surface}-${locale}-${width}.png`) });
    await help.click();
    const dialog = page.getByRole("dialog", { name: title });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("section")).toHaveCount(6);
    await expect(dialog).toContainText(locale === "ru" ? "не понимание смысла ИИ" : "not AI understanding");
    await expect(dialog).toContainText(locale === "ru" ? "Подбирать вместе" : "Select together");
    await expect(dialog).toContainText(locale === "ru" ? "×0,85" : "×0.85");
    if (surface === "settings") await expect(dialog).toContainText(locale === "ru" ? "6 баллов" : "6 points");
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.width).toBeLessThanOrEqual(width);
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await expect(dialog.locator("header button")).toBeFocused();
    await dialog.locator("footer button").focus();
    await page.keyboard.press("Tab");
    await expect(dialog.locator("header button")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.locator("footer button")).toBeFocused();
    const audit = await new AxeBuilder({ page }).include(".dr-memory-guide").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`manual-${surface}-${locale}-${width}.png`) });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(help).toBeFocused();
    if (surface === "chat") await expect(page.locator(".dr-panel")).toBeVisible();
    await help.click();
    await page.getByRole("dialog").locator("footer").getByRole("button", { name: close }).click();
    await expect(help).toBeFocused();
    expect(await page.evaluate(() => (window as unknown as { savedMemory?: unknown }).savedMemory)).toBeUndefined();
  });
}

for (const locale of ["ru", "en"] as const) test(`memory manual works inside extension shadow root ${locale}`, async ({ page }) => {
  await page.goto(`/tests/fixtures/memory-guide.html?locale=${locale}`);
  const help = page.locator(".dr-memory-help");
  await help.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(node => node.getRootNode() instanceof ShadowRoot)).toBe(true);
  await expect(dialog).toContainText(locale === "ru" ? "9 баллов" : "9 points");
  await page.keyboard.press("Escape");
  await expect(help).toBeFocused();
  await expect(dialog).toHaveCount(0);
});
