import {expect,test} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {resetServiceScreenCopy} from "../../src/core/field-service-screen";
for(const locale of ['ru','en'] as const)for(const width of [320,520])test(`reset service screen ${locale} ${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:720});await page.goto('/tests/fixtures/reset-service.html?locale='+locale);
 const screen=page.locator('deeprole-field-screen'),t=resetServiceScreenCopy(locale);await expect(screen.locator('h1')).toHaveText(t.title);
 await expect(screen.locator('.brief')).toHaveText(t.generic);await expect(screen.locator('.status')).toHaveText(t.stages.generating);
 await expect(screen.locator('.hint')).toHaveText(t.hint);expect(await screen.textContent()).not.toMatch(/анкеты|анкет|Персонажи из лора|profiles|Characters from lore|PRIVATE_/iu);
 expect(await screen.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);expect(await screen.locator('.brief').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 expect(await page.locator('html').ariaSnapshot()).not.toContain('PRIVATE_');expect(await page.locator('body').textContent()).toContain('PRIVATE_RESET_REPLY');
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 if(info.project.name==='chromium')await page.screenshot({path:info.outputPath(`reset-service-${locale}-${width}.png`),fullPage:true});
 await page.keyboard.press('Tab');await expect(screen.locator('.cancel')).toBeFocused();await page.keyboard.press('Escape');
 await expect(screen.locator('.status')).toHaveText(t.stages.cleanup);expect(await page.evaluate(()=>(window as any).cancelled)).toBe(1);
 await expect(screen.locator('.cancel')).toBeDisabled();
});
