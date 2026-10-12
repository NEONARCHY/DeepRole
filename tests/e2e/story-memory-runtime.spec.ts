import { chromium, expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { storyWorld } from "../fixtures/story-worlds";
async function rows(panel: Page) {
  return panel.evaluate(() => new Promise<any[]>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction("records"), read = tx.objectStore("records").getAll(); read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error); tx.oncomplete = () => db.close(); }; }));
}
for (const locale of ["ru", "en"] as const) test(`installed reviewed memory ${locale}: next request, beyond recent turns, alternatives and strict send`, async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Installed Edge MV3 on a wholly synthetic site"); test.setTimeout(120000);
  const extension = path.resolve(".output/chrome-mv3"), context = await chromium.launchPersistentContext("", { channel: "msedge", headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"), panel = await context.newPage(); await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`); await expect(panel.locator(".onboarding")).toBeVisible();
    const f = storyWorld(locale), message = (id: number, parent: number | null, role: "USER" | "ASSISTANT", content: string) => ({ message_id: id, parent_id: parent, role, status: "FINISHED", has_pending_fragment: false, fragments: [{ type: role === "USER" ? "REQUEST" : "RESPONSE", content }] });
    const messages = [message(40, null, "USER", "Begin"), message(41, 40, "ASSISTANT", "Workshop")]; let selected = 41, posts = 0, outgoing = "", historyFails = false;
    await panel.evaluate(async ({ records, locale }) => {
      await new Promise<void>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction("records", "readwrite"); for (const row of records) tx.objectStore("records").put({ pk: `${row.kind}:${row.id}`, ...row, updatedAt: Date.now() }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; });
      await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, showChatContextMeter: false, automaticMetadataRepair: false }, deeprole_library_change: { token: "memory-seed" } });
    }, { records: f.records, locale });
    await context.route("https://chat.deepseek.com/**", route => {
      const url = route.request().url();
      if (url.includes("/api/v0/chat/history_messages")) return historyFails ? route.fulfill({ status: 503, json: { code: 1 } }) : route.fulfill({ json: { code: 0, data: { biz_code: 0, biz_data: { chat_session: { id: f.binding.chatId, current_message_id: selected }, chat_messages: messages } } } });
      if (url.endsWith("/api/v0/chat/completion")) { posts++; outgoing = route.request().postDataJSON().prompt; return route.fulfill({ contentType: "text/event-stream", body: `event: ready\ndata: {"request_message_id":${200 + posts * 2},"response_message_id":${201 + posts * 2}}\n\nevent: finish\ndata: {}\n\nevent: close\ndata: {}\n\n` }); }
      if (url.includes("/api/v0/")) return route.fulfill({ json: {} });
      return route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body><main><section id="story"><article data-role="assistant" data-message-id="41"><div class="ds-markdown">Workshop</div></article></section><textarea aria-label="Message"></textarea></main></body></html>' });
    });
    const chat = await context.newPage(), errors: string[] = []; chat.on("pageerror", error => errors.push(error.message)); await chat.goto(f.binding.chatUrl!); await chat.bringToFront(); await expect(chat.locator(".dr-character-row")).toHaveCount(2, { timeout: 12000 });
    const send = (message: any) => panel.evaluate(async ({ message, url }) => { const api = (globalThis as any).chrome, [tab] = await api.tabs.query({ url, active: true }); return api.tabs.sendMessage(tab.id, message); }, { message, url: f.binding.chatUrl! });
    const read = async () => (await send({ type: "DR_STORY_REVIEW_READ", cursor: null })).data;
    const display = (id: number, text: string) => chat.evaluate(({ id, text }) => { const row = document.createElement("article"), body = document.createElement("div"); row.dataset.role = "assistant"; row.dataset.messageId = String(id); body.className = "ds-markdown"; body.textContent = text; row.append(body); document.querySelector("#story")!.replaceChildren(row); }, { id, text });
    expect(await send({ type: "DR_STORY_GAME", operation: "start", manual: "stop" })).toMatchObject({ ok: true }); const branch = (await read()).guard.branchId, normalPages = context.pages().length;
    const prose = locale === "ru" ? "Мира передала медный ключ. Мира обещала ремонт." : "Mira handed over a copper key. Mira promised a repair.";
    const quote = locale === "ru" ? "Мира передала медный ключ." : "Mira handed over a copper key.";
    const first = prose + `<deeprole_characters>${JSON.stringify({ version: 2, world: f.world.id, chat: f.binding.chatId, branch, updates: [{ id: "person-1", state: { condition: "A", goal: 23 } }], facts: [{ text: "Key received", kind: "event", quote }] })}</deeprole_characters>`;
    const other = `Alternative B.<deeprole_characters>${JSON.stringify({ version: 2, world: f.world.id, chat: f.binding.chatId, branch, updates: [{ id: "person-1", state: { condition: "B" } }] })}</deeprole_characters>`;
    messages.push(message(42, 41, "USER", "Act"), message(43, 42, "ASSISTANT", first), message(44, 42, "ASSISTANT", other)); selected = 43; await display(43, first);
    await expect.poll(async () => (await read())?.facts?.length, { timeout: 12000 }).toBe(1); let page = await read(); expect(page.update).toMatchObject({ status: "partial", accepted: 1, skipped: 1 }); expect(page.facts[0].accepted).toBe(false); expect(context.pages()).toHaveLength(normalPages);
    const edited = locale === "ru" ? "Медный ключ спрятан в кармане героя" : "The copper key is in the protagonist’s pocket";
    expect(await send({ type: "DR_STORY_FACT", input: { worldId: f.world.id, chatId: f.binding.chatId, guard: page.guard, eventId: page.facts[0].eventId, text: edited, accept: true } })).toMatchObject({ ok: true });
    let parent = 43;
    for (let n = 0; n < 3; n++) { const user = 60 + n * 2, answer = user + 1; messages.push(message(user, parent, "USER", `Quiet turn ${n}`), message(answer, user, "ASSISTANT", `Quiet scene ${n}`)); selected = answer; await display(answer, `Quiet scene ${n}`); await expect.poll(async () => (await read())?.guard?.headRevisionId, { timeout: 12000 }).not.toBe(page.guard.headRevisionId); page = await read(); parent = answer; }
    const nativeSend = async (draft: string, parent: number) => chat.evaluate(({ draft, parent }) => new Promise<string>(resolve => { const xhr = new XMLHttpRequest(); xhr.open("POST", "/api/v0/chat/completion"); xhr.onload = () => resolve("sent"); xhr.onerror = () => resolve("blocked"); xhr.send(JSON.stringify({ chat_session_id: "synthetic-a", parent_message_id: parent, prompt: draft })); }), { draft, parent });
    expect(await nativeSend("Continue", parent)).toBe("sent"); expect(outgoing).toContain("<deeprole_story_memory>"); expect(outgoing).toContain(edited); expect(outgoing).toContain("version:2");
    await display(44, other); await expect.poll(async () => (await read())?.facts?.length, { timeout: 12000 }).toBe(0); expect(await nativeSend("Continue B", 44)).toBe("sent"); expect(outgoing).not.toContain("<deeprole_story_memory>"); expect(outgoing).not.toContain(edited); expect(posts).toBe(2);
    await panel.evaluate(async locale => { await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, strictMemorySending: true, showChatContextMeter: false }, deeprole_library_change: { token: "strict-memory-on" } }); }, locale);
    await expect.poll(() => chat.evaluate(() => document.documentElement.dataset.deeproleStrictMemory)).toBe("active"); historyFails = true;
    expect(await nativeSend("My unsent draft", 44)).toBe("blocked"); expect(posts).toBe(2); await expect(chat.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("My unsent draft");
    historyFails = false; expect(await nativeSend("My unsent draft", 44)).toBe("sent"); expect(posts).toBe(3); expect(errors).toEqual([]);
    expect((await rows(panel)).filter(r => r.kind === "entry")).toHaveLength(f.records.filter(r => r.kind === "entry").length);
  } finally { await context.close(); }
});
