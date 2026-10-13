import {chromium,expect,test,type Page} from "@playwright/test";
import path from "node:path";
import {actionWorld} from "../fixtures/story-action-quality";
import {decodeStoryMemory} from "../../src/core/story-memory-transport";
import type {StoryFact} from "../../src/core/story-update";

const rows=(page:Page)=>page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{const open=indexedDB.open('deeprole');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('records'),read=tx.objectStore('records').getAll();read.onsuccess=()=>resolve(read.result);read.onerror=()=>reject(read.error);tx.oncomplete=()=>db.close();};}));
for(const locale of ['ru','en'] as const)test(`installed ordinary action ${locale}: whole conditional door memory, gestures, direct queries and reload`,async({},info)=>{
 test.skip(info.project.name!=='chromium','Installed Edge MV3, synthetic DeepSeek without an account');test.setTimeout(120000);
 const context=await chromium.launchPersistentContext('',{channel:'msedge',headless:true,args:['--disable-extensions-except='+path.resolve('.output/chrome-mv3'),'--load-extension='+path.resolve('.output/chrome-mv3'),'--host-resolver-rules=MAP chat.deepseek.com ~NOTFOUND']});
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker'),panel=await context.newPage();await panel.goto('chrome-extension://'+new URL(worker.url()).host+'/sidepanel.html');await expect(panel.locator('.onboarding')).toBeVisible();
  const f=actionWorld(locale),base=f.base;base.world.contextBudget=6000;
  await panel.evaluate(async({records,locale})=>{
   await new Promise<void>((resolve,reject)=>{const open=indexedDB.open('deeprole');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('records','readwrite');for(const r of records)tx.objectStore('records').put({pk:r.kind+':'+r.id,...r,updatedAt:Date.now()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
   await(globalThis as any).chrome.storage.local.set({deeprole_settings:{locale,onboardingComplete:true,showChatContextMeter:false,automaticMetadataRepair:false},deeprole_library_change:{token:'action-seed'}});
  },{records:base.records,locale});
  const message=(id:number,parent:number|null,role:string,content:string)=>({message_id:id,parent_id:parent,role,status:'FINISHED',has_pending_fragment:false,fragments:[{type:role==='USER'?'REQUEST':'RESPONSE',content}]});
  const messages=[message(40,null,'USER','Begin'),message(41,40,'ASSISTANT','Workshop')];let selected=41,posts=0,outgoing='';
  await context.route('https://chat.deepseek.com/**',route=>{
   const url=route.request().url();
   if(url.includes('/api/v0/chat/history_messages'))return route.fulfill({json:{code:0,data:{biz_code:0,biz_data:{chat_session:{id:base.binding.chatId,current_message_id:selected},chat_messages:messages}}}});
   if(url.endsWith('/api/v0/chat/completion')){posts++;outgoing=route.request().postDataJSON().prompt;return route.fulfill({contentType:'text/event-stream',body:`event: ready\ndata: {"request_message_id":${40+posts*2},"response_message_id":${41+posts*2}}\n\nevent: finish\ndata: {}\n\nevent: close\ndata: {}\n\n`});}
   if(url.includes('/api/v0/'))return route.fulfill({json:{}});
   return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><main><article data-role="assistant" data-message-id="41"><div class="ds-markdown">Workshop</div></article><textarea aria-label="Message"></textarea></main></body></html>'});
  });
  const chat=await context.newPage(),errors:string[]=[];chat.on('pageerror',e=>errors.push(e.message));await chat.goto(base.binding.chatUrl!);await chat.bringToFront();await expect(chat.locator('.dr-character-row')).toHaveCount(2,{timeout:12000});
  const rpc=(data:any)=>panel.evaluate(async({data,url})=>{const api=(globalThis as any).chrome,[tab]=await api.tabs.query({url,active:true});return api.tabs.sendMessage(tab.id,data);},{data,url:base.binding.chatUrl!});
  const read=async()=>(await rpc({type:'DR_STORY_REVIEW_READ',cursor:null})).data;
  expect(await rpc({type:'DR_STORY_GAME',operation:'start',manual:'stop'})).toMatchObject({ok:true});const branch=(await read()).guard.branchId,pages=context.pages().length;
  const send=(draft:string)=>chat.evaluate(({draft,parent})=>new Promise<void>(resolve=>{const xhr=new XMLHttpRequest();xhr.open('POST','/api/v0/chat/completion');xhr.onload=()=>resolve();xhr.send(JSON.stringify({chat_session_id:'synthetic-a',parent_message_id:parent,prompt:draft}));}),{draft,parent:selected});
  const batches=[[f.task,f.knowledge],f.noise.slice(0,7),f.noise.slice(7,14),f.noise.slice(14)];let total=0;
  for(const batch of batches){
   const previous=selected;await send('Continue.');const answer=batch.map(x=>x.quote).join('\n')+'<deeprole_characters>'+JSON.stringify({version:2,world:base.world.id,chat:base.binding.chatId,branch,updates:[],facts:batch})+'</deeprole_characters>';
   messages.push(message(previous+1,previous,'USER',outgoing),message(previous+2,previous+1,'ASSISTANT',answer));selected=previous+2;total+=batch.length;
   await chat.evaluate(({id,answer})=>{const row=document.querySelector('article')!;row.setAttribute('data-message-id',String(id));row.querySelector('.ds-markdown')!.textContent=answer;},{id:selected,answer});
   await expect.poll(async()=>(await read()).facts?.length,{timeout:12000}).toBe(total);
   for(let i=0;i<8;i++){const r=await read(),candidate=r.facts.find((x:any)=>!x.accepted&&!x.superseded);if(!candidate)break;expect(await rpc({type:'DR_STORY_FACT',input:{worldId:base.world.id,chatId:base.binding.chatId,guard:r.guard,eventId:candidate.eventId,text:candidate.text,accept:true}})).toMatchObject({ok:true});}
  }
  const saved=(await rows(panel)).find(r=>r.kind==='world').data.sharedGame;expect(saved.facts).toHaveLength(22);
  const hints=()=>{const block=outgoing.split('<deeprole_story_memory>')[1]!.split('</deeprole_story_memory>')[0]!;return decodeStoryMemory(JSON.parse(block.split('\n')[1]!));};
  const assertWhole=(selected:ReturnType<typeof hints>,target:StoryFact)=>{const hint=selected.find(h=>h.text===target.text)!;expect(hint).toBeDefined();expect(hint.kind).toBe(target.kind);expect(hint.sourceQuote??hint.text).toBe(target.quote);if(target.task)expect(hint.task).toEqual(target.task);if(target.claim)expect(hint.claim).toEqual(target.claim);return hint;};
  const checkAll=async()=>{
   for(const draft of [f.input.draft,f.s('Я киваю.','I nod.'),f.s('*Я киваю Мире.*','*I nod to Mira.*')]){
    await send(draft);const selected=hints();expect(selected).toHaveLength(8);expect(selected[0]!.text).toBe(f.latest.text);
    const task=assertWhole(selected,f.task),lasting=assertWhole(selected,f.knowledge);expect(task.sourceRoles?.promisor?.id).toBe(base.entities[0]!.id);expect(task.task?.status).toBe('open');expect(lasting.sourceRoles?.speaker?.id).toBe(base.entities[1]!.id);expect(lasting.timeStatus).toBe('persistent');
   }
   await send(f.s('Напомни код.','What do we know about the code?'));const topic=hints();expect(topic).toHaveLength(1);assertWhole(topic,f.knowledge);
   // Existing short-word morphology is deliberately not broadened by an action parser.
   await send(f.s('Что известно о коде?','What do we know about the code?'));expect(hints()).toHaveLength(locale==='ru'?8:1);
   await send(f.s('Что Нора обещала Мире?','What did Nora promise Mira?'));expect(hints()[0]!.text).toBe(f.task.text);
   await send(f.s('Я открываю люк.','I open the hatch.'));expect(hints()).toHaveLength(8);expect(hints().some(h=>h.text===f.knowledge.text)).toBe(false);
   await send(f.s('Я созерцаю дверь.','I contemplate the door.'));expect(hints()).toHaveLength(8);
  };
  await checkAll();await chat.reload();await chat.bringToFront();await expect(chat.locator('.dr-character-row')).toHaveCount(2,{timeout:12000});await checkAll();
  const after=(await rows(panel)).find(r=>r.kind==='world').data.sharedGame;expect(after.facts).toEqual(saved.facts);expect(after.factRoleSeeds).toEqual(saved.factRoleSeeds);expect(after.episodeSources).toEqual(saved.episodeSources);expect(posts).toBe(20);expect(context.pages()).toHaveLength(pages);expect(errors).toEqual([]);
 }finally{await context.close();}
});
