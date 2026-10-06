import { chromium, expect, test } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

for (const locale of ["ru", "en"]) test(`installed automatic recovery persists across reload and stays in its chat ${locale}`, async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Chrome MV3 runtime scenario"); test.setTimeout(60000);
  const profile = await mkdtemp(path.join(tmpdir(), "deeprole-reply-runtime-"));
  const extension = path.resolve(".output/chrome-mv3");
  const context = await chromium.launchPersistentContext(profile, { channel: "msedge", headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] }); context.setDefaultTimeout(10000);
  const refusal = "Sorry, that's beyond my current scope. Let's talk about something else.";
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const id = new URL(worker.url()).host;
    await worker.evaluate(locale => (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, replyRecoveryEnabled: true } }), locale);
    await context.route("https://chat.deepseek.com/**", route => route.fulfill({ contentType:"text/html", body:`<!doctype html><html><head><title>Recovery demo</title></head><body><main><header><h1>Recovery demo</h1></header><section><article data-message-id="answer" data-role="assistant"><div class="ds-think-content">Never archive this reasoning.</div><div class="ds-assistant-message-main-content"><div class="ds-markdown" id="answer">${refusal}</div></div></article></section><form><textarea aria-label="Message"></textarea></form></main></body></html>` }));
    const panel = await context.newPage(); await panel.goto(`chrome-extension://${id}/sidepanel.html`);
    const chat = await context.newPage(); await chat.goto("https://chat.deepseek.com/chat/s/recovery-runtime");
    await expect(chat.locator("deeprole-page-widget")).toBeAttached();
    await expect(chat.locator(".dr-launcher")).toBeVisible();
    await chat.getByRole("textbox", { name:"Message", exact:true }).fill("Preserved draft");
    await chat.locator("#answer").evaluate(node => { node.innerHTML = "<p>Mira has the compass.</p><p>The garden door is open.</p>"; });
    await expect(chat.locator("#answer")).toContainText("garden door");
    await chat.locator("#answer").evaluate((node, refusal) => { node.textContent = refusal; }, refusal);
    const host = chat.locator("[data-deeprole-recovered-reply]");
    await expect(host).toBeVisible(); await expect(host).toContainText("Mira has the compass.");
    await expect(host.locator("[data-deeprole-recovery-label]")).toHaveText(locale === "ru" ? "Восстановлено" : "Restored");
    await expect(chat.locator("textarea")).toHaveValue("Preserved draft");
    const archive = () => panel.evaluate(async () => new Promise<any[]>((resolve, reject) => {
      const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => {
        const db = open.result, read = db.transaction("records", "readonly").objectStore("records").getAll();
        read.onerror = () => { db.close(); reject(read.error); }; read.onsuccess = () => { db.close(); resolve(read.result.find(r => r.kind === "binding" && r.data.chatId === "recovery-runtime")?.data.recoveredReplies ?? []); };
      };
    }));
    await expect.poll(archive).toHaveLength(1); expect((await archive())[0].html).not.toContain("reasoning");
    await chat.reload(); await expect(host).toBeVisible(); await expect(host).toContainText("garden door");
    await chat.goto("https://chat.deepseek.com/chat/s/another-chat"); await expect(host).toHaveCount(0);
    await chat.goto("https://chat.deepseek.com/chat/s/recovery-runtime"); await expect(host).toBeVisible();
    await panel.setViewportSize({ width: locale === "ru" ? 360 : 1280, height: 900 });
    await panel.getByRole("button", { name: locale === "ru" ? "Настройки" : "Settings", exact: true }).click();
    await panel.getByRole("button", { name: locale === "ru" ? "Приложение" : "App", exact: true }).click();
    const toggle = panel.getByRole("checkbox", { name: locale === "ru" ? "Автоматически восстанавливать скрытые ответы" : "Automatically restore hidden replies", exact: true });
    await expect(toggle).toBeChecked(); await toggle.evaluate(node => node.scrollIntoView({ block: "center" }));
    expect(await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await panel.screenshot({ path: info.outputPath("reply-recovery-settings.png") });
    await toggle.uncheck();
    await expect(host).toHaveCount(0); await expect(chat.locator("#answer")).toBeVisible(); expect(await archive()).toHaveLength(1);
  } finally { await context.close(); }
});
