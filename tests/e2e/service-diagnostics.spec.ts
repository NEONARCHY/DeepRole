import { expect, test } from "@playwright/test";
import { openSettingsSection, setEnglish  } from "./helpers/settings";

for (const locale of ["ru", "en"] as const) for (const width of [320, 760]) test(`precise field validation in ${locale} at ${width}px survives reload and copies safely`, async ({ page }) => {
 await page.setViewportSize({ width, height: 900 }); const name = "field-report-" + crypto.randomUUID(), url = `/tests/fixtures/service-diagnostics.html?locale=${locale}&field=true&db=${name}`;
 await page.goto(url); const check = locale === "ru" ? "Прочитать отчёт операций" : "Read operation report", copy = locale === "ru" ? "Скопировать отчёт" : "Copy report";
 for (let attempt = 0; attempt < 2; attempt++) {
  await page.getByRole("button", { name: check }).click(); await page.getByText(locale === "ru" ? "Подробности операций" : "Operation details", { exact: true }).click();
  const field = page.locator(".dr-service-diagnostics-list > li").filter({ has: page.getByText("evidence[0].quote", { exact: true }) });
  await expect(field.getByText(locale === "ru" ? "Проверка ответа палочки" : "Field reply check")).toBeVisible(); await expect(field.getByText(locale === "ru" ? "Цитата должна дословно совпадать с текстом источника." : "The quote must match the source text exactly.")).toBeVisible();
  await expect(field.getByText(locale === "ru" ? "Исправление формата" : "Format correction", { exact: true })).toHaveCount(0);
  await expect(field.getByText(locale === "ru" ? "Ожидание ответа на странице" : "Waiting for reply in the page", { exact: true })).toBeVisible();
  await expect(field.getByText(locale === "ru" ? "Страница скрыта" : "Hidden page", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: copy }).click(); const report = await page.evaluate(() => JSON.parse((window as any).serviceDiagnosticFixture.copied.at(-1)));
  expect(report).toMatchObject({ diagnosticVersion: 4, result: { journal: { total: 3 } } }); expect(report.result.journal.entries).toHaveLength(3);
  expect(report.result.journal.entries[0]).toMatchObject({ operation: "character-field", validation: { family: "field" }, runtime: { stage: "waiting-reply", visibility: "hidden", at: 7 } }); expect(JSON.stringify(report)).not.toMatch(/PRIVATE|ChatId|worldId|"sources"\s*:|"token"/u);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); if (!attempt) await page.reload();
 }
 expect(await page.evaluate(() => ({ rpc: (window as any).serviceDiagnosticFixture.rpc, tabs: (window as any).serviceDiagnosticFixture.tabWrites }))).toEqual({ rpc: 0, tabs: 0 }); await page.evaluate(() => (window as any).serviceDiagnosticFixture.db.delete());
});

for (const locale of ["ru", "en"] as const) for (const width of [320, 760, 1100]) test(`safe read-only service diagnostics in ${locale} at ${width}px`, async ({ page }) => {
 await page.setViewportSize({ width, height: 850 });
 const name = "service-diagnostic-browser-" + crypto.randomUUID();
 await page.goto(`/tests/fixtures/service-diagnostics.html?locale=${locale}&db=${name}`);
 const check = locale === "ru" ? "Прочитать отчёт операций" : "Read operation report", refresh = locale === "ru" ? "Обновить отчёт" : "Refresh report", copy = locale === "ru" ? "Скопировать отчёт" : "Copy report";
 await expect(page.getByRole("button", { name: check })).toBeVisible();
 expect(await page.evaluate(() => (window as any).serviceDiagnosticFixture.checks)).toBe(0);
 const before = await page.evaluate(async () => ({ records: await (window as any).serviceDiagnosticFixture.db.records.toArray(), local: await (window as any).chrome.storage.local.get() }));
 await page.keyboard.press("Tab"); await expect(page.getByRole("button", { name: check })).toBeFocused(); await page.keyboard.press("Enter"); await expect(page.getByRole("button", { name: copy })).toBeVisible();
 await page.getByText(locale === "ru" ? "Подробности операций" : "Operation details", { exact: true }).click();
 await expect(page.getByText("partial-reply", { exact: true })).toBeVisible();
 await expect(page.getByText(locale === "ru" ? "Цитата должна дословно совпадать с текстом источника." : "The quote must match the source text exactly.")).toBeVisible();
 await expect(page.getByText("characters[1].evidence[1].quote", { exact: true })).toBeVisible();
 await expect(page.getByText("present[0]", { exact: true })).toBeVisible();
 await expect(page.getByText(locale === "ru" ? "Очередь служебных отметок" : "Queued operation updates", { exact: true })).toBeVisible();
 expect(await page.locator("body").innerText()).not.toContain("PRIVATE");
 await page.getByRole("button", { name: copy }).click();
 const report = await page.evaluate(() => JSON.parse((window as any).serviceDiagnosticFixture.copied[0]));
 expect(report).toMatchObject({ readOnly: true, nativeCompletion: "not-verified", result: { journal: { total: 2 }, pending: { total: 1 } } }); expect(JSON.stringify(report)).not.toMatch(/PRIVATE|"token"|worldId|ChatId/);
 expect(report.result.journal.entries.find((entry: any) => entry.operation === "cast-preparation").validation.events.map((event: any) => event.repair)).toEqual([false, true]);
 await page.evaluate(() => { (window as any).serviceDiagnosticFixture.clipboardFails = true; }); await page.getByRole("button", { name: copy }).click();
 const fallback = page.getByRole("textbox", { name: locale === "ru" ? "Отчёт диагностики операций" : "Operation diagnostic report" }); await expect(fallback).toBeVisible(); await fallback.focus(); expect(await fallback.evaluate((node: HTMLTextAreaElement) => node.selectionEnd === node.value.length)).toBe(true);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 // Capture only in memory: no persistent screenshot, trace or browser profile.
 expect((await page.screenshot()).length).toBeGreaterThan(1000);
 await page.getByRole("button", { name: refresh }).click(); await expect(fallback).toHaveCount(0);
 expect(await page.evaluate(async () => ({ records: await (window as any).serviceDiagnosticFixture.db.records.toArray(), local: await (window as any).chrome.storage.local.get() }))).toEqual(before);
 expect(await page.evaluate(() => ({ rpc: (window as any).serviceDiagnosticFixture.rpc, tabs: (window as any).serviceDiagnosticFixture.tabWrites }))).toEqual({ rpc: 0, tabs: 0 });
 await page.evaluate(() => (window as any).serviceDiagnosticFixture.db.delete());
});

for (const locale of ["ru", "en"] as const) test(`past validation attempts do not look like current failure after success in ${locale}`, async ({ page }) => {
 await page.setViewportSize({ width: 320, height: 850 }); await page.goto(`/tests/fixtures/service-diagnostics.html?locale=${locale}&success=true`);
 await page.getByRole("button", { name: locale === "ru" ? "Прочитать отчёт операций" : "Read operation report" }).click();
 await page.getByText(locale === "ru" ? "Подробности операций" : "Operation details", { exact: true }).click();
 await expect(page.getByText(locale === "ru" ? /Более поздний успех их не стирает/ : /A later successful result does not erase them/)).toBeVisible();
 const cast = page.locator(".dr-service-diagnostics-list > li").filter({ has: page.getByText("characters[1].evidence[1].quote", { exact: true }) });
 await expect(cast.getByText(locale === "ru" ? "Получен подготовленный результат" : "Prepared result received", { exact: true })).toBeVisible();
 await expect(cast.getByText("partial-reply", { exact: true })).toHaveCount(0); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.evaluate(() => (window as any).serviceDiagnosticFixture.db.delete());
});

for (const locale of ["ru", "en"] as const) test(`operation report is wired into real Files and security settings in ${locale}`, async ({ page }) => {
 await page.setViewportSize({ width: 320, height: 850 }); await page.goto("/tests/fixtures/sidepanel.html");
 await page.getByRole("button", { name: "Настройки", exact: true }).click(); if (locale === "en") await setEnglish(page);
  await openSettingsSection(page,"diagnostics",locale);
// Diagnostics is now a direct settings route.
 const section = page.getByRole("region", { name: locale === "ru" ? "Диагностика палочек и подготовки персонажей" : "Wand and character preparation diagnostics", exact: true });
 await expect(section).toBeVisible(); await section.getByRole("button", { name: locale === "ru" ? "Прочитать отчёт операций" : "Read operation report" }).click();
 await expect(section.getByText(locale === "ru" ? /Зарегистрированных операций/ : /No registered operations/)).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.evaluate(async () => { const path = "/src/storage/repository.ts", { repository } = await import(path); await repository.db.delete(); });
});

for (const locale of ["ru", "en"] as const) test(`locked, restored, empty and unavailable service diagnostics in ${locale}`, async ({ page }) => {
 await page.setViewportSize({ width: 320, height: 850 });
 await page.goto(`/tests/fixtures/service-diagnostics.html?locale=${locale}`);
 const check = locale === "ru" ? "Прочитать отчёт операций" : "Read operation report", refresh = locale === "ru" ? "Обновить отчёт" : "Refresh report";
 await expect(page.getByRole("button", { name: check })).toBeVisible();
 await page.evaluate(async () => { const f = (window as any).serviceDiagnosticFixture; await f.repo.enableVault("synthetic-password"); await f.repo.lockVault(); });
 await page.getByRole("button", { name: check }).click(); await expect(page.getByText(locale === "ru" ? /Сейф закрыт/ : /vault is locked/)).toBeVisible();
 expect(await page.evaluate(() => (window as any).serviceDiagnosticFixture.repo.isLocked())).toBe(true);
 await page.evaluate(async () => {
  const f = (window as any).serviceDiagnosticFixture; await f.repo.unlockVault("synthetic-password");
  const backupUrl = "/src/storage/backup.ts", { createBackup, parseBackup, restoreBackup } = await import(backupUrl);
  const backup = await parseBackup(JSON.stringify(await createBackup("synthetic-backup", f.repo)), "synthetic-backup"); await restoreBackup(backup, "replace", f.repo);
 });
 await page.getByRole("button", { name: refresh }).click(); await page.getByText(locale === "ru" ? "Подробности операций" : "Operation details", { exact: true }).click();
 await expect(page.getByText(locale === "ru" ? /Восстановлено из резервной копии/ : /Restored from backup/).first()).toBeVisible();
 await page.evaluate(() => { (window as any).serviceDiagnosticFixture.mode = "empty"; }); await page.getByRole("button", { name: refresh }).click(); await expect(page.getByText(locale === "ru" ? /Зарегистрированных операций/ : /No registered operations/)).toBeVisible();
 await page.evaluate(() => { (window as any).serviceDiagnosticFixture.mode = "failure"; }); await page.getByRole("button", { name: refresh }).click(); await expect(page.getByText(locale === "ru" ? /Не удалось прочитать журнал/ : /Saved records could not be read/)).toBeVisible();
 expect(await page.locator("body").innerText()).not.toContain("PRIVATE"); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 expect(await page.evaluate(() => ({ rpc: (window as any).serviceDiagnosticFixture.rpc, tabs: (window as any).serviceDiagnosticFixture.tabWrites }))).toEqual({ rpc: 0, tabs: 0 });
 await page.evaluate(() => (window as any).serviceDiagnosticFixture.db.delete());
});
