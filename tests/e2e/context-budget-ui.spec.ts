import {expect,test} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {contextBudgetText} from "../../src/core/context-budget-i18n";
import {memoryDeliveryText} from "../../src/core/memory-delivery-i18n";
for(const locale of ['ru','en'] as const)for(const width of [320,900])test(`action reasons ${locale} ${width}: actual whole memory and existing UI`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});await page.goto('/tests/fixtures/context-budget.html?locale='+locale+'&action=1');const t=contextBudgetText(locale),summary=page.locator('.dr-context-budget:not(.dr-memory-delivery) > summary');await summary.focus();await page.keyboard.press('Enter');
 await expect(page.getByText(t.persistentFacts,{exact:true})).toBeVisible();await expect(page.getByText(t.openTasks,{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>{const {result:r,input}=(window as any).contextBudgetFixture;return input.draft.startsWith(input.draft.includes('Я')?'Я открываю':'I open')&&r.report.explanation.persistentFacts===1&&r.report.explanation.openTasks===1&&Object.values(r.report.explanation).reduce((a:any,b:any)=>a+b,0)===r.report.selected.facts;})).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
 if(info.project.name==='chromium')await page.screenshot({path:info.outputPath(`action-reasons-${locale}-${width}.png`),fullPage:true});await summary.focus();await page.keyboard.press('Enter');await expect(page.getByText(t.persistentFacts,{exact:true})).not.toBeVisible();
});
for(const locale of ["ru","en"] as const)for(const width of [320,900])test(`continuation reasons ${locale} ${width}: actual protected lanes, keyboard and accessibility`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});await page.goto("/tests/fixtures/context-budget.html?locale="+locale+"&continuation=1");const t=contextBudgetText(locale),summary=page.locator(".dr-context-budget:not(.dr-memory-delivery) > summary");await summary.focus();await page.keyboard.press("Enter");
 await expect(page.getByText(t.persistentFacts,{exact:true})).toBeVisible();await expect(page.getByText(t.openTasks,{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>{const r=(window as any).contextBudgetFixture.result;return r.report.explanation.persistentFacts===1&&r.report.explanation.openTasks===1&&Object.values(r.report.explanation).reduce((a:any,b:any)=>a+b,0)===r.report.selected.facts;})).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
 if(info.project.name==="chromium")await page.screenshot({path:info.outputPath(`continuation-reasons-${locale}-${width}.png`),fullPage:true});await summary.focus();await page.keyboard.press("Enter");await expect(page.getByText(t.persistentFacts,{exact:true})).not.toBeVisible();
});
for(const locale of ["ru","en"] as const)for(const width of [320,900])test(`context budget ${locale} ${width}: overflow, preserved required data, disclosure and accessibility`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});await page.goto("/tests/fixtures/context-budget.html?locale="+locale);const t=contextBudgetText(locale),summary=page.locator(".dr-context-budget:not(.dr-memory-delivery) > summary");
 await expect(summary).toContainText(t.title);await summary.focus();await page.keyboard.press("Enter");await expect(page.getByText(t.overflow)).toBeVisible();await expect(page.getByText(t.required,{exact:true})).toBeVisible();
 await expect(page.getByText(t.preview,{exact:true})).toBeVisible();await expect(page.getByText(t.previewHint)).toBeVisible();
 const reasons=page.getByText(t.loreReasons,{exact:true});await reasons.focus();await page.keyboard.press("Enter");await expect(page.getByText(t.alwaysReason,{exact:true})).toBeVisible();
 const d=memoryDeliveryText(locale),receipt=page.locator(".dr-memory-delivery > summary");await receipt.focus();await page.keyboard.press("Enter");await expect(page.getByText(d.accepted)).toBeVisible();await expect(page.getByText(d.historical)).toBeVisible();await expect(page.getByText(d.use)).toBeVisible();
 await expect(page.getByRole("textbox",{name:d.payload})).toHaveCount(0);
 for(const label of locale==="ru"?["Для технической поддержки","Открыть технические данные"]:["For technical support","Open technical data"]){const control=page.getByText(label,{exact:true});await control.focus();await page.keyboard.press("Enter");}
 const payload=page.getByText(d.payload,{exact:true});await payload.focus();await page.keyboard.press("Enter");await expect(page.getByRole("textbox",{name:d.payload})).toHaveValue(await page.evaluate(()=>(window as any).contextBudgetFixture.result.text));await expect(page.getByRole("textbox")).toHaveAttribute("readonly","");await expect(page.getByText(d.payloadHint)).toBeVisible();expect(await page.locator("body").textContent()).not.toContain("PRIVATE_DRAFT_NOT_SHOWN");
 expect(await page.evaluate(()=>{const r=(window as any).contextBudgetFixture.result;return r.text.includes("ALWAYS complete user rule.")&&r.text.includes("Protected author rule.")})).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
 if(info.project.name==="chromium")await page.screenshot({path:info.outputPath(`context-budget-${locale}-${width}.png`),fullPage:true});
 await summary.focus();await page.keyboard.press("Enter");await expect(page.getByText(t.overflow)).not.toBeVisible();
});
