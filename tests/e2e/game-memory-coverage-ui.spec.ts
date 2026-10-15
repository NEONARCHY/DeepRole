import {expect,test} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {gameMemoryCoverageText} from "../../src/core/game-memory-coverage-i18n";
for(const locale of ["ru","en"] as const)for(const width of [320,900])test(`whole memory coverage ${locale} ${width}: honest states, no interruption, keyboard and layout`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});const t=gameMemoryCoverageText(locale);
 for(const kind of ["complete","budget","source","query","required"]){
  await page.goto(`/tests/fixtures/context-budget.html?locale=${locale}&coverage=${kind}`);
  const issue=kind==="budget"||kind==="required";
  await expect(page.locator(".dr-game-memory-notice")).toHaveCount(issue?1:0);
  if(issue)await expect(page.getByRole("status")).toContainText(kind==="budget"?t.budgetTitle:t.requiredTitle);
  expect(await page.evaluate(()=>{const f=(window as any).contextBudgetFixture;return Object.hasOwn(f.result.selection,'memoryCoverage')||JSON.stringify(f.result.report).includes('memoryCoverage');})).toBe(false);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const summary=page.locator('.dr-context-budget:not(.dr-memory-delivery)>summary');await summary.focus();await page.keyboard.press('Enter');
  await expect(page.getByText(t.preview,{exact:true})).toBeVisible();
  await expect(page.getByText(kind==="complete"?t.complete:kind==="budget"?t.budget:kind==="required"?t.requiredTitle:t[kind as "source"|"query"],{exact:true}).last()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  if(info.project.name==='chromium'&&kind==='budget')await page.screenshot({path:info.outputPath(`memory-deficit-${locale}-${width}.png`),fullPage:true});
  await summary.focus();await page.keyboard.press('Enter');await expect(page.getByText(t.preview,{exact:true})).not.toBeVisible();
  if(issue)await expect(page.getByRole('status')).toBeVisible();
 }
});
