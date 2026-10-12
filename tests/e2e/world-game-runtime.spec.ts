import { chromium, expect, test } from "@playwright/test";
import path from "node:path";
import { storyWorld } from "../fixtures/story-worlds";
import { characterTab, closeSavedCharacter } from "./character-helpers";
import { oldChatNoticeText } from "../../src/core/old-chat-notice";
for (const locale of ["ru","en"] as const) test(`installed shared lore game ${locale}: manual attachment, latest state, old reminder and resume`, async ({},info) => {
 test.skip(info.project.name !== "chromium","Synthetic installed Edge MV3"); test.setTimeout(120000);
 const extension = path.resolve(".output/chrome-mv3"), context = await chromium.launchPersistentContext("",{channel:"msedge",headless:true,args:["--disable-extensions-except="+extension,"--load-extension="+extension]});
 try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker"), panel = await context.newPage(); await panel.goto("chrome-extension://"+new URL(worker.url()).host+"/sidepanel.html"); await expect(panel.locator(".onboarding")).toBeVisible();
  const f = storyWorld(locale), t = oldChatNoticeText(locale), newUrl = "https://chat.deepseek.com/a/chat/s/manual-b", outgoing: any[] = [];
  await panel.evaluate(async ({records,locale}) => { await new Promise<void>((resolve,reject) => { const open=indexedDB.open("deeprole"); open.onerror=()=>reject(open.error); open.onsuccess=()=>{const db=open.result,tx=db.transaction("records","readwrite"); for(const row of records)tx.objectStore("records").put({pk:row.kind+":"+row.id,...row,updatedAt:Date.now()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};}); await (globalThis as any).chrome.storage.local.set({deeprole_settings:{locale,onboardingComplete:true,showChatContextMeter:false,automaticMetadataRepair:false},deeprole_library_change:{token:"shared-game-seed"}}); },{records:f.records,locale});
  await context.route("https://chat.deepseek.com/**",route=>{
   const url=route.request().url(); if(url.includes("/api/v0/chat/completion")){outgoing.push(route.request().postDataJSON());return route.fulfill({json:{}});}
   if(url.includes("/api/v0/"))return route.fulfill({json:{}});
   return route.fulfill({contentType:"text/html",body:'<!doctype html><html><head><style>body{background:#181818;color:#eee;font:14px system-ui}textarea{position:fixed;bottom:20px}</style></head><body><main><article data-role="assistant" data-message-id="2"><div class="ds-markdown">The workshop opens.</div></article><textarea aria-label="Message"></textarea></main></body></html>'});
  });
  const rows=()=>panel.evaluate(()=>new Promise<any[]>((resolve,reject)=>{const open=indexedDB.open("deeprole");open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction("records"),read=tx.objectStore("records").getAll();read.onsuccess=()=>resolve(read.result);tx.oncomplete=()=>db.close();};}));
  const game=async()=> (await rows()).find(r=>r.kind==="world").data.sharedGame;
  const message=(url:string,data:any)=>panel.evaluate(async ({url,data})=>{const api=(globalThis as any).chrome,[tab]=await api.tabs.query({url});if(!tab?.id)throw Error("no tab");return api.tabs.sendMessage(tab.id,data);},{url,data});
  const a=await context.newPage();await a.goto(f.binding.chatUrl);await a.bringToFront();await expect.poll(async()=> (await game())?.activeChatId).toBe(f.binding.chatId);const gameId=(await game()).id;
  const b=await context.newPage();await b.goto(newUrl);await b.bringToFront();await expect.poll(async()=>message(newUrl,{type:"DR_SET_SCENE",scene:{worldId:f.world.id,focusIds:[],bookId:null}}).catch(()=>({ok:false}))).toMatchObject({ok:true});await expect.poll(async()=> (await game()).activeChatId).toBe("manual-b");expect((await game()).id).toBe(gameId);
  await b.locator(".dr-character-row").filter({hasText:f.entities[0]!.name}).click();const dialog=b.getByRole("dialog");await characterTab(dialog,"scene",locale);await dialog.getByRole("textbox",{name:locale==="ru"?"Состояние":"Condition",exact:true}).fill("Latest shared condition");await dialog.getByRole("button",{name:locale==="ru"?"Сохранить персонажа":"Save character",exact:true}).click();await closeSavedCharacter(dialog,locale);await expect.poll(async()=> (await game()).scene.states["person-1"].condition).toBe("Latest shared condition");
  const old=(await rows()).find(r=>r.kind==="binding"&&r.data.chatId===f.binding.chatId);expect(old.data.characterScenes[f.world.id].states["person-1"].condition).not.toBe("Latest shared condition");
  await a.bringToFront();await a.reload();await expect(a.getByRole("region",{name:t.title})).toBeVisible({timeout:12000});
  const send=()=>a.evaluate(async id=>{await fetch("/api/v0/chat/completion",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_session_id:id,parent_message_id:2,prompt:"I continue the game."})});},f.binding.chatId);
  await send();expect(outgoing.at(-1).prompt).toContain("<deeprole_chat_notice");await expect.poll(async()=> (await rows()).find(r=>r.kind==="binding"&&r.data.chatId===f.binding.chatId)?.data.oldChatNotice?.sentAt).toBeTruthy();expect((await game()).activeChatId).toBe("manual-b");
  await send();await expect.poll(async()=> (await game()).activeChatId).toBe(f.binding.chatId);expect(outgoing.at(-1).prompt).not.toContain("<deeprole_chat_notice");expect(outgoing.at(-1).prompt).toContain("Latest shared condition");expect((await game()).id).toBe(gameId);
  await a.reload();await expect(a.getByRole("region",{name:t.title})).toHaveCount(0);await b.bringToFront();await b.reload();await expect(b.getByRole("region",{name:t.title})).toBeVisible({timeout:12000});await b.locator("textarea").fill("My preserved draft");await b.getByRole("button",{name:t.stay,exact:true}).click();await expect.poll(async()=> (await game()).activeChatId).toBe("manual-b");await expect(b.locator("textarea")).toHaveValue("My preserved draft");expect((await game()).scene.states["person-1"].condition).toBe("Latest shared condition");
 } finally {await context.close();}
});
