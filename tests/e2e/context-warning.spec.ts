import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { setEnglish } from "./helpers/settings";

for (const locale of ["ru", "en"] as const) for (const width of [360, 1280]) {
  test(`capacity warning is readable and keyboard-safe ${locale} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 720 });
    await page.goto(`/tests/fixtures/context-warning.html?locale=${locale}`);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const close = dialog.getByRole("button", { name: locale === "ru" ? "Продолжить здесь" : "Stay in this chat", exact: true });
    const primary = dialog.getByRole("button", { name: locale === "ru" ? "Продолжить в новом чате" : "Continue in a new chat", exact: true });
    const disable = dialog.getByRole("button", { name: locale === "ru" ? "Не предупреждать" : "Turn off warnings", exact: true });
    await expect(close).toBeFocused();
    await page.keyboard.press("Tab"); await expect(disable).toBeFocused();
    await page.keyboard.press("Tab"); await expect(primary).toBeFocused();
    await page.keyboard.press("Shift+Tab"); await expect(disable).toBeFocused();
    const rect = await dialog.boundingBox(); expect(rect!.x).toBeGreaterThanOrEqual(0); expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(axe.violations.map(v => `${v.id}: ${v.help}`)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`warning-${locale}-${width}.png`) });
    await page.evaluate(() => (window as any).setBusy(true));
    await expect(primary).toBeDisabled(); await expect(dialog).toContainText(locale === "ru" ? "Дождитесь" : "Wait for");
    await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(page.locator("#composer")).toBeFocused();
  });
}

for (const locale of ["ru", "en"] as const) test(`capacity settings are clear, separate from memory and persistent ${locale}`, async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 820 });
  await page.goto("/tests/fixtures/sidepanel.html?world=1&persist=1");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  if (locale === "en") await setEnglish(page);
  await page.getByRole("button", { name: locale === "ru" ? "Приложение" : "App", exact: true }).click();
  const warning = page.getByRole("checkbox", { name: locale === "ru" ? "Предупреждать о заполнении чата" : "Warn when a chat is filling up", exact: true });
  const capacity = page.getByRole("spinbutton", { name: locale === "ru" ? "Ориентировочный объём чата, токенов" : "Estimated chat capacity, tokens", exact: true });
  await expect(warning).toBeChecked(); await expect(capacity).toHaveValue("1000000");
  await capacity.fill("50000"); await warning.uncheck();
  await expect(capacity).toHaveValue("50000");
  await expect(warning).not.toBeChecked();
  await expect.poll(() => page.evaluate(async () => {
    const saved = (await (window as any).chrome.storage.local.get("deeprole_settings")).deeprole_settings;
    return [saved.locale, saved.chatContextCapacity, saved.contextWarningsEnabled];
  })).toEqual([locale, 50000, false]);
  await page.reload(); await page.getByRole("button", { name: locale === "ru" ? "Настройки" : "Settings", exact: true }).click();
  await page.getByRole("button", { name: locale === "ru" ? "Приложение" : "App", exact: true }).click();
  await expect(warning).not.toBeChecked(); await expect(capacity).toHaveValue("50000");
  expect(await page.locator(".app-shell").evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath(`capacity-settings-${locale}.png`), fullPage: true });
});
