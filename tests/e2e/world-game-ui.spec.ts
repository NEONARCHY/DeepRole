import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { worldGameText } from "../../src/core/world-game";
for (const locale of ["ru", "en"] as const) for (const width of [320, 900]) test(`shared game controls ${locale} ${width}: resume, explicit reset and keyboard`, async ({ page }, info) => {
 const t = worldGameText(locale); await page.setViewportSize({ width, height: 900 }); await page.goto("/tests/fixtures/world-game.html?locale=" + locale);
 await expect(page.getByRole("link",{ name: t.open })).toHaveAttribute("href","https://chat.deepseek.com/a/chat/s/new-chat");
 await page.evaluate(() => { (window as any).worldGameFixture.fail = true; }); const resume = page.getByRole("button", { name: t.resume }); await resume.focus(); await page.keyboard.press("Enter"); await expect(page.getByRole("alert")).toHaveText(t.failed);
 await page.evaluate(() => { (window as any).worldGameFixture.fail = false; }); await resume.click(); await expect(page.getByRole("heading", { name: t.active })).toBeVisible();
 await page.locator("summary").filter({ hasText: t.restart }).click(); const reset = page.getByRole("button",{ name: t.restart }); await expect(reset).toBeDisabled(); await page.getByRole("checkbox").check(); await expect(reset).toBeEnabled();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
 if (info.project.name === "chromium") await page.screenshot({path:info.outputPath(`shared-game-${locale}-${width}.png`)});
 await reset.click(); await expect(reset).toBeDisabled(); expect(await page.evaluate(() => (window as any).worldGameFixture.resets)).toBe(1); const undo = page.getByRole("button", { name: locale === "ru" ? "Отменить начало новой игры" : "Undo starting over" }); await expect(undo).toBeVisible(); await undo.click(); await expect(undo).toHaveCount(0); expect(await page.evaluate(() => (window as any).worldGameFixture.undos)).toBe(1);
});
for (const locale of ["ru", "en"] as const) test(`square character actions ${locale}`, async ({ page },info) => {
 await page.setViewportSize({width:320,height:800}); await page.goto("/tests/fixtures/characters.html?locale="+locale);
 const actions = page.locator(".dr-characters .dr-character-header-actions").first().locator("button"); await expect(actions).toHaveCount(3);
 for (const button of await actions.all()) { const bounds = await button.boundingBox(); expect(bounds!.width).toBe(36); expect(bounds!.height).toBe(36); }
 if (info.project.name === "chromium") await page.screenshot({path:info.outputPath("square-character-"+locale+".png")});
});
