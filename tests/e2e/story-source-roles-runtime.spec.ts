import { chromium, expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { storyWorld } from "../fixtures/story-worlds";
import { decodeStoryMemory } from "../../src/core/story-memory-transport";

const records = (panel: Page) => panel.evaluate(() => new Promise<any[]>((resolve, reject) => {
  const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error);
  open.onsuccess = () => { const db = open.result, tx = db.transaction("records"), read = tx.objectStore("records").getAll(); read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error); tx.oncomplete = () => db.close(); };
}));
for (const locale of ["ru", "en"] as const) test(`installed source roles ${locale}: exact next POST, reload and excluded alternative`, async ({}, info) => {
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
    const quote = locale === "ru" ? "Нора сказала Мире: «Я обещаю принести инструменты, если дорогу откроют»." : "Nora told Mira: “I promise to bring tools if the road opens.”";
    const otherQuote = locale === "ru" ? "Мира сказала Норе: «Я обещаю ждать»." : "Mira told Nora: “I promise to wait.”";
    const sharedQuote = `${quote}\n${otherQuote}`;
    const sourceFacts = [{ kind: "promise", text: "Bring tools only if the road opens.", quote }, { kind: "promise", text: "Wait.", quote: otherQuote }, { kind: "promise", text: "An exchange of promises.", quote: sharedQuote }];
    const answer = `${quote}\n${otherQuote}<deeprole_characters>${JSON.stringify({ version: 2, world: f.world.id, chat: f.binding.chatId, branch, facts: sourceFacts })}</deeprole_characters>`;
    const alternate = "A different scene.";
    messages.push(message(42, 41, "USER", outgoing), message(43, 42, "ASSISTANT", answer), message(44, 42, "ASSISTANT", alternate)); selected = 43; await display(43, answer);
    await expect.poll(async () => (await read())?.facts?.length, { timeout: 12000 }).toBe(3);
    for (let n = 0; n < 3; n++) { const current = await read(), candidate = current.facts.find((x: any) => !x.accepted); if (!candidate) break; expect(await send({ type: "DR_STORY_FACT", input: { worldId: f.world.id, chatId: f.binding.chatId, guard: current.guard, eventId: candidate.eventId, text: candidate.text, accept: true } })).toMatchObject({ ok: true }); }
    const original = JSON.stringify((await records(panel)).find(r => r.kind === "world").data.sharedGame.facts);
    const question = locale === "ru" ? "Напомни, что Нора обещала Мире." : "Remind me what Nora promised Mira.";
    const payload = ():any[] => decodeStoryMemory(JSON.parse(outgoing.split("<deeprole_story_memory>")[1]!.split("</deeprole_story_memory>")[0]!.split("\n")[1]!));
    await nativeSend(question, 43);
    expect(payload()[0]).toMatchObject({ sourceQuote: quote, sourceRoles: { speaker: { id: "person-1", name: names[0] }, recipient: { id: "person-2", name: names[1] }, promisor: { id: "person-1", name: names[0] } } });
    expect(payload().find((x: any) => x.sourceQuote === otherQuote).sourceRoles.promisor.id).toBe("person-2");
    expect(payload().find((x: any) => x.sourceQuote === sharedQuote)).not.toHaveProperty("sourceRoles"); expect(outgoing).toContain("NOT fulfillment or objective truth");
    expect(JSON.stringify((await records(panel)).find(r => r.kind === "world").data.sharedGame.facts)).toBe(original);
    const currentName=locale==="ru"?"Ева":"Eva";
    await panel.evaluate(async ({currentName,originalName})=>{
      await new Promise<void>((resolve,reject)=>{const open=indexedDB.open("deeprole");open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction("records","readwrite"),store=tx.objectStore("records"),read=store.get("entity:person-1");read.onsuccess=()=>{const row=read.result;store.put({...row,data:{...row.data,name:currentName,updatedAt:Date.now()}});store.put({...row,pk:"entity:new-nora",id:"new-nora",data:{...row.data,id:"new-nora",name:originalName,characterSheet:{...row.data.characterSheet,protagonist:false},createdAt:Date.now(),updatedAt:Date.now()}});};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
      await (globalThis as any).chrome.storage.local.set({deeprole_library_change:{token:"roles-renamed"}});
    },{currentName,originalName:names[0]});
    await chat.reload(); await chat.bringToFront(); await expect(chat.locator(".dr-character-row")).toHaveCount(2, { timeout: 12000 });
    await nativeSend(locale==="ru"?"Что обещала Ева?":"What did Eva promise?",43);
    expect(payload()[0].sourceRoles.promisor).toEqual({id:"person-1",name:currentName,sourceName:names[0]});
    await nativeSend(question, 43); expect(payload().find((x:any)=>x.sourceQuote===quote).sourceRoles.promisor.id).toBe("person-1");expect(payload().filter((x:any)=>x.sourceRoles?.promisor?.id==="new-nora")).toEqual([]);expect(posts).toBe(4); expect(context.pages()).toHaveLength(pageCount);
    expect(JSON.stringify((await records(panel)).find(r => r.kind === "world").data.sharedGame.facts)).toBe(original);
    await display(44, alternate); await expect.poll(async () => (await read())?.facts?.length, { timeout: 12000 }).toBe(0);
    await nativeSend(question, 44); expect(outgoing).not.toContain('"sourceRoles":'); expect(outgoing).not.toContain(quote); expect(posts).toBe(5); expect(errors).toEqual([]);
  } finally { await context.close(); }
});
