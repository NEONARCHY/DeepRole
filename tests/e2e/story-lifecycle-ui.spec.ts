import {expect,test} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {storyTaskText} from "../../src/core/story-task-i18n";
for(const locale of ["ru","en"] as const)for(const width of [320,900])test(`tasks and conflicts ${locale} ${width}: compare, resolve, complete, search and accessibility`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});await page.goto("/tests/fixtures/story-lifecycle.html?locale="+locale);const t=storyTaskText(locale);
 const tasks=page.getByRole("region",{name:t.title,exact:true});await expect(tasks.getByText(t.open,{exact:true})).toBeVisible();
 await expect(page.getByRole("heading",{name:t.before,exact:true})).toBeVisible();await expect(page.getByRole("heading",{name:t.after,exact:true})).toBeVisible();
 if(info.project.name==="chromium")await page.screenshot({path:info.outputPath(`lifecycle-${locale}-${width}.png`),fullPage:true});
 await page.getByRole("button",{name:t.replace,exact:true}).focus();await page.keyboard.press("Enter");
 await expect.poll(()=>page.evaluate(async()=>((await (window as any).lifecycle.f.world()).sharedGame.facts.filter((f:any)=>!f.task).map((f:any)=>f.text)))).toEqual([locale==="ru"?"Синий ключ открывает подвал.":"The blue key opens the cellar."]);
 await page.evaluate(async()=>{await (window as any).lifecycle.complete()});await expect(tasks.getByText(t.empty,{exact:true})).toBeVisible();
 await tasks.getByText(new RegExp(t.closed)).click();await expect(tasks.getByText(t.completed,{exact:true})).toBeVisible();
 await tasks.getByRole("searchbox",{name:t.search,exact:true}).fill("not-in-this-world");await expect(tasks.getByText(t.noMatch)).toBeVisible();
 await tasks.getByRole("searchbox",{name:t.search,exact:true}).fill("");await expect(tasks.getByText(t.completed,{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
 expect(await page.evaluate(()=>(window as any).lifecycle.calls.every((s:string)=>s==="DR_AUTOMATION_READ"||s==="DR_AUTOMATION_RESOLVE"))).toBe(true);
});
