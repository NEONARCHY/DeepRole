import { chromium, expect, test } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

for (const locale of ["ru", "en"]) test(`installed automatic recovery persists across reload and stays in its chat ${locale}`, async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Chrome MV3 runtime scenario"); test.setTimeout(60000);
  const profile = await mkdtemp(path.join(tmpdir(), "deeprole-reply-runtime-"));
  const extension = path.resolve(".output/chrome-mv3");
  const context = await chromium.launchPersistentContext(profile, { channel: "msedge", headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] }); context.setDefaultTimeout(10000);
  const refusal = locale === "ru" ? "Извините, это выходит за рамки моих текущих возможностей. Давайте поговорим о чём-то другом." : "Sorry, that's beyond my current scope. Let's talk about something else.";
  const compass = locale === "ru" ? "Мира держит компас." : "Mira has the compass.";
  const garden = locale === "ru" ? "Дверь в сад открыта." : "The garden door is open.";
  const regenerated = locale === "ru" ? "Мира вернула компас на полку." : "Mira returned the compass to the shelf.";
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const id = new URL(worker.url()).host;
    await worker.evaluate(locale => (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, replyRecoveryEnabled: true } }), locale);
    await context.route("https://chat.deepseek.com/**", route => route.fulfill({ contentType:"text/html", body:`<!doctype html><html><head><meta charset="UTF-8"><title>Recovery demo</title></head><body><main><header><h1>Recovery demo</h1></header><section><article data-message-id="answer" data-role="assistant"><div class="ds-think-content">Never archive this reasoning.</div><div class="ds-assistant-message-main-content"><div class="ds-markdown" id="answer">${refusal}</div></div></article></section><form><textarea aria-label="Message"></textarea></form></main></body></html>` }));
    const requests: any[] = []; let responseStatus = 200;
    await context.route("https://chat.deepseek.com/api/v0/chat/completion", route => {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ status: responseStatus, contentType: "text/event-stream", body: "data: [DONE]\n\n" });
    });
    const panel = await context.newPage(); await panel.goto(`chrome-extension://${id}/sidepanel.html`);
    const chat = await context.newPage(); await chat.goto("https://chat.deepseek.com/chat/s/recovery-runtime");
    await expect(chat.locator("deeprole-page-widget")).toBeAttached();
    await expect(chat.locator(".dr-launcher")).toBeVisible();
    await chat.getByRole("textbox", { name:"Message", exact:true }).fill("Preserved draft");
    await chat.locator("#answer").evaluate((node, lines) => { node.replaceChildren(...lines.map(text => { const p = document.createElement("p"); p.textContent = text; return p; })); }, [compass, garden]);
    await expect(chat.locator("#answer")).toContainText(garden);
    await chat.locator("#answer").evaluate((node, refusal) => { node.textContent = refusal; }, refusal);
    const host = chat.locator("[data-deeprole-recovered-reply]");
    await expect(host).toBeVisible(); await expect(host).toContainText(compass);
    await expect(host.locator("[data-deeprole-recovery-label]")).toHaveText(locale === "ru" ? "Восстановлено" : "Restored");
    await expect(chat.locator("textarea")).toHaveValue("Preserved draft");
    const archive = () => panel.evaluate(async () => new Promise<any[]>((resolve, reject) => {
      const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => {
        const db = open.result, read = db.transaction("records", "readonly").objectStore("records").getAll();
        read.onerror = () => { db.close(); reject(read.error); }; read.onsuccess = () => { db.close(); resolve(read.result.find(r => r.kind === "binding" && r.data.chatId === "recovery-runtime")?.data.recoveredReplies ?? []); };
      };
    }));
    await expect.poll(archive).toHaveLength(1); expect((await archive())[0].html).not.toContain("reasoning");
    await chat.reload(); await expect(host).toBeVisible(); await expect(host).toContainText(garden);
    const send = (chatId = "recovery-runtime", parent = "answer", service = false) => chat.evaluate(async ({ chatId, parent, service }) => {
      const response = await fetch("/api/v0/chat/completion", { method: "POST", body: JSON.stringify({ chat_session_id: chatId, parent_message_id: parent, prompt: service ? "[DeepRole Service]\n[Request ID: recovery-service]\nAnalyze." : "Mira, what about the compass?" }) });
      return response.status;
    }, { chatId, parent, service });
    await send("another-chat"); expect(requests.at(-1).prompt).not.toContain("deeprole_recovered_reply");
    await send("recovery-runtime", "another-branch"); expect(requests.at(-1).prompt).not.toContain("deeprole_recovered_reply");
    await send("recovery-runtime", "answer", true); expect(requests.at(-1).prompt).not.toContain("deeprole_recovered_reply");
    expect((await archive())[0].contextSentAt).toBeUndefined();
    responseStatus = 500; expect(await send()).toBe(500);
    expect(requests.at(-1).prompt).toContain(compass); expect((await archive())[0].contextSentAt).toBeUndefined();
    responseStatus = 200; expect(await send()).toBe(200);
    expect(requests.at(-1).prompt).toContain(garden); expect(requests.at(-1).prompt).toContain("[User message]\nMira, what about the compass?");
    await expect.poll(async () => (await archive())[0].contextSentAt).toEqual(expect.any(Number));
    await expect(host.locator("[data-deeprole-recovery-label]")).toHaveText(locale === "ru" ? "Восстановлено · контекст передан" : "Restored · context sent");
    await chat.addStyleTag({ content: "body{background:#17191c;color:#e6e9ef;font:15px/1.7 system-ui,sans-serif;margin:32px}main{max-width:700px;margin:auto}[data-deeprole-recovered-reply]{padding:20px 24px;border:1px solid #363d47;border-radius:16px;background:#21262d}.ds-markdown{font:15px/1.7 system-ui,sans-serif}.ds-markdown p{margin:8px 0}" });
    await host.screenshot({ path: info.outputPath("recovered-reply-sent.png") });
    await chat.reload(); await expect(host).toBeVisible();
    await send(); expect(requests.at(-1).prompt).not.toContain("deeprole_recovered_reply");
    await chat.locator("#answer").evaluate((node, text) => { const p = document.createElement("p"); p.textContent = text; node.replaceChildren(p); }, regenerated);
    await expect(host).toHaveCount(0);
    await chat.locator("#answer").evaluate((node, refusal) => { node.textContent = refusal; }, refusal);
    await expect(host).toContainText(regenerated);
    await expect.poll(async () => (await archive())[0].contextSentAt).toBeUndefined();
    await chat.evaluate(async () => new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest(); xhr.open("POST", "/api/v0/chat/completion"); xhr.onload = () => resolve(); xhr.onerror = () => reject(new Error("XHR failed"));
      xhr.send(JSON.stringify({ chat_session_id: "recovery-runtime", parent_message_id: "answer", prompt: "Where is the shelf?" }));
    }));
    expect(requests.at(-1).prompt).toContain(regenerated);
    await expect.poll(async () => (await archive())[0].contextSentAt).toEqual(expect.any(Number));
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
    await send(); expect(requests.at(-1).prompt).not.toContain("deeprole_recovered_reply");
  } finally { await context.close(); }
});
