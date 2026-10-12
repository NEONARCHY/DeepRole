import {chromium,expect,test} from "@playwright/test";
import path from "node:path";
import {storyWorld} from "../fixtures/story-worlds";
for(const locale of ["ru","en"] as const)test(`installed memory batch ${locale}: auto scheduling, untouched draft, source memory and owned cleanup`,async({},info)=>{
 test.skip(info.project.name!=="chromium","Installed Edge MV3; synthetic DeepSeek only");test.setTimeout(120000);
 const context=await chromium.launchPersistentContext("",{channel:"msedge",headless:true,args:[`--disable-extensions-except=${path.resolve(".output/chrome-mv3")}`,`--load-extension=${path.resolve(".output/chrome-mv3")}`]});
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent("serviceworker"),panel=await context.newPage();await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);await expect(panel.locator(".onboarding")).toBeVisible();
  const f=storyWorld(locale,3);f.world.storyAutomation={mode:"automatic",revision:"inline-native"};
  await panel.evaluate(async({records,locale})=>{
   await new Promise<void>((resolve,reject)=>{const open=indexedDB.open("deeprole");open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction("records","readwrite");for(const row of records)tx.objectStore("records").put({pk:row.kind+":"+row.id,...row,updatedAt:Date.now()});tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)}});
   await(globalThis as any).chrome.storage.local.set({deeprole_settings:{locale,onboardingComplete:true,showChatContextMeter:false,automaticMetadataRepair:false},deeprole_library_change:{token:"batch-seed"}});
  },{records:f.records,locale});
  const msg=(id:number,parent:number|null,role:"USER"|"ASSISTANT",content:string)=>({message_id:id,parent_id:parent,role,status:"FINISHED",has_pending_fragment:false,fragments:[{type:role==="USER"?"REQUEST":"RESPONSE",content}]});
  const messages=[msg(81,null,"USER","Begin."),msg(82,81,"ASSISTANT","The workshop opens.")];let selected=82,opened=0;const prompts:string[]=[],posts:any[]=[];
  await context.route("https://chat.deepseek.com/**",route=>{
   const url=route.request().url();
   if(url.includes("/api/v0/chat/history_messages"))return route.fulfill({json:{code:0,data:{biz_code:0,biz_data:{chat_session:{id:f.binding.chatId,current_message_id:selected},chat_messages:messages}}}});
   if(url.includes("/api/v0/")){if(url.includes("/chat/completion"))posts.push(route.request().postDataJSON());return route.fulfill({json:{}})}
   if(url.includes("deeprole_field_job")){
    const id=new URL(url).searchParams.get("deeprole_field_job")!,owned="owned-"+id.slice(6);
    return route.fulfill({contentType:"text/html",body:`<!doctype html><html><head><meta charset="utf-8"><title>Owned memory fixture</title></head><body><aside><div id="owned-row"><a href="https://chat.deepseek.com/chat/s/${owned}">Service</a><button id="more" aria-label="More"></button></div></aside><main><div id="turns"></div><textarea aria-label="Message"></textarea><button id="send" aria-label="Send"></button></main><script>
     document.querySelector('#send').onclick=()=>{const prompt=document.querySelector('textarea').value;window.promptText=prompt;const sources=JSON.parse(prompt.slice(prompt.lastIndexOf('\\nSources: ')+10));document.querySelector('textarea').value='';history.replaceState({},'','/chat/s/${owned}');const u=document.createElement('article');u.dataset.role='user';u.textContent=prompt;const a=document.createElement('article');a.dataset.role='assistant';const b=document.createElement('div');b.className='ds-markdown';b.textContent=JSON.stringify({requestId:${JSON.stringify(id)},results:sources.map(s=>({source:s.id,complete:true,facts:s.role==='assistant'?[{text:s.text,quote:s.text,kind:'event',risk:'ordinary'}]:[],people:[]}))});a.append(b);document.querySelector('#turns').replaceChildren(u,a)};
     document.querySelector('#more').onclick=()=>{const menu=document.createElement('div');menu.setAttribute('role','menu');menu.innerHTML='<button role="menuitem">Delete chat</button>';document.body.append(menu);menu.querySelector('button').onclick=()=>{menu.remove();const dialog=document.createElement('div');dialog.setAttribute('role','dialog');dialog.innerHTML='<p>Delete chat?</p><button>Delete</button>';document.body.append(dialog);dialog.querySelector('button').onclick=()=>{document.querySelector('#owned-row').remove();document.querySelector('#turns').replaceChildren();dialog.remove();history.replaceState({},'','/')}}};
    </script></body></html>`});
   }
   return route.fulfill({contentType:"text/html",body:`<!doctype html><html><head><meta charset="utf-8"><title>Game fixture</title></head><body><main><section id="story"><article data-role="assistant" data-message-id="${selected}"><div class="ds-markdown"></div></article></section><textarea aria-label="Message"></textarea></main><script>document.querySelector('.ds-markdown').textContent=${JSON.stringify(messages.at(-1)!.fragments[0]!.content)}</script></body></html>`});
  });
  const chat=await context.newPage();await chat.goto(f.binding.chatUrl);await chat.bringToFront();await expect(chat.locator(".dr-character-row")).toHaveCount(2,{timeout:12000});
  const send=(message:unknown)=>worker.evaluate(async({url,message})=>{const api=(globalThis as any).chrome,tabs=await api.tabs.query({});const tab=tabs.find((t:any)=>t.url===url);return api.tabs.sendMessage(tab.id,message)},{url:f.binding.chatUrl,message});
  const rows=()=>panel.evaluate(async()=>new Promise<any[]>((resolve,reject)=>{const request=indexedDB.open("deeprole");request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,q=db.transaction("records","readonly").objectStore("records").getAll();q.onsuccess=()=>{db.close();resolve(q.result)}}}));
  expect(await send({type:"DR_STORY_GAME",operation:"start",manual:"stop"})).toMatchObject({ok:true});
  for(let i=1;i<=12;i++){const u=82+i*2-1,a=u+1;messages.push(msg(u,u-1,"USER","Continue."),msg(a,u,"ASSISTANT",`Room${i} contains token${i}.`))}selected=106;
  await chat.evaluate(({selected,text})=>{const a=document.createElement("article"),b=document.createElement("div");a.dataset.role="assistant";a.dataset.messageId=String(selected);b.className="ds-markdown";b.textContent=text;a.append(b);document.querySelector("#story")!.replaceChildren(a)},{selected,text:messages.at(-1)!.fragments[0]!.content});
  expect(await send({type:"DR_STORY_GAME",operation:"sync",manual:"stop"})).toMatchObject({ok:true});
  const input={worldId:f.world.id,chatId:f.binding.chatId,force:false};expect((await send({type:"DR_MEMORY_BATCH",action:"status",input})).data).toMatchObject({mode:"off",pendingTurns:12,due:false});
  const baselinePages=context.pages().length;context.on("page",p=>{opened++;p.on("close",async()=>{try{const value=await p.evaluate(()=>(window as any).promptText);if(value)prompts.push(value)}catch{}})});
  await chat.locator('textarea[aria-label="Message"]').fill("Unsent draft stays here.");
  expect(await send({type:"DR_MEMORY_BATCH",action:"policy",input,mode:"automatic"})).toMatchObject({ok:true});
  await chat.waitForTimeout(1500);expect(opened).toBe(0);await expect(chat.locator('textarea[aria-label="Message"]')).toHaveValue("Unsent draft stays here.");
  await chat.locator('textarea[aria-label="Message"]').fill("");
  try { await expect.poll(async()=>{const all=await rows();return all.find(r=>r.kind==="world"&&r.id===f.world.id)?.data.sharedGame?.facts.length},{timeout:45000}).toBe(12); } catch(e) { const state=await rows(); const debug={opened,service:state.filter(r=>r.kind==="service").map(r=>({phase:r.data.phase,error:r.data.error,cleanup:r.data.cleanup,runtime:r.data.runtime})),batch:(await send({type:"DR_MEMORY_BATCH",action:"status",input})),pages:await Promise.all(context.pages().map(async p=>({url:p.url(),text:(await p.locator("body").innerText().catch(()=>"")).slice(0,200)})))}; await info.attach("synthetic-batch-debug",{body:JSON.stringify(debug),contentType:"application/json"});throw e; }
  await expect.poll(()=>context.pages().length,{timeout:15000}).toBe(baselinePages);expect(opened).toBe(1);expect(posts).toHaveLength(0);
  const saved=await rows();expect(saved.filter(r=>r.kind==="service").map(r=>({phase:r.data.phase,cleanup:r.data.cleanup}))).toEqual([{phase:"result",cleanup:"done"}]);
  expect(saved.filter(r=>r.kind==="story"&&r.data.memoryBatchSourceRevisionId).length).toBe(12);
  await chat.reload();await chat.bringToFront();await expect(chat.locator(".dr-character-row")).toHaveCount(2,{timeout:12000});await chat.waitForTimeout(1500);expect(opened).toBe(1);
  expect((await send({type:"DR_MEMORY_BATCH",action:"status",input})).data).toMatchObject({pendingTurns:0,due:false});
  await chat.locator('textarea[aria-label="Message"]').fill("Where is token1?");
  await chat.evaluate(async({chatId,parent})=>{await fetch("/api/v0/chat/completion",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_session_id:chatId,parent_message_id:parent,prompt:"Where is token1?"})})},{chatId:f.binding.chatId,parent:selected});
  expect(posts).toHaveLength(1);expect(posts[0].prompt).toContain("Room1 contains token1.");expect(opened).toBe(1);
 }finally{await context.close()}
});
