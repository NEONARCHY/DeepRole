import {chromium,expect,test,type Page} from "@playwright/test";
import path from "node:path";
import {relevanceQualityCorpus} from "../fixtures/story-relevance-quality";
import {storyWorld} from "../fixtures/story-worlds";
import {decodeStoryMemory} from "../../src/core/story-memory-transport";
import type {StoryFact} from "../../src/core/story-update";

const rows=(page:Page)=>page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{const open=indexedDB.open("deeprole");open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction("records"),read=tx.objectStore("records").getAll();read.onsuccess=()=>resolve(read.result);read.onerror=()=>reject(read.error);tx.oncomplete=()=>db.close();};}));
for(const locale of ["ru","en"] as const)test(`installed relevance ${locale}: whole old topics without unrelated tail; compound, owner, unknown and continuation`,async({},info)=>{
  test.skip(info.project.name!=="chromium","Installed Edge MV3 with synthetic DeepSeek, no account");test.setTimeout(120000);
  const context=await chromium.launchPersistentContext("",{channel:"msedge",headless:true,args:[`--disable-extensions-except=${path.resolve(".output/chrome-mv3")}`,`--load-extension=${path.resolve(".output/chrome-mv3")}`]});
  try {
    const worker=context.serviceWorkers()[0]??await context.waitForEvent("serviceworker"),panel=await context.newPage();await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);await expect(panel.locator(".onboarding")).toBeVisible();
    const corpus=relevanceQualityCorpus(locale),bodyCase=corpus.find(c=>c.name===`space:${locale}:late-body`)!,titleCase=corpus.find(c=>c.name===`space:${locale}:full-task-title`)!,topic=bodyCase.first,done=titleCase.first,noise=bodyCase.input.story!.facts.slice(3),f=storyWorld(locale,2);
    f.entities=bodyCase.input.entities!;f.world.contextBudget=6000;
    const records=f.records.map(r=>r.kind==="entity"?{...r,data:f.entities.find(e=>e.id===r.id)!}:r);
    await panel.evaluate(async({records,locale})=>{
      await new Promise<void>((resolve,reject)=>{const open=indexedDB.open("deeprole");open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction("records","readwrite");for(const r of records)tx.objectStore("records").put({pk:`${r.kind}:${r.id}`,...r,updatedAt:Date.now()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
      await (globalThis as any).chrome.storage.local.set({deeprole_settings:{locale,onboardingComplete:true,showChatContextMeter:false,automaticMetadataRepair:false},deeprole_library_change:{token:"relevance-seed"}});
    },{records,locale});
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
    expect(await rpc({type:"DR_STORY_GAME",operation:"start",manual:"stop"})).toMatchObject({ok:true});const branch=(await read()).guard.branchId,pages=context.pages().length;
    const send=(draft:string)=>chat.evaluate(({draft,parent})=>new Promise<void>(resolve=>{const xhr=new XMLHttpRequest();xhr.open("POST","/api/v0/chat/completion");xhr.onload=()=>resolve();xhr.send(JSON.stringify({chat_session_id:"synthetic-a",parent_message_id:parent,prompt:draft}));}),{draft,parent:selected});
    const open:StoryFact={kind:"task",text:done.task!.title,quote:done.task!.title,task:{...done.task!,status:"open"}};
    const gateText=locale==="ru"?"Нора обещала Мире починить ворота только после открытия дороги.":"Nora promised Mira to repair the gate only after the road opens.";
    const gate:StoryFact={kind:"promise",text:gateText,quote:gateText,task:{key:"separate-gate",title:locale==="ru"?"Ремонт ворот":"Repair the gate",status:"open"}};
    const knowledgeText=locale==="ru"?"Мира узнала код кладовой, но это не даёт разрешения входить.":"Mira learned the pantry code, but it does not give permission to enter.";
    const knowledge:StoryFact={kind:"event",text:knowledgeText,quote:locale==="ru"?"Мира сказала: «Я узнала код кладовой, но это не даёт разрешения входить».":"Mira said: “I learned the pantry code, but it does not give permission to enter.”",claim:{key:"pantry-code",value:knowledgeText,scope:"state",lifetime:"persistent"}};
    const batches=[[topic,open,gate,knowledge],[done,...noise.slice(0,5)],noise.slice(5,12),noise.slice(12)];let total=0;
    for(const batch of batches) {
      const previous=selected;await send("Continue.");const answer=batch.map(x=>x.quote).join("\n")+"<deeprole_characters>"+JSON.stringify({version:2,world:f.world.id,chat:f.binding.chatId,branch,updates:[],facts:batch})+"</deeprole_characters>";
      messages.push(message(previous+1,previous,"USER",outgoing),message(previous+2,previous+1,"ASSISTANT",answer));selected=previous+2;total+=batch.length;
      await chat.evaluate(({id,answer})=>{const row=document.querySelector("article")!;row.setAttribute("data-message-id",String(id));row.querySelector(".ds-markdown")!.textContent=answer;},{id:selected,answer});
      // Review is the latest24 proposals, not a world/library-size ceiling.
      await expect.poll(async()=>(await read()).facts?.length,{timeout:12000}).toBe(Math.min(total,24));
      const visible=await read();for(const fact of batch)expect(visible.facts.some((x:any)=>x.text===fact.text)).toBe(true);
      for(let i=0;i<8;i++){const r=await read(),candidate=r.facts.find((x:any)=>!x.accepted&&!x.superseded);if(!candidate)break;expect(await rpc({type:"DR_STORY_FACT",input:{worldId:f.world.id,chatId:f.binding.chatId,guard:r.guard,eventId:candidate.eventId,text:candidate.text,accept:true}})).toMatchObject({ok:true});}
    }
    const saved=(await rows(panel)).find(r=>r.kind==="world").data.sharedGame;expect(saved.facts).toHaveLength(24);expect(saved.facts.find((x:any)=>x.task?.key===done.task!.key)?.task.status).toBe("completed");expect(saved.facts.find((x:any)=>x.task?.key===gate.task!.key)?.task.status).toBe("open");
    expect(saved.facts.some((x:any)=>x.text===topic.text)).toBe(true);expect(saved.facts.some((x:any)=>x.text===knowledge.text)).toBe(true);for(const item of noise)expect(saved.facts.some((x:any)=>x.text===item.text)).toBe(true);
    const check=(target:StoryFact)=>{
      const block=outgoing.split("<deeprole_story_memory>")[1]!.split("</deeprole_story_memory>")[0]!,hints=decodeStoryMemory(JSON.parse(block.split("\n")[1]!));
      expect(hints).toHaveLength(1);
      expect(hints[0]!.text).toBe(target.text);expect(hints[0]!.kind).toBe(target.kind);expect(hints[0]!.sourceQuote??hints[0]!.text).toBe(target.quote);expect(hints[0]!.episodeSource?.period).toBe("earlier-turn");
      if(target.task)expect(hints[0]!.task).toEqual(target.task);
    };
    const readHints=()=>{const block=outgoing.split("<deeprole_story_memory>")[1]!.split("</deeprole_story_memory>")[0]!;return decodeStoryMemory(JSON.parse(block.split("\n")[1]!));};
    const checkAll=async()=>{
      await send(bodyCase.input.draft);check(topic);await send(titleCase.input.draft);check(done);
      await send(locale==="ru"?"Что известно о кислороде и телеметрии?":"What do we know about oxygen and telemetry?");
      const compound=readHints();expect(compound).toHaveLength(2);expect(compound.map(h=>h.text).sort()).toEqual([topic.text,done.text].sort());for(const target of [topic,done]){const hint=compound.find(h=>h.text===target.text)!;expect(hint.sourceQuote??hint.text).toBe(target.quote);if(target.task)expect(hint.task).toEqual(target.task);}
      await send(locale==="ru"?"Напомни, что Нора обещала Мире.":"Remind me what Nora promised Mira.");const owned=readHints();expect(owned).toHaveLength(8);expect(owned[0]!.text).toBe(gate.text);expect(owned[0]!.task).toEqual(gate.task);expect(owned[0]!.sourceRoles?.promisor?.id).toBe(f.entities[0]!.id);
      await send(locale==="ru"?"Что известно о драконе?":"What do we know about the dragon?");expect(readHints()).toHaveLength(8);
      await send(locale==="ru"?"Продолжай.":"Continue.");const continued=readHints();expect(continued).toHaveLength(8);expect(continued[0]!.text).toBe(noise.at(-1)!.text);
      const commitment=continued.find(h=>h.text===gate.text)!;expect(commitment).toBeDefined();expect(commitment.task).toEqual(gate.task);expect(commitment.sourceRoles?.promisor?.id).toBe(f.entities[0]!.id);expect(commitment.sourceQuote??commitment.text).toBe(gate.quote);
      const lasting=continued.find(h=>h.text===knowledge.text)!;expect(lasting).toBeDefined();expect(lasting.claim).toEqual(knowledge.claim);expect(lasting.sourceQuote??lasting.text).toBe(knowledge.quote);expect(lasting.timeStatus).toBe("persistent");expect(lasting.sourceRoles?.speaker?.id).toBe(f.entities[1]!.id);
    };
    await checkAll();await chat.reload();await chat.bringToFront();await expect(chat.locator(".dr-character-row")).toHaveCount(2,{timeout:12000});await checkAll();
    const after=(await rows(panel)).find(r=>r.kind==="world").data.sharedGame;expect(after.facts).toEqual(saved.facts);expect(after.factRoleSeeds).toEqual(saved.factRoleSeeds);expect(after.episodeSources).toEqual(saved.episodeSources);expect(posts).toBe(16);expect(context.pages()).toHaveLength(pages);expect(errors).toEqual([]);
  }finally{await context.close();}
});
