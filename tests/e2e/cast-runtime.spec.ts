import { chromium, expect, test } from "@playwright/test";
import { mkdir,mkdtemp } from "node:fs/promises";
import path from "node:path";
import { castRecords,castDraft } from "../fixtures/cast-data";
function fixture(mode:string) {
 const payload=JSON.stringify(castDraft("placeholder"));
 return '<!doctype html><html><body><nav id="sidebar"></nav><main><div id="conversation"></div><form><textarea aria-label="Message"></textarea><button type="submit">Send</button></form></main><script>'+
 'const mode='+JSON.stringify(mode==="open-chat"?"cleanup-fail":mode)+',roster='+payload+';let n=0,finals=0;'+
 (mode==="open-chat"?'const nativeReplace=history.replaceState.bind(history);history.replaceState=(state,title,url)=>nativeReplace(state,title,url==="/chat/s/owned"?"/a/chat/s/owned":url);':'')+
 'const event=(v)=>console.log("CAST_EVENT:"+JSON.stringify(v));'+
 'document.querySelector("form").onsubmit=e=>{e.preventDefault();const input=document.querySelector("textarea"),text=input.value;input.value="";if(!text)return;event({request:text});const marker=text.match(/Request: (cast[\\w-]+)/);'+
 'if(!location.pathname.includes("/chat/")){history.replaceState({},"","/chat/s/owned");document.querySelector("nav").innerHTML=\'<div><a href="/chat/s/owned">Temporary</a><button aria-label="More">...</button></div>\';document.querySelector("nav button").onclick=()=>{if(mode==="cleanup-fail")return;const menu=document.createElement("div");menu.setAttribute("role","menu");menu.innerHTML=\'<button role="menuitem">Delete</button>\';document.body.append(menu);menu.querySelector("button").onclick=()=>{menu.remove();const d=document.createElement("div");d.setAttribute("role","dialog");d.innerHTML=\'Delete chat?<button>Delete</button>\';document.body.append(d);d.querySelector("button").onclick=()=>{event({deleted:true});d.remove();document.querySelector("nav").innerHTML="";history.replaceState({},"","/");};};};}'+
 'const user=document.createElement("article");user.dataset.messageRole="user";user.dataset.messageId="u"+(++n);user.textContent=text;document.querySelector("#conversation").append(user);'+
 'const final=text.includes("Now prepare the complete roster")||text.includes("Your previous roster was invalid");if(final){finals++;roster.request=marker?.[1];}'+
 'const reply=document.createElement("article");reply.dataset.messageRole="assistant";reply.dataset.messageId="r"+n;const thinking=document.createElement("div");thinking.className="ds-think-content";thinking.textContent="Ignore my intermediate notes";reply.append(thinking);const body=document.createElement("div");body.className="ds-assistant-message-main-content";body.textContent=final?(mode==="refusal"?"Sorry, that\\u0027s beyond my current scope. Let\\u0027s talk about something else.":mode==="repair"&&finals===1?"invalid JSON":"<deeprole_cast>"+JSON.stringify(roster)+"</deeprole_cast>"):"received";reply.append(body);setTimeout(()=>{document.querySelector("#conversation").append(reply);if(final&&["replacement","same-batch","replacement-reload"].includes(mode)){const replace=()=>{body.textContent="Sorry, that\\u0027s beyond my current scope. Let\\u0027s talk about something else.";event({replaced:true});};if(mode==="same-batch")replace();else setTimeout(replace,100);}},mode==="cancel"&&final?15000:100);};</script></body></html>';
}
for(const mode of ["success","auto","repair","cleanup-fail","refusal","cancel","replacement","same-batch","replacement-reload","floating","open-chat"]) test("temporary cast workflow: "+mode,async()=>{
 test.skip(test.info().project.name !== "chromium", "Installed Edge workflow; Firefox UI is covered by cast.spec.ts.");
 test.setTimeout(60000);
 const folder=path.join(test.info().project.outputDir,"profiles");await mkdir(folder,{recursive:true});const profile=await mkdtemp(path.join(folder,"cast-"));
 const context=await chromium.launchPersistentContext(profile,{channel:"msedge",headless:true,args:['--disable-extensions-except='+path.resolve(".output/chrome-mv3"),'--load-extension='+path.resolve(".output/chrome-mv3"),'--host-resolver-rules=MAP chat.deepseek.com ~NOTFOUND']});
 const events:any[]=[],errors:string[]=[];context.on("page",p=>{p.on("console",m=>{if(m.text().startsWith("CAST_EVENT:"))events.push(JSON.parse(m.text().slice(11)));else if(m.type()==="error")errors.push(m.text());});p.on("pageerror",e=>errors.push(e.message));});
 try{
 const worker=context.serviceWorkers()[0]??await context.waitForEvent("serviceworker");
 let inspectionHtml:string|undefined;
 await context.route("https://chat.deepseek.com/**",r=>r.fulfill({contentType:"text/html",body:mode==="open-chat"&&new URL(r.request().url()).pathname==="/a/chat/s/owned"&&inspectionHtml?inspectionHtml:fixture(mode)}));
 const panel=await context.newPage();await panel.goto('chrome-extension://'+new URL(worker.url()).host+'/sidepanel.html');
 await expect(panel.locator(".onboarding")).toBeVisible();
 await panel.evaluate(async records=>{await new Promise<void>((resolve,reject)=>{const open=indexedDB.open("deeprole");open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction("records","readwrite");for(const r of records)tx.objectStore("records").put({pk:r.kind+":"+r.id,...r,updatedAt:Date.now()});tx.oncomplete=()=>{db.close();resolve();};};});await(globalThis as any).chrome.storage.local.set({deeprole_settings:{locale:"en",onboardingComplete:true}});},castRecords());
 const story=await context.newPage();await story.goto("https://chat.deepseek.com/chat/s/original");await story.locator("textarea").fill("My untouched draft");
 const command=(m:any)=>panel.evaluate(m=>(globalThis as any).chrome.runtime.sendMessage(m),m);
 let start:any;
 if(mode==="auto"){await panel.evaluate(async()=>{const open=indexedDB.open("deeprole");await new Promise<void>(resolve=>{open.onsuccess=()=>{const db=open.result,tx=db.transaction("records","readwrite"),store=tx.objectStore("records"),get=store.get("world:w");get.onsuccess=()=>store.put({...get.result,data:{...get.result.data,autoPrepareCharacters:true}});tx.oncomplete=()=>{db.close();resolve();};};});await(globalThis as any).chrome.storage.local.set({deeprole_library_change:{token:"start-auto"}});});await expect.poll(async()=>!!(await command({type:"DR_CAST",action:"status",worldId:"w"})).job,{timeout:10000}).toBe(true);start=await command({type:"DR_CAST",action:"status",worldId:"w"});}
 else if(mode==="floating"||mode==="open-chat"){
  await expect(story.getByRole("combobox",{name:"World",exact:true})).toBeVisible({timeout:10000}).catch(()=>{throw new Error("Chat UI did not mount: "+errors.join(" | "));});
  const world=story.getByRole("combobox",{name:"World",exact:true});await world.click();await story.getByRole("listbox",{name:"World",exact:true}).getByRole("option",{name:"Test story",exact:true}).click();
  await expect(story.getByRole("button",{name:"Create characters from lore",exact:true})).toBeVisible({timeout:10000});
  await story.getByRole("button",{name:"Create characters from lore",exact:true}).click();
  await expect.poll(async()=>!!(await command({type:"DR_CAST",action:"status",worldId:"w"})).job,{timeout:10000}).toBe(true);start=await command({type:"DR_CAST",action:"status",worldId:"w"});
  const popup=story.locator(".dr-cast-status.is-floating"),panelBox=story.locator(".dr-characters");await expect(popup).toBeVisible({timeout:10000});
  await expect.poll(()=>popup.evaluate(e=>getComputedStyle(e).transform)).toBe("matrix(1, 0, 0, 1, 0, 0)");
  const box=(await popup.boundingBox())!,anchor=(await panelBox.boundingBox())!;expect(box.y).toBeCloseTo(anchor.y,0);expect(box.x).toBeGreaterThan(anchor.x+anchor.width);
  await story.screenshot({path:test.info().outputPath("cast-live-popup.png")});
  const heading=popup.getByRole("button",{name:"Move preparation window",exact:true}),h=(await heading.boundingBox())!;
  await story.mouse.move(h.x+35,h.y+12);await story.mouse.down();await story.mouse.move(h.x+120,h.y+80,{steps:6});await story.mouse.up();
  expect((await popup.boundingBox())!.x).toBeGreaterThan(box.x+80);
 }
 else start=await command({type:"DR_CAST",action:"start",worldId:"w",locale:"en"});
 expect(start.ok).toBe(true);const id=start.job.id;
 const status=()=>command({type:"DR_CAST",action:"status",worldId:"w"});
 await expect.poll(async()=>(await status()).job.phase,{timeout:20000}).toBe("analyzing");
 if(mode==="replacement-reload") {
  await expect.poll(()=>panel.evaluate(async id=>{const open=indexedDB.open("deeprole");return new Promise<boolean>(resolve=>{open.onsuccess=()=>{const db=open.result,tx=db.transaction("records","readonly"),get=tx.objectStore("records").get("cast:"+id);get.onsuccess=()=>resolve(!!get.result?.data.replyCheckpoint);tx.oncomplete=()=>db.close();};});},id),{timeout:10000}).toBe(true);
  const service=context.pages().find(p=>p!==story&&p.url().includes("/chat/s/owned"))!;expect(service).toBeTruthy();await service.reload();
 }
 if(mode==="cancel")await command({type:"DR_CAST",action:"cancel",id});
 await expect.poll(async()=>(await status()).job.phase,{timeout:20000}).toBe(mode==="refusal"?"error":mode==="cancel"?"cancelled":"ready");
 await expect.poll(async()=>(await status()).job.cleanup,{timeout:15000}).toBe(["cleanup-fail","replacement-reload","open-chat"].includes(mode)?"failed":"done");
 expect(await story.locator("textarea").inputValue()).toBe("My untouched draft");expect(story.url()).toContain("/original");
 const requests=events.filter(e=>e.request);expect(requests.length).toBe(mode==="repair"?3:2);
 expect(requests[0].request).toContain("Leon is the protagonist.");expect(requests[1].request).toContain("ALL distinct story characters");
 if(mode==="open-chat"){
  const job=(await status()).job;expect(job.chatUrl).toBe("https://chat.deepseek.com/a/chat/s/owned");
  const popup=story.locator(".dr-cast-status.is-floating"),open=popup.getByRole("button",{name:"Open temporary chat",exact:true});await expect(open).toBeEnabled();
  const service=context.pages().find(p=>p!==story&&p.url().includes("/a/chat/s/owned"))!;expect(service).toBeTruthy();const pageCount=context.pages().length;
  await open.click();expect(context.pages().length).toBe(pageCount);expect(service.url()).toBe(job.chatUrl);
  await expect.poll(()=>panel.evaluate(async()=>{const tabs=await(globalThis as any).chrome.tabs.query({active:true,currentWindow:true});return tabs[0]?.url;})).toBe(job.chatUrl);
  expect(await service.locator('[data-message-role="user"]').allTextContents()).toEqual(requests.map(r=>r.request));
  inspectionHtml=await service.content();await service.close();
  const opened=context.waitForEvent("page");await open.click();const inspection=await opened;await inspection.waitForURL(job.chatUrl);
  // A tabs.create navigation can start before Playwright attaches its route interceptor.
  // DNS is blocked above; after verifying the native target, load the same URL through
  // the attached interceptor to simulate the server returning the original history.
  await inspection.goto(job.chatUrl);
  await expect(inspection.locator('[data-message-role="user"]')).toHaveCount(2);
  await expect(inspection.locator('[data-message-role="user"]').first()).toBeVisible();await expect(inspection.locator('[data-message-role="user"]').last()).toBeVisible();
  expect(await inspection.locator('[data-message-role="user"]').allTextContents()).toEqual(requests.map(r=>r.request));
  await panel.reload();expect((await status()).job.chatUrl).toBe(job.chatUrl);
  expect((await status()).job).toMatchObject({phase:"ready",cleanup:"failed",draft:job.draft});
  expect(events.filter(e=>e.request).length).toBe(requests.length);expect(events.some(e=>e.deleted)).toBe(false);
  expect(await story.locator("textarea").inputValue()).toBe("My untouched draft");
  await story.screenshot({path:test.info().outputPath("cast-open-native-chat.png")});
 }
 if(["success","auto","repair","cleanup-fail","replacement","same-batch","replacement-reload","floating"].includes(mode)){
  const job=(await status()).job;expect(job.draft.characters).toHaveLength(2);expect(job.draft.characters[1].sheet.relationships.initial.trust).toBe(82);
  if(mode==="floating"){
   const popup=story.locator(".dr-cast-status.is-floating");await expect(popup.getByRole("button",{name:"Review characters",exact:true})).toBeVisible();
   await popup.getByRole("button",{name:"Hide preparation window",exact:true}).click();await expect(popup).toHaveCount(0);
   await expect.poll(async()=>(await status()).job.statusHidden).toBe(true);expect((await status()).job.phase).toBe("ready");
   await panel.reload();expect((await status()).job.statusHidden).toBe(true);
   await story.getByRole("button",{name:"Show character preparation",exact:true}).click();await expect(popup).toBeVisible();
   expect((await status()).job.draft).toEqual(job.draft);expect(events.filter(e=>e.request).length).toBe(requests.length);
   expect(await story.locator("textarea").inputValue()).toBe("My untouched draft");
  }
  expect((await command({type:"DR_CAST",action:"apply",id,draft:job.draft,selected:["p1","p2"],hero:"p1"})).count).toBe(2);
 }
 expect(events.some(e=>e.deleted)).toBe(!["cleanup-fail","replacement-reload","open-chat"].includes(mode));
 if(mode==="cleanup-fail"){
  const before=(await status()).job;
  expect((await command({type:"DR_CAST",action:"hide",id})).ok).toBe(true);
  expect((await status()).job).toMatchObject({statusHidden:true,cleanup:"failed",phase:"applied"});
  expect((await command({type:"DR_CAST",action:"show",id})).ok).toBe(true);
  const service=context.pages().find(p=>p!==story&&p.url().includes("/chat/s/owned"))!;expect(service).toBeTruthy();await service.close();
  expect((await command({type:"DR_CAST",action:"confirm-cleanup",id})).ok).toBe(true);
  const after=(await status()).job;expect(after.cleanup).toBe("done");expect(after.draft).toEqual(before.draft);expect(after.phase).toBe(before.phase);
  expect(events.some(e=>e.deleted)).toBe(false);expect(events.filter(e=>e.request).length).toBe(requests.length);
  expect(await story.locator("textarea").inputValue()).toBe("My untouched draft");expect(story.url()).toContain("/original");
  await panel.reload();expect((await status()).job.cleanup).toBe("done");
 }
 }finally{await context.close();}
});
