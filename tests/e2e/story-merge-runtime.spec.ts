import { chromium, expect, test } from "@playwright/test";
import path from "node:path";
import { storyWorld } from "../fixtures/story-worlds";
for (const locale of ["ru", "en"] as const) test("installed story merge " + locale + ": local identity, context, reload and undo", async ({}, info) => {
 test.skip(info.project.name !== "chromium", "Synthetic installed Edge MV3"); test.setTimeout(120000);
 const extension = path.resolve(".output/chrome-mv3"), context = await chromium.launchPersistentContext("", { channel: "msedge", headless: true, args: ["--disable-extensions-except=" + extension, "--load-extension=" + extension] });
 try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"), panel = await context.newPage(); await panel.goto("chrome-extension://" + new URL(worker.url()).host + "/sidepanel.html"); await expect(panel.locator(".onboarding")).toBeVisible();
  const f = storyWorld(locale, 3), sent: any[] = [];
  await panel.evaluate(async ({ records, locale }) => {
   await new Promise<void>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction("records", "readwrite"); for (const row of records) tx.objectStore("records").put({ pk: row.kind + ":" + row.id, ...row, updatedAt: Date.now() }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; });
   await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, showChatContextMeter: false, automaticMetadataRepair: false }, deeprole_library_change: { token: "merge-seed" } });
  }, { records: f.records, locale });
  await context.route("https://chat.deepseek.com/**", route => {
   const url = route.request().url();
   if (url.includes("/api/v0/chat/history_messages")) return route.fulfill({ json: { code: 0, data: { biz_code: 0, biz_data: { chat_session: { id: f.binding.chatId, current_message_id: 2 }, chat_messages: [{ message_id: 1, parent_id: null, role: "USER", status: "FINISHED", has_pending_fragment: false, fragments: [{ type: "REQUEST", content: "Begin." }] }, { message_id: 2, parent_id: 1, role: "ASSISTANT", status: "FINISHED", has_pending_fragment: false, fragments: [{ type: "RESPONSE", content: "Starting point." }] }] } } } });
   if (url.includes("/api/v0/")) { if (url.includes("/chat/completion")) sent.push(route.request().postDataJSON()); return route.fulfill({ json: {} }); }
   return route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><meta charset="utf-8"></head><body><main><article data-role="assistant" data-message-id="2"><div class="ds-markdown">Starting point.</div></article><textarea aria-label="Message"></textarea></main></body></html>' });
  });
  const chat = await context.newPage(); await chat.goto(f.binding.chatUrl!); await chat.bringToFront(); await expect(chat.locator(".dr-character-row")).toHaveCount(2, { timeout: 12000 });
  const send = (message: any) => panel.evaluate(async ({ message, url }) => { const api = (globalThis as any).chrome, [tab] = await api.tabs.query({ url }); return api.tabs.sendMessage(tab.id, message); }, { message, url: f.binding.chatUrl! });
  expect(await send({ type: "DR_STORY_GAME", operation: "start", manual: "stop" })).toMatchObject({ ok: true });
  const scope = { worldId: f.world.id, chatId: f.binding.chatId }, read = () => send({ type: "DR_STORY_MERGE", action: "read", input: { ...scope, query: "", offset: 0, pair: ["person-1", "person-2"] } });
  const initial = await read(); expect(initial).toMatchObject({ ok: true }); const p = initial.data;
  const merged = await send({ type: "DR_STORY_MERGE", action: "approve", input: { ...scope, query: "", offset: 0, pair: p.pair, guard: p.guard, versions: [p.preview.a.updatedAt, p.preview.b.updatedAt], choices: { profile: "a", state: "a", incoming: "a", name: "Unified resident", aliases: ["Courier"], protagonist: true } } }); expect(merged).toMatchObject({ ok: true, data: { total: 2 } }); await expect(chat.locator(".dr-character-row")).toHaveCount(1);
  const request = async () => { await chat.locator("textarea").fill("Courier, continue."); await chat.evaluate(async chatId => { await fetch("/api/v0/chat/completion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_session_id: chatId, parent_message_id: 2, prompt: "Courier, continue." }) }); }, scope.chatId); await chat.locator("textarea").fill(""); return sent.at(-1).prompt; };
  expect(await request()).toContain("Unified resident"); expect(sent.at(-1).prompt).toContain('"aliases":["Courier"]');
  await chat.reload(); await chat.bringToFront(); await expect(chat.locator(".dr-character-row")).toHaveCount(1, { timeout: 12000 });
  const names = await send({ type: "DR_STORY_IDENTITIES", action: "read", input: { ...scope, offset: 0 } }); expect(names).toMatchObject({ ok: true, data: { total: 1 } }); const row = names.data.rows[0];
  expect(await send({ type: "DR_STORY_IDENTITIES", action: "approve", input: { ...scope, offset: 0, guard: names.data.guard, reference: row.reference, expectedUpdatedAt: row.updatedAt, enabled: false } })).toMatchObject({ ok: true }); expect(await request()).not.toContain('"aliases":["Courier"]');
  const current = await send({ type: "DR_STORY_MERGE", action: "read", input: { ...scope, query: "", offset: 0, pair: null } });
  expect(await send({ type: "DR_STORY_MERGE", action: "undo", input: { ...scope, query: "", offset: 0, guard: current.data.guard, eventId: current.data.merges[0].id } })).toMatchObject({ ok: true }); await expect(chat.locator(".dr-character-row")).toHaveCount(2);
  expect(await request()).not.toContain("Unified resident");
 } finally { await context.close(); }
});
