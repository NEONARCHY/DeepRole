import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const box = (page: import("@playwright/test").Page, key: string) => page.locator(`[data-character-text-field="${key}"]`);
const choose = async (page: import("@playwright/test").Page, key: string, locale = "en") => { await box(page,key).locator(".dr-character-generate").click(); await box(page,key).getByRole("button", { name: locale === "ru" ? "Предложить новое описание" : "Suggest a new description" }).click(); };
const waitActive = (page: import("@playwright/test").Page, key: string) => expect.poll(() => page.evaluate(() => (window as any).activeField)).toBe(key);
for (const locale of ["ru","en"]) for (const width of [320,760]) test("sequential field chats and localized queue " + locale + " " + width, async ({page}) => {
 await page.setViewportSize({width,height:850}); await page.goto("/tests/fixtures/character-queue.html?locale="+locale); await choose(page,"appearance",locale); await waitActive(page,"appearance"); await choose(page,"personality",locale); await choose(page,"goals",locale);
 await expect(box(page,"personality").getByRole("status")).toContainText(locale === "ru" ? "В очереди · 1" : "In queue · 1"); await expect(box(page,"goals").getByRole("status")).toContainText(locale === "ru" ? "В очереди · 2" : "In queue · 2");
 expect(await page.evaluate(()=>(window as any).queueRequests.length)).toBe(1); expect((await new AxeBuilder({page}).include("#app").analyze()).violations).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true); expect((await page.screenshot()).length).toBeGreaterThan(1000);
 await page.getByRole("button",{name:"Finish reply",exact:true}).click(); await waitActive(page,"personality"); await expect(box(page,"appearance").getByRole("textbox")).toHaveValue("Prepared appearance");
 expect(await page.evaluate(()=>(window as any).queueRequests[1].reference.appearance)).toBe("Prepared appearance");
 await page.getByRole("button",{name:"Finish reply",exact:true}).click(); await waitActive(page,"goals"); await page.getByRole("button",{name:"Finish reply",exact:true}).click(); await expect(box(page,"goals").getByRole("textbox")).toHaveValue("Prepared goals");
 expect(await page.evaluate(()=>(window as any).queueEvents.filter((v:string)=>v.startsWith("create:")||v.startsWith("remove:")))).toEqual(["create:2","remove:2","create:3","remove:3","create:4","remove:4"]);
 expect(await page.evaluate(()=>({saved:(window as any).queueSaved,draft:(window as any).mainDraft}))).toEqual({saved:0,draft:"Unsent main chat draft"});
});
test("manual queued edits are skipped; active edits preserve the generated text separately", async ({page})=>{
 await page.goto("/tests/fixtures/character-queue.html"); await choose(page,"appearance"); await waitActive(page,"appearance"); await choose(page,"personality"); await choose(page,"goals");
 await box(page,"personality").getByRole("textbox").fill("Manual personality"); await expect(box(page,"personality").getByRole("status")).toContainText("edited manually"); await box(page,"appearance").getByRole("textbox").fill("Manual coat");
 await page.getByRole("button",{name:"Finish reply",exact:true}).click(); await waitActive(page,"goals"); expect(await page.evaluate(()=>(window as any).queueRequests.map((r:any)=>r.field.key))).toEqual(["appearance","goals"]);
 await expect(box(page,"appearance").getByRole("textbox",{name:/Suggested text/})).toHaveValue("Prepared appearance"); expect(await page.evaluate(()=>(window as any).queueRequests[1].reference)).toMatchObject({appearance:"Manual coat",personality:"Manual personality"});
 await page.getByRole("button",{name:"Finish reply",exact:true}).click(); await expect(box(page,"goals").getByRole("textbox")).toHaveValue("Prepared goals");
});
test("active cancel waits for cleanup before dispatching the next field", async ({page})=>{
 await page.goto("/tests/fixtures/character-queue.html"); await choose(page,"appearance"); await waitActive(page,"appearance"); await choose(page,"personality"); await page.evaluate(()=>{(window as any).holdCleanup=true});
 await box(page,"appearance").getByRole("button",{name:/Cancel request:/}).click(); await expect(box(page,"appearance").getByRole("status")).toContainText("finishing cleanup");
 await expect.poll(()=>page.evaluate(()=>(window as any).queueEvents.includes("cancel:2"))).toBe(true); expect(await page.evaluate(()=>(window as any).queueRequests.length)).toBe(1);
 await page.getByRole("button",{name:"Finish cleanup",exact:true}).click(); await waitActive(page,"personality"); await expect(box(page,"appearance").getByRole("textbox")).toHaveValue("");
 await page.getByRole("button",{name:"Finish reply",exact:true}).click(); await expect(box(page,"personality").getByRole("textbox")).toHaveValue("Prepared personality");
});
test("changing book cancels queued requests and keeps manual draft fields", async ({page})=>{
 await page.goto("/tests/fixtures/character-queue.html"); await box(page,"goals").getByRole("textbox").fill("Manual goal"); await choose(page,"appearance"); await waitActive(page,"appearance"); await choose(page,"personality");
 await page.getByRole("button",{name:"Change book",exact:true}).click(); await expect(box(page,"personality").getByRole("alert")).toContainText("chat or world changed"); await expect(box(page,"appearance").getByRole("status")).toContainText("cancelled");
 await expect(box(page,"goals").getByRole("textbox")).toHaveValue("Manual goal"); expect(await page.evaluate(()=>(window as any).queueRequests.length)).toBe(1);
});
test("closing editor cancels owned worker and leaves no queued request for a different editor", async ({page})=>{
 await page.goto("/tests/fixtures/character-queue.html"); await choose(page,"appearance"); await waitActive(page,"appearance"); await choose(page,"personality"); await page.getByRole("button",{name:"Close",exact:true}).last().click();
 await expect(page.getByText("Editor closed",{exact:true})).toBeVisible(); await expect.poll(()=>page.evaluate(()=>(window as any).queueEvents.includes("remove:2"))).toBe(true); expect(await page.evaluate(()=>(window as any).queueRequests.length)).toBe(1);
});
