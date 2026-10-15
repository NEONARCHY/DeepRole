import {chromium,expect,test} from '@playwright/test';
import path from 'node:path';
import {storyWorld} from '../fixtures/story-worlds';
for(const locale of ['ru','en'] as const)test(`installed incremental search ${locale}: edit/delete/restore/scope/reload actual POST`,async({},info)=>{
 test.skip(info.project.name!=='chromium','Isolated installed Edge MV3, synthetic responses');test.setTimeout(120000);
 const context=await chromium.launchPersistentContext('',{channel:'msedge',headless:true,args:['--disable-extensions-except='+path.resolve('.output/chrome-mv3'),'--load-extension='+path.resolve('.output/chrome-mv3'),'--host-resolver-rules=MAP chat.deepseek.com ~NOTFOUND']});
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker'),panel=await context.newPage();await panel.goto('chrome-extension://'+new URL(worker.url()).host+'/sidepanel.html');await expect(panel.locator('.onboarding')).toBeVisible();
  const f=storyWorld(locale,2),e=f.entry;f.world.contextBudget=6000;e.title='Violet lantern';e.content='The violet lantern is in the BLUE vault.';e.keywords=['violet lantern'];
  const other={...structuredClone(f.world),id:'other-world',name:'Other world'},foreign={...structuredClone(e),id:'foreign-lantern',worldId:other.id,content:'The violet lantern is in the FOREIGN tower.'};
  f.records.push({kind:'world',id:other.id,data:other},{kind:'entry',id:foreign.id,data:foreign});
  await panel.evaluate(async({records,locale})=>{await new Promise<void>((resolve,reject)=>{const open=indexedDB.open('deeprole');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('records','readwrite');for(const r of records)tx.objectStore('records').put({pk:r.kind+':'+r.id,...r,updatedAt:Date.now()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});await(globalThis as any).chrome.storage.local.set({deeprole_settings:{locale,onboardingComplete:true,showChatContextMeter:false,automaticMetadataRepair:false},deeprole_library_change:{token:'index-seed'}});},{records:f.records,locale});
  let outgoing='',posts=0;
  await context.route('https://chat.deepseek.com/**',route=>{const url=route.request().url();
   if(url.endsWith('/api/v0/chat/completion')){posts++;outgoing=route.request().postDataJSON().prompt;return route.fulfill({contentType:'text/event-stream',body:'event: finish\ndata: {}\n\nevent: close\ndata: {}\n\n'});}
   if(url.includes('/api/v0/chat/history_messages'))return route.fulfill({json:{code:0,data:{biz_code:0,biz_data:{chat_session:{id:f.binding.chatId,current_message_id:41},chat_messages:[{message_id:41,parent_id:null,role:'ASSISTANT',status:'FINISHED',has_pending_fragment:false,fragments:[{type:'RESPONSE',content:'Workshop'}]}]}}}});
   if(url.includes('/api/v0/'))return route.fulfill({json:{}});
   return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><main><article data-role="assistant" data-message-id="41"><div class="ds-markdown">Workshop</div></article><textarea aria-label="Message"></textarea></main></body></html>'});
  });
  const chat=await context.newPage(),errors:string[]=[];chat.on('pageerror',e=>errors.push(e.message));await chat.goto(f.binding.chatUrl!);await chat.bringToFront();await expect(chat.locator('.dr-character-row')).toHaveCount(2,{timeout:12000});
  const rpc=(data:any)=>panel.evaluate(async({data,url})=>{const api=(globalThis as any).chrome,[tab]=await api.tabs.query({url,active:true});return api.tabs.sendMessage(tab.id,data);},{data,url:f.binding.chatUrl!});
  const query=locale==='ru'?'Где violet lantern?':'Where is the violet lantern?';
  const send=async()=>{await chat.evaluate(draft=>new Promise<void>(resolve=>{const x=new XMLHttpRequest();x.open('POST','/api/v0/chat/completion');x.onload=()=>resolve();x.send(JSON.stringify({chat_session_id:'synthetic-a',parent_message_id:41,prompt:draft}));}),query);expect(outgoing.endsWith(query)).toBe(true);};
  const write=async(value:typeof e|null)=>{await panel.evaluate(({id,value})=>new Promise<void>((resolve,reject)=>{const open=indexedDB.open('deeprole');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('records','readwrite'),store=tx.objectStore('records');if(value)store.put({pk:'entry:'+id,kind:'entry',id,data:value,updatedAt:Date.now()});else store.delete('entry:'+id);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};}),{id:e.id,value});expect(await rpc({type:'DR_DATA_CHANGED'})).toMatchObject({ok:true});};
  await send();expect(outgoing).toContain('BLUE vault');expect(outgoing).not.toContain('FOREIGN tower');
  e.content='The violet lantern is in the GREEN attic.';await write(e);await send();expect(outgoing).toContain('GREEN attic');expect(outgoing).not.toContain('BLUE vault');
  e.enabled=false;await write(e);await send();expect(outgoing).not.toContain('GREEN attic');
  e.enabled=true;e.activation='manual';await write(e);await send();expect(outgoing).not.toContain('GREEN attic');
  expect(await rpc({type:'DR_MEMORY_OVERRIDE',id:e.id,action:'include'})).toMatchObject({ok:true});await send();expect(outgoing).toContain('GREEN attic');
  expect(await rpc({type:'DR_MEMORY_OVERRIDE',id:e.id,action:'reset'})).toMatchObject({ok:true});e.activation='smart';await write(e);
  await write(null);await send();expect(outgoing).not.toContain('GREEN attic');
  e.content='The violet lantern is in the RESTORED cabinet.';await write(e);await send();expect(outgoing).toContain('RESTORED cabinet');expect(outgoing).not.toContain('GREEN attic');
  expect(await rpc({type:'DR_SET_SCENE',scene:{worldId:other.id,bookId:null,focusIds:[]}})).toMatchObject({ok:true});await send();expect(outgoing).toContain('FOREIGN tower');expect(outgoing).not.toContain('RESTORED cabinet');
  expect(await rpc({type:'DR_SET_SCENE',scene:{worldId:f.world.id,bookId:null,focusIds:[]}})).toMatchObject({ok:true});await send();expect(outgoing).toContain('RESTORED cabinet');expect(outgoing).not.toContain('FOREIGN tower');
  await chat.reload();await chat.bringToFront();await expect(chat.locator('.dr-character-row')).toHaveCount(2,{timeout:12000});await send();expect(outgoing).toContain('RESTORED cabinet');expect(outgoing).not.toContain('FOREIGN tower');
  expect(posts).toBe(10);expect(errors).toEqual([]);
 }finally{await context.close();}
});
