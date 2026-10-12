import { expect,test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {memoryBatchText} from "../../src/core/story-memory-batch-i18n";
for(const locale of ["ru","en"] as const)for(const width of [320,900])test(`memory batch ${locale} ${width}: explicit enable, pause, successful memory and accessibility`,async({page},info)=>{
 const t=memoryBatchText(locale);await page.setViewportSize({width,height:1000});await page.goto(`/tests/fixtures/story-memory-batch.html?locale=${locale}`);
 await expect(page.getByRole("button",{name:t.enable,exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as any).batchFixture.calls.filter((x:string)=>x==="run"))).toEqual([]);
 await page.getByRole("button",{name:t.enable,exact:true}).focus();await page.keyboard.press("Enter");await expect(page.getByText(t.enabled,{exact:true})).toBeVisible();
 await page.getByRole("button",{name:t.pause,exact:true}).click();await expect(page.getByText(t.paused,{exact:true})).toBeVisible();await page.getByRole("button",{name:t.resume,exact:true}).click();
 await page.getByRole("button",{name:t.run,exact:true}).click();await expect.poll(()=>page.evaluate(async()=>((await (window as any).batchFixture.f.world()).sharedGame.facts.length))).toBe(12);
 await expect(page.getByRole("button",{name:t.run,exact:true})).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
 if(info.project.name==="chromium")await page.screenshot({path:info.outputPath(`batch-${locale}-${width}.png`),fullPage:true});
});
for(const locale of ["ru","en"] as const)test(`memory batch ${locale}: cancellation keeps sources and explicit retry succeeds`,async({page})=>{
 const t=memoryBatchText(locale);await page.goto(`/tests/fixtures/story-memory-batch.html?locale=${locale}`);await page.getByRole("button",{name:t.enable,exact:true}).click();
 await page.evaluate(()=>{(window as any).batchFixture.stall=true});await page.getByRole("button",{name:t.run,exact:true}).click();await page.getByRole("button",{name:t.cancel,exact:true}).click();
 await expect(page.getByRole("button",{name:t.retry,exact:true})).toBeVisible();expect(await page.evaluate(async()=>((await (window as any).batchFixture.f.world()).sharedGame.facts.length))).toBe(0);
 await page.evaluate(()=>{(window as any).batchFixture.stall=false});await page.getByRole("button",{name:t.retry,exact:true}).click();await expect.poll(()=>page.evaluate(async()=>((await (window as any).batchFixture.f.world()).sharedGame.facts.length))).toBe(12);
 expect(await page.evaluate(()=>(window as any).batchFixture.calls.filter((x:string)=>x==="run").length)).toBe(2);
});
