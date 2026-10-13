import {chromium,expect,test,type Page} from "@playwright/test";
import path from "node:path";
import {transportWorld} from "../fixtures/story-memory-transport";
import {decodeStoryMemory} from "../../src/core/story-memory-transport";
import {storyFactHint} from "../../src/core/story-fact-context";
import {createEpisodeReader} from "../../src/core/story-episodes";
import {createStoryTimeReader} from "../../src/core/story-time";

const rows=(page:Page)=>page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{
  const open=indexedDB.open("deeprole");open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction("records"),read=tx.objectStore("records").getAll();read.onsuccess=()=>resolve(read.result);read.onerror=()=>reject(read.error);tx.oncomplete=()=>db.close();};
}));
for(const locale of ["ru","en"] as const)test(`installed compact memory ${locale}: exact mixed scene, next POST, reload and no canonical refs`,async({},info)=>{
  test.skip(info.project.name!=="chromium","Installed Edge MV3 with synthetic DeepSeek, no account");test.setTimeout(120000);
  const extension=path.resolve(".output/chrome-mv3"),context=await chromium.launchPersistentContext("",{channel:"msedge",headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  try {
    const worker=context.serviceWorkers()[0]??await context.waitForEvent("serviceworker"),panel=await context.newPage();
    await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);await expect(panel.locator(".onboarding")).toBeVisible();
    const fixture=transportWorld(locale),f=fixture.base;f.world.contextBudget=8000;
    await panel.evaluate(async({records,locale})=>{
      await new Promise<void>((resolve,reject)=>{const open=indexedDB.open("deeprole");open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction("records","readwrite");for(const row of records)tx.objectStore("records").put({pk:`${row.kind}:${row.id}`,...row,updatedAt:Date.now()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
      await (globalThis as any).chrome.storage.local.set({deeprole_settings:{locale,onboardingComplete:true,showChatContextMeter:false,automaticMetadataRepair:false},deeprole_library_change:{token:"transport-seed"}});
    },{records:f.records,locale});
    const message=(id:number,parent:number|null,role:string,content:string)=>({message_id:id,parent_id:parent,role,status:"FINISHED",has_pending_fragment:false,fragments:[{type:role==="USER"?"REQUEST":"RESPONSE",content}]});
    const messages=[message(40,null,"USER","Begin"),message(41,40,"ASSISTANT","Workshop")];let selected=41,posts=0,outgoing="";
    await context.route("https://chat.deepseek.com/**",route=>{
      const url=route.request().url();
      if(url.includes("/api/v0/chat/history_messages"))return route.fulfill({json:{code:0,data:{biz_code:0,biz_data:{chat_session:{id:f.binding.chatId,current_message_id:selected},chat_messages:messages}}}});
      if(url.endsWith("/api/v0/chat/completion")){posts++;outgoing=route.request().postDataJSON().prompt;return route.fulfill({contentType:"text/event-stream",body:`event: ready\ndata: {"request_message_id":${40+posts*2},"response_message_id":${41+posts*2}}\n\nevent: finish\ndata: {}\n\nevent: close\ndata: {}\n\n`});}
      if(url.includes("/api/v0/"))return route.fulfill({json:{}});
      return route.fulfill({contentType:"text/html",body:'<!doctype html><html><body><main><article data-role="assistant" data-message-id="41"><div class="ds-markdown">Workshop</div></article><textarea aria-label="Message"></textarea></main></body></html>'});
    });
    const chat=await context.newPage(),errors:string[]=[];chat.on("pageerror",e=>errors.push(e.message));await chat.goto(f.binding.chatUrl!);await chat.bringToFront();await expect(chat.locator(".dr-character-row")).toHaveCount(2,{timeout:12000});
    const rpc=(data:any)=>panel.evaluate(async({data,url})=>{const api=(globalThis as any).chrome,[tab]=await api.tabs.query({url,active:true});return api.tabs.sendMessage(tab.id,data);},{data,url:f.binding.chatUrl!});
    const read=async()=>(await rpc({type:"DR_STORY_REVIEW_READ",cursor:null})).data;
    expect(await rpc({type:"DR_STORY_GAME",operation:"start",manual:"stop"})).toMatchObject({ok:true});
    const branch=(await read()).guard.branchId,count=context.pages().length;
    const send=(draft:string)=>chat.evaluate(({draft,parent})=>new Promise<void>(resolve=>{const xhr=new XMLHttpRequest();xhr.open("POST","/api/v0/chat/completion");xhr.onload=()=>resolve();xhr.send(JSON.stringify({chat_session_id:"synthetic-a",parent_message_id:parent,prompt:draft}));}),{draft,parent:selected});
    await send("Continue.");
    const answer=fixture.quote+"<deeprole_characters>"+JSON.stringify({version:2,world:f.world.id,chat:f.binding.chatId,branch,updates:[],facts:fixture.facts.map(fact=>({...fact,risk:"ordinary"}))})+"</deeprole_characters>";
    messages.push(message(42,41,"USER",outgoing),message(43,42,"ASSISTANT",answer));selected=43;
    await chat.evaluate(({answer})=>{const row=document.querySelector("article")!;row.setAttribute("data-message-id","43");row.querySelector(".ds-markdown")!.textContent=answer;},{answer});
    await expect.poll(async()=>(await read()).update?.facts,{timeout:12000}).toBe(8);
    // Uncertain/terminal/unlinked details remain in the real review queue.
    // Confirm them explicitly; do not weaken production acceptance gates.
    for(let i=0;i<10;i++) {
      const r=(await rpc({type:"DR_AUTOMATION_READ",input:{worldId:f.world.id,chatId:f.binding.chatId,query:""}})).data,item=r.items[0];if(!item)break;
      expect(await rpc({type:"DR_AUTOMATION_RESOLVE",input:{worldId:f.world.id,chatId:f.binding.chatId,guard:r.guard,gameRevision:r.gameRevision,eventId:item.id,accept:true,fields:[],entityId:null,name:"",replaceKeys:item.conflicts.map((x:any)=>x.key)}})).toMatchObject({ok:true});
    }
    await expect.poll(async()=>(await read()).facts?.length,{timeout:12000}).toBe(8);
    for(let i=0;i<10;i++){const r=await read(),candidate=r.facts.find((x:any)=>!x.accepted&&!x.superseded);if(!candidate)break;expect(await rpc({type:"DR_STORY_FACT",input:{worldId:f.world.id,chatId:f.binding.chatId,guard:r.guard,eventId:candidate.eventId,text:candidate.text,accept:true}})).toMatchObject({ok:true});}
    const saved=(await rows(panel)).find(r=>r.kind==="world").data.sharedGame;expect(saved.facts).toHaveLength(8);
    const episodes=createEpisodeReader(saved.factRoleSeeds,saved.episodeSources),time=createStoryTimeReader(saved.facts,episodes);
    const check=()=>{
      const block=outgoing.split("<deeprole_story_memory>")[1]!.split("</deeprole_story_memory>")[0]!,raw=JSON.parse(block.split("\n")[1]!),decoded=decodeStoryMemory(raw);
      expect(decoded).toHaveLength(8);expect(block).toContain("Transport refs resolve ONLY in THIS array");
      expect(raw.some((x:any)=>x.episodeSourceRef!==undefined||x.claim?.valueRef!==undefined||x.task?.titleRef!==undefined)).toBe(true);
      for(const fact of saved.facts){const hint=decoded.find(x=>x.text===fact.text)!;expect(hint).toMatchObject(storyFactHint(fact,undefined,episodes,time));expect(hint.sourceQuote).toBe(fixture.quote);}
      expect(decoded.find(x=>x.task?.key==="gate")?.task?.status).toBe("open");expect(decoded.find(x=>x.task?.key==="letter")?.task?.status).toBe("completed");
      expect(decoded.find(x=>x.claim?.key==="reading")?.timeStatus).toBe("ended");expect(decoded.find(x=>x.kind==="belief")?.kind).toBe("belief");
      expect(outgoing).toContain("NEVER output refs in fact proposals");expect(outgoing.endsWith(fixture.input.draft)).toBe(true);
    };
    await send(fixture.input.draft);check();
    await chat.reload();await chat.bringToFront();await expect(chat.locator(".dr-character-row")).toHaveCount(2,{timeout:12000});await send(fixture.input.draft);check();
    const after=(await rows(panel)).find(r=>r.kind==="world").data.sharedGame;expect(after.facts).toEqual(saved.facts);expect(after.factRoleSeeds).toEqual(saved.factRoleSeeds);expect(after.episodeSources).toEqual(saved.episodeSources);
    expect(JSON.stringify(after.facts)).not.toMatch(/(?:valueRef|titleRef|sourceQuoteRef|episodeSourceRef|sourceRolesRef)/);expect(posts).toBe(3);expect(context.pages()).toHaveLength(count);expect(errors).toEqual([]);
  }finally{await context.close();}
});
