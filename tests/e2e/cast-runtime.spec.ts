import { chromium, expect, test } from "@playwright/test";
import { mkdir,mkdtemp } from "node:fs/promises";
import path from "node:path";
import { castRecords,castDraft } from "../fixtures/cast-data";
function fixture(mode:string) {
 const payload=JSON.stringify(castDraft("placeholder"));
 return '<!doctype html><html><body><nav id="sidebar"></nav><main><div id="conversation"></div><form><textarea aria-label="Message"></textarea><button type="submit">Send</button></form></main><script>'+
 'const mode='+JSON.stringify(mode)+',roster='+payload+';let n=0,finals=0;'+
 'const event=(v)=>console.log("CAST_EVENT:"+JSON.stringify(v));'+
 'document.querySelector("form").onsubmit=e=>{e.preventDefault();const input=document.querySelector("textarea"),text=input.value;input.value="";if(!text)return;event({request:text});const marker=text.match(/Request: (cast[\\w-]+)/);'+
 'if(!location.pathname.includes("/chat/")){history.replaceState({},"","/chat/s/owned");document.querySelector("nav").innerHTML=\'<div><a href="/chat/s/owned">Temporary</a><button aria-label="More">...</button></div>\';document.querySelector("nav button").onclick=()=>{if(mode==="cleanup-fail")return;const menu=document.createElement("div");menu.setAttribute("role","menu");menu.innerHTML=\'<button role="menuitem">Delete</button>\';document.body.append(menu);menu.querySelector("button").onclick=()=>{menu.remove();const d=document.createElement("div");d.setAttribute("role","dialog");d.innerHTML=\'Delete chat?<button>Delete</button>\';document.body.append(d);d.querySelector("button").onclick=()=>{event({deleted:true});d.remove();document.querySelector("nav").innerHTML="";history.replaceState({},"","/");};};};}'+
 'const user=document.createElement("article");user.dataset.messageRole="user";user.dataset.messageId="u"+(++n);user.textContent=text;document.querySelector("#conversation").append(user);'+
 'const final=text.includes("Now prepare the complete roster")||text.includes("Your previous roster was invalid");if(final){finals++;roster.request=marker?.[1];}'+
 'const reply=document.createElement("article");reply.dataset.messageRole="assistant";reply.dataset.messageId="r"+n;const thinking=document.createElement("div");thinking.className="ds-think-content";thinking.textContent="Ignore my intermediate notes";reply.append(thinking);const body=document.createElement("div");body.className="ds-assistant-message-main-content";body.textContent=final?(mode==="refusal"?"Sorry, that\\u0027s beyond my current scope. Let\\u0027s talk about something else.":mode==="repair"&&finals===1?"invalid JSON":"<deeprole_cast>"+JSON.stringify(roster)+"</deeprole_cast>"):"received";reply.append(body);setTimeout(()=>document.querySelector("#conversation").append(reply),mode==="cancel"&&final?15000:100);};</script></body></html>';
}
for(const mode of ["success","auto","repair","cleanup-fail","refusal","cancel"]) test("temporary cast workflow: "+mode,async()=>{
 test.skip(test.info().project.name !== "chromium", "Installed Edge workflow; Firefox UI is covered by cast.spec.ts.");
 test.setTimeout(60000);
 const folder=path.join(test.info().project.outputDir,"profiles");await mkdir(folder,{recursive:true});const profile=await mkdtemp(path.join(folder,"cast-"));
 const context=await chromium.launchPersistentContext(profile,{channel:"msedge",headless:true,args:['--disable-extensions-except='+path.resolve(".output/chrome-mv3"),'--load-extension='+path.resolve(".output/chrome-mv3")]});
 const events:any[]=[];context.on("page",p=>p.on("console",m=>{if(m.text().startsWith("CAST_EVENT:"))events.push(JSON.parse(m.text().slice(11)));}));
 try{
 const worker=context.serviceWorkers()[0]??await context.waitForEvent("serviceworker");
 await context.route("https://chat.deepseek.com/**",r=>r.fulfill({contentType:"text/html",body:fixture(mode)}));
 const panel=await context.newPage();await panel.goto('chrome-extension://'+new URL(worker.url()).host+'/sidepanel.html');
 await expect(panel.locator(".onboarding")).toBeVisible();
 await panel.evaluate(async records=>{await new Promise<void>((resolve,reject)=>{const open=indexedDB.open("deeprole");open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction("records","readwrite");for(const r of records)tx.objectStore("records").put({pk:r.kind+":"+r.id,...r,updatedAt:Date.now()});tx.oncomplete=()=>{db.close();resolve();};};});await(globalThis as any).chrome.storage.local.set({deeprole_settings:{locale:"en",onboardingComplete:true}});},castRecords());
 const story=await context.newPage();await story.goto("https://chat.deepseek.com/chat/s/original");await story.locator("textarea").fill("My untouched draft");
 const command=(m:any)=>panel.evaluate(m=>(globalThis as any).chrome.runtime.sendMessage(m),m);
 let start:any;
 if(mode==="auto"){await panel.evaluate(async()=>{const open=indexedDB.open("deeprole");await new Promise<void>(resolve=>{open.onsuccess=()=>{const db=open.result,tx=db.transaction("records","readwrite"),store=tx.objectStore("records"),get=store.get("world:w");get.onsuccess=()=>store.put({...get.result,data:{...get.result.data,autoPrepareCharacters:true}});tx.oncomplete=()=>{db.close();resolve();};};});await(globalThis as any).chrome.storage.local.set({deeprole_library_change:{token:"start-auto"}});});await expect.poll(async()=>!!(await command({type:"DR_CAST",action:"status",worldId:"w"})).job,{timeout:10000}).toBe(true);start=await command({type:"DR_CAST",action:"status",worldId:"w"});}
 else start=await command({type:"DR_CAST",action:"start",worldId:"w",locale:"en"});
 expect(start.ok).toBe(true);const id=start.job.id;
 const status=()=>command({type:"DR_CAST",action:"status",worldId:"w"});
 await expect.poll(async()=>(await status()).job.phase,{timeout:20000}).toBe("analyzing");
 if(mode==="cancel")await command({type:"DR_CAST",action:"cancel",id});
 await expect.poll(async()=>(await status()).job.phase,{timeout:20000}).toBe(mode==="refusal"?"error":mode==="cancel"?"cancelled":"ready");
 await expect.poll(async()=>(await status()).job.cleanup,{timeout:15000}).toBe(mode==="cleanup-fail"?"failed":"done");
 expect(await story.locator("textarea").inputValue()).toBe("My untouched draft");expect(story.url()).toContain("/original");
 const requests=events.filter(e=>e.request);expect(requests.length).toBe(mode==="repair"?3:2);
 expect(requests[0].request).toContain("Leon is the protagonist.");expect(requests[1].request).toContain("ALL distinct story characters");
 if(["success","auto","repair","cleanup-fail"].includes(mode)){
  const job=(await status()).job;expect(job.draft.characters).toHaveLength(2);expect(job.draft.characters[1].sheet.relationships.initial.trust).toBe(82);
  expect((await command({type:"DR_CAST",action:"apply",id,draft:job.draft,selected:["p1","p2"],hero:"p1"})).count).toBe(2);
 }
 expect(events.some(e=>e.deleted)).toBe(mode!=="cleanup-fail");
 }finally{await context.close();}
});
