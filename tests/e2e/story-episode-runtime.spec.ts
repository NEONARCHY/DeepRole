import { EMPTY_STATUS } from "../../src/core/characters";
import { chromium, expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { storyWorld } from "../fixtures/story-worlds";
import { GAME_TIME_KEY } from "../../src/core/story-time";

const records = (panel: Page) => panel.evaluate(() => new Promise<any[]>((resolve, reject) => {
  const open = indexedDB.open("deeprole"); open.onerror = () => reject(open.error);
  open.onsuccess = () => { const db = open.result, tx = db.transaction("records"), read = tx.objectStore("records").getAll(); read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error); tx.oncomplete = () => db.close(); };
}));
for (const locale of ["ru", "en"] as const) test(`installed episodes ${locale}: time jump, current state, open task and reload`, async ({}, info) => {
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
      if (url.endsWith("/api/v0/chat/completion")) { posts++; outgoing = route.request().postDataJSON().prompt; return route.fulfill({ contentType: "text/event-stream", body: `event: ready\ndata: {"request_message_id":${40 + posts * 2},"response_message_id":${41 + posts * 2}}\n\nevent: finish\ndata: {}\n\nevent: close\ndata: {}\n\n` }); }
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
    const ru = locale === "ru", promiseQuote = ru ? "Нора сказала Мире: «Я обещаю починить ворота, если дорогу откроют»." : "Nora told Mira: “I promise to mend the gate if the road opens.”";
    const bridge = ru ? "Нора ждёт у моста." : "Nora is waiting at the bridge.", library = ru ? "Нора в библиотеке." : "Nora is in the library.";
    const task = { key: "repair-gate", title: ru ? "починить ворота" : "mend the gate", status: "open" };
    const promise = { kind: "promise", text: ru ? "Нора обещала ремонт ворот при открытой дороге." : "Nora promised to mend the gate if the road opens.", quote: promiseQuote, task };
    const oldPlace = { kind: "event", text: bridge, quote: bridge, claim: { key: "nora-place", value: "bridge", scope: "state" } };
    const coatText=ru?"Нора в синем пальто.":"Nora is wearing a blue coat.",codeText=ru?"Нора знает код ворот.":"Nora knows the gate code.";
    const coat={kind:"event",text:coatText,quote:coatText,claim:{key:"nora-clothes",value:coatText,scope:"state",lifetime:"scene"}},code={kind:"event",text:codeText,quote:codeText,claim:{key:"gate-code",value:codeText,scope:"state",lifetime:"persistent"}};
    const readingText=ru?"Нора читает книгу.":"Nora is reading a book.",reading={kind:"event",text:readingText,quote:readingText,claim:{key:"nora-reading",value:readingText,scope:"state",lifetime:"scene"}};
    const answer = promiseQuote+"\n"+bridge+"\n"+coatText+"\n"+codeText+"\n"+readingText+"<deeprole_characters>"+JSON.stringify({version:2,world:f.world.id,chat:f.binding.chatId,branch,updates:[{id:"person-1",state:{...EMPTY_STATUS,condition:bridge}}],facts:[promise,oldPlace,coat,code,reading]})+"</deeprole_characters>";
    messages.push(message(42,41,"USER",outgoing),message(43,42,"ASSISTANT",answer));selected=43;await display(43,answer);
    await expect.poll(async()=> (await read()).facts?.length,{timeout:12000}).toBe(5);
    const approve = async()=>{for(let i=0;i<8;i++){const current=await read(),candidate=current.facts.find((x:any)=>!x.accepted&&!x.superseded);if(!candidate)break;expect(await send({type:"DR_STORY_FACT",input:{worldId:f.world.id,chatId:f.binding.chatId,guard:current.guard,eventId:candidate.eventId,text:candidate.text,accept:true}})).toMatchObject({ok:true});}};
    await approve();
    await nativeSend(ru?"Через три игровых дня я ищу Нору.":"Three game days later I look for Nora.",43);
    const nextPlace={kind:"event",text:library,quote:library,claim:{key:"nora-place",value:"library",scope:"state",transition:"progress",lifetime:"scene"}};
    const timeLabel=ru?"Прошло три дня.":"Three days passed.",clock={kind:"event",text:timeLabel,quote:timeLabel,claim:{key:GAME_TIME_KEY,value:timeLabel,scope:"state",transition:"progress"}};
    const endedText=ru?"Нора закончила читать.":"Nora finished reading.",ended={kind:"event",text:endedText,quote:endedText,claim:{...reading.claim,value:endedText,transition:"progress",status:"ended"}};
    const later=timeLabel+" "+library+"\n"+endedText+"<deeprole_characters>"+JSON.stringify({version:2,world:f.world.id,chat:f.binding.chatId,branch,updates:[{id:"person-1",state:{...EMPTY_STATUS,condition:library}}],facts:[nextPlace,clock,ended]})+"</deeprole_characters>";
    messages.push(message(44,43,"USER",outgoing),message(45,44,"ASSISTANT",later));selected=45;await display(45,later);
    await expect.poll(async()=> (await read()).facts?.some((x:any)=>x.text===library),{timeout:12000}).toBe(true);await approve();
    const saved=(await records(panel)).find(r=>r.kind==="world").data.sharedGame;
    expect(saved.episodeSources).toHaveLength(4);expect(saved.scene.states["person-1"].condition).toBe(library);
    const check=()=>{
      const block=outgoing.split("<deeprole_story_memory>")[1]!.split("</deeprole_story_memory>")[0]!,payload=JSON.parse(block.split("\n").find(x=>x.startsWith("["))!);
      expect(payload[0]).toMatchObject({kind:"promise",text:promise.text,task,sourceQuote:promiseQuote,episodeSource:{episode:1,period:"earlier-turn"}});
       expect(payload.find((x:any)=>x.text===library)).toMatchObject({episodeSource:{period:"latest-turn"},claim:nextPlace.claim,timeStatus:"last-known"});
        expect(payload.find((x:any)=>x.text===coatText)).toMatchObject({timeStatus:"earlier-scene",claim:coat.claim});expect(payload.find((x:any)=>x.text===codeText)).toMatchObject({timeStatus:"persistent",claim:code.claim});
        expect(payload.find((x:any)=>x.text===endedText)).toMatchObject({timeStatus:"ended",claim:ended.claim,episodeSource:{period:"latest-turn"}});expect(payload.some((x:any)=>x.text===readingText)).toBe(false);expect(outgoing).toContain("NOT current activity");
       const timeBlock=outgoing.split("<deeprole_story_time>")[1]!.split("</deeprole_story_time>")[0]!,time=JSON.parse(timeBlock.split("\n").find(x=>x.startsWith("{"))!);expect(time).toMatchObject({label:timeLabel,kind:"elapsed",quote:timeLabel});
       expect(outgoing).toContain("NOT an absolute date or summed duration");
      expect(payload.some((x:any)=>x.text===bridge)).toBe(false);
       expect(outgoing).toContain("last-known=NOT current proof");expect(outgoing).toContain("NEVER fulfills or cancels");
    };
    const question=ru?"Напомни, что Нора обещала Мире.":"Remind me what Nora promised Mira.";
    await nativeSend(question,45);check();
    await chat.reload();await chat.bringToFront();await expect(chat.locator(".dr-character-row")).toHaveCount(2,{timeout:12000});
    await nativeSend(question,45);check();
    const after=(await records(panel)).find(r=>r.kind==="world").data.sharedGame;
    expect(after.facts).toEqual(saved.facts);expect(after.episodeSources).toEqual(saved.episodeSources);
    expect((await records(panel)).some(r=>r.kind==="story"&&r.data.type==="revision"&&r.data.content.includes(bridge))).toBe(true);
    expect(posts).toBe(4);expect(context.pages()).toHaveLength(pageCount);expect(errors).toEqual([]);
  }finally{await context.close();}
});
