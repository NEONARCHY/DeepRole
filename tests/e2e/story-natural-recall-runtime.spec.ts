import {chromium,expect,test,type Page} from '@playwright/test';
import path from 'node:path';
import {naturalRecallWorld} from '../fixtures/story-natural-recall-quality';
import {decodeStoryMemory} from '../../src/core/story-memory-transport';
const rows=(page:Page)=>page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{const open=indexedDB.open('deeprole');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('records'),read=tx.objectStore('records').getAll();read.onsuccess=()=>resolve(read.result);read.onerror=()=>reject(read.error);tx.oncomplete=()=>db.close();};}));
for(const locale of ['ru','en'] as const)test(`installed natural recall ${locale}: natural syntax and cases amid newer discussion, whole actual POST and reload`,async({},info)=>{
 test.skip(info.project.name!=='chromium','Installed Edge MV3; synthetic DeepSeek without an account');test.setTimeout(120000);
 const context=await chromium.launchPersistentContext('',{channel:'msedge',headless:true,args:['--disable-extensions-except='+path.resolve('.output/chrome-mv3'),'--load-extension='+path.resolve('.output/chrome-mv3'),'--host-resolver-rules=MAP chat.deepseek.com ~NOTFOUND']});
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker'),panel=await context.newPage();await panel.goto('chrome-extension://'+new URL(worker.url()).host+'/sidepanel.html');await expect(panel.locator('.onboarding')).toBeVisible();
  const f=naturalRecallWorld(locale),base=f.base;base.world.contextBudget=3000;
  await panel.evaluate(async({records,locale})=>{await new Promise<void>((resolve,reject)=>{const open=indexedDB.open('deeprole');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('records','readwrite');for(const r of records)tx.objectStore('records').put({pk:r.kind+':'+r.id,...r,updatedAt:Date.now()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});await(globalThis as any).chrome.storage.local.set({deeprole_settings:{locale,onboardingComplete:true,showChatContextMeter:false,automaticMetadataRepair:false},deeprole_library_change:{token:'natural-seed'}});},{records:base.records,locale});
  const message=(id:number,parent:number|null,role:string,content:string)=>({message_id:id,parent_id:parent,role,status:'FINISHED',has_pending_fragment:false,fragments:[{type:role==='USER'?'REQUEST':'RESPONSE',content}]});
  const messages=[message(40,null,'USER','Begin'),message(41,40,'ASSISTANT','Workshop')];let selected=41,posts=0,outgoing='';
  await context.route('https://chat.deepseek.com/**',route=>{const url=route.request().url();
   if(url.includes('/api/v0/chat/history_messages'))return route.fulfill({json:{code:0,data:{biz_code:0,biz_data:{chat_session:{id:base.binding.chatId,current_message_id:selected},chat_messages:messages}}}});
   if(url.endsWith('/api/v0/chat/completion')){posts++;outgoing=route.request().postDataJSON().prompt;return route.fulfill({contentType:'text/event-stream',body:`event: ready\ndata: {"request_message_id":${40+posts*2},"response_message_id":${41+posts*2}}\n\nevent: finish\ndata: {}\n\nevent: close\ndata: {}\n\n`});}
   if(url.includes('/api/v0/'))return route.fulfill({json:{}});
   return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><main><article data-role="assistant" data-message-id="41"><div class="ds-markdown">Workshop</div></article><textarea aria-label="Message"></textarea></main></body></html>'});
  });
  const chat=await context.newPage(),errors:string[]=[];chat.on('pageerror',e=>errors.push(e.message));await chat.goto(base.binding.chatUrl!);await chat.bringToFront();await expect(chat.locator('.dr-character-row')).toHaveCount(2,{timeout:12000});
  const rpc=(data:any)=>panel.evaluate(async({data,url})=>{const api=(globalThis as any).chrome,[tab]=await api.tabs.query({url,active:true});return api.tabs.sendMessage(tab.id,data);},{data,url:base.binding.chatUrl!}),read=async()=>(await rpc({type:'DR_STORY_REVIEW_READ',cursor:null})).data;
  expect(await rpc({type:'DR_STORY_GAME',operation:'start',manual:'stop'})).toMatchObject({ok:true});const branch=(await read()).guard.branchId,pages=context.pages().length;
  const send=(draft:string)=>chat.evaluate(({draft,parent})=>new Promise<void>(resolve=>{const x=new XMLHttpRequest();x.open('POST','/api/v0/chat/completion');x.onload=()=>resolve();x.send(JSON.stringify({chat_session_id:'synthetic-a',parent_message_id:parent,prompt:draft}));}),{draft,parent:selected});
  const later=f.noise,batches=[[...f.duties,f.knowledge],...Array.from({length:5},(_,i)=>later.slice(i*8,i*8+8))];let total=0;
  for(const batch of batches){const previous=selected;await send('Continue.');const answer=batch.map(x=>x.quote).join('\n')+'<deeprole_characters>'+JSON.stringify({version:2,world:base.world.id,chat:base.binding.chatId,branch,updates:[],facts:batch})+'</deeprole_characters>';messages.push(message(previous+1,previous,'USER',outgoing),message(previous+2,previous+1,'ASSISTANT',answer));selected=previous+2;total+=batch.length;
   await chat.evaluate(({id,answer})=>{const row=document.querySelector('article')!;row.setAttribute('data-message-id',String(id));row.querySelector('.ds-markdown')!.textContent=answer;},{id:selected,answer});
   // Story review is a bounded 24-fact page, not the entire stored library.
   await expect.poll(async()=>{const page=await read();return batch.every(fact=>(page.facts??[]).some((v:any)=>v.text===fact.text));},{timeout:12000}).toBe(true);
   for(let i=0;i<8;i++){const r=await read(),candidate=r.facts.find((x:any)=>!x.accepted&&!x.superseded);if(!candidate)break;expect(await rpc({type:'DR_STORY_FACT',input:{worldId:base.world.id,chatId:base.binding.chatId,guard:r.guard,eventId:candidate.eventId,text:candidate.text,accept:true}})).toMatchObject({ok:true});}
   await expect.poll(async()=>(await rows(panel)).find(r=>r.kind==='world').data.sharedGame.facts.length,{timeout:12000}).toBe(total);
  }
  const saved=(await rows(panel)).find(r=>r.kind==='world').data.sharedGame;expect(saved.facts).toHaveLength(45);
  const hints=()=>{const block=outgoing.split('<deeprole_story_memory>')[1]!.split('</deeprole_story_memory>')[0]!;return decodeStoryMemory(JSON.parse(block.split('\n')[1]!));};
  const check=async()=>{
   const queries=[{draft:f.input.draft,objects:[0]},{draft:f.s('Проверяю дверь ключом.','I inspect the door with the key.'),objects:[0,1]},{draft:f.s('Я беру ключ, осматриваю дверь, проверяю код и открываю ворота.','I take the key, inspect the door, check the code and open the gate.'),objects:[0,1,2,3]},{draft:f.s('Жду возле мастерской и внимательно смотрю по сторонам. '.repeat(15)+'Проверяю дверь ключом.','I wait near the workshop and carefully look around. '.repeat(15)+'I inspect the door with the key.'),objects:[0,1]},{draft:f.s('Если охрана разрешит, воспользуюсь ключом и осмотрю дверь.','If the guards permit it, I will use the key and inspect the door.'),objects:[0,1]},{draft:f.s('Не беру ключ без разрешения, просто осматриваю дверь.','I do not take the key without permission; I only inspect the door.'),objects:[0,1]}];
   for(const {draft,objects} of queries){await send(draft);const memory=hints();expect(memory[0]!.text).toBe(f.latest.text);expect(outgoing.endsWith(draft)).toBe(true);
    for(const at of objects){const fact=f.duties[at]!,role=at%2?'planner':'promisor',hint=memory.find(h=>h.text===fact.text)!;expect(hint).toBeDefined();expect(hint.task).toEqual(fact.task);expect(hint.sourceQuote??hint.text).toBe(fact.quote);expect(hint.sourceRoles?.[role]?.id).toBe(base.entities[at%2?1:0]!.id);expect(hint.episodeSource?.revisionId).toBeTruthy();}
    if(objects.includes(2)){const hint=memory.find(h=>h.text===f.knowledge.text)!;expect(hint.claim).toEqual(f.knowledge.claim);expect(hint.sourceQuote??hint.text).toBe(f.knowledge.quote);expect(hint.timeStatus).toBe('persistent');}
   }
   for(const draft of [f.s('Воспользовался её ключом.','I used her key.'),f.s('Воспользовался зелёным жетоном.','I used the green token.')]){await send(draft);expect(outgoing.endsWith(draft)).toBe(true);for(const hint of hints())if(hint.task){expect(hint.task.status).toBe('open');expect(hint.sourceRoles?.[hint.kind==='plan'?'planner':'promisor']?.id).toBe(base.entities[hint.kind==='plan'?1:0]!.id);}}
  };
  await check();await chat.reload();await chat.bringToFront();await expect(chat.locator('.dr-character-row')).toHaveCount(2,{timeout:12000});await check();
   const after=(await rows(panel)).find(r=>r.kind==='world').data.sharedGame;expect(after.facts).toEqual(saved.facts);expect(after.factRoleSeeds).toEqual(saved.factRoleSeeds);expect(after.episodeSources).toEqual(saved.episodeSources);expect(posts).toBe(22);expect(context.pages()).toHaveLength(pages);expect(errors).toEqual([]);
 }finally{await context.close();}
});
