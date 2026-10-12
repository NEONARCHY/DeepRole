import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("diagnostic uses an exact virtual row key but rejects a key absent from server history", async ({ page }) => {
 await page.goto("/tests/fixtures/story-diagnostics.html?locale=en");
 await page.evaluate(() => { const row = document.querySelector('[data-message-id="2"]')!; row.removeAttribute("data-message-id"); row.setAttribute("data-virtual-list-item-key", "2"); });
 await page.getByRole("button", { name: "Check current chat", exact: true }).click(); await page.getByRole("button", { name: "Copy report" }).click();
 let report = JSON.parse(await page.evaluate(() => (window as any).diagnosticFixture.copied.at(-1)));
 expect(report.result.diagnostics.replyProbe).toMatchObject({ anchor: "matched", role: "assistant", selection: "unknown", completion: "unknown" });
 await page.evaluate(() => document.querySelector('[data-virtual-list-item-key="2"]')!.setAttribute("data-virtual-list-item-key", "999"));
 await page.getByRole("button", { name: "Check again", exact: true }).click(); await page.getByRole("button", { name: "Copy report" }).click();
 report = JSON.parse(await page.evaluate(() => (window as any).diagnosticFixture.copied.at(-1))); expect(report.result.diagnostics.replyProbe).toMatchObject({ anchor: "not-in-history", selection: "unknown", completion: "unknown" });
});

for (const locale of ["ru", "en"] as const) for (const width of [320, 760]) test(`manual diagnostic UI ${locale} at ${width}px`, async ({ page }) => {
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await page.setViewportSize({ width, height: 1100 }); await page.goto(`/tests/fixtures/story-diagnostics.html?locale=${locale}`);
  const check = page.getByRole("button", { name: locale === "ru" ? "Проверить текущий чат" : "Check current chat", exact: true });
  await expect(check, `Fixture initialization errors: ${errors.join(" | ")}`).toBeVisible(); expect(await page.evaluate(() => (window as any).diagnosticFixture.calls)).toEqual([]);
  await page.keyboard.press("Tab"); await expect(check).toBeFocused(); await page.keyboard.press("Enter");
  await expect(page.getByText(locale === "ru" ? "Связи сообщений прочитаны" : "Message links read", { exact: true })).toBeVisible();
  await expect(page.getByText(locale === "ru" ? /Запись и отмена игровых изменений включаются/ : /Story tracking and undo are enabled separately/)).toBeVisible();
  const copy = page.getByRole("button", { name: locale === "ru" ? "Скопировать отчёт" : "Copy report" }); await copy.click();
  await expect(page.getByText(locale === "ru" ? "Отчёт скопирован" : "Report copied")).toBeVisible();
  const report = await page.evaluate(() => (window as any).diagnosticFixture.copied[0]); expect(report).not.toMatch(/PRIVATE|diagnostic-fixture|Authorization|chatId/);
  expect(JSON.parse(report)).toMatchObject({ diagnosticVersion: 3, result: { diagnostics: { completion: "unknown", replyProbe: { anchor: "matched", role: "assistant", parent: "in-window", siblingReplies: 1, childMessages: 0, selection: "unknown", completion: "unknown" }, statusCounts: [{ field: "status", role: "assistant", state: "FINISHED", count: 1 }] } } });
  await page.getByText(locale === "ru" ? "Технические подробности" : "Technical details", { exact: true }).click();
  await expect(page.getByText("FINISHED", { exact: true }).first()).toBeVisible();
  const replyCheck=page.getByRole("region", { name: locale === "ru" ? "Проверка последней видимой реплики" : "Last visible message check" });
  await expect(replyCheck).toBeVisible();
  await expect(replyCheck.getByText(locale === "ru" ? "Точное совпадение" : "Exact match", { exact: true })).toBeVisible();
  await expect(page.getByText(locale === "ru" ? "Не подтверждена" : "Not verified", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze(); expect(audit.violations).toEqual([]);
  expect((await page.screenshot({ fullPage: true })).length).toBeGreaterThan(1000);
  await page.evaluate(() => { const f=(window as any).diagnosticFixture; f.clipboardFails=true; f.payload={messages:[{id:1,role:"USER",content:"PRIVATE_LORE"}]}; });
  await page.getByRole("button", { name: locale === "ru" ? "Проверить ещё раз" : "Check again" }).click();
  await expect(page.getByText(locale === "ru" ? "Не удалось проверить связи сообщений" : "Message links could not be verified", { exact: true })).toBeVisible();
  await copy.click(); const text = page.getByRole("textbox", { name: locale === "ru" ? "Диагностический отчёт" : "Diagnostic report" }); await expect(text).toBeVisible(); expect(await text.inputValue()).not.toMatch(/PRIVATE|diagnostic-fixture/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const finalAudit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze(); expect(finalAudit.violations).toEqual([]);
  expect(await page.evaluate(() => (window as any).diagnosticFixture.calls)).toEqual(Array(2).fill({ url: "/api/v0/chat/history_messages?chat_session_id=diagnostic-fixture", method: "GET" }));
  expect((await page.screenshot({ fullPage: true })).length).toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});

test("diagnostic distinguishes anchored status from old unknown codes and alternative replies",async({page})=>{
  await page.goto("/tests/fixtures/story-diagnostics.html?locale=en");
  await expect(page.getByRole("button",{name:"Check current chat",exact:true})).toBeVisible();
  await page.evaluate(()=>{const f=(window as any).diagnosticFixture;f.payload.data.biz_data.current_message_id=2;f.payload.data.biz_data.selected_message_id=3;f.payload.data.biz_data.messages.push({id:3,parent_id:1,role:"assistant",status:"PRIVATE_UNKNOWN",content:"PRIVATE_ALTERNATIVE"});});
  await page.getByRole("button",{name:"Check current chat",exact:true}).click();await page.getByRole("button",{name:"Copy report"}).click();
  const report=await page.evaluate(()=>(window as any).diagnosticFixture.copied[0]);
  expect(JSON.parse(report)).toMatchObject({diagnosticVersion:3,automaticStoryIngestion:"not-checked",result:{diagnostics:{completion:"unknown",replyProbe:{anchor:"matched",siblingReplies:2,selection:"unknown",completion:"unknown",fields:[{field:"status",state:"FINISHED"}],references:[{relation:"anchor"},{relation:"other-in-window"}]}}}});
  expect(report).not.toMatch(/PRIVATE|anchorId|diagnostic-fixture/);
  expect(await page.evaluate(()=>(window as any).diagnosticFixture.calls)).toHaveLength(1);
});

test("diagnostic rejects a changed visible anchor and does not guess when DOM identity is ambiguous",async({page})=>{
  await page.goto("/tests/fixtures/story-diagnostics.html?locale=en");await expect(page.getByRole("button",{name:"Check current chat",exact:true})).toBeVisible();
  await page.evaluate(()=>{(window as any).diagnosticFixture.delay=true;});
  await page.getByRole("button",{name:"Check current chat",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>typeof (window as any).diagnosticFixture.release)).toBe("function");
  await page.evaluate(()=>{document.querySelector("[data-message-id]")!.setAttribute("data-message-id","3");(window as any).diagnosticFixture.release();});
  await expect(page.getByText(/visible message changed/)).toBeVisible();
  await page.getByRole("button",{name:"Copy report"}).click();
  expect(JSON.parse(await page.evaluate(()=>(window as any).diagnosticFixture.copied[0]))).toMatchObject({result:{status:"unavailable",code:"changed"}});
  await page.evaluate(()=>{const f=(window as any).diagnosticFixture;f.delay=false;const row=document.querySelector("[data-message-id]")!;row.setAttribute("data-message-id","2");row.after(row.cloneNode(true));});
  await page.getByRole("button",{name:"Check again"}).click();await expect(page.getByText("Message links read",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Copy report"}).click();
  const report=await page.evaluate(()=>(window as any).diagnosticFixture.copied[1]);expect(JSON.parse(report)).toMatchObject({result:{diagnostics:{replyProbe:{anchor:"not-supplied",fields:[],selection:"unknown",completion:"unknown"}}}});expect(report).not.toMatch(/PRIVATE|anchorId/);
});
