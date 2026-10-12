import { chromium, expect, test } from "@playwright/test";
import path from "node:path";
import { storyWorld } from "../fixtures/story-worlds";
for (const locale of ["ru", "en"] as const) test(`installed large library ${locale}: 1001st person, late profile context, alternatives and reload`, async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Installed Edge MV3, synthetic DeepSeek only"); test.setTimeout(120000);
  const extension = path.resolve(".output/chrome-mv3"), context = await chromium.launchPersistentContext("", { channel: "msedge", headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"), panel = await context.newPage(); await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`); await expect(panel.locator(".onboarding")).toBeVisible();
    const f = storyWorld(locale, 1000), last = f.entities.at(-1)!; last.characterSheet!.background = "UNIQUE_LATE_LIBRARY_PROFILE";
    const message = (id: number, parent: number | null, role: "USER" | "ASSISTANT", content: string) => ({ message_id: id, parent_id: parent, role, status: "FINISHED", has_pending_fragment: false, fragments: [{ type: role === "USER" ? "REQUEST" : "RESPONSE", content }] });
    const messages = [message(40, null, "USER", "Begin"), message(41, 40, "ASSISTANT", "Workshop")]; let selected = 41, outgoing = "", posts = 0;
    await panel.evaluate(async ({ records, locale }) => {
      await new Promise<void>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction("records", "readwrite"); for (const row of records) tx.objectStore("records").put({ pk: `${row.kind}:${row.id}`, ...row, updatedAt: Date.now() }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; });
      await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, showChatContextMeter: false, automaticMetadataRepair: false }, deeprole_library_change: { token: "large-library-seed" } });
    }, { records: f.records, locale });
    await context.route("https://chat.deepseek.com/**", route => {
      const url = route.request().url();
      if (url.includes("/api/v0/chat/history_messages")) return route.fulfill({ json: { code: 0, data: { biz_code: 0, biz_data: { chat_session: { id: f.binding.chatId, current_message_id: selected }, chat_messages: messages } } } });
      if (url.endsWith("/api/v0/chat/completion")) { posts++; outgoing = route.request().postDataJSON().prompt; return route.fulfill({ contentType: "text/event-stream", body: 'event: ready\ndata: {"request_message_id":90,"response_message_id":91}\n\nevent: finish\ndata: {}\n\nevent: close\ndata: {}\n\n' }); }
      if (url.includes("/api/v0/")) return route.fulfill({ json: {} });
      const shown = messages.find(m => m.message_id === selected)?.fragments[0]?.content ?? "Workshop";
      return route.fulfill({ contentType: "text/html", body: `<!doctype html><html><body><main><section id="story"><article data-role="assistant" data-message-id="${selected}"><div class="ds-markdown"></div></article></section><textarea aria-label="Message"></textarea></main><script>document.querySelector('.ds-markdown').textContent=${JSON.stringify(shown)}</script></body></html>` });
    });
    const chat = await context.newPage(), errors: string[] = []; chat.on("pageerror", error => errors.push(error.message)); await chat.goto(f.binding.chatUrl!); await chat.bringToFront(); await expect(chat.locator(".dr-character-row")).toHaveCount(2, { timeout: 15000 });
    const send = (message: any) => panel.evaluate(async ({ message, url }) => { const api = (globalThis as any).chrome, [tab] = await api.tabs.query({ url }); return api.tabs.sendMessage(tab.id, message); }, { message, url: f.binding.chatUrl! });
    expect(await send({ type: "DR_STORY_GAME", operation: "start", manual: "stop" })).toMatchObject({ ok: true }); const branch = (await send({ type: "DR_STORY_REVIEW_READ", cursor: null })).data.guard.branchId, normal = context.pages().length;
    const reply = `A courier arrived in a gray coat.<deeprole_characters>${JSON.stringify({ version: 2, world: f.world.id, chat: f.binding.chatId, branch, present: [f.entities[0]!.id, last.id, "new:Courier"], updates: [{ id: last.id, state: { condition: "At the gate" } }, { id: "new:Courier", name: "Courier", appearance: "Gray coat", state: { condition: "With a letter" } }] })}</deeprole_characters>`;
    messages.push(message(42, 41, "USER", "Continue"), message(43, 42, "ASSISTANT", reply), message(44, 42, "ASSISTANT", "Nobody arrived.")); selected = 43;
    const display = (id: number) => chat.evaluate(({ id, text }) => { const row = document.createElement("article"), body = document.createElement("div"); row.dataset.role = "assistant"; row.dataset.messageId = String(id); body.className = "ds-markdown"; body.textContent = text; row.append(body); document.querySelector("#story")!.replaceChildren(row); }, { id, text: messages.find(m => m.message_id === id)!.fragments[0]!.content });
    const records = () => panel.evaluate(() => new Promise<any[]>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction("records"), read = tx.objectStore("records").getAll(); read.onsuccess = () => resolve(read.result); tx.oncomplete = () => db.close(); }; }));
    const count = async () => (await records()).filter(r => r.kind === "entity").length;
    await display(43); await expect.poll(count, { timeout: 15000 }).toBe(1001); const courier = (await records()).find(r => r.kind === "entity" && r.data.name === "Courier"); expect(context.pages()).toHaveLength(normal);
    const sent = await chat.evaluate(draft => new Promise<string>(resolve => { const xhr = new XMLHttpRequest(); xhr.open("POST", "/api/v0/chat/completion"); xhr.onload = () => resolve("sent"); xhr.onerror = () => resolve("failed"); xhr.send(JSON.stringify({ chat_session_id: "synthetic-a", parent_message_id: 43, prompt: draft })); }), `Ask ${last.name} about the key`); expect(sent).toBe("sent"); expect(posts).toBe(1); expect(outgoing).toContain("UNIQUE_LATE_LIBRARY_PROFILE"); const roster = JSON.parse(outgoing.match(/Roster: (.*)\nCurrent profiles/)![1]!); expect(roster.length).toBeLessThan(150); expect(roster.some((e: any) => e.name === last.name)).toBe(true);
    selected = 44; await display(44); await expect.poll(count, { timeout: 15000 }).toBe(1000); selected = 43; await display(43); await expect.poll(count, { timeout: 15000 }).toBe(1001); expect((await records()).find(r => r.kind === "entity" && r.data.name === "Courier").id).toBe(courier.id);
    await chat.reload(); await chat.bringToFront(); await expect(chat.locator(".dr-character-row")).toHaveCount(3, { timeout: 15000 }); expect(await count()).toBe(1001); expect(posts).toBe(1); expect(errors).toEqual([]);
  } finally { await context.close(); }
});
