import { chromium, expect, test } from "@playwright/test";
import path from "node:path";
import { storyWorld } from "../fixtures/story-worlds";
import { oldChatNoticeText } from "../../src/core/old-chat-notice";
for (const locale of ["ru", "en"] as const) test("installed previous chat reminder " + locale + ": retry, once, reload, ordinary play and dismissal", async ({}, info) => {
 test.skip(info.project.name !== "chromium", "Synthetic installed Edge MV3"); test.setTimeout(120000);
 const extension = path.resolve(".output/chrome-mv3"), context = await chromium.launchPersistentContext("", { channel: "msedge", headless: true, args: ["--disable-extensions-except=" + extension, "--load-extension=" + extension] });
 try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"), panel = await context.newPage(); await panel.goto("chrome-extension://" + new URL(worker.url()).host + "/sidepanel.html"); await expect(panel.locator(".onboarding")).toBeVisible();
  const f = storyWorld(locale, 3), t = oldChatNoticeText(locale), sent: any[] = []; let fail = true;
  const snapshot = { id: "continued", title: "Clock scene", summary: "The clock waits.", sourceChatId: f.binding.chatId, sourceChatUrl: f.binding.chatUrl, worldId: f.world.id, bookId: null, targetChatId: "new-chat", createdAt: 10, appliedAt: 20 };
  await panel.evaluate(async ({ records, locale }) => {
   await new Promise<void>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction("records", "readwrite"); for (const row of records) tx.objectStore("records").put({ pk: row.kind + ":" + row.id, ...row, updatedAt: Date.now() }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; });
   await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, showChatContextMeter: false, automaticMetadataRepair: false }, deeprole_library_change: { token: "old-chat-seed" } });
  }, { records: [...f.records, { kind: "snapshot", id: snapshot.id, data: snapshot }], locale });
  await context.route("https://chat.deepseek.com/**", route => {
   const url = route.request().url();
   if (url.includes("/api/v0/chat/history_messages")) return route.fulfill({ json: { code: 0, data: { biz_code: 0, biz_data: { chat_session: { id: f.binding.chatId, current_message_id: 2 }, chat_messages: [{ message_id: 1, parent_id: null, role: "USER", status: "FINISHED", has_pending_fragment: false, fragments: [{ type: "REQUEST", content: "Begin." }] }, { message_id: 2, parent_id: 1, role: "ASSISTANT", status: "FINISHED", has_pending_fragment: false, fragments: [{ type: "RESPONSE", content: "Starting point." }] }] } } } });
   if (url.includes("/api/v0/chat/completion")) { sent.push(route.request().postDataJSON()); return route.fulfill({ status: fail ? 503 : 200, json: {} }); }
   if (url.includes("/api/v0/")) return route.fulfill({ json: {} });
   return route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><meta charset="utf-8"></head><body><main><article data-role="assistant" data-message-id="2"><div class="ds-markdown">Starting point.</div></article><textarea aria-label="Message"></textarea></main></body></html>' });
  });
  const chat = await context.newPage(); await chat.goto(f.binding.chatUrl); await chat.bringToFront();
  const card = chat.getByRole("region", { name: t.title }); await expect(card).toBeVisible({ timeout: 12000 });
  const request = async () => { await chat.locator("textarea").fill("I open the door."); await chat.evaluate(async chatId => { await fetch("/api/v0/chat/completion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_session_id: chatId, parent_message_id: 2, prompt: "I open the door." }) }); }, f.binding.chatId); await chat.locator("textarea").fill(""); return sent.at(-1).prompt as string; };
  const receipt = () => panel.evaluate(chatId => new Promise<any>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction("records"), read = tx.objectStore("records").getAll(); read.onsuccess = () => resolve(read.result.find((r: any) => r.kind === "binding" && r.data.chatId === chatId)?.data.oldChatNotice); tx.oncomplete = () => db.close(); }; }), f.binding.chatId);
  expect(await request()).toContain('<deeprole_chat_notice version="1">'); expect(await receipt()).toBeUndefined();
  fail = false; const prompt = await request(); expect(prompt).toContain("https://chat.deepseek.com/a/chat/s/new-chat"); expect(prompt).toContain("I open the door.");
  await expect.poll(async () => (await receipt())?.sentAt).toBeTruthy(); await chat.reload(); await chat.bringToFront(); await expect(card).toBeVisible({ timeout: 12000 });
  // Explicit Continue here now also moves the shared game to this chat.
  await chat.locator("textarea").fill("My untouched draft"); await card.getByRole("button", { name: t.stay }).click(); await expect(card).toHaveCount(0); await expect(chat.locator("textarea")).toHaveValue("My untouched draft");
  await chat.reload(); await expect(card).toHaveCount(0); expect(await request()).not.toContain("<deeprole_chat_notice");
 } finally { await context.close(); }
});
