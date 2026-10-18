import { chromium,expect,test,type Page } from '@playwright/test';
import path from 'node:path';
import { repeatSelectionWorld } from '../fixtures/story-repeat-selection';
import { decodeStoryMemory } from '../../src/core/story-memory-transport';
const rows=(page:Page)=>page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{
  const open=indexedDB.open('deeprole');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('records'),get=tx.objectStore('records').getAll();get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error);tx.oncomplete=()=>db.close();};
}));
for(const locale of ['ru','en'] as const)test(`installed repeat selection ${locale}: complete conditions in POST/reload/OOC, canon unchanged`,async({},info)=>{
  test.skip(info.project.name!=='chromium','Synthetic installed Edge MV3, not a personal DeepSeek account');test.setTimeout(120000);
  const extension=path.resolve('.output/chrome-mv3'),context=await chromium.launchPersistentContext('',{channel:'msedge',headless:true,args:['--disable-extensions-except='+extension,'--load-extension='+extension,'--host-resolver-rules=MAP chat.deepseek.com ~NOTFOUND']});
  try{
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker'),panel=await context.newPage();
    await panel.goto('chrome-extension://'+new URL(worker.url()).host+'/sidepanel.html');await expect(panel.locator('.onboarding')).toBeVisible();
    const f=repeatSelectionWorld(locale,16),base=f.base;base.world.contextBudget=6000;
    await panel.evaluate(async({records,locale})=>{
      await new Promise<void>((resolve,reject)=>{const open=indexedDB.open('deeprole');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('records','readwrite');for(const r of records)tx.objectStore('records').put({pk:r.kind+':'+r.id,...r,updatedAt:Date.now()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
      await(globalThis as any).chrome.storage.local.set({deeprole_settings:{locale,onboardingComplete:true,showChatContextMeter:false,automaticMetadataRepair:false},deeprole_library_change:{token:'repeat-selection-seed'}});
    },{records:base.records,locale});
    const message=(id:number,parent:number|null,role:string,content:string)=>({message_id:id,parent_id:parent,role,status:'FINISHED',has_pending_fragment:false,fragments:[{type:role==='USER'?'REQUEST':'RESPONSE',content}]});
    const messages=[message(40,null,'USER','Begin'),message(41,40,'ASSISTANT','Workshop')];let selected=41,outgoing='',posts=0;
    await context.route('https://chat.deepseek.com/**',route=>{
      const url=route.request().url();
      if(url.includes('/api/v0/chat/history_messages'))return route.fulfill({json:{code:0,data:{biz_code:0,biz_data:{chat_session:{id:base.binding.chatId,current_message_id:selected},chat_messages:messages}}}});
      if(url.endsWith('/api/v0/chat/completion')){posts++;outgoing=route.request().postDataJSON().prompt;return route.fulfill({contentType:'text/event-stream',body:`event: ready\ndata: {"request_message_id":${40+posts*2},"response_message_id":${41+posts*2}}\n\nevent: finish\ndata: {}\n\nevent: close\ndata: {}\n\n`});}
      if(url.includes('/api/v0/'))return route.fulfill({json:{}});
      return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><main><article data-role="assistant" data-message-id="41"><div class="ds-markdown">Workshop</div></article><textarea aria-label="Message"></textarea></main></body></html>'});
    });
    const chat=await context.newPage(),errors:string[]=[];chat.on('pageerror',e=>errors.push(e.message));await chat.goto(base.binding.chatUrl);await chat.bringToFront();await expect(chat.locator('.dr-character-row')).toHaveCount(2,{timeout:12000});
    const rpc=(data:any)=>panel.evaluate(async({data,url})=>{const api=(globalThis as any).chrome,[tab]=await api.tabs.query({url,active:true});return api.tabs.sendMessage(tab.id,data);},{data,url:base.binding.chatUrl});
    const read=async()=>(await rpc({type:'DR_STORY_REVIEW_READ',cursor:null})).data;
    expect(await rpc({type:'DR_STORY_GAME',operation:'start',manual:'stop'})).toMatchObject({ok:true});const branch=(await read()).guard.branchId;
    const send=async(draft:string)=>{
      await chat.locator('textarea').fill(draft);
      await chat.evaluate(({draft,parent})=>new Promise<void>(resolve=>{const x=new XMLHttpRequest();x.open('POST','/api/v0/chat/completion');x.onload=()=>resolve();x.send(JSON.stringify({chat_session_id:'synthetic-a',parent_message_id:parent,prompt:draft}));}),{draft,parent:selected});
      // XHR load is not completion of the extension's asynchronous durable
      // stream journal. Reloading/sending the next probe before close was
      // cancelling the fixture's own pending operation, not testing retrieval.
      const assistantKey=JSON.stringify(['message',String(41+posts*2)]);
      await expect.poll(async()=>{const d=(await rows(panel)).find(r=>r.kind==='dispatch'&&r.data.wire?.link?.assistantMessageKey===assistantKey)?.data;return [d?.delivery?.status,d?.wire?.phase,d?.wire?.sawFinish];},{timeout:12000}).toEqual(['accepted','closed',true]);
    };
    const batches=[f.facts.slice(0,4),f.facts.slice(4),f.repeats.slice(0,8),f.repeats.slice(8)];
    for(const batch of batches){
      const previous=selected;await send('Continue.');
      const answer=batch.map(f=>f.quote).join('\n')+'<deeprole_characters>'+JSON.stringify({version:2,world:base.world.id,chat:base.binding.chatId,branch,updates:[],facts:batch})+'</deeprole_characters>';
      messages.push(message(previous+1,previous,'USER',outgoing),message(previous+2,previous+1,'ASSISTANT',answer));selected=previous+2;
      await chat.evaluate(({id,answer})=>{const row=document.querySelector('article')!;row.setAttribute('data-message-id',String(id));row.querySelector('.ds-markdown')!.textContent=answer;},{id:selected,answer});
      try{await expect.poll(async()=>{const r=await read();return batch.every(f=>(r.facts??[]).some((v:any)=>v.text===f.text));},{timeout:12000}).toBe(true);}
      catch(error){await info.attach('selection-ingestion-debug',{body:JSON.stringify({batch,review:await read(),rows:await rows(panel),page:await rpc({type:'DR_GET_PAGE_STATE'}),errors}),contentType:'application/json'});throw error;}
      for(let i=0;i<8;i++){const r=await read(),candidate=r.facts.find((v:any)=>!v.accepted&&!v.superseded);if(!candidate)break;expect(await rpc({type:'DR_STORY_FACT',input:{worldId:base.world.id,chatId:base.binding.chatId,guard:r.guard,eventId:candidate.eventId,text:candidate.text,accept:true}})).toMatchObject({ok:true});}
    }
    const saved=(await rows(panel)).find(r=>r.kind==='world').data.sharedGame,pages=context.pages().length;expect(saved.facts).toHaveLength(23);
    for(const reload of [false,true]){
      if(reload){await chat.reload();await chat.bringToFront();await expect(chat.locator('.dr-character-row')).toHaveCount(2,{timeout:12000});}
      for(const draft of [f.input.draft,f.s(`Я проверяю предмет ${f.topic}.`,`I check the ${f.topic}.`),f.s('Вне игры: ','OOC: ')+f.input.draft]){
        await send(draft);expect(outgoing.endsWith(draft)).toBe(true);
        if(!outgoing.includes('<deeprole_story_memory>'))await info.attach('selection-context-debug',{body:JSON.stringify({draft,outgoing,rows:await rows(panel),page:await rpc({type:'DR_GET_PAGE_STATE'}),errors}),contentType:'application/json'});
        expect(outgoing).toContain('<deeprole_story_memory>');
        const block=outgoing.split('<deeprole_story_memory>')[1]!.split('</deeprole_story_memory>')[0]!,hints=decodeStoryMemory(JSON.parse(block.split('\n')[1]!));
        expect(hints).toHaveLength(7);
        for(const fact of f.facts){const h=hints.find(h=>h.text===fact.text)!;expect(h).toBeDefined();expect(h.sourceQuote??h.text).toBe(fact.quote);expect(h.task).toEqual(fact.task);expect(h.claim).toEqual(fact.claim);expect(h.episodeSource?.revisionId).toBeTruthy();}
        expect(hints.some(h=>f.repeats.some(f=>f.text===h.text))).toBe(false);
        expect(new Set(hints.filter(h=>h.task?.status==='open').map(h=>h.sourceRoles?.promisor?.id)).size).toBe(2);
      }
    }
    const after=(await rows(panel)).find(r=>r.kind==='world').data.sharedGame;
    expect(after.facts).toEqual(saved.facts);expect(after.factRoleSeeds).toEqual(saved.factRoleSeeds);expect(after.episodeSources).toEqual(saved.episodeSources);expect(posts).toBe(10);expect(context.pages()).toHaveLength(pages);expect(errors).toEqual([]);
  }finally{await context.close();}
});
