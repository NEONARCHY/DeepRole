import { chromium, expect, test } from "@playwright/test";
import path from "node:path";
import { storyWorld } from "../fixtures/story-worlds";
for (const locale of ["ru", "en"] as const) test(`installed automatic metadata repair ${locale}: one popup after ingestion, preserved prose, cleanup`, async ({}, info) => {
  test.skip(info.project.name !== "chromium", "Installed Edge MV3, synthetic DeepSeek only"); test.setTimeout(90000);
  const extension = path.resolve(".output/chrome-mv3"), context = await chromium.launchPersistentContext("", { channel: "msedge", headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"), panel = await context.newPage(); await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`); await expect(panel.locator(".onboarding")).toBeVisible();
    const f = storyWorld(locale), message = (id: number, parent: number | null, role: "USER" | "ASSISTANT", content: string) => ({ message_id: id, parent_id: parent, role, status: "FINISHED", has_pending_fragment: false, fragments: [{ type: role === "USER" ? "REQUEST" : "RESPONSE", content }] });
    const messages = [message(40, null, "USER", "Begin"), message(41, 40, "ASSISTANT", "Workshop")]; let selected = 41, branch = "";
    await panel.evaluate(async ({ records, locale }) => {
      await new Promise<void>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction("records", "readwrite"); for (const row of records) tx.objectStore("records").put({ pk: `${row.kind}:${row.id}`, ...row, updatedAt: Date.now() }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; });
      await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, showChatContextMeter: false, automaticMetadataRepair: true }, deeprole_library_change: { token: "auto-repair-seed" } });
    }, { records: f.records, locale });
    await context.route("https://chat.deepseek.com/**", route => {
      const url = route.request().url();
      if (url.includes("/api/v0/chat/history_messages")) return route.fulfill({ json: { code: 0, data: { biz_code: 0, biz_data: { chat_session: { id: f.binding.chatId, current_message_id: selected }, chat_messages: messages } } } });
      if (url.includes("/api/v0/")) return route.fulfill({ json: {} });
      if (url.includes("deeprole_field_job")) {
        const id = new URL(url).searchParams.get("deeprole_field_job"), reply = JSON.stringify({ requestId: id, data: { version: 2, world: f.world.id, chat: f.binding.chatId, branch, updates: [{ id: "person-1", state: { condition: "Do not overwrite", goal: "Find copper key" } }] } });
        // The real extension clicks this synthetic native UI; no account/model call.
        return route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><title>Service fixture</title></head><body><aside><div id="owned-row"><a href="https://chat.deepseek.com/chat/s/auto-owned">Service</a><button id="more" aria-label="More">…</button></div></aside><main id="turns"></main><form><textarea aria-label="Message" placeholder="Message DeepSeek"></textarea><button type="submit">Send</button></form><script>
          document.querySelector('form').onsubmit=e=>{e.preventDefault();const prompt=document.querySelector('textarea').value;document.querySelector('textarea').value='';history.replaceState({},'','/chat/s/auto-owned');const user=document.createElement('article');user.dataset.role='user';user.textContent=prompt;const response=document.createElement('article');response.dataset.role='assistant';const text=document.createElement('div');text.className='ds-markdown';text.textContent=${JSON.stringify(reply)};response.append(text);document.querySelector('#turns').replaceChildren(user,response)};
          document.querySelector('#more').onclick=()=>{const menu=document.createElement('div');menu.setAttribute('role','menu');menu.innerHTML='<button role="menuitem">Delete chat</button>';document.body.append(menu);menu.querySelector('button').onclick=()=>{menu.remove();const dialog=document.createElement('div');dialog.setAttribute('role','dialog');dialog.innerHTML='<p>Delete chat?</p><button>Delete</button>';document.body.append(dialog);dialog.querySelector('button').onclick=()=>{document.querySelector('#owned-row').remove();document.querySelector('#turns').replaceChildren();dialog.remove();history.replaceState({},'','/')}}};
        </script></body></html>` });
      }
      const shown = messages.find(m => m.message_id === selected)?.fragments[0]?.content ?? "Workshop";
      return route.fulfill({ contentType: "text/html", body: `<!doctype html><html><body><main><section id="story"><article data-role="assistant" data-message-id="${selected}"><div class="ds-markdown"></div></article></section><textarea aria-label="Message"></textarea></main><script>document.querySelector('.ds-markdown').textContent=${JSON.stringify(shown)}</script></body></html>` });
    });
    const chat = await context.newPage(); await chat.goto(f.binding.chatUrl!); await chat.bringToFront(); await expect(chat.locator(".dr-character-row")).toHaveCount(2, { timeout: 12000 });
    const send = (message: any) => panel.evaluate(async ({ message, url }) => { const api = (globalThis as any).chrome, [tab] = await api.tabs.query({ url }); return api.tabs.sendMessage(tab.id, message); }, { message, url: f.binding.chatUrl! });
    expect(await send({ type: "DR_STORY_GAME", operation: "start", manual: "stop" })).toMatchObject({ ok: true }); branch = (await send({ type: "DR_STORY_REVIEW_READ", cursor: null })).data.guard.branchId;
    let opened = 0; context.on("page", () => opened++); const normal = context.pages().length;
    const original = `Mira waits by the gate. Her goal is to find a copper key.<deeprole_characters>${JSON.stringify({ version: 2, world: f.world.id, chat: f.binding.chatId, branch, updates: [{ id: "person-1", state: { condition: "At the gate", goal: 22 } }] })}</deeprole_characters>`;
    messages.push(message(42, 41, "USER", "Act"), message(43, 42, "ASSISTANT", original)); selected = 43; await chat.evaluate(text => { const row = document.createElement("article"), body = document.createElement("div"); row.dataset.role = "assistant"; row.dataset.messageId = "43"; body.className = "ds-markdown"; body.textContent = text; row.append(body); document.querySelector("#story")!.replaceChildren(row); }, original);
    await expect.poll(async () => (await send({ type: "DR_STORY_REVIEW_READ", cursor: null }))?.data?.repair, { timeout: 45000 }).toMatchObject({ status: "done", cleanup: "done" });
    const rows = await panel.evaluate(() => new Promise<any[]>((resolve, reject) => { const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction("records"), read = tx.objectStore("records").getAll(); read.onsuccess = () => resolve(read.result); tx.oncomplete = () => db.close(); }; }));
    expect(rows.find(r => r.kind === "binding" && r.id === f.binding.id).data.characterScenes[f.world.id].states["person-1"]).toMatchObject({ condition: "At the gate", goal: "Find copper key" }); expect(rows.filter(r => r.kind === "story" && r.data.type === "revision" && r.data.metadataRepair)).toHaveLength(1); expect(rows.find(r => r.kind === "story" && r.data.metadataRepair).data.content).toBe(original);
    await expect.poll(() => context.pages().length).toBe(normal); expect(opened).toBe(1); await chat.reload(); await chat.bringToFront(); await expect(chat.locator(".dr-character-row")).toHaveCount(2, { timeout: 12000 }); expect((await send({ type: "DR_STORY_REVIEW_READ", cursor: null })).data.repair.status).toBe("done"); expect(opened).toBe(1);
  } finally { await context.close(); }
});
