import { chromium,expect,test,type Page } from '@playwright/test';
import path from 'node:path';
import { contextualWorld } from '../fixtures/story-contextual-reference';
import { decodeStoryMemory } from '../../src/core/story-memory-transport';
import type { StoryFact } from '../../src/core/story-update';
const rows=(page:Page)=>page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{const open=indexedDB.open('deeprole');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('records'),read=tx.objectStore('records').getAll();read.onsuccess=()=>resolve(read.result);read.onerror=()=>reject(read.error);tx.oncomplete=()=>db.close();};}));
for(const locale of ['ru','en'] as const)test(`installed obligation recall ${locale}: prose promise, paraphrase, whole sources, retry and reload`,async({},info)=>{
  test.skip(info.project.name!=='chromium','Installed Edge MV3 with synthetic responses, no account');test.setTimeout(180000);
 const context=await chromium.launchPersistentContext('',{channel:'msedge',headless:true,args:['--disable-extensions-except='+path.resolve('.output/chrome-mv3'),'--load-extension='+path.resolve('.output/chrome-mv3'),'--host-resolver-rules=MAP chat.deepseek.com ~NOTFOUND']});
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker'),panel=await context.newPage();await panel.goto('chrome-extension://'+new URL(worker.url()).host+'/sidepanel.html');await expect(panel.locator('.onboarding')).toBeVisible();
  const f=contextualWorld(locale),base=f.base;base.world.contextBudget=12000;
  const promise=f.records[0]!;promise.task!.title=f.s(`Я обещаю вернуть предмет ${f.object} только после разрешения хранителя`,`I promise to return the ${f.object} only after the custodian gives permission.`);
  f.anchor.text=f.s(`Лида сказала: «Мы вернулись к предмету ${f.object}. Речь о её обещании вернуть его хранителю».`,`Lida said: “We returned to the subject of the ${f.object}. We mean her promise to give it back to the custodian.”`);f.anchor.quote=f.anchor.text;
  const reference=f.s('Напомни об этом обещании.','Remind me about that promise.'),paraphrase=f.s('Куда теперь вернуть ту вещь, и исполнен ли обещанный возврат?','Where should that memento go? Polishing it does not mean its owner received it.');
  await panel.evaluate(async({records,locale})=>{await new Promise<void>((resolve,reject)=>{const open=indexedDB.open('deeprole');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('records','readwrite');for(const r of records)tx.objectStore('records').put({pk:r.kind+':'+r.id,...r,updatedAt:Date.now()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});await(globalThis as any).chrome.storage.local.set({deeprole_settings:{locale,onboardingComplete:true,showChatContextMeter:false,automaticMetadataRepair:false},deeprole_library_change:{token:'obligation-seed'}});},{records:base.records,locale});
  const message=(id:number,parent:number|null,role:string,content:string)=>({message_id:id,parent_id:parent,role,status:'FINISHED',has_pending_fragment:false,fragments:[{type:role==='USER'?'REQUEST':'RESPONSE',content}]});
  const messages=[message(40,null,'USER','Begin'),message(41,40,'ASSISTANT','Workshop')];let selected=41,outgoing='',posts=0,failNext=false;
  await context.route('https://chat.deepseek.com/**',route=>{const url=route.request().url();
   if(url.includes('/api/v0/chat/history_messages'))return route.fulfill({json:{code:0,data:{biz_code:0,biz_data:{chat_session:{id:base.binding.chatId,current_message_id:selected},chat_messages:messages}}}});
   if(url.endsWith('/api/v0/chat/completion')){posts++;outgoing=route.request().postDataJSON().prompt;if(failNext){failNext=false;return route.fulfill({status:503,json:{error:'synthetic-unavailable'}});}return route.fulfill({contentType:'text/event-stream',body:`event: ready\ndata: {"request_message_id":${40+posts*2},"response_message_id":${41+posts*2}}\n\nevent: finish\ndata: {}\n\nevent: close\ndata: {}\n\n`});}
   if(url.includes('/api/v0/'))return route.fulfill({json:{}});
   const visible=messages.find(m=>m.message_id===selected)!.fragments[0]!.content.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
   return route.fulfill({contentType:'text/html',body:`<!doctype html><html><body><main><article data-role="assistant" data-message-id="${selected}"><div class="ds-markdown">${visible}</div></article><textarea aria-label="Message"></textarea></main></body></html>`});
  });
  const chat=await context.newPage(),errors:string[]=[];chat.on('pageerror',e=>errors.push(e.message));await chat.goto(base.binding.chatUrl!);await chat.bringToFront();await expect(chat.locator('.dr-character-row')).toHaveCount(2,{timeout:12000});
  const rpc=(data:any)=>panel.evaluate(async({data,url})=>{const api=(globalThis as any).chrome,[tab]=await api.tabs.query({url,active:true});return api.tabs.sendMessage(tab.id,data);},{data,url:base.binding.chatUrl!}),read=async()=>(await rpc({type:'DR_STORY_REVIEW_READ',cursor:null})).data;
  expect(await rpc({type:'DR_STORY_GAME',operation:'start',manual:'stop'})).toMatchObject({ok:true});const branch=(await read()).guard.branchId;
  const send=(draft:string,fetch=false)=>chat.evaluate(async({draft,parent,fetch:useFetch})=>{const body=JSON.stringify({chat_session_id:'synthetic-a',parent_message_id:parent,prompt:draft});if(useFetch){await window.fetch('/api/v0/chat/completion',{method:'POST',body,headers:{'Content-Type':'application/json'}});return;}await new Promise<void>(resolve=>{const x=new XMLHttpRequest();x.open('POST','/api/v0/chat/completion');x.onload=()=>resolve();x.send(body);});},{draft,parent:selected,fetch});
  const records:StoryFact[]=Array.from({length:24},(_,i)=>{const text=f.s(`Лида сказала: «Предмет ${f.object} осмотрен на участке ${i}; выдача разрешена только при хранителе».`,`Lida said: “The ${f.object} was inspected at section ${i}; handover is allowed only with the custodian present.”`);return {kind:'event',text,quote:text};});
  const batches=[[promise],...Array.from({length:4},(_,i)=>records.slice(i*6,i*6+6)),f.noise.slice(0,6),f.noise.slice(6,12),[f.anchor]];
  for(const batch of batches){
   const previous=selected;await send('Continue.');const answer=batch.map(f=>f.quote).join('\n')+'<deeprole_characters>'+JSON.stringify({version:2,world:base.world.id,chat:base.binding.chatId,branch,updates:[],facts:batch})+'</deeprole_characters>';
   messages.push(message(previous+1,previous,'USER',outgoing),message(previous+2,previous+1,'ASSISTANT',answer));selected=previous+2;
   await chat.evaluate(({id,answer})=>{const row=document.querySelector('article')!;row.setAttribute('data-message-id',String(id));row.querySelector('.ds-markdown')!.textContent=answer;},{id:selected,answer});
   await expect.poll(async()=>{const data=await rows(panel),revision=data.find(r=>r.kind==='story'&&r.data.type==='revision'&&r.data.nativeMessageKey===JSON.stringify(['message',String(selected)]));return !!revision&&data.find(r=>r.kind==='world').data.sharedGame.episodeSources.includes(revision.id);},{timeout:12000}).toBe(true);
   for(let i=0;i<8;i++){const r=await read(),candidate=r.facts.find((v:any)=>!v.accepted&&!v.superseded);if(!candidate)break;expect(await rpc({type:'DR_STORY_FACT',input:{worldId:base.world.id,chatId:base.binding.chatId,guard:r.guard,eventId:candidate.eventId,text:candidate.text,accept:true}})).toMatchObject({ok:true});}
  }
  const saved=(await rows(panel)).find(r=>r.kind==='world').data.sharedGame,pages=context.pages().length;
  expect(saved.facts).toHaveLength(38);let usedColumns=false;
  // Repeated unchanged memory must remain self-contained after a failed send;
  // an HTTP receipt or a previous request never supplies a dictionary here.
  const readHints=()=>decodeStoryMemory(JSON.parse(outgoing.split('<deeprole_story_memory>')[1]!.split('</deeprole_story_memory>')[0]!.split('\n')[1]!));
  failNext=true;await send(reference);const failed=readHints();
  for(const fact of [promise,...records,f.anchor])expect(failed.some(h=>h.text===fact.text)).toBe(true);
  await send(reference);expect(readHints()).toEqual(failed);
  for(const reload of [false,true]){
   if(reload){await chat.reload();await chat.bringToFront();await expect(chat.locator('.dr-character-row')).toHaveCount(2,{timeout:12000});}
   for(const draft of [reference,paraphrase]){
    await send(draft,reload);expect(outgoing.endsWith(draft)).toBe(true);expect(outgoing).toContain('The current object reference (this/that) is NOT resolved by DeepRole.');expect(outgoing).toContain('A shared literal label is NOT an object ID');
    const block=outgoing.split('<deeprole_story_memory>')[1]!.split('</deeprole_story_memory>')[0]!,wire=JSON.parse(block.split('\n')[1]!),hints=decodeStoryMemory(wire);usedColumns||=wire.format==='deeprole-memory-columns-v1';expect(hints.length).toBeGreaterThan(8);
    for(const fact of [promise,...records,f.anchor]){const h=hints.find(h=>h.text===fact.text)!;expect(h).toBeDefined();expect(h.sourceQuote??h.text).toBe(fact.quote);expect(h.sourceRoles?.speaker?.id??h.sourceRoles?.promisor?.id).toBe(base.entities[0]!.id);expect(h.episodeSource?.revisionId).toBeTruthy();expect(h.task).toEqual(fact.task);const seed=saved.factRoleSeeds.find((v:any)=>v.binding.quote===fact.quote);expect(h.sourceRoles).toEqual(seed.binding.roles);expect(h.episodeSource?.revisionId).toBe(seed.binding.sourceRevisionId);}
   }
  }
  const after=(await rows(panel)).find(r=>r.kind==='world').data.sharedGame;
  expect(usedColumns).toBe(true);expect(after.facts).toEqual(saved.facts);expect(after.factRoleSeeds).toEqual(saved.factRoleSeeds);expect(after.episodeSources).toEqual(saved.episodeSources);expect(posts).toBe(14);expect(context.pages()).toHaveLength(pages);expect(errors).toEqual([]);
   // RP288: a real accepted-scene bridge, two separately owned identical labels,
   // a generic prefix from a terminal duty, then raw prose with NO accepted bridge.
   const cloak=f.s('старый бархатный плащ','old velvet cloak'),vest=f.s('старый бархатный жилет','old velvet waistcoat');
   const source=(body:string,owner=0,task?:StoryFact['task']):StoryFact=>{const name=base.entities[owner]!.name,text=locale==='ru'?`${name} ${owner?'сказал':'сказала'}: «${body}»`:`${name} said: “${body}”`;return {kind:task?.status==='open'?'promise':'event',text,quote:text,...(task?{task}:{})};};
   const titleA=f.s(`Я обещаю вернуть ${cloak} с биркой Л-17 после спектакля.`,`I promise to return the ${cloak} belonging to Lida after the performance.`);
   const titleB=f.s(`Я обещаю вернуть ${cloak} с биркой О-42 после фотосъёмки.`,`I promise to return the ${cloak} belonging to ${base.entities[1]!.name} after the photo session.`);
   const sameLabel=[
    source(titleA,0,{key:'rp288-return-a',title:titleA,status:'open'}),
    source(f.s(`Предмет ${cloak} с биркой Л-17 лежит в запертой гримёрной; ключ только у костюмера.`,`The ${cloak} belonging to Lida is in a locked dressing room; only the dresser holds the key.`)),
    source(f.s(`Предмет ${cloak} с биркой Л-17 теперь принимают в швейной комнате; проходная закрыта.`,`The ${cloak} belonging to Lida is now accepted in the sewing room; the gatehouse is closed.`)),
    source(f.s(`Предмет ${cloak} с биркой Л-17 почистили, но хозяйке ещё не вернули.`,`The ${cloak} belonging to Lida has been cleaned, but not returned.`)),
    source(titleB,1,{key:'rp288-return-b',title:titleB,status:'open'}),
    source(f.s(`Предмет ${cloak} с биркой О-42 лежит в чехле у фотографа.`,`The ${cloak} belonging to ${base.entities[1]!.name} is in a travel cover at the photographer’s studio.`),1),
    source(f.s(`Предмет ${cloak} с биркой О-42 ждут в понедельник у служебного входа.`,`The ${cloak} belonging to ${base.entities[1]!.name} is expected at the stage door on Monday.`),1),
    source(f.s(`Я обещала вернуть ${vest} после примерки; теперь возврат завершён.`,`I promised to return the ${vest} after the fitting; its return is now complete.`),0,{key:'rp288-completed-vest',title:f.s(`Я обещаю вернуть ${vest} после примерки.`,`I promise to return the ${vest} after the fitting.`),status:'completed'}),
   ];
   const newAnchor=source(f.s(`Тот долг — моё обещание вернуть ${cloak} с биркой Л-17 после спектакля.`,`That debt means my promise to return the ${cloak} tagged L-17 after the performance.`));
   const accept=async(batch:StoryFact[],raw='')=>{
    const previous=selected;await send('Continue.');const answer=raw+batch.map(f=>f.quote).join('\n')+'<deeprole_characters>'+JSON.stringify({version:2,world:base.world.id,chat:base.binding.chatId,branch,updates:[],facts:batch})+'</deeprole_characters>';
    // Retries above consumed native IDs even though no accepted assistant row
    // was appended. Match the ready event, or its request-frozen roster is lost.
    const requestId=40+posts*2,responseId=41+posts*2;
    messages.push(message(requestId,previous,'USER',outgoing),message(responseId,requestId,'ASSISTANT',answer));selected=responseId;
    await chat.evaluate(({id,answer})=>{const row=document.querySelector('article')!;row.setAttribute('data-message-id',String(id));row.querySelector('.ds-markdown')!.textContent=answer;},{id:selected,answer});
    await expect.poll(async()=>{const data=await rows(panel),r=data.find(r=>r.kind==='story'&&r.data.type==='revision'&&r.data.nativeMessageKey===JSON.stringify(['message',String(selected)]));return !!r&&data.find(r=>r.kind==='world').data.sharedGame.episodeSources.includes(r.id);},{timeout:12000}).toBe(true);
    for(let i=0;i<8;i++){const r=await read(),pending=r.facts.find((v:any)=>!v.accepted&&!v.superseded);if(!pending)break;expect(await rpc({type:'DR_STORY_FACT',input:{worldId:base.world.id,chatId:base.binding.chatId,guard:r.guard,eventId:pending.eventId,text:pending.text,accept:true}})).toMatchObject({ok:true});}
   };
   await accept(sameLabel.slice(0,4));await accept(sameLabel.slice(4));await accept([newAnchor]);
   const scoped=(await rows(panel)).find(r=>r.kind==='world').data.sharedGame,newReference=f.s('Напомни о том долге.','Remind me of this promise.');
   failNext=true;await send(newReference);const failedScoped=readHints();await send(newReference);expect(readHints()).toEqual(failedScoped);
   await chat.reload();await chat.bringToFront();await expect(chat.locator('.dr-character-row')).toHaveCount(2,{timeout:12000});await send(newReference,true);
   expect(outgoing.endsWith(newReference)).toBe(true);expect(outgoing).toContain('<deeprole_reference_guard>');expect(outgoing).toContain('NOT resolved by DeepRole');
   const related=readHints();
   for(const fact of sameLabel.slice(0,7)){
    const h=related.find(h=>h.text===fact.text)!;expect(h).toBeDefined();expect(h.sourceQuote??h.text).toBe(fact.quote);expect(h.task).toEqual(fact.task);
    const seed=scoped.factRoleSeeds.find((s:any)=>s.binding.quote===fact.quote);expect(h.sourceRoles).toEqual(seed.binding.roles);expect(h.episodeSource?.revisionId).toBe(seed.binding.sourceRevisionId);
   }
   expect(related.find(h=>h.task?.key==='rp288-return-a')?.sourceRoles?.promisor?.id).toBe(base.entities[0]!.id);expect(related.find(h=>h.task?.key==='rp288-return-b')?.sourceRoles?.promisor?.id).toBe(base.entities[1]!.id);
   const beforeRaw=(await rows(panel)).find(r=>r.kind==='world').data.sharedGame;expect(beforeRaw.facts).toEqual(scoped.facts);expect(beforeRaw.factRoleSeeds).toEqual(scoped.factRoleSeeds);
   const fake=f.s('Тот долг — обещание вернуть серебряный сценический шлем.','That debt means a promise to return the silver stage helmet.');
   await accept([source(f.s('Рабочий день закончился, все обсуждают завтрашнюю погоду.','The working day ended and everyone discusses tomorrow’s weather.'))],fake+'\n');
   const rawSaved=(await rows(panel)).find(r=>r.kind==='world').data.sharedGame;
   for(const useFetch of [false,true]){await send(newReference,useFetch);expect(outgoing.endsWith(newReference)).toBe(true);expect(outgoing).toContain('<deeprole_reference_guard>');expect(outgoing).toContain('NOT resolved by DeepRole');expect(readHints().some(h=>h.text.includes('silver stage helmet')||h.text.includes('серебряный сценический шлем'))).toBe(false);}
   const end=(await rows(panel)).find(r=>r.kind==='world').data.sharedGame;expect(end.facts).toEqual(rawSaved.facts);expect(end.factRoleSeeds).toEqual(rawSaved.factRoleSeeds);expect(end.episodeSources).toEqual(rawSaved.episodeSources);expect(posts).toBe(23);expect(errors).toEqual([]);
 }finally{await context.close();}
});
