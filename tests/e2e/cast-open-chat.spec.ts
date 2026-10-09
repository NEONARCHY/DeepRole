import { expect, test } from "@playwright/test";

for (const locale of ["ru", "en"]) for (const compact of [true, false]) test(`opens the saved conversation, not a new service launcher: ${locale} ${compact}`, async ({ page }) => {
 await page.setViewportSize({ width:compact?320:800, height:800 });
 const url="https://chat.deepseek.com/a/chat/s/known-uuid?deeprole_cast_job=old-job";
 await page.goto(`/tests/fixtures/cast.html?phase=error&cleanup=failed&locale=${locale}&compact=${compact?1:0}&chatId=known-uuid&chatUrl=${encodeURIComponent(url)}`);
 const status=page.locator(".dr-cast-status"), ru=locale==="ru", open=status.getByRole("button",{name:ru?"Открыть временный чат":"Open temporary chat",exact:true});
 await expect(open).toBeEnabled();
 const before=await page.evaluate(()=>(window as any).castSnapshot());
 await open.click();await expect.poll(()=>page.evaluate(()=>(window as any).castOpened)).toEqual([{url:"https://chat.deepseek.com/a/chat/s/known-uuid",active:true}]);
 expect(await page.evaluate(()=>(window as any).castMessages.filter((m:any)=>["start","cancel","cleanup","apply"].includes(m.action)))).toEqual([]);
 const after=await page.evaluate(()=>(window as any).castSnapshot());expect(after).toEqual(before);
 expect(await status.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 await page.screenshot({path:test.info().outputPath("cast-open-chat.png")});
});

for (const locale of ["ru", "en"]) test(`does not pretend an incomplete legacy address is a chat: ${locale}`, async ({ page }) => {
 await page.setViewportSize({width:320,height:800});
 await page.goto(`/tests/fixtures/cast.html?compact=1&phase=error&cleanup=failed&chatId=s&locale=${locale}`);
 const status=page.locator(".dr-cast-status"), ru=locale==="ru";
 await expect(status.getByRole("button",{name:ru?"Открыть временный чат":"Open temporary chat",exact:true})).toBeDisabled();
 await expect(status.getByText(ru?"Адрес временного чата не сохранился. Новый диалог вместо него открывать не будем.":"The temporary chat address was not saved. We will not open a new conversation in its place.",{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).castOpened)).toEqual([]);
 await expect(status.getByRole("button",{name:ru?"Чат уже удалён":"Chat already deleted",exact:true})).toBeEnabled();
 expect(await status.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
});
