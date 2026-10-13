import { chromium, expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { storyWorld } from "../fixtures/story-worlds";

const records = (panel: Page) => panel.evaluate(() => new Promise<any[]>((resolve, reject) => {
  const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error);
  open.onsuccess = () => { const db = open.result, tx = db.transaction("records"), read = tx.objectStore("records").getAll(); read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error); tx.oncomplete = () => db.close(); };
}));
for (const locale of ["ru", "en"] as const) test(`installed paraphrase retrieval ${locale}: exact next POST and reload`, async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Installed Edge MV3 with synthetic DeepSeek, no account"); test.setTimeout(120000);
  const extension = path.resolve(".output/chrome-mv3"), context = await chromium.launchPersistentContext("", { channel: "msedge", headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"), panel = await context.newPage();
    await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`); await expect(panel.locator(".onboarding")).toBeVisible();
    const f = storyWorld(locale, 2), names = locale === "ru" ? ["Нора", "Мира"] : ["Nora", "Mira"];
    f.entities.forEach((e, i) => e.name = names[i]!); f.world.contextBudget = 6000;
    const message = (id: number, parent: number | null, role: "USER" | "ASSISTANT", content: string) => ({ message_id: id, parent_id: parent, role, status: "FINISHED", has_pending_fragment: false, fragments: [{ type: role === "USER" ? "REQUEST" : "RESPONSE", content }] });
    const messages = [message(40, null, "USER", "Begin"), message(41, 40, "ASSISTANT", "Workshop")]; let selected = 41, posts = 0, outgoing = "";
    await panel.evaluate(async ({ rows, locale }) => {
      await new Promise<void>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction("records", "readwrite"); for (const row of rows) tx.objectStore("records").put({ pk: `${row.kind}:${row.id}`, ...row, updatedAt: Date.now() }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; });
      await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, showChatContextMeter: false, automaticMetadataRepair: false }, deeprole_library_change: { token: "roles-seed" } });
    }, { rows: f.records, locale });
    await context.route("https://chat.deepseek.com/**", route => {
      const url = route.request().url();
      if (url.includes("/api/v0/chat/history_messages")) return route.fulfill({ json: { code: 0, data: { biz_code: 0, biz_data: { chat_session: { id: f.binding.chatId, current_message_id: selected }, chat_messages: messages } } } });
      if (url.endsWith("/api/v0/chat/completion")) { posts++; outgoing = route.request().postDataJSON().prompt; return route.fulfill({ contentType: "text/event-stream", body: `event: ready\ndata: {"request_message_id":${posts===1?42:200 + posts * 2},"response_message_id":${posts===1?43:201 + posts * 2}}\n\nevent: finish\ndata: {}\n\nevent: close\ndata: {}\n\n` }); }
      if (url.includes("/api/v0/")) return route.fulfill({ json: {} });
      return route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body><main><section id="story"><article data-role="assistant" data-message-id="41"><div class="ds-markdown">Workshop</div></article></section><textarea aria-label="Message"></textarea></main></body></html>' });
    });
    const chat = await context.newPage(), errors: string[] = []; chat.on("pageerror", e => errors.push(e.message));
    await chat.goto(f.binding.chatUrl!); await chat.bringToFront(); await expect(chat.locator(".dr-character-row")).toHaveCount(2, { timeout: 12000 });
    const send = (message: any) => panel.evaluate(async ({ message, url }) => { const api = (globalThis as any).chrome, [tab] = await api.tabs.query({ url, active: true }); return api.tabs.sendMessage(tab.id, message); }, { message, url: f.binding.chatUrl! });
    const read = async () => (await send({ type: "DR_STORY_REVIEW_READ", cursor: null })).data;
    const display = (id: number, text: string) => chat.evaluate(({ id, text }) => { const row = document.createElement("article"), body = document.createElement("div"); row.dataset.role = "assistant"; row.dataset.messageId = String(id); body.className = "ds-markdown"; body.textContent = text; row.append(body); document.querySelector("#story")!.replaceChildren(row); }, { id, text });
    expect(await send({ type: "DR_STORY_GAME", operation: "start", manual: "stop" })).toMatchObject({ ok: true });
    const branch = (await read()).guard.branchId, pageCount = context.pages().length;
    const nativeSend = (draft: string, parent: number) => chat.evaluate(({ draft, parent }) => new Promise<void>(resolve => { const xhr = new XMLHttpRequest(); xhr.open("POST", "/api/v0/chat/completion"); xhr.onload = () => resolve(); xhr.send(JSON.stringify({ chat_session_id: "synthetic-a", parent_message_id: parent, prompt: draft })); }), { draft, parent });
    await nativeSend("Act",41);
    const ru = locale === "ru";
    const quote = ru ? "Нора сказала Мире: «Я обещаю починить ворота, если дорогу откроют»." : "Nora told Mira: “I promise to mend the gate if the road opens.”";
    const inspection = ru ? "Нора осмотрела ворота." : "Nora inspected the gate.";
    const unrelated = ru ? "Мира описала башню." : "Mira described the tower.";
    const wanted = { kind: "promise", text: ru ? "Нора обещала ремонт ворот при открытой дороге." : "Nora promised to mend the gate if the road opens.", quote };
    const sourceFacts = [wanted, { kind: "event", text: inspection, quote: inspection }, { kind: "event", text: unrelated, quote: unrelated }];
    const answer = [quote, inspection, unrelated].join("\n") + "<deeprole_characters>" + JSON.stringify({ version: 2, world: f.world.id, chat: f.binding.chatId, branch, facts: sourceFacts }) + "</deeprole_characters>";
    messages.push(message(42, 41, "USER", outgoing), message(43, 42, "ASSISTANT", answer)); selected = 43; await display(43, answer);
    await expect.poll(async () => (await read())?.facts?.length, { timeout: 12000 }).toBe(3);
    for (let n = 0; n < 3; n++) { const current = await read(), candidate = current.facts.find((x: any) => !x.accepted); if (!candidate) break; expect(await send({ type: "DR_STORY_FACT", input: { worldId: f.world.id, chatId: f.binding.chatId, guard: current.guard, eventId: candidate.eventId, text: candidate.text, accept: true } })).toMatchObject({ ok: true }); }
    const original = JSON.stringify((await records(panel)).find(r => r.kind === "world").data.sharedGame.facts);
    const payload = () => JSON.parse(outgoing.split("<deeprole_story_memory>")[1]!.split("</deeprole_story_memory>")[0]!.split("\n")[1]!);
    const check = () => {
      expect(payload()[0]).toMatchObject({ kind: "promise", text: wanted.text, sourceQuote: quote, sourceRoles: { speaker: { id: "person-1", name: names[0] }, promisor: { id: "person-1", name: names[0] }, recipient: { id: "person-2", name: names[1] } } });
      expect(outgoing).toContain("NOT fulfillment or objective truth");
    };
    await nativeSend(ru ? "Восстановить ворота" : "Fix the gate", 43); check();
    await chat.reload(); await chat.bringToFront(); await expect(chat.locator(".dr-character-row")).toHaveCount(2, { timeout: 12000 });
    await nativeSend(ru ? "Fix the gate" : "Починить ворота", 43); check();
    expect(JSON.stringify((await records(panel)).find(r => r.kind === "world").data.sharedGame.facts)).toBe(original);
    expect(posts).toBe(3); expect(context.pages()).toHaveLength(pageCount); expect(errors).toEqual([]);
  } finally { await context.close(); }
});

