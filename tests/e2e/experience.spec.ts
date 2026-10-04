import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setEnglish } from "./helpers/settings";

test("sidebar keeps actual analysis progress and empty/error results visible", async ({ page }) => {
  await page.goto("/tests/fixtures/sidepanel.html?world=1");
  await expect(page.getByRole("button", { name: "Обновить лор", exact: true })).toBeEnabled();
  for (const [phase, text] of [["preparing", "Готовим запрос"], ["waiting", "DeepSeek готовит предложения"], ["empty", "Новых фактов не найдено"], ["error", "Обновление не завершилось"]] as const) {
    await page.evaluate((phase) => (window as any).setPageState({ activity: { phase, type: "memory-analysis" } }), phase);
    await expect(page.locator(".dr-service-state")).toContainText(text);
    if (phase === "preparing" || phase === "waiting") await expect(page.getByRole("button", { name: "Обновить лор", exact: true })).toBeDisabled();
    else await expect(page.getByRole("button", { name: "Обновить лор", exact: true })).toBeEnabled();
  }
  await page.evaluate(() => (window as any).setPageState({ activity: null, generating: true }));
  await expect(page.locator(".dr-service-state")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Обновить лор", exact: true })).toBeDisabled();
  await expect(page.getByText("DeepSeek ещё отвечает", { exact: true })).toBeVisible();
});

for (const locale of ["ru", "en"] as const) for (const width of [320, 1280]) test(`handoff failure stays near the bottom without changing lore guidance ${locale} ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/tests/fixtures/page-widget.html?locale=${locale}`);
  await page.evaluate(() => (window as any).setWidgetState({ activity: { phase: "error", type: "continue-handoff" } }));
  const status = page.locator(".dr-context-anchor > .dr-service-state");
  await expect(status).toContainText(locale === "ru" ? "Перенос не завершился" : "The handoff did not finish");
  await expect(status).toContainText(locale === "ru" ? "Сохранённые состояния" : "Saved states");
  await expect(status).not.toContainText(locale === "ru" ? "Обновить лор" : "Update lore");
  const anchor = (await page.locator(".dr-context-anchor").boundingBox())!;
  const box = (await status.boundingBox())!;
  expect(box.x).toBeCloseTo(width === 320 ? 8 : anchor.x, 0);
  expect(box.y + box.height).toBeCloseTo(width === 320 ? 796 : 888, 0);
  expect(box.x + box.width).toBeLessThanOrEqual(width - 8);
  await page.screenshot({ path: info.outputPath(`handoff-error-${locale}-${width}.png`) });
});

test("outgoing preview shows records and reasons, not a claim they were already sent", async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/tests/fixtures/sidepanel.html?world=1");
  await expect(page.locator(".play-view")).toBeVisible();
  await page.evaluate(async () => {
    const { repository } = await import("/src/storage/repository.ts" as string);
    const entry = (await repository.list("entry"))[0];
    (window as any).setPageState({ selection: { entries: [{ entry, score: 8, reasons: ["keyword:Мира"], manuallySelected: false, estimatedTokens: 30 }], estimatedTokens: 30, omittedCount: 0 } });
  });
  await expect(page.locator(".dr-memory-status")).toContainText("Сейчас ничего не отправлено");
  await page.getByRole("button", { name: /Посмотреть записи/ }).click();
  await expect(page.locator(".dr-memory-preview-list")).toContainText("Совпали слова");
  await expect(page.locator(".dr-memory-preview-list strong")).not.toBeEmpty();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath("ready-memory-360.png"), fullPage: true });
  await page.evaluate(() => (window as any).setPageState({ warning: "unsupported" }));
  await expect(page.locator(".dr-memory-status")).toContainText("Память не попала в запрос");
  await page.evaluate(() => (window as any).setPageState({ warning: "", pendingHandoff: "Arrival", selection: { entries: [], estimatedTokens: 40, omittedCount: 0 } }));
  await expect(page.locator(".dr-memory-status")).toContainText("Память готова");
  await expect(page.locator(".dr-memory-status")).toContainText("Пересказ «Arrival» добавится один раз");
  await expect(page.locator(".dr-memory-status")).not.toContainText("Добавьте первый факт");
});

for (const locale of ["ru", "en"] as const) test(`compact settings keep help accessible and reminder editing keeps typed digits (${locale})`, async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/tests/fixtures/sidepanel.html");
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  if (locale === "en") await setEnglish(page);
  const l = (ru: string, en: string) => locale === "ru" ? ru : en;
  await expect(page.locator(".dr-mode-guide, .dr-score-guide")).toHaveCount(0);
  const help = page.getByRole("button", { name: l("Как работает подбор памяти", "How memory selection works"), exact: true });
  await expect(help).toBeVisible();
  await help.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).toBeFocused();
  await page.screenshot({ path: info.outputPath(`compact-settings-${locale}.png`), fullPage: true });
  await page.getByRole("button", { name: l("Приложение", "App"), exact: true }).click();
  const chatIndicator = page.getByRole("checkbox", { name: l("Контекст чата", "Chat context"), exact: true });
  const memoryIndicator = page.getByRole("checkbox", { name: l("Контекст DeepRole", "DeepRole context"), exact: true });
  await expect(chatIndicator).toBeChecked();
  await expect(memoryIndicator).toBeChecked();
  await chatIndicator.uncheck();
  await memoryIndicator.uncheck();
  const visibility = await page.evaluate(async () => (await (window as any).chrome.storage.local.get("deeprole_settings")).deeprole_settings);
  expect(visibility.showChatContextMeter).toBe(false);
  expect(visibility.showMemoryContextIndicator).toBe(false);
  const interval = page.getByRole("spinbutton", { name: l("Через сколько реплик", "Messages between reminders"), exact: true });
  await interval.fill(""); await interval.pressSequentially("25");
  await expect(interval).toHaveValue("25"); await interval.press("Tab");
  expect(await page.evaluate(async () => (await (window as any).chrome.storage.local.get("deeprole_settings")).deeprole_settings.suggestionInterval)).toBe(25);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const locale of ["ru", "en"] as const) test(`chat context indicators stack in the requested order and hide independently (${locale})`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto(`/tests/fixtures/page-widget.html${locale === "en" ? "?locale=en" : ""}`);
  await page.evaluate(() => (window as any).setWidgetState({ conversationEstimate: { estimatedTokens: 499, messageCount: 20, atLeast: false, source: "history" } }));
  const meter = page.locator(".dr-chat-meter");
  const memory = page.locator(".dr-context-indicators > .dr-pill");
  await expect(meter).toBeVisible();
  await expect(memory).toBeVisible();
  const meterBox = await meter.boundingBox();
  const memoryBox = await memory.boundingBox();
  expect(meterBox).not.toBeNull();
  expect(memoryBox).not.toBeNull();
  expect(memoryBox!.y).toBeGreaterThan(meterBox!.y);
  expect(Math.abs(memoryBox!.x - meterBox!.x)).toBeLessThan(2);

  await page.evaluate(() => (window as any).setWidgetState({ showChatContextMeter: false }));
  await expect(meter).toHaveCount(0);
  await expect(memory).toBeVisible();
  await page.evaluate(() => (window as any).setWidgetState({ showMemoryContextIndicator: false }));
  await expect(memory).toHaveCount(0);
  await page.evaluate(() => (window as any).setWidgetState({ showChatContextMeter: true }));
  await expect(meter).toBeVisible();
  await expect(memory).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("chat widget explains waiting and no-result states without hiding the conversation", async ({ page }) => {
  await page.goto("/tests/fixtures/page-widget.html");
  await page.evaluate(() => (window as any).setWidgetState({ canAnalyzeChat: true, activity: { phase: "waiting", type: "memory-analysis" } }));
  await expect(page.locator(".dr-service-state")).toContainText("DeepSeek готовит предложения");
  await page.getByRole("button", { name: /^Контекст/ }).click();
  await expect(page.locator(".dr-play-tools").getByRole("button", { name: "Обновить лор", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "DeepSeek chat control", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-chat-control-clicked", "true");
  await page.evaluate(() => (window as any).setWidgetState({ activity: { phase: "empty", type: "memory-analysis" } }));
  await expect(page.locator(".dr-service-state")).toContainText("Память не менялась");
  await expect(page.locator(".dr-play-tools").getByRole("button", { name: "Обновить лор", exact: true })).toBeEnabled();
});
