import {chromium,expect,test} from "@playwright/test";
import path from "node:path";
import {storyWorld} from "../fixtures/story-worlds";
import {estimateTokens} from "../../src/core/text";
for(const locale of ["ru","en"] as const)test(`installed common budget ${locale}: large cast, exact alias retrieval, whole profile preservation and bounded POST`,async({},info)=>{
 test.skip(info.project.name!=="chromium","Installed Edge MV3; Firefox UI is covered separately");test.setTimeout(120000);
 const extension=path.resolve(".output/chrome-mv3"),context=await chromium.launchPersistentContext("",{channel:"msedge",headless:true,args:["--disable-extensions-except="+extension,"--load-extension="+extension]});
 try {
  const worker=context.serviceWorkers()[0]??await context.waitForEvent("serviceworker"),panel=await context.newPage();await panel.goto("chrome-extension://"+new URL(worker.url()).host+"/sidepanel.html");await expect(panel.locator(".onboarding")).toBeVisible();
  const f=storyWorld(locale,100);f.world.contextBudget=3000;f.world.storyAutomation={mode:"automatic",revision:"common-budget"};f.world.useDescriptionInContext=true;
  for(const p of f.entities)p.characterSheet!.background="Short established detail for "+p.name+".\n\n"+"UNRELATED LONG PROFILE PARAGRAPH. ".repeat(200);
  f.entities[98]!.name="Archive keeper";f.entities[98]!.aliases=["Keeper"];f.entities[98]!.characterSheet!.background="The keeper remembers the hidden clock.\n\n"+"OFF-SCENE ARCHIVE HISTORY. ".repeat(200);
  f.entities[95]!.name=locale==="ru"?"Анна":"Ann";f.entities[95]!.characterSheet!.background="WRONG SHORT-NAME PROFILE";f.entities[95]!.description="WRONG SHORT-NAME DESCRIPTION";f.entities[95]!.useDescriptionInContext=true;
  f.entities[96]!.name=locale==="ru"?"Анна Ли":"Ann Lee";f.entities[96]!.characterSheet!.background="TARGET FULL-NAME PROFILE";f.entities[96]!.description="TARGET FULL-NAME DESCRIPTION";f.entities[96]!.useDescriptionInContext=true;
  await panel.evaluate(async({records,locale})=>{await new Promise<void>((resolve,reject)=>{const open=indexedDB.open("deeprole");open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction("records","readwrite");for(const row of records)tx.objectStore("records").put({pk:row.kind+":"+row.id,...row,updatedAt:Date.now()});tx.oncomplete=()=>{db.close();resolve()}}});await(globalThis as any).chrome.storage.local.set({deeprole_settings:{locale,onboardingComplete:true,showChatContextMeter:false,automaticMetadataRepair:false},deeprole_library_change:{token:"context-seed"}})},{records:f.records,locale});
  const msg=(id:number,parent:number|null,role:"USER"|"ASSISTANT",content:string)=>({message_id:id,parent_id:parent,role,status:"FINISHED",has_pending_fragment:false,fragments:[{type:role==="USER"?"REQUEST":"RESPONSE",content}]});
  const messages=[msg(40,null,"USER","Begin."),msg(41,40,"ASSISTANT","The workshop opens.")],posts:any[]=[];
  await context.route("https://chat.deepseek.com/**",route=>{
   const url=route.request().url();
   if(url.includes("/api/v0/chat/history_messages"))return route.fulfill({json:{code:0,data:{biz_code:0,biz_data:{chat_session:{id:f.binding.chatId,current_message_id:41},chat_messages:messages}}}});
   if(url.endsWith("/api/v0/chat/completion")){posts.push(route.request().postDataJSON());if(posts.length===5)return route.fulfill({status:500,json:{}});return route.fulfill({contentType:"text/event-stream",body:'event: ready\ndata: {"request_message_id":42,"response_message_id":43}\n\nevent: finish\ndata: {}\n\nevent: close\ndata: {}\n\n'})}
   if(url.includes("/api/v0/"))return route.fulfill({json:{}});
   return route.fulfill({contentType:"text/html",body:'<!doctype html><html><body><main><article data-role="assistant" data-message-id="41"><div class="ds-markdown">The workshop opens.</div></article><textarea aria-label="Message"></textarea></main></body></html>'})
  });
  const chat=await context.newPage();await chat.goto(f.binding.chatUrl);await chat.bringToFront();await expect(chat.locator(".dr-character-row")).toHaveCount(2,{timeout:12000});
  const rpc=(m:any)=>worker.evaluate(async({url,m})=>{const api=(globalThis as any).chrome,[tab]=await api.tabs.query({url});return api.tabs.sendMessage(tab.id,m).catch(()=>undefined)},{url:f.binding.chatUrl,m});
  expect(await rpc({type:"DR_STORY_GAME",operation:"start",manual:"stop"})).toMatchObject({ok:true});
  const pages=context.pages().length;
  const send=async(text:string)=>{await chat.locator("textarea").fill(text);await chat.evaluate(async({id,text})=>{await fetch("/api/v0/chat/completion",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_session_id:id,parent_message_id:41,prompt:text})})},{id:f.binding.chatId,text})};
  const firstDraft=locale==="ru"?"Где ключ от часов?":"Where is the clock key?";await send(firstDraft);expect(posts).toHaveLength(1);const first=posts[0].prompt;
  expect(first).toContain(f.entry.content);expect(first).toContain("Short established detail");expect(first).not.toContain("UNRELATED LONG PROFILE PARAGRAPH");expect(first).not.toContain("Archive keeper");expect(first).not.toContain("Resident 100");
  const prefix=(text:string)=>text.slice(0,text.lastIndexOf("[User message]")+15);
  expect(estimateTokens(prefix(first))).toBeLessThanOrEqual(3000);await expect(chat.locator("textarea")).toHaveValue(firstDraft);

  await expect.poll(async()=> (await rpc({type:"DR_GET_PAGE_STATE"}))?.memoryDelivery?.stage).toBe("accepted");
  const receipt=(await rpc({type:"DR_GET_PAGE_STATE"})).memoryDelivery;
  expect(receipt.context).toBe(first.slice(0,first.lastIndexOf("\n\n[User message]\n")));expect(receipt).not.toHaveProperty("originalDraft");
  await send(locale==="ru"?"Я спрашиваю Keeper о ключе от часов.":"I ask Keeper about the clock key.");expect(posts).toHaveLength(2);expect(posts[1].prompt).toContain("Archive keeper");expect(posts[1].prompt).toContain("The keeper remembers the hidden clock.");expect(estimateTokens(prefix(posts[1].prompt))).toBeLessThanOrEqual(3000);
  await send(locale==="ru"?"Обещание Анна Ли":"Ann Lee's promise");expect(posts).toHaveLength(3);expect(posts[2].prompt).toContain("TARGET FULL-NAME PROFILE");expect(posts[2].prompt).toContain("TARGET FULL-NAME DESCRIPTION");expect(posts[2].prompt).not.toContain("WRONG SHORT-NAME");expect(estimateTokens(prefix(posts[2].prompt))).toBeLessThanOrEqual(3000);
  const ambiguous=locale==="ru"?"Обещание Анны":"Ann's promise";await send(ambiguous);expect(posts).toHaveLength(4);expect(posts[3].prompt).toContain("multiple possible owners");expect(posts[3].prompt).not.toContain("WRONG SHORT-NAME");expect(posts[3].prompt).not.toContain("TARGET FULL-NAME PROFILE");expect(posts[3].prompt.endsWith(ambiguous)).toBe(true);expect(estimateTokens(prefix(posts[3].prompt))).toBeLessThanOrEqual(3000);
  const saved=await panel.evaluate(()=>new Promise<any[]>((resolve,reject)=>{const open=indexedDB.open("deeprole");open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction("records"),get=tx.objectStore("records").getAll();get.onsuccess=()=>resolve(get.result);tx.oncomplete=()=>db.close()}}));
  for(const p of f.entities)expect(saved.find(r=>r.kind==="entity"&&r.id===p.id).data.characterSheet.background).toBe(p.characterSheet!.background);
  await send("DELIVERY_FAILURE_USER_DRAFT");expect(posts).toHaveLength(5);await expect.poll(async()=>(await rpc({type:"DR_GET_PAGE_STATE"}))?.memoryDelivery?.stage).toBe("failed");
  const failed=(await rpc({type:"DR_GET_PAGE_STATE"})).memoryDelivery;expect(failed.context).toBe(posts[4].prompt.slice(0,posts[4].prompt.lastIndexOf("\n\n[User message]\n")));expect(JSON.stringify(failed)).not.toContain("DELIVERY_FAILURE_USER_DRAFT");
  await chat.reload();await expect.poll(async()=>(await rpc({type:"DR_GET_PAGE_STATE"}))?.memoryDelivery?.stage).toBe("failed");expect(posts).toHaveLength(5);
  await chat.goto("https://chat.deepseek.com/chat/s/another-synthetic-chat");await expect(chat.locator("deeprole-page-widget")).toHaveCount(1);
  await expect.poll(async()=>worker.evaluate(async()=>{const api=(globalThis as any).chrome,[tab]=await api.tabs.query({url:"https://chat.deepseek.com/chat/s/another-synthetic-chat"});const state=await api.tabs.sendMessage(tab.id,{type:"DR_GET_PAGE_STATE"}).catch(()=>undefined);return {ready:state?.type==="DR_PAGE_STATE",empty:state?.memoryDelivery===undefined}})).toEqual({ready:true,empty:true});expect(posts).toHaveLength(5);
  expect(context.pages()).toHaveLength(pages);
 } finally {await context.close()}
});
