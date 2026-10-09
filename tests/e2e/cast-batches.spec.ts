import { expect, test } from "@playwright/test";
for (const scenario of ["full", "partial"]) test("cast worker saves streamed " + scenario + " preparation", async ({ page }) => {
 await page.goto("/tests/fixtures/cast-worker.html?scenario=" + scenario);
 await expect.poll(() => page.evaluate(() => (window as any).workerFinished), { timeout: 15000 }).toBe(true);
 const job = await page.evaluate(() => (window as any).workerSnapshot());
 const prompts = await page.evaluate(() => (window as any).sentPrompts);
 expect(job.draft.characters.map((c: any) => c.name)).toEqual(scenario === "full" ? ["Leon", "Mira"] : ["Leon"]);
 expect(job.phase).toBe(scenario === "full" ? "ready" : "error");
 expect(prompts).toHaveLength(scenario === "full" ? 3 : 2);
 expect(prompts[1]).toContain("at most TWO");
 if(scenario === "full") expect(prompts[2]).toContain('Previously prepared people (do NOT repeat them');
 else { expect(job.error).toBe("partial-reply"); await expect(page.locator("[data-deeprole-cast-recovery]")).toBeVisible(); }
});
for (const locale of ["ru", "en"]) for (const width of [320, 1100]) test("partial cast review " + locale + " " + width, async ({ page }) => {
 await page.setViewportSize({ width, height: 900 });
 await page.goto("/tests/fixtures/cast.html?phase=error&cleanup=failed&compact=1&locale="+locale);
 const review = locale==="ru" ? "Проверить персонажей · 2" : "Review characters · 2";
 await page.getByRole("button", { name: review, exact:true }).click();
 const dialog=page.getByRole("dialog");await expect(dialog).toBeVisible();
 expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 await page.screenshot({path:test.info().outputPath("partial-review-"+locale+"-"+width+".png")});
 await dialog.getByRole("button", { name: locale==="ru" ? "Сохранить выбранных · 2" : "Save selected · 2", exact:true }).click();
 await expect(dialog).not.toBeVisible();
 expect(await page.evaluate(()=>(window as any).saved.length)).toBe(2);
});
