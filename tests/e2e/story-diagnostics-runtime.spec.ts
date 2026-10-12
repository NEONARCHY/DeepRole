import { chromium, expect, test } from "@playwright/test";
import path from "node:path";

for (const locale of ["ru", "en"] as const) for (const protocol of ["legacy", "native"] as const) test(`installed manual history diagnostics ${locale} ${protocol}`, async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Installed MV3 only; shared UI/bridge is separately tested in Firefox"); test.setTimeout(60_000);
  const extension = path.resolve(".output/chrome-mv3");
  // Playwright owns the temporary profile and removes it on context.close().
  const context = await chromium.launchPersistentContext("", { channel: "msedge", headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    await worker.evaluate(locale => (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, showChatContextMeter: false } }), locale);
    let modelRequests = 0, historyReads = 0;
    await context.route("https://chat.deepseek.com/**", route => {
      if (route.request().url().includes("/api/v0/chat/completion")) { modelRequests++; return route.fulfill({ json: {} }); }
      if (route.request().url().includes("/api/v0/chat/history_messages?")) {
        historyReads++; expect(route.request().method()).toBe("GET");
        return route.fulfill({ json: protocol === "legacy"
          ? { messages: [{ id: 1, parent_id: null, role: "USER", content: "PRIVATE_DRAFT" }, { id: 2, parent_id: 1, role: "ASSISTANT", status: "FINISHED", content: "PRIVATE_REPLY" }] }
          : { code: 0, data: { biz_code: 0, biz_data: { chat_session: { id: "diagnostic-runtime", current_message_id: 2 }, chat_messages: [
            { message_id: 1, parent_id: null, role: "USER", status: "FINISHED", has_pending_fragment: false, content: "PRIVATE_DRAFT" },
            { message_id: 2, parent_id: 1, role: "ASSISTANT", status: "FINISHED", has_pending_fragment: false, fragments: [{ type: "RESPONSE", content: "PRIVATE_REPLY" }] },
            { message_id: 3, parent_id: 1, role: "ASSISTANT", status: "INCOMPLETE", has_pending_fragment: false, content: "PRIVATE_OTHER_BRANCH" },
          ] } } } });
      }
      return route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><title>Diagnostic mock</title></head><body><main><h1>Observatory</h1><article ${protocol === "native" ? 'data-virtual-list-item-key="2"' : 'data-message-id="1"'}>A test reply.</article><form><textarea aria-label="Message">Unsent private draft.</textarea><button type="button">Send</button></form></main></body></html>` });
    });
    const panel = await context.newPage(); await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`); await panel.setViewportSize({ width: 320, height: 1150 });
    const chat = await context.newPage(); await chat.goto("https://chat.deepseek.com/a/chat/s/diagnostic-runtime");
    await expect(chat.locator("deeprole-page-widget")).toBeAttached();
    await panel.getByRole("button", { name: locale === "ru" ? "Настройки" : "Settings", exact: true }).click();
    await panel.getByRole("button", { name: locale === "ru" ? "Файлы и защита" : "Files & security", exact: true }).click();
    await panel.getByText(locale === "ru" ? "Проверка работы" : "Troubleshooting", { exact: true }).click();
    await worker.evaluate(async () => { const tabs = await (globalThis as any).chrome.tabs.query({ url: "https://chat.deepseek.com/*" }); await (globalThis as any).chrome.tabs.update(tabs[0].id, { active: true }); });
    const before = historyReads;
    await panel.getByRole("button", { name: locale === "ru" ? "Проверить текущий чат" : "Check current chat", exact: true }).click();
    await expect(panel.getByText(locale === "ru" ? "Связи сообщений прочитаны" : "Message links read", { exact: true })).toBeVisible(); expect(historyReads - before).toBe(1);
    if (protocol === "native") {
      const native = panel.getByRole("region", { name: locale === "ru" ? "Ответ в серверной истории" : "Reply in server history", exact: true });
      await expect(native.getByText(locale === "ru" ? "Совпадает с концом ветки" : "Matches the branch end", { exact: true })).toBeVisible();
      await expect(native.getByText(locale === "ru" ? "Завершён, нет ожидающих фрагментов" : "Finished, no pending fragments", { exact: true })).toBeVisible();
    }
    await panel.getByText(locale === "ru" ? "Технические подробности" : "Technical details", { exact: true }).click();
    await expect(panel.getByText(locale === "ru" ? "Не подтверждена" : "Not verified", { exact: true })).toBeVisible();
    await panel.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Test clipboard unavailable"); } } }));
    await panel.getByRole("button", { name: locale === "ru" ? "Скопировать отчёт" : "Copy report", exact: true }).click();
    const report = await panel.getByRole("textbox", { name: locale === "ru" ? "Диагностический отчёт" : "Diagnostic report", exact: true }).inputValue();
    expect(report).not.toMatch(/PRIVATE|diagnostic-runtime|chatId|requestId/);
    expect(JSON.parse(report)).toMatchObject({ diagnosticVersion: protocol === "native" ? 4 : 3, automaticStoryIngestion: "not-checked", result: { diagnostics: { completion: "unknown" } } });
    if (protocol === "native") expect(JSON.parse(report)).toMatchObject({ result: { diagnostics: { nativeSnapshot: { session: "matched", selection: "anchor", selectedPath: "complete", anchorCompletion: "complete" } } } });
    else expect(JSON.parse(report)).toMatchObject({ result: { diagnostics: { statusCounts: [{ field: "status", role: "assistant", state: "FINISHED", count: 1 }] } } });
    await expect(panel.getByText("FINISHED", { exact: true }).first()).toBeVisible();
    await expect(chat.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("Unsent private draft."); expect(modelRequests).toBe(0); expect(await panel.locator(".dr-story-diagnostics:not(.dr-service-diagnostics)").textContent()).not.toMatch(/PRIVATE|diagnostic-runtime/);
    expect(await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await panel.screenshot({ path: info.outputPath(`installed-diagnostics-${locale}.png`), fullPage: true });
  } finally { await context.close(); }
});
