import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const locale of ["ru","en"]) for (const width of [320,520]) test(`roster service screen ${locale} ${width}`, async ({page}) => {
 await page.setViewportSize({width,height:720}); await page.goto(`/tests/fixtures/cast-worker.html?locale=${locale}&scenario=hold`);
 const screen=page.locator('deeprole-field-screen[data-service-kind="cast"]'); await expect(screen).toBeVisible();
 await expect(screen.locator(".brief")).toHaveText(locale==="ru"?"Подготовь персонажей по лору":"Prepare characters from the lore");
 await expect(screen.locator("h1")).toHaveText(locale==="ru"?"Персонажи из лора":"Characters from lore");
 expect(await page.evaluate(()=>(window as any).fieldMask)).toBe(false);
 await expect.poll(()=>page.evaluate(()=>(window as any).sentPrompts.length)).toBe(1);
 expect(await page.locator("#turns").textContent()).toContain("[DeepRole");
 const visibleText=await screen.textContent(); expect(visibleText).not.toMatch(/Synthetic|Leon|Mira|deeprole_cast|Request ID|Return ONLY/u);
 expect(await page.locator("#turns").evaluate(node=>getComputedStyle(node).visibility)).not.toBe("hidden");
 expect(await page.locator("body").evaluate(node=>getComputedStyle(node).opacity)).toBe("0");
 const ax=await page.locator("html").ariaSnapshot(); expect(ax).not.toMatch(/Synthetic|textbox|button "Send"|Return ONLY/u);
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 expect(await screen.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 const request=(await screen.locator(".request").boundingBox())!,response=(await screen.locator(".response").boundingBox())!,main=(await screen.locator("main").boundingBox())!;
 expect(request.width).toBeCloseTo(response.width*.9,0); expect(request.x+request.width).toBeCloseTo(response.x+response.width,0);
 expect(response.width).toBeCloseTo(main.width,0);
 expect(await screen.locator(".brief").evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 await page.keyboard.press("Tab"); await expect(screen.locator(".cancel")).toBeFocused();
 await page.keyboard.press("Escape"); await expect.poll(()=>page.evaluate(()=>(window as any).workerFinished)).toBe(true);
 const state=await page.evaluate(async()=>({job:await (window as any).workerSnapshot(),sent:(window as any).sentPrompts.length,deleted:(window as any).cleanupCount,foreign:(window as any).foreignClicks}));
 expect(state.job.phase).toBe("cancelled"); expect(state.job.cleanup).toBe("done"); expect(state.sent).toBe(1); expect(state.deleted).toBe(1); expect(state.foreign).toBe(0);
});
test("roster profiles and repair stay masked through real native deletion dialog",async({page})=>{
 await page.goto("/tests/fixtures/cast-worker.html?scenario=repair&nativeDialog=1"); const screen=page.locator('deeprole-field-screen');
 await expect(screen.locator(".status")).toHaveText("Correcting the profile format",{timeout:15000});
 await expect.poll(()=>page.evaluate(()=>(window as any).workerFinished),{timeout:20000}).toBe(true);
 const result=await page.evaluate(async()=>({job:await(window as any).workerSnapshot(),count:(window as any).sentPrompts.length,cleanup:(window as any).cleanupCount}));
 expect(result.job.phase).toBe("ready"); expect(result.job.cleanup).toBe("done"); expect(result.job.draft.characters.map((p:any)=>p.name)).toEqual(["Leon","Mira"]); expect(result.count).toBe(4); expect(result.cleanup).toBe(1);
 await expect(screen.locator(".status")).toHaveText("Profiles ready for review"); expect(await screen.textContent()).not.toMatch(/INVALID|Synthetic|entity_|Leon|Mira/u);
 await expect(page.locator("#foreign-row")).toHaveCount(1);
});
test("failed roster cleanup stops animation and requires explicit native reveal",async({page})=>{
 await page.goto("/tests/fixtures/cast-worker.html?scenario=cleanup-fail"); const screen=page.locator('deeprole-field-screen');
 await expect.poll(()=>page.evaluate(()=>(window as any).workerFinished),{timeout:15000}).toBe(true);
 await expect(screen.locator(".status")).toHaveText("Check the temporary chat"); await expect(screen.locator(".skeleton")).not.toBeVisible();
 expect(await page.locator("body").evaluate(e=>getComputedStyle(e).opacity)).toBe("0");
 await screen.getByRole("button",{name:"Open DeepSeek interface"}).click(); await expect(screen).toHaveCount(0);
 await expect(page.locator("#turns")).toBeVisible(); expect(await page.evaluate(()=>(window as any).cleanupCount)).toBe(0);
});
test("roster animation respects reduced motion",async({page})=>{
 await page.emulateMedia({reducedMotion:"reduce"}); await page.goto("/tests/fixtures/cast-worker.html?scenario=hold");
 expect(await page.locator('deeprole-field-screen .dots i').first().evaluate(e=>getComputedStyle(e).animationName)).toBe("none");
 await page.locator('deeprole-field-screen .cancel').click(); await expect.poll(()=>page.evaluate(()=>(window as any).workerFinished)).toBe(true);
});
