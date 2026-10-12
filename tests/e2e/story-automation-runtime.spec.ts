import { chromium,expect,test,type Page } from "@playwright/test";
import path from "node:path";
import { storyWorld } from "../fixtures/story-worlds";
async function rows(panel:Page){return panel.evaluate(()=>new Promise<any[]>((resolve,reject)=>{const open=indexedDB.open("deeprole");open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction("records"),read=tx.objectStore("records").getAll();read.onsuccess=()=>resolve(read.result);tx.oncomplete=()=>db.close();};}));}
for(const locale of ["ru","en"] as const)test(`installed accompaniment ${locale}: natural send, automatic facts, profiles, review and reload without extra POSTs`,async({},info)=>{
 test.skip(info.project.name!=="chromium","Synthetic installed Edge MV3; Firefox UI is covered separately");test.setTimeout(120000);
 const extension=path.resolve(".output/chrome-mv3"),context=await chromium.launchPersistentContext("",{channel:"msedge",headless:true,args:["--disable-extensions-except="+extension,"--load-extension="+extension]});
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent("serviceworker"),panel=await context.newPage();await panel.goto("chrome-extension://"+new URL(worker.url()).host+"/sidepanel.html");await expect(panel.locator(".onboarding")).toBeVisible();
  const f=storyWorld(locale);f.world.storyAutomation={mode:"automatic",revision:"policy-seed"};
  await panel.evaluate(async({records,locale})=>{await new Promise<void>((resolve,reject)=>{const open=indexedDB.open("deeprole");open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction("records","readwrite");for(const row of records)tx.objectStore("records").put({pk:row.kind+":"+row.id,...row,updatedAt:Date.now()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});await (globalThis as any).chrome.storage.local.set({deeprole_settings:{locale,onboardingComplete:true,showChatContextMeter:false,automaticMetadataRepair:false},deeprole_library_change:{token:"automatic-seed"}});},{records:f.records,locale});
  const message=(id:number,parent:number|null,role:"USER"|"ASSISTANT",content:string)=>({message_id:id,parent_id:parent,role,status:"FINISHED",has_pending_fragment:false,fragments:[{type:role==="USER"?"REQUEST":"RESPONSE",content}]});
  const messages=[message(40,null,"USER","Begin"),message(41,40,"ASSISTANT","The workshop opens.")];let selected=41,posts=0,outgoing="";
  const source="The traveler returned the lantern.",detail="keeps a journal.",name=f.entities[1]!.name,quote=name+" "+detail;
  const answer=source+"\n"+quote+"\nThe clock key is in the red box.\n<deeprole_characters>"+JSON.stringify({version:2,world:f.world.id,chat:f.binding.chatId,updates:[],facts:[{text:source,quote:source,kind:"event",risk:"ordinary"},{text:"The clock key is in the red box.",quote:"The clock key is in the red box.",kind:"event",risk:"conflict"}],people:[{id:"person-2",name,quote,risk:"ordinary",fields:[{key:"background",text:detail,quote,risk:"ordinary"}]}]})+"</deeprole_characters>";
  await context.route("https://chat.deepseek.com/**",route=>{
   const url=route.request().url();
   if(url.includes("/api/v0/chat/history_messages"))return route.fulfill({json:{code:0,data:{biz_code:0,biz_data:{chat_session:{id:f.binding.chatId,current_message_id:selected},chat_messages:messages}}}});
   if(url.endsWith("/api/v0/chat/completion")){posts++;outgoing=route.request().postDataJSON().prompt;return route.fulfill({contentType:"text/event-stream",body:'event: ready\ndata: {"request_message_id":42,"response_message_id":43}\n\nevent: finish\ndata: {}\n\nevent: close\ndata: {}\n\n'});}
   if(url.includes("/api/v0/")){if(route.request().method()==="POST")posts++;return route.fulfill({json:{}});}
   const visible=messages.find(m=>m.message_id===selected)?.fragments[0]!.content??"";
   return route.fulfill({contentType:"text/html",body:'<!doctype html><html><body><main><section id="story"><article data-role="assistant" data-message-id="'+selected+'"><div class="ds-markdown">'+visible.replaceAll("&","&amp;").replaceAll("<","&lt;")+'</div></article></section><textarea aria-label="Message"></textarea></main></body></html>'});
  });
  const chat=await context.newPage();await chat.goto(f.binding.chatUrl);await chat.bringToFront();await expect(chat.locator(".dr-character-row")).toHaveCount(2,{timeout:12000});
  const rpc=(data:any)=>panel.evaluate(async({url,data})=>{const api=(globalThis as any).chrome,[tab]=await api.tabs.query({url,active:true});if(!tab)throw Error("missing chat");return api.tabs.sendMessage(tab.id,data);},{url:f.binding.chatUrl,data});
  const initialPageCount=context.pages().length;
  expect(await rpc({type:"DR_STORY_GAME",operation:"start",manual:"stop"})).toMatchObject({ok:true});
  await chat.evaluate(id=>new Promise<void>((resolve,reject)=>{const request=new XMLHttpRequest();request.open("POST","/api/v0/chat/completion");request.onload=()=>resolve();request.onerror=()=>reject(Error("synthetic network"));request.send(JSON.stringify({chat_session_id:id,parent_message_id:41,prompt:"Continue the story."}));}),f.binding.chatId);
  expect(outgoing).toContain("<deeprole_game_automation>");expect(outgoing).toContain("Memory accompaniment mode is automatic");
  messages.push(message(42,41,"USER",outgoing),message(43,42,"ASSISTANT",answer));selected=43;
  await chat.evaluate(answer=>{const a=document.querySelector("article")!;a.setAttribute("data-message-id","43");a.querySelector(".ds-markdown")!.textContent=answer;},answer);
  const game=async()=>(await rows(panel)).find(r=>r.kind==="world").data.sharedGame;
  await expect.poll(async()=>(await game()).facts?.length,{timeout:12000}).toBe(1);await expect.poll(async()=>(await game()).profileSeeds["person-2"]?.values.background).toContain(detail);
  const review=await rpc({type:"DR_AUTOMATION_READ",input:{worldId:f.world.id,chatId:f.binding.chatId,query:""}});expect(review).toMatchObject({ok:true,data:{total:1}});expect(review.data.items[0].reason).toBe("conflict");
  expect(await rpc({type:"DR_AUTOMATION_RESOLVE",input:{worldId:f.world.id,chatId:f.binding.chatId,guard:review.data.guard,gameRevision:review.data.gameRevision,eventId:review.data.items[0].id,accept:false,fields:[],entityId:null,name:""}})).toMatchObject({ok:true});
  const events=(await rows(panel)).filter(r=>r.kind==="story"&&r.data.type==="event").length;await chat.reload();await expect.poll(async()=>(await game()).facts.length).toBe(1);
  expect((await rows(panel)).filter(r=>r.kind==="story"&&r.data.type==="event")).toHaveLength(events);expect((await game()).pendingReviewIds??[]).toEqual([]);expect(posts).toBe(1);expect(context.pages()).toHaveLength(initialPageCount);
 }finally{await context.close();}
});
