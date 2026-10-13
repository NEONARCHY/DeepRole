import { chromium, expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { storyWorld } from "../fixtures/story-worlds";
import { decodeStoryMemory } from "../../src/core/story-memory-transport";

const records = (panel: Page) => panel.evaluate(() => new Promise<any[]>((resolve, reject) => {
  const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error);
  open.onsuccess = () => { const db = open.result, tx = db.transaction("records"), read = tx.objectStore("records").getAll(); read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error); tx.oncomplete = () => db.close(); };
}));
for (const locale of ["ru", "en"] as const) test(`installed late dispatch ${locale}: accepted memory survives delayed XHR evidence`, async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Installed Edge MV3 with synthetic DeepSeek, no account"); test.setTimeout(120000);
  const context = await chromium.launchPersistentContext("", { channel: "msedge", headless: true, args: [`--disable-extensions-except=${path.resolve(".output/chrome-mv3")}`, `--load-extension=${path.resolve(".output/chrome-mv3")}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"), panel = await context.newPage();
    await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`); await expect(panel.locator(".onboarding")).toBeVisible();
    const f = storyWorld(locale, 2), names = locale === "ru" ? ["Нора", "Мира"] : ["Nora", "Mira"]; f.entities.forEach((e, i) => e.name = names[i]!); f.world.contextBudget = 6000;
    await panel.evaluate(async ({ rows, locale }) => {
      await new Promise<void>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction("records", "readwrite"); for (const row of rows) tx.objectStore("records").put({ pk: `${row.kind}:${row.id}`, ...row, updatedAt: Date.now() }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; });
      await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, showChatContextMeter: false, automaticMetadataRepair: false }, deeprole_library_change: { token: "late-seed" } });
    }, { rows: f.records, locale });
    const message = (id: number, parent: number | null, role: "USER" | "ASSISTANT", content: string) => ({ message_id: id, parent_id: parent, role, status: "FINISHED", has_pending_fragment: false, fragments: [{ type: role === "USER" ? "REQUEST" : "RESPONSE", content }] });
    const messages = [message(40, null, "USER", "Begin"), message(41, 40, "ASSISTANT", "Workshop")]; let selected = 41, posts = 0, outgoing = "", release: (() => Promise<void>) | undefined;
    const events = (user: number, assistant: number) => `event: ready\ndata: {"request_message_id":${user},"response_message_id":${assistant}}\n\nevent: finish\ndata: {}\n\nevent: close\ndata: {}\n\n`;
    await context.route("https://chat.deepseek.com/**", route => {
      const url = route.request().url();
      if (url.includes("/api/v0/chat/history_messages")) return route.fulfill({ json: { code: 0, data: { biz_code: 0, biz_data: { chat_session: { id: f.binding.chatId, current_message_id: selected }, chat_messages: messages } } } });
      if (url.endsWith("/api/v0/chat/completion")) {
        posts++; outgoing = route.request().postDataJSON().prompt;
        if (posts === 1) return new Promise<void>(resolve => { release = async () => { await route.fulfill({ contentType: "text/event-stream", body: events(42, 43) }); resolve(); }; });
        return route.fulfill({ contentType: "text/event-stream", body: events(200 + posts * 2, 201 + posts * 2) });
      }
      if (url.includes("/api/v0/")) return route.fulfill({ json: {} });
      return route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body><main><section id="story"><article data-role="assistant" data-message-id="41"><div class="ds-markdown">Workshop</div></article></section><textarea aria-label="Message"></textarea></main></body></html>' });
    });
    const chat = await context.newPage(), errors: string[] = []; chat.on("pageerror", e => errors.push(e.message));
    await chat.goto(f.binding.chatUrl!); await chat.bringToFront(); await expect(chat.locator(".dr-character-row")).toHaveCount(2, { timeout: 12000 });
    const send = (message: any) => panel.evaluate(async ({ message, url }) => { const api = (globalThis as any).chrome, [tab] = await api.tabs.query({ url, active: true }); return api.tabs.sendMessage(tab.id, message); }, { message, url: f.binding.chatUrl! });
    const read = async () => (await send({ type: "DR_STORY_REVIEW_READ", cursor: null })).data;
    expect(await send({ type: "DR_STORY_GAME", operation: "start", manual: "stop" })).toMatchObject({ ok: true });
    const branch = (await read()).guard.branchId, pages = context.pages().length;
    const nativeSend = (draft: string, parent: number) => chat.evaluate(({ draft, parent }) => new Promise<void>(resolve => { const xhr = new XMLHttpRequest(); xhr.open("POST", "/api/v0/chat/completion"); xhr.onload = () => resolve(); xhr.send(JSON.stringify({ chat_session_id: "synthetic-a", parent_message_id: parent, prompt: draft })); }), { draft, parent });
    const first = nativeSend("Act", 41); void first.catch(() => {}); await expect.poll(() => posts).toBe(1);
    const quote = locale === "ru" ? "Нора сказала Мире: «Я обещаю принести инструменты, если дорогу откроют»." : "Nora told Mira: “I promise to bring tools if the road opens.”";
    const fact = { kind: "promise", text: "Bring tools only if the road opens.", quote }, answer = quote + `<deeprole_characters>${JSON.stringify({ version: 2, world: f.world.id, chat: f.binding.chatId, branch, facts: [fact] })}</deeprole_characters>`;
    messages.push(message(42, 41, "USER", outgoing), message(43, 42, "ASSISTANT", answer)); selected = 43;
    await chat.evaluate(text => { const row = document.createElement("article"), body = document.createElement("div"); row.dataset.role = "assistant"; row.dataset.messageId = "43"; body.className = "ds-markdown"; body.textContent = text; row.append(body); document.querySelector("#story")!.replaceChildren(row); }, answer);
    expect(await send({ type: "DR_STORY_GAME", operation: "sync", manual: "stop" })).toMatchObject({ ok: true });
    await expect.poll(async () => (await read())?.facts?.length, { timeout: 12000 }).toBe(1);
    const review = await read(), candidate = review.facts[0]; expect(await send({ type: "DR_STORY_FACT", input: { worldId: f.world.id, chatId: f.binding.chatId, guard: review.guard, eventId: candidate.eventId, text: candidate.text, accept: true } })).toMatchObject({ ok: true });
    const before = await records(panel), originalFacts = JSON.stringify(before.find(r => r.kind === "world").data.sharedGame.facts);
    const sourceIds = before.filter(r => r.kind === "story" && r.data.type === "revision").map(r => r.id).sort();
    const captureId = before.find(r => r.kind === "dispatch" && r.data.originalDraft === "Act").id;
    expect(before.find(r => r.id === captureId).data.delivery).toBeNull();
    await release!(); await first;
    await expect.poll(async () => (await records(panel)).find(r => r.id === captureId).data.wire.phase, { timeout: 12000 }).toBe("closed");
    await panel.evaluate(async locale => {
      await new Promise<void>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction("records", "readwrite"), store = tx.objectStore("records"), get = store.get("entity:person-1"); get.onsuccess = () => store.put({ ...get.result, data: { ...get.result.data, name: locale === "ru" ? "Ева" : "Eva", updatedAt: Date.now() }, updatedAt: Date.now() }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; });
      await (globalThis as any).chrome.storage.local.set({ deeprole_library_change: { token: "late-rename" } });
    }, locale);
    await nativeSend(locale === "ru" ? "Напомни, что Ева обещала Мире." : "Remind me what Eva promised Mira.", 43);
    const payload = decodeStoryMemory(JSON.parse(outgoing.split("<deeprole_story_memory>")[1]!.split("</deeprole_story_memory>")[0]!.split("\n")[1]!));
    expect(payload[0]).toMatchObject({ sourceQuote: quote, sourceIdentity: "unknown" }); expect(payload[0]).not.toHaveProperty("sourceRoles");
    const after = await records(panel); expect(JSON.stringify(after.find(r => r.kind === "world").data.sharedGame.facts)).toBe(originalFacts);
    expect(after.filter(r => r.kind === "story" && r.data.type === "revision").map(r => r.id).sort()).toEqual(sourceIds);
    expect(after.find(r => r.kind === "story" && r.data.type === "revision" && r.data.role === "assistant").data.roleRosterRequestId).toBeUndefined();
    expect(posts).toBe(2); expect(context.pages()).toHaveLength(pages); expect(errors).toEqual([]);
  } finally { await context.close(); }
});
