import { chromium,expect,test,type Page } from "@playwright/test";
import path from "node:path";
import { storyWorld } from "../fixtures/story-worlds";
import { navigationText } from "../../src/core/navigation-i18n";
import { storyAutomationText } from "../../src/core/story-automation-i18n";
async function rows(panel:Page){return panel.evaluate(()=>new Promise<any[]>((resolve,reject)=>{const open=indexedDB.open("deeprole");open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction("records"),read=tx.objectStore("records").getAll();read.onsuccess=()=>resolve(read.result);tx.oncomplete=()=>db.close();};}));}
for(const locale of ["ru","en"] as const)test(`installed accompaniment ${locale}: natural send, automatic facts, profiles, review and reload without extra POSTs`,async({},info)=>{
 test.skip(info.project.name!=="chromium","Synthetic installed Edge MV3; Firefox UI is covered separately");test.setTimeout(120000);
 const extension=path.resolve(process.env.DEEPROLE_TEST_EXTENSION ?? ".output/chrome-mv3"),context=await chromium.launchPersistentContext("",{channel:"msedge",headless:true,args:["--disable-extensions-except="+extension,"--load-extension="+extension]});
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent("serviceworker"),panel=await context.newPage();await panel.goto("chrome-extension://"+new URL(worker.url()).host+"/sidepanel.html");await expect(panel.locator(".onboarding")).toBeVisible();
  const f=storyWorld(locale);f.world.storyAutomation={mode:"automatic",revision:"policy-seed"};
  await panel.evaluate(async({records,locale})=>{await new Promise<void>((resolve,reject)=>{const open=indexedDB.open("deeprole");open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction("records","readwrite");for(const row of records)tx.objectStore("records").put({pk:row.kind+":"+row.id,...row,updatedAt:Date.now()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});await (globalThis as any).chrome.storage.local.set({deeprole_settings:{locale,onboardingComplete:true,showChatContextMeter:false,automaticMetadataRepair:false},deeprole_library_change:{token:"automatic-seed"}});},{records:f.records,locale});
  const message=(id:number,parent:number|null,role:"USER"|"ASSISTANT",content:string)=>({message_id:id,parent_id:parent,role,status:"FINISHED",has_pending_fragment:false,fragments:[{type:role==="USER"?"REQUEST":"RESPONSE",content}]});
  const messages=[message(40,null,"USER","Begin"),message(41,40,"ASSISTANT","The workshop opens.")];let selected=41; const prompts:string[]=[];
  const source="The traveler returned the lantern.",detail="keeps a journal.",name=f.entities[1]!.name,quote=name+" "+detail;
  const answer=source+"\n"+quote+"\nThe clock key is in the red box.\n<deeprole_characters>"+JSON.stringify({version:2,world:f.world.id,chat:f.binding.chatId,updates:[],facts:[{text:source,quote:source,kind:"event",risk:"ordinary"},{text:"The clock key is in the red box.",quote:"The clock key is in the red box.",kind:"event",risk:"conflict"}],people:[{id:"person-2",name,quote,risk:"ordinary",fields:[{key:"background",text:detail,quote,risk:"ordinary"}]}]})+"</deeprole_characters>";
  await context.route("https://chat.deepseek.com/**",route=>{
   const url=route.request().url();
   if(url.includes("/api/v0/chat/history_messages"))return route.fulfill({json:{code:0,data:{biz_code:0,biz_data:{chat_session:{id:f.binding.chatId,current_message_id:selected},chat_messages:messages}}}});
   if(url.endsWith("/api/v0/chat/completion")){
    prompts.push(route.request().postDataJSON().prompt);
    const identity=JSON.stringify({request_message_id:selected+1,response_message_id:selected+2});
    return route.fulfill({contentType:"text/event-stream",body:`event: ready\ndata: ${identity}\n\ndata: {"p":"response/status","o":"SET","v":"FINISHED"}\n\nevent: close\ndata: {"auto_resume":false}\n\n`});
   }
   if(url.includes("/api/v0/")){if(route.request().method()==="POST")prompts.push("unexpected POST");return route.fulfill({json:{}});}
   const visible=messages.find(m=>m.message_id===selected)?.fragments[0]!.content??"";
   return route.fulfill({contentType:"text/html",body:'<!doctype html><html><head><style>body{font:1rem system-ui;background:#17191c;color:#f5f5f5}@media(prefers-color-scheme:light){body{background:#fff;color:#161616}}</style></head><body><main><section id="story"><article data-role="assistant" data-message-id="'+selected+'"><div class="ds-markdown">'+visible.replaceAll("&","&amp;").replaceAll("<","&lt;")+'</div></article></section><textarea aria-label="Message"></textarea></main></body></html>'});
  });
  const chat=await context.newPage();
  await chat.emulateMedia({colorScheme:locale==="ru"?"dark":"light"});
  await chat.goto(f.binding.chatUrl);await chat.bringToFront();await expect(chat.locator(".dr-character-row")).toHaveCount(2,{timeout:12000});
  const rpc=(data:any)=>panel.evaluate(async({url,data})=>{const api=(globalThis as any).chrome,[tab]=await api.tabs.query({url,active:true});if(!tab)throw Error("missing chat");return api.tabs.sendMessage(tab.id,data);},{url:f.binding.chatUrl,data});
  const initialPageCount=context.pages().length;
  expect(await rpc({type:"DR_STORY_GAME",operation:"start",manual:"stop"})).toMatchObject({ok:true});
  const send = (prompt:string) => chat.evaluate(async ({id,parent,prompt,locale})=>{
   const body=JSON.stringify({chat_session_id:id,parent_message_id:parent,prompt});
   if (locale==="en") { await (await fetch("/api/v0/chat/completion", {method:"POST",body})).text(); return; }
   await new Promise<void>((resolve,reject)=>{const request=new XMLHttpRequest();request.open("POST","/api/v0/chat/completion");request.onload=()=>resolve();request.onerror=()=>reject(Error("synthetic network"));request.send(body);});
  },{id:f.binding.chatId,parent:selected,prompt,locale});
  await send("Continue the story.");
  expect(prompts[0]).toContain("<deeprole_game_automation>");expect(prompts[0]).toContain("Memory accompaniment mode is automatic");
  messages.push(message(42,41,"USER",prompts[0]!),message(43,42,"ASSISTANT",answer));selected=43;
  await chat.evaluate(answer=>{const a=document.querySelector("article")!;a.setAttribute("data-message-id","43");a.querySelector(".ds-markdown")!.textContent=answer;},answer);
  const game=async()=>(await rows(panel)).find(r=>r.kind==="world").data.sharedGame;
  await expect.poll(async()=>(await game()).facts?.length,{timeout:12000}).toBe(1);await expect.poll(async()=>(await game()).profileSeeds["person-2"]?.values.background).toContain(detail);
  const notice = chat.locator("[data-deeprole-review-reminder]");
  const menuPath = `DeepRole → ${navigationText(locale,"story")} → ${storyAutomationText(locale).inbox}`;
  await expect(notice).toHaveCount(0);
  for (let turn=1; turn<=10; turn++) {
   await send(`I check the workshop again (${turn}).`);
   const userId=selected+1, replyId=userId+1, prose=`The workshop remains quiet (turn ${turn}).`;
   messages.push(message(userId,selected,"USER",prompts.at(-1)!),message(replyId,userId,"ASSISTANT",prose));
   selected=replyId;
   await chat.evaluate(({id,prose})=>{
    const row=document.createElement("article"), markdown=document.createElement("div");
    row.dataset.role="assistant";row.dataset.messageId=String(id);markdown.className="ds-markdown";
    markdown.textContent=prose;row.append(markdown);document.querySelector("#story")!.append(row);
   },{id:replyId,prose});
   await expect.poll(async () => (await rows(panel)).some(r => r.kind==="story" && r.data.type==="revision" && r.data.nativeMessageKey===JSON.stringify(["message",String(replyId)])),{timeout:12000}).toBe(true);
   if (turn<5) { await expect(notice).toHaveCount(0); continue; }
   if (turn===5 || turn===10) {
    await expect(notice.getByRole("note")).toContainText(menuPath);
    await expect.poll(() => notice.evaluate(el => {
     let sibling=el.previousElementSibling;
     while (sibling && !sibling.hasAttribute("data-message-id")) sibling=sibling.previousElementSibling;
     return sibling?.getAttribute("data-message-id");
    })).toBe(String(replyId));
    expect(await chat.locator(`[data-message-id="${replyId}"]`).textContent()).toBe(prose);
   }
   if (turn===5) {
    await chat.reload();
    await expect(notice).toHaveCount(1);
    await chat.setViewportSize({width:320,height:480});
    await chat.evaluate(()=>{document.documentElement.style.fontSize="125%";});
    const note = notice.getByRole("note");
    await expect(note).toBeVisible();
    const box=(await note.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(320);
    expect(await note.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await chat.screenshot({path:info.outputPath("review-reminder.png"),fullPage:true});
   }
  }
  expect(prompts).toHaveLength(11);
  expect(prompts.every(prompt=>!prompt.includes(menuPath))).toBe(true);
  const review=await rpc({type:"DR_AUTOMATION_READ",input:{worldId:f.world.id,chatId:f.binding.chatId,query:""}});expect(review).toMatchObject({ok:true,data:{total:1}});expect(review.data.items[0].reason).toBe("conflict");
  expect(await rpc({type:"DR_AUTOMATION_RESOLVE",input:{worldId:f.world.id,chatId:f.binding.chatId,guard:review.data.guard,gameRevision:review.data.gameRevision,eventId:review.data.items[0].id,accept:false,fields:[],entityId:null,name:""}})).toMatchObject({ok:true});
  await expect(notice).toHaveCount(0);
  const events=(await rows(panel)).filter(r=>r.kind==="story"&&r.data.type==="event").length;await chat.reload();await expect.poll(async()=>(await game()).facts.length).toBe(1);
  await expect(notice).toHaveCount(0);
  expect((await rows(panel)).filter(r=>r.kind==="story"&&r.data.type==="event")).toHaveLength(events);expect((await game()).pendingReviewIds??[]).toEqual([]);expect(prompts).toHaveLength(11);expect(context.pages()).toHaveLength(initialPageCount);
 }finally{await context.close();}
});
