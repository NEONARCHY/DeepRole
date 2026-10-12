import { chromium, expect, test } from "@playwright/test";
import path from "node:path";
import { castRecords,castDraft } from "../fixtures/cast-data";
function fixture(mode:string) {
 const payload=JSON.stringify({...castDraft("placeholder"),more:false});
 return '<!doctype html><html><body><nav id="sidebar"></nav><main><div id="conversation"></div><form><textarea aria-label="Message"></textarea><button type="button" id="deepthink" aria-pressed="false">DeepThink</button><button type="submit">Send</button></form></main><script>'+
 'const mode='+JSON.stringify(mode==="open-chat"?"cleanup-fail":mode)+',cast='+payload+';let n=0,finals=0,prepared=Number(sessionStorage.getItem("cast_mock_prepared")??0);'+
 (mode==="open-chat"?'const nativeReplace=history.replaceState.bind(history);history.replaceState=(state,title,url)=>nativeReplace(state,title,url==="/chat/s/owned"?"/a/chat/s/owned":url);':'')+
 'const event=(v)=>console.log("CAST_EVENT:"+JSON.stringify(v));'+
 'document.querySelector("#deepthink").onclick=e=>{const b=e.currentTarget,on=b.getAttribute("aria-pressed")!=="true";b.setAttribute("aria-pressed",String(on));event({deepthink:on});};'+
 'document.querySelector("form").onsubmit=e=>{e.preventDefault();const input=document.querySelector("textarea"),text=input.value;input.value="";if(!text)return;event({request:text});const marker=text.match(/Request: (cast[\\w-]+)/);'+
 'if(!location.pathname.includes("/chat/")){history.replaceState({},"","/chat/s/owned");document.querySelector("nav").innerHTML=\'<div><a href="/chat/s/owned">Temporary</a><button aria-label="More">...</button></div>\';document.querySelector("nav button").onclick=()=>{if(mode==="cleanup-fail")return;const menu=document.createElement("div");menu.setAttribute("role","menu");menu.innerHTML=\'<button role="menuitem">Delete</button>\';document.body.append(menu);menu.querySelector("button").onclick=()=>{menu.remove();const d=document.createElement("div");d.setAttribute("role","dialog");d.innerHTML=\'Delete chat?<button>Delete</button>\';document.body.append(d);d.querySelector("button").onclick=()=>{event({deleted:true});d.remove();document.querySelector("nav").innerHTML="";history.replaceState({},"","/");};};};}'+
 'const user=document.createElement("article");user.dataset.messageRole="user";user.dataset.messageId="u"+(++n);user.textContent=text;document.querySelector("#conversation").append(user);'+
 'const roster=structuredClone(cast),final=text.includes("Now prepare the complete roster")||text.includes("Prepare the NEXT batch")||text.includes("Your previous roster was invalid");if(final){finals++;roster.request=marker?.[1];const person=structuredClone(cast.characters[Math.min(prepared,1)]);if(mode==="batch"&&prepared===2){person.key="p3";person.name="Nora";person.aliases=[];person.sheet.protagonist=false;person.sheet.relationships=null;person.completed=[];person.evidence=[{source:"w",quote:"Nora is a guide."}];}roster.characters=[person];roster.present=prepared===0?["p1"]:prepared===1?["p1","p2"]:[];roster.partners=prepared===1?["p2"]:[];roster.more=prepared<(mode==="batch"?2:1);if(!(["repair","schema-repair"].includes(mode)&&finals===1))prepared++;sessionStorage.setItem("cast_mock_prepared",String(prepared));}'+
 'if(mode==="schema-repair"&&finals===1){roster.characters[0].completed=[{id:"past",label:"Past event",required:false}];delete roster.characters[0].state;}const answer=JSON.stringify(roster);'+
 'const reply=document.createElement("article");reply.dataset.messageRole="assistant";reply.dataset.messageId="r"+n;const thinking=document.createElement("div");thinking.className="ds-think-content";thinking.textContent="Ignore my intermediate notes";reply.append(thinking);const body=document.createElement("div");body.className="ds-assistant-message-main-content";body.textContent=final?(mode==="refusal"?"Sorry, that\\u0027s beyond my current scope. Let\\u0027s talk about something else.":mode==="repair"&&finals===1?"invalid JSON":"<deeprole_cast>"+answer+"</deeprole_cast>"):"received";reply.append(body);setTimeout(()=>{document.querySelector("#conversation").append(reply);if(final&&["replacement","same-batch","replacement-reload"].includes(mode)){const replace=()=>{body.textContent="Sorry, that\\u0027s beyond my current scope. Let\\u0027s talk about something else.";event({replaced:true});};if(mode==="same-batch")replace();else setTimeout(replace,100);}},mode==="cancel"&&final?15000:100);};</script></body></html>';
}
for(const mode of ["success","auto","repair","schema-repair","batch","cleanup-fail","refusal","cancel","replacement","same-batch","replacement-reload","floating","open-chat"]) test("temporary cast workflow: "+mode,async()=>{
 test.skip(test.info().project.name !== "chromium", "Installed Edge workflow; Firefox UI is covered by cast.spec.ts.");
 test.setTimeout(60000);
 // Playwright owns and removes this temporary profile when the context closes.
 // Never touch the user's installed browser profile or keep synthetic ones.
 const context=await chromium.launchPersistentContext("",{channel:"msedge",headless:true,args:['--disable-extensions-except='+path.resolve(".output/chrome-mv3"),'--load-extension='+path.resolve(".output/chrome-mv3"),'--host-resolver-rules=MAP chat.deepseek.com ~NOTFOUND']});
 const events:any[]=[],errors:string[]=[];context.on("page",p=>{p.on("console",m=>{if(m.text().startsWith("CAST_EVENT:"))events.push(JSON.parse(m.text().slice(11)));else if(m.type()==="error")errors.push(m.text());});p.on("pageerror",e=>errors.push(e.message));});
 try{
 const worker=context.serviceWorkers()[0]??await context.waitForEvent("serviceworker");
 let inspectionHtml:string|undefined;
 await context.route("https://chat.deepseek.com/**",r=>r.fulfill({contentType:"text/html",body:mode==="open-chat"&&new URL(r.request().url()).pathname==="/a/chat/s/owned"&&inspectionHtml?inspectionHtml:fixture(mode)}));
 const panel=await context.newPage();await panel.goto('chrome-extension://'+new URL(worker.url()).host+'/sidepanel.html');
 await expect(panel.locator(".onboarding")).toBeVisible();
 const records = castRecords(); if (mode === "batch") (records[0]!.data as any).description += " Nora is a guide.";
 await panel.evaluate(async records=>{await new Promise<void>((resolve,reject)=>{const open=indexedDB.open("deeprole");open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction("records","readwrite");for(const r of records)tx.objectStore("records").put({pk:r.kind+":"+r.id,...r,updatedAt:Date.now()});tx.oncomplete=()=>{db.close();resolve();};};});await(globalThis as any).chrome.storage.local.set({deeprole_settings:{locale:"en",onboardingComplete:true}});},records);
 const story=await context.newPage();await story.goto("https://chat.deepseek.com/chat/s/original");await story.locator("textarea").fill("My untouched draft");
 const command=(m:any)=>panel.evaluate(m=>(globalThis as any).chrome.runtime.sendMessage(m),m);
 // Edge's about:blank -> URL update can outrun Playwright target attachment,
 // deadlocking an intercepted navigation before any content script runs.
 // Synchronize ONLY this isolated mock browser's windows.create return; production
 // navigation, ownership checks, worker messages and model requests are intact.
 await worker.evaluate(() => {
  const scope = globalThis as any, original = scope.chrome.windows.create.bind(scope.chrome.windows);
  const attached = new Promise<void>(resolve => { scope.__castMockAttached = resolve; });
  scope.chrome.windows.create = async (...args:any[]) => {
   const window = await original(...args);
   if (args[0]?.url === "about:blank") await attached;
   return window;
  };
  scope.__castMockRestore = () => { scope.chrome.windows.create = original; delete scope.__castMockAttached; delete scope.__castMockRestore; };
 });
 const attachment = context.waitForEvent("page").then(async page => {
  await page.evaluate(() => document.readyState);
  await worker.evaluate(() => (globalThis as any).__castMockAttached());
 });
 // Preserve a rejection for the assertion below without an unhandled promise
 // if the test fails before start returns.
 void attachment.catch(() => undefined);
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
  expect((await story.screenshot()).length).toBeGreaterThan(1000);
  const heading=popup.getByRole("button",{name:"Move preparation window",exact:true}),h=(await heading.boundingBox())!;
  await story.mouse.move(h.x+35,h.y+12);await story.mouse.down();await story.mouse.move(h.x+120,h.y+80,{steps:6});await story.mouse.up();
  expect((await popup.boundingBox())!.x).toBeGreaterThan(box.x+80);
 }
 else start=await command({type:"DR_CAST",action:"start",worldId:"w",locale:"en"});
 await attachment;
 await worker.evaluate(() => (globalThis as any).__castMockRestore());
 expect(start.ok).toBe(true);const id=start.job.id;
 const serviceWindow=await panel.evaluate(async id=>{const own=(await(globalThis as any).chrome.storage.session.get("deeprole_cast_owners")).deeprole_cast_owners.find((o:any)=>o.id===id);const tab=await(globalThis as any).chrome.tabs.get(own.tabId);const window=await(globalThis as any).chrome.windows.get(tab.windowId);return{type:window.type,windowId:window.id};},id);
 expect(serviceWindow.type).toBe("popup");
 const status=()=>command({type:"DR_CAST",action:"status",worldId:"w"});
 await expect.poll(async()=>(await status()).job.phase,{timeout:20000}).toBe("analyzing").catch(async error => {
  const pages = await Promise.all(context.pages().map(async page => ({url:page.url(), dom:await Promise.race([page.evaluate(()=>({ready:document.readyState,composer:!!document.querySelector("textarea"),scripts:Array.from(document.scripts).map(s=>s.src).filter(Boolean)})).catch(()=>null),new Promise(resolve=>setTimeout(()=>resolve("unresponsive-page"),1000))])})));
  throw new Error(String(error)+"\nStartup diagnostics: "+JSON.stringify({pages,errors,events,ownership:await panel.evaluate(async()=>({owners:await(globalThis as any).chrome.storage.session.get("deeprole_cast_owners"),tabs:await(globalThis as any).chrome.tabs.query({})}))}));
 });
 if(mode==="replacement-reload") {
  await expect.poll(()=>panel.evaluate(async id=>{const open=indexedDB.open("deeprole");return new Promise<boolean>(resolve=>{open.onsuccess=()=>{const db=open.result,tx=db.transaction("records","readonly"),get=tx.objectStore("records").get("cast:"+id);get.onsuccess=()=>resolve(!!get.result?.data.replyCheckpoint);tx.oncomplete=()=>db.close();};});},id),{timeout:10000}).toBe(true);
  const service=context.pages().find(p=>p!==story&&p.url().includes("/chat/s/owned"))!;expect(service).toBeTruthy();await service.reload();
 }
 if(mode==="cancel"){
  // "analyzing" is persisted before the next prompt is submitted. Exercise an
  // in-flight cancellation, not a race that sometimes cancels before request 2.
  await expect.poll(()=>events.filter(e=>e.request).length,{timeout:10000}).toBe(2);
  await command({type:"DR_CAST",action:"cancel",id});
 }
 await expect.poll(async()=>(await status()).job.phase,{timeout:20000}).toBe(mode==="refusal"?"error":mode==="cancel"?"cancelled":"ready");
 await expect.poll(async()=>(await status()).job.cleanup,{timeout:15000}).toBe(["cleanup-fail","replacement-reload","open-chat"].includes(mode)?"failed":"done");
 if(mode==="refusal"){
  const job=(await status()).job;expect(job.diagnostics.at(-1).code).toBe("model-refusal");
  expect(JSON.stringify(job.diagnostics)).not.toContain("Sorry");
  await command({type:"DR_CAST",action:"hide",id});await panel.reload();
  expect((await status()).job.statusHidden).toBe(true);expect((await status()).job.diagnostics).toEqual(job.diagnostics);
 }
 expect(await story.locator("textarea").inputValue()).toBe("My untouched draft");expect(story.url()).toContain("/original");
 const requests=events.filter(e=>e.request);expect(requests.length).toBe(["refusal","cancel"].includes(mode)?2:["repair","schema-repair","batch"].includes(mode)?4:3);
 expect(requests[1].request).toContain('at most ONE character');
 if(mode==="schema-repair") {
  expect(requests[2].request).toContain("characters[0].state is required");
  const job=(await status()).job;expect(job.reasoning).toBe("enabled");
  expect(job.diagnostics[0].details[0].path).toBe("characters[0].state");
  expect(events.filter(e=>typeof e.deepthink==='boolean').map(e=>e.deepthink)).toEqual([true,false]);
 }
 if(mode==="batch") expect(requests[2].request).toContain('"name":"Leon"');
 expect(requests[0].request).toContain("Leon is the protagonist.");expect(requests[1].request).toContain("ALL distinct story characters");
 if(mode==="open-chat"){
  const job=(await status()).job;expect(job.chatUrl).toBe("https://chat.deepseek.com/a/chat/s/owned");
  const popup=story.locator(".dr-cast-status.is-floating"),open=popup.getByRole("button",{name:"Open temporary chat",exact:true});await expect(open).toBeEnabled();
  const service=context.pages().find(p=>p!==story&&p.url().includes("/a/chat/s/owned"))!;expect(service).toBeTruthy();const pageCount=context.pages().length;
  await open.click();expect(context.pages().length).toBe(pageCount);expect(service.url()).toBe(job.chatUrl);
  await expect.poll(()=>panel.evaluate(async windowId=>{const tabs=await(globalThis as any).chrome.tabs.query({active:true,windowId});return tabs[0]?.url;},serviceWindow.windowId)).toBe(job.chatUrl);
  await expect(service.locator('deeprole-field-screen')).toHaveCount(0);
  expect(await service.locator('[data-message-role="user"]').allTextContents()).toEqual(requests.map(r=>r.request));
  inspectionHtml=await service.content();await service.close();
  const opened=context.waitForEvent("page");await open.click();const inspection=await opened;await inspection.waitForURL(job.chatUrl);
  // A tabs.create navigation can start before Playwright attaches its route interceptor.
  // DNS is blocked above; after verifying the native target, load the same URL through
  // the attached interceptor to simulate the server returning the original history.
  await inspection.goto(job.chatUrl);
  await expect(inspection.locator('[data-message-role="user"]')).toHaveCount(3);
  await expect(inspection.locator('[data-message-role="user"]').first()).toBeVisible();await expect(inspection.locator('[data-message-role="user"]').last()).toBeVisible();
  expect(await inspection.locator('[data-message-role="user"]').allTextContents()).toEqual(requests.map(r=>r.request));
  await panel.reload();expect((await status()).job.chatUrl).toBe(job.chatUrl);
  expect((await status()).job).toMatchObject({phase:"ready",cleanup:"failed",draft:job.draft});
  expect(events.filter(e=>e.request).length).toBe(requests.length);expect(events.some(e=>e.deleted)).toBe(false);
  expect(await story.locator("textarea").inputValue()).toBe("My untouched draft");
  expect((await story.screenshot()).length).toBeGreaterThan(1000);
 }
 if(["success","auto","repair","schema-repair","batch","cleanup-fail","replacement","same-batch","replacement-reload","floating"].includes(mode)){
  const job=(await status()).job;expect(job.draft.characters).toHaveLength(mode==="batch"?3:2);expect(job.draft.characters[1].sheet.relationships.initial.trust).toBe(82);
  if(mode==="floating"){
   const popup=story.locator(".dr-cast-status.is-floating");await expect(popup.getByRole("button",{name:"Review characters",exact:true})).toBeVisible();
   const review=popup.getByRole("button",{name:"Review characters",exact:true});await review.click();
   const dialog=story.getByRole("dialog",{name:"Characters from lore",exact:true});await expect(dialog).toBeVisible();
   await dialog.locator("header").getByRole("button",{name:"Close",exact:true}).click({timeout:3000});await expect(dialog).toHaveCount(0);await expect(review).toBeFocused();
   await popup.getByRole("button",{name:"Hide preparation window",exact:true}).click();await expect(popup).toHaveCount(0);
   await expect.poll(async()=>(await status()).job.statusHidden).toBe(true);expect((await status()).job.phase).toBe("ready");
   await panel.reload();expect((await status()).job.statusHidden).toBe(true);
   await story.getByRole("button",{name:"Show character preparation",exact:true}).click();await expect(popup).toBeVisible();
   expect((await status()).job.draft).toEqual(job.draft);expect(events.filter(e=>e.request).length).toBe(requests.length);
   expect(await story.locator("textarea").inputValue()).toBe("My untouched draft");
   await review.click();await expect(dialog).toBeVisible();
   await dialog.getByRole("spinbutton",{name:"Trust: Mira",exact:true}).fill("88");
   await dialog.locator("footer").getByRole("button",{name:"Close",exact:true}).click();await expect(dialog).toHaveCount(0);
   expect((await status()).job.draft).toEqual(job.draft);
   await review.click();await dialog.getByRole("spinbutton",{name:"Trust: Mira",exact:true}).fill("90");
   await dialog.locator("footer").getByRole("button",{name:"Save selected · 2",exact:true}).click();await expect(dialog).toHaveCount(0);
   await expect.poll(async()=>(await status()).job.phase).toBe("applied");
   expect(await story.locator("textarea").inputValue()).toBe("My untouched draft");
  }
  if(mode!=="floating")expect((await command({type:"DR_CAST",action:"apply",id,draft:job.draft,selected:job.draft.characters.map((c:any)=>c.key),hero:"p1"})).count).toBe(mode==="batch"?3:2);
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
