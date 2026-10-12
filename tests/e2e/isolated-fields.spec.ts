import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const locale of ["ru", "en"]) for (const width of [320, 520]) test("opaque service screen and keyboard cancellation " + locale + " " + width, async ({ page }) => {
 await page.setViewportSize({ width, height: 720 }); await page.emulateMedia({ reducedMotion: "reduce" });
 await page.goto("/tests/fixtures/isolated-fields.html?scenario=hold&locale=" + locale);
 await expect.poll(() => page.evaluate(() => (window as any).submitted)).toBe(true);
 const host = page.locator("deeprole-field-screen");
 await expect(host.locator(".brief")).toHaveText(locale === "ru" ? "Сгенерируй описание поля «Внешность» персонажа «Mira»" : "Generate a description for “Appearance” for the character “Mira”");
 await expect(host.locator(".status")).toHaveText(locale === "ru" ? "Размышляю" : "Thinking");
 expect(await host.evaluate(el => el.shadowRoot!.textContent)).not.toMatch(/PRIVATE_SYNTHETIC|Request ID|sources|evidence|field_/u);
 expect(await page.getByRole("textbox", { name: "Message" }).count()).toBe(0);
 expect(await page.getByRole("button", { name: "Send", exact: true }).count()).toBe(0);
 expect(await page.locator("#turns").textContent()).toContain("PRIVATE_SYNTHETIC_REASONING");
 expect(await page.locator("body").evaluate(el => getComputedStyle(el).opacity)).toBe("0");
 expect(await host.locator(".screen").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
 const request=(await host.locator(".request").boundingBox())!,response=(await host.locator(".response").boundingBox())!,main=(await host.locator("main").boundingBox())!;
 expect(request.width).toBeCloseTo(response.width*.9,0); expect(request.x+request.width).toBeCloseTo(response.x+response.width,0);
 expect(response.width).toBeCloseTo(main.width,0);
 expect(await host.locator(".dots i").first().evaluate(el => getComputedStyle(el).animationName)).toBe("none");
 expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
 // Layout stress only: replace the local display text, not the model request,
 // journal, character data, or native DOM retained for cleanup.
 const longBrief=locale==="ru"?`Сгенерируй описание поля «${"Внешность и повседневная одежда ".repeat(6)}» персонажа «${"Александра".repeat(8)}»`:`Generate a description for “${"Appearance and everyday clothing ".repeat(6)}” for the character “${"Alexandra".repeat(8)}”`;
 await host.locator(".brief").evaluate((el,text)=>{el.textContent=text;},longBrief);
 await expect(host.locator(".brief")).toHaveText(longBrief);
 expect(await host.locator(".request").evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 expect(await host.locator(".screen").evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 expect((await page.screenshot()).length).toBeGreaterThan(1000);
 const cancel = page.getByRole("button", { name: locale === "ru" ? "Отменить запрос" : "Cancel request", exact: true });
 await cancel.focus(); await page.keyboard.press("Tab"); await expect(cancel).toBeFocused(); await page.keyboard.press("Enter");
 await expect.poll(() => page.evaluate(() => (window as any).workerFinished), { timeout: 12000 }).toBe(true);
 expect(await page.evaluate(() => (window as any).error)).toBe("cancelled");
 expect(await page.evaluate(() => (window as any).cleanupCount)).toBe(1); expect(await page.evaluate(() => (window as any).removedTabs)).toEqual([2]);
 expect(await page.evaluate(() => (window as any).sentPrompts.length)).toBe(1);
 const report = await page.evaluate(async () => { const path = "/src/storage/service-diagnostics.ts"; return (await import(path)).readServiceDiagnostics(); });
 expect(report.journal.entries[0]).toMatchObject({ phase: "failed", cleanup: "done", error: "cancelled", runtime: { stage: "waiting-reply", visibility: "visible" } });
});

test("cleanup failure keeps native content masked until explicit inspection", async ({ page }) => {
 await page.goto("/tests/fixtures/isolated-fields.html?scenario=failed");
 await expect.poll(() => page.evaluate(() => (window as any).workerFinished), { timeout: 12000 }).toBe(true);
 await expect(page.locator("deeprole-field-screen .status")).toHaveText("Check the temporary chat");
 await expect(page.getByRole("button", { name: "Send", exact: true })).toHaveCount(0);
 expect(await page.evaluate(() => (window as any).outcome.cleanup)).toBe("failed");
 await page.getByRole("button", { name: "Open DeepSeek interface", exact: true }).click();
 await expect(page.locator("deeprole-field-screen")).toHaveCount(0); await expect(page.getByRole("button", { name: "Send", exact: true })).toBeVisible();
 expect(await page.evaluate(() => (window as any).cleanupCount)).toBe(0);
});
test("native top-layer confirmation remains masked and can be cleaned programmatically", async ({ page }) => {
 await page.goto("/tests/fixtures/isolated-fields.html?topLayer=true&fieldMode=history");
 await expect.poll(() => page.evaluate(() => (window as any).workerFinished), { timeout: 12000 }).toBe(true);
 expect(await page.evaluate(() => (window as any).outcome)).toMatchObject({ cleanup: "done", text: "Blue coat and short dark hair." });
 expect(await page.evaluate(() => (window as any).cleanupCount)).toBe(1); expect(await page.evaluate(() => (window as any).removedTabs)).toEqual([2]);
 await expect(page.locator("dialog")).toHaveCount(0); expect(await page.locator("deeprole-field-screen").evaluate(el => el.shadowRoot!.textContent)).not.toContain("evidence");
});

test("a focused service page renders and cleans behind its local screen without manual opening", async ({ page }) => {
 await page.goto("/tests/fixtures/isolated-fields.html?renderGate=true");
 await expect.poll(() => page.evaluate(() => (window as any).workerFinished), { timeout: 12000 }).toBe(true);
 expect(await page.evaluate(() => (window as any).serviceWindowRequest)).toMatchObject({ type: "popup", focused: true, width: 520, height: 720 });
 expect(await page.evaluate(() => (window as any).outcome)).toMatchObject({ text: "Blue coat and short dark hair.", cleanup: "done" });
 expect(await page.evaluate(() => (window as any).mainDraft)).toBe("Untouched manual game message"); expect(await page.evaluate(() => (window as any).removedTabs)).toEqual([2]);
 const report = await page.evaluate(async () => { const path = "/src/storage/service-diagnostics.ts"; return (await import(path)).readServiceDiagnostics(); });
 expect(report.diagnosticVersion).toBe(4); expect(report.journal.entries[0]).toMatchObject({ phase: "result", cleanup: "done", runtime: { stage: "reply-received", visibility: "visible" } });
});

for (const scenario of ["done", "failed", "refusal"]) test("isolated field worker " + scenario, async ({ page }) => {
 await page.goto("/tests/fixtures/isolated-fields.html?scenario=" + scenario);
 await expect.poll(() => page.evaluate(() => (window as any).workerFinished), { timeout: 12000 }).toBe(true);
 const value = await page.evaluate(() => ({ outcome: (window as any).outcome, error: (window as any).error, sent: (window as any).sentPrompts, draft: (window as any).mainDraft, removed: (window as any).removedTabs, deleted: (window as any).cleanupCount, foreign: (window as any).foreignClicks }));
 expect(value.sent).toHaveLength(1); expect(value.sent[0]).toContain("[DeepRole Service]"); expect(value.draft).toBe("Untouched manual game message"); expect(value.foreign).toBe(0); await expect(page.locator("#foreign-row")).toHaveCount(1);
 if (scenario === "refusal") {
  expect(value.error).toBe("invalid-result"); expect(value.outcome).toBeUndefined();
  const report = await page.evaluate(async () => { const path = "/src/storage/service-diagnostics.ts"; return (await import(path)).readServiceDiagnostics(); });
  expect(report.journal.entries[0]).toMatchObject({ phase: "failed", cleanup: "done", validation: { family: "field", events: [{ issues: [{ path: "text", rule: "not a replaced reply" }] }] } });
  expect(JSON.stringify(report)).not.toMatch(/Mira|Sorry|PRIVATE|https:\/\//u);
 } else { expect(value.outcome.text).toBe("Blue coat and short dark hair."); expect(value.outcome.text).not.toContain("REASONING"); expect(value.outcome.cleanup).toBe(scenario); }
 expect(value.deleted).toBe(scenario === "failed" ? 0 : 1); expect(value.removed).toEqual(scenario === "failed" ? [] : [2]);
});
test("human input stops the worker without deleting the touched chat", async ({ page }) => {
 await page.goto("/tests/fixtures/isolated-fields.html?scenario=touched");
 await expect.poll(() => page.evaluate(() => (window as any).submitted)).toBe(true);
 // Simulate explicit native inspection outside the masked surface. The guard
 // remains required even if someone removes the local presentation in DevTools.
 await page.evaluate(() => (window as any).revealNativeForTest()); await page.getByRole("button", { name: "Human intervention" }).click();
 await expect.poll(() => page.evaluate(() => (window as any).workerFinished), { timeout: 12000 }).toBe(true);
 expect(await page.evaluate(() => (window as any).error)).toBe("user-interrupted"); expect(await page.evaluate(() => (window as any).removedTabs)).toEqual([]); expect(await page.evaluate(() => (window as any).cleanupCount)).toBe(0);
});
for (const scenario of ["done", "missing", "bad-evidence"]) test("history-mode worker validates quotes and cleans on " + scenario, async ({ page }) => {
 await page.goto("/tests/fixtures/isolated-fields.html?fieldMode=history&scenario=" + scenario);
 await expect.poll(() => page.evaluate(() => (window as any).workerFinished), { timeout: 12000 }).toBe(true);
 const value = await page.evaluate(() => ({ outcome: (window as any).outcome, error: (window as any).error, deleted: (window as any).cleanupCount, removed: (window as any).removedTabs, sent: (window as any).sentPrompts.length }));
 expect(value.deleted).toBe(1); expect(value.removed).toEqual([2]); expect(value.sent).toBe(1);
 if (scenario === "done") expect(value.outcome).toMatchObject({ text: "Blue coat and short dark hair.", mode: "history", historyOrigin: "native", evidence: ["Mira wears a blue coat and has short dark hair."] });
 else {
  expect(value.outcome).toBeUndefined(); expect(value.error).toBe(scenario === "missing" ? "facts-not-found" : "invalid-evidence");
  const report = await page.evaluate(async () => { const path = "/src/storage/service-diagnostics.ts"; return (await import(path)).readServiceDiagnostics(); });
  expect(report.journal.entries[0]).toMatchObject({ phase: "failed", cleanup: "done", validation: { family: "field", events: [{ code: value.error, issues: [{ path: scenario === "missing" ? "status" : "evidence[0].quote" }] }] } });
  expect(JSON.stringify(report)).not.toMatch(/Mira|RED coat|https:\/\//u);
 }
});
for (const locale of ["ru", "en"]) for (const width of [320, 760]) test("field result and deletion warning " + locale + " " + width, async ({ page }) => {
 await page.setViewportSize({ width, height: 850 }); await page.goto("/tests/fixtures/isolated-fields.html?mode=ui&scenario=failed&locale=" + locale);
 const ask = locale === "ru" ? "Попросить дипсик сгенерировать: Внешность и одежда" : "Ask DeepSeek to generate: Appearance and clothing";
 await page.getByRole("button", { name: ask }).focus(); await page.keyboard.press("Enter");
 const choice = page.getByRole("button", { name: locale === "ru" ? "Предложить новое описание" : "Suggest a new description" }); await choice.focus(); await page.keyboard.press("Enter");
 await expect(page.locator('[data-character-text-field="appearance"] textarea')).toHaveValue(locale === "ru" ? "Синее пальто и короткие тёмные волосы." : "Blue coat and short dark hair.");
 const link = page.getByRole("link", { name: locale === "ru" ? "Открыть временный чат" : "Open temporary chat" }); await expect(link).toHaveAttribute("href", "https://chat.deepseek.com/chat/s/owned");
 expect(await page.locator("#app").evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 expect((await new AxeBuilder({ page }).include("#app").analyze()).violations).toEqual([]);
 // In-memory capture: no screenshots or browser profiles left on disk.
 expect((await page.screenshot()).length).toBeGreaterThan(1000);
});
