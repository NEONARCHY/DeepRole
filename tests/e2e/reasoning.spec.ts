import { expect, test } from "@playwright/test";
import { setEnglish } from "./helpers/settings";
import AxeBuilder from "@axe-core/playwright";

for (const locale of ["ru", "en"] as const) for (const width of [320, 1100]) {
  test(`folded thoughts preserve native controls and manual expansion ${locale} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 950 }); await page.goto("/tests/fixtures/reasoning.html?locale=" + locale);
    await expect.poll(() => page.evaluate(() => !!(window as any).thoughtsTest)).toBe(true);
    const header = page.locator("#first .thought-heading"), thoughts = page.locator("#first .ds-think-content-wrapper"), fallback = page.locator("#fallback [data-deeprole-reasoning-toggle]");
    await expect(header).toHaveAttribute("aria-expanded", "false"); await expect(thoughts).toBeHidden(); await expect(header).toBeVisible();
    await expect(page.locator("#first .ds-markdown")).toBeVisible(); await expect(page.locator("#first .options")).toBeVisible();
    expect(await thoughts.textContent()).toContain("Private test thoughts"); await expect(page.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("Unsent draft.");
    await expect(page.locator("#deepthink")).toHaveAttribute("aria-pressed", "true"); expect(await page.evaluate(() => (window as any).thoughtsTest.modeClicks())).toBe(0);
    await expect(fallback).toHaveText(locale === "ru" ? "Показать размышления" : "Show thoughts");
    await page.screenshot({ path: info.outputPath("folded-thoughts.png") });
    await header.focus(); await header.press("Enter"); await expect(thoughts).toBeVisible();
    await page.evaluate(() => (window as any).thoughtsTest.stream()); await expect(thoughts).toBeVisible(); await expect(thoughts).toContainText("More streamed test thoughts");
    await page.evaluate(() => (window as any).thoughtsTest.replace()); await expect(header).toHaveAttribute("aria-expanded", "true"); await expect(thoughts).toBeVisible();
    await page.evaluate(() => (window as any).thoughtsTest.add()); await expect(page.locator("#new-reply .ds-think-content-wrapper")).toBeHidden(); await expect(thoughts).toBeVisible();
    await fallback.focus(); await fallback.press("Space"); await expect(page.locator("#fallback .ds-think-content-wrapper")).toBeVisible(); await expect(fallback).toHaveAttribute("aria-expanded", "true");
    await page.evaluate(() => (window as any).thoughtsTest.setShow(true)); await expect(page.locator("#new-reply .ds-think-content-wrapper")).toBeVisible(); await expect(fallback).toHaveCount(0);
    await page.evaluate(() => (window as any).thoughtsTest.setShow(false)); await expect(thoughts).toBeHidden();
    await header.click(); await expect(thoughts).toBeVisible(); await page.evaluate(() => (window as any).thoughtsTest.newChat()); await expect(thoughts).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
  test(`appearance settings save and reload without changing game settings ${locale} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 950 }); await page.goto("/tests/fixtures/sidepanel.html?persist");
    await page.getByRole("button", { name: "Настройки", exact: true }).click(); if (locale === "en") await setEnglish(page);
    const appearance = page.getByRole("button", { name: locale === "ru" ? "Оформление" : "Appearance", exact: true }); await appearance.click();
    const toggle = page.getByRole("checkbox", { name: locale === "ru" ? "Показывать размышления автоматически" : "Show thoughts automatically", exact: true });
    await expect(toggle).not.toBeChecked(); await expect(appearance).toHaveAttribute("aria-pressed", "true"); await expect(page.locator(".dr-settings-nav button")).toHaveCount(6);
    await page.screenshot({ path: info.outputPath("appearance-settings.png") });
    const audit = await new AxeBuilder({ page }).include(".dr-settings-page:not([hidden])").withTags(["wcag2a", "wcag2aa"]).analyze(); expect(audit.violations).toEqual([]);
    await toggle.check();
    await expect.poll(() => page.evaluate(async () => (await (window as any).chrome.storage.local.get("deeprole_settings")).deeprole_settings.showDeepSeekReasoning)).toBe(true);
    const settings = await page.evaluate(async () => (await (window as any).chrome.storage.local.get("deeprole_settings")).deeprole_settings);
    expect(settings.contextBudget).toBe(2000); expect(settings.sceneChoicesEnabled).toBe(true); expect(settings.characterSheetsEnabled).toBe(true);
    await page.reload(); await page.getByRole("button", { name: locale === "ru" ? "Настройки" : "Settings", exact: true }).click(); await appearance.click(); await expect(toggle).toBeChecked();
    await toggle.uncheck(); await expect.poll(() => page.evaluate(async () => (await (window as any).chrome.storage.local.get("deeprole_settings")).deeprole_settings.showDeepSeekReasoning)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
