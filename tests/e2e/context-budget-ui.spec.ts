import {expect,test} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {contextBudgetText} from "../../src/core/context-budget-i18n";
for(const locale of ["ru","en"] as const)for(const width of [320,900])test(`context budget ${locale} ${width}: overflow, preserved required data, disclosure and accessibility`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});await page.goto("/tests/fixtures/context-budget.html?locale="+locale);const t=contextBudgetText(locale),summary=page.locator("summary");
 await expect(summary).toContainText(t.title);await summary.focus();await page.keyboard.press("Enter");await expect(page.getByText(t.overflow)).toBeVisible();await expect(page.getByText(t.required,{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>{const r=(window as any).contextBudgetFixture.result;return r.text.includes("ALWAYS complete user rule.")&&r.text.includes("Protected author rule.")})).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
 if(info.project.name==="chromium")await page.screenshot({path:info.outputPath(`context-budget-${locale}-${width}.png`),fullPage:true});
 await summary.focus();await page.keyboard.press("Enter");await expect(page.getByText(t.overflow)).not.toBeVisible();
});
