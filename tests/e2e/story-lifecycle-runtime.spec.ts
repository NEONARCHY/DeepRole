import {chromium,expect,test,type Page} from "@playwright/test";
import path from "node:path";
import {storyWorld} from "../fixtures/story-worlds";
async function rows(page:Page){return page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{const open=indexedDB.open("deeprole");open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction("records"),read=tx.objectStore("records").getAll();read.onsuccess=()=>resolve(read.result);tx.oncomplete=()=>db.close()}}))}
for(const locale of ["ru","en"] as const)test(`installed RP04 ${locale}: promise, completion, conflicting memory, resolution, next request and reload`,async({},info)=>{
 test.skip(info.project.name!=="chromium","Installed Edge MV3; Firefox UI covered separately");test.setTimeout(120000);
 const extension=path.resolve(".output/chrome-mv3"),context=await chromium.launchPersistentContext("",{channel:"msedge",headless:true,args:["--disable-extensions-except="+extension,"--load-extension="+extension]});
 try {
  const worker=context.serviceWorkers()[0]??await context.waitForEvent("serviceworker"),panel=await context.newPage();await panel.goto("chrome-extension://"+new URL(worker.url()).host+"/sidepanel.html");await expect(panel.locator(".onboarding")).toBeVisible();
  const f=storyWorld(locale);f.world.storyAutomation={mode:"automatic",revision:"policy-lifecycle"};
  await panel.evaluate(async({records,locale})=>{await new Promise<void>((resolve,reject)=>{const open=indexedDB.open("deeprole");open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction("records","readwrite");for(const row of records)tx.objectStore("records").put({pk:row.kind+":"+row.id,...row,updatedAt:Date.now()});tx.oncomplete=()=>{db.close();resolve()}}});await (globalThis as any).chrome.storage.local.set({deeprole_settings:{locale,onboardingComplete:true,showChatContextMeter:false,automaticMetadataRepair:false},deeprole_library_change:{token:"lifecycle-seed"}})},{records:f.records,locale});
  const msg=(id:number,parent:number|null,role:"USER"|"ASSISTANT",content:string)=>({message_id:id,parent_id:parent,role,status:"FINISHED",has_pending_fragment:false,fragments:[{type:role==="USER"?"REQUEST":"RESPONSE",content}]});
  const messages=[msg(40,null,"USER","Begin."),msg(41,40,"ASSISTANT","The workshop opens.")];let selected=41,posts=0,outgoing="";
  const title=locale==="ru"?"починить ворота":"repair the gate",promise=locale==="ru"?"Мира обещала починить ворота.":"Mira will repair the gate.",done=locale==="ru"?"Мира починила ворота.":"Mira repaired the gate.",old=locale==="ru"?"Красный ключ открывает подвал.":"The red key opens the cellar.",next=locale==="ru"?"Синий ключ открывает подвал.":"The blue key opens the cellar.";
  const task=(text:string,status:string)=>({text,quote:text,kind:status==="open"?"promise":"event",risk:"ordinary",task:{key:"mira.gate",title,status}});
  const answer=(facts:unknown[])=>facts.map(f=>(f as any).quote).join("\n")+"\n<deeprole_characters>"+JSON.stringify({version:2,world:f.world.id,chat:f.binding.chatId,updates:[],facts})+"</deeprole_characters>";
  await context.route("https://chat.deepseek.com/**",route=>{
   const url=route.request().url();
   if(url.includes("/api/v0/chat/history_messages"))return route.fulfill({json:{code:0,data:{biz_code:0,biz_data:{chat_session:{id:f.binding.chatId,current_message_id:selected},chat_messages:messages}}}});
   if(url.endsWith("/api/v0/chat/completion")){posts++;outgoing=route.request().postDataJSON().prompt;return route.fulfill({contentType:"text/event-stream",body:'event: ready\ndata: '+JSON.stringify({request_message_id:selected+1,response_message_id:selected+2})+'\n\nevent: finish\ndata: {}\n\nevent: close\ndata: {}\n\n'})}
   if(url.includes("/api/v0/")){if(route.request().method()==="POST")posts++;return route.fulfill({json:{}})}
   const visible=messages.find(m=>m.message_id===selected)?.fragments[0]!.content??"";
   return route.fulfill({contentType:"text/html",body:'<!doctype html><html><body><main><article data-role="assistant" data-message-id="'+selected+'"><div class="ds-markdown">'+visible.replaceAll("&","&amp;").replaceAll("<","&lt;")+'</div></article><textarea aria-label="Message"></textarea></main></body></html>'})
  });
  const chat=await context.newPage();await chat.goto(f.binding.chatUrl);await chat.bringToFront();await expect(chat.locator(".dr-character-row")).toHaveCount(2,{timeout:12000});
  const rpc=(data:any)=>panel.evaluate(async({url,data})=>{const api=(globalThis as any).chrome,[tab]=await api.tabs.query({url,active:true});return api.tabs.sendMessage(tab.id,data)},{url:f.binding.chatUrl,data});
  expect(await rpc({type:"DR_STORY_GAME",operation:"start",manual:"stop"})).toMatchObject({ok:true});const pages=context.pages().length;
  const send=async(text:string)=>chat.evaluate(async({chatId,parent,text})=>{await fetch("/api/v0/chat/completion",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_session_id:chatId,parent_message_id:parent,prompt:text})})},{chatId:f.binding.chatId,parent:selected,text});
  const present=async(content:string)=>{const parent=selected;messages.push(msg(parent+1,parent,"USER",outgoing),msg(parent+2,parent+1,"ASSISTANT",content));selected=parent+2;await chat.evaluate(({id,content})=>{const article=document.querySelector("article")!;article.setAttribute("data-message-id",String(id));article.querySelector(".ds-markdown")!.textContent=content},{id:selected,content})};
  const game=async()=>(await rows(panel)).find(r=>r.kind==="world").data.sharedGame;
  await send("Continue.");expect(outgoing).toContain("Optional task:");await present(answer([task(promise,"open"),{text:old,quote:old,kind:"event",risk:"ordinary"}]));
  await expect.poll(async()=>(await game()).facts?.find((f:any)=>f.task)?.task.status,{timeout:12000}).toBe("open");
  await send(locale==="ru"?"Что с воротами?":"What about the gate?");expect(outgoing).toContain('"key":"mira.gate"');await present(answer([task(done,"completed"),{text:next,quote:next,kind:"event",risk:"conflict"}]));
  await expect.poll(async()=>(await game()).facts?.find((f:any)=>f.task)?.task.status,{timeout:12000}).toBe("completed");
  const pending=await rpc({type:"DR_AUTOMATION_READ",input:{worldId:f.world.id,chatId:f.binding.chatId,query:""}});expect(pending).toMatchObject({ok:true,data:{total:1}});expect(pending.data.items[0].conflicts[0].text).toBe(old);
  await send(locale==="ru"?"Какой ключ открывает подвал?":"Which key opens the cellar?");let memory=outgoing.split("<deeprole_story_memory>")[1]?.split("</deeprole_story_memory>")[0];expect(memory).toContain(old);expect(memory).not.toContain(next);
  const item=pending.data.items[0];expect(await rpc({type:"DR_AUTOMATION_RESOLVE",input:{worldId:f.world.id,chatId:f.binding.chatId,guard:pending.data.guard,gameRevision:pending.data.gameRevision,eventId:item.id,accept:true,fields:[],entityId:null,name:"",replaceKeys:item.conflicts.map((c:any)=>c.key)}})).toMatchObject({ok:true});
  await send(locale==="ru"?"Какой ключ открывает подвал теперь и починили ли ворота?":"Which key opens the cellar now, and is the gate repaired?");memory=outgoing.split("<deeprole_story_memory>")[1]?.split("</deeprole_story_memory>")[0];expect(memory).toContain(next);expect(memory).not.toContain(old);expect(memory).toContain('"status":"completed"');
  const before=(await rows(panel)).filter(r=>r.kind==="story"&&r.data.type==="event").length;await chat.reload();await chat.bringToFront();await expect(chat.locator(".dr-character-row")).toHaveCount(2);
  expect((await game()).facts.find((f:any)=>f.task)?.task.status).toBe("completed");expect((await rows(panel)).filter(r=>r.kind==="story"&&r.data.type==="event")).toHaveLength(before);expect(posts).toBe(4);expect(context.pages()).toHaveLength(pages);
 }finally{await context.close()}
});
