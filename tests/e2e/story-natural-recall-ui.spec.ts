import {expect,test} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {contextBudgetText} from '../../src/core/context-budget-i18n';
for(const locale of ['ru','en'] as const)for(const width of [320,900])test(`natural recall preview ${locale} ${width}: whole duties, keyboard, overflow and accessibility`,async({page},info)=>{
 const t=contextBudgetText(locale);await page.setViewportSize({width,height:1000});await page.goto(`/tests/fixtures/context-budget.html?locale=${locale}&natural=1`);
 const panel=page.locator('.dr-context-budget:not(.dr-memory-delivery)'),summary=panel.locator(':scope > summary');await summary.focus();await page.keyboard.press('Enter');await expect(panel).toHaveAttribute('open','');
 const reason=panel.getByText(t.openTasks,{exact:true});await expect(reason).toBeVisible();await expect(reason.locator('..').locator('dd')).toHaveText('4');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).include('.dr-context-budget').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
 if(info.project.name==='chromium')await page.screenshot({path:info.outputPath(`natural-recall-${locale}-${width}.png`),fullPage:true});
 const selected=await page.evaluate(()=>(window as any).contextBudgetFixture.result.report.explanation);expect(selected.openTasks).toBe(4);await summary.focus();await page.keyboard.press('Enter');await expect(panel).not.toHaveAttribute('open','');
});
