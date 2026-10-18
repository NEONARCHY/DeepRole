import { chromium, expect, test } from '@playwright/test';
import path from 'node:path';
import { storyWorld } from '../fixtures/story-worlds';
import { characterRevision, EMPTY_STATUS } from '../../src/core/characters';
import {storyMessageModeText} from '../../src/core/story-message-mode-i18n';

for (const transport of ['xhr','fetch'] as const) for (const locale of ['ru', 'en'] as const) for (const mode of ['managed', 'legacy', 'manual','cards-off','silent-setting'] as const) test(`installed bracket OOC ${transport}/${locale}/${mode}: read-only POST, malicious metadata, reload, next game turn`, async ({}, info) => {
  test.skip(info.project.name !== 'chromium', 'Installed Edge MV3 on synthetic DeepSeek, no account'); test.setTimeout(120000);
  const extension = path.resolve('.output/chrome-mv3');
  const context = await chromium.launchPersistentContext('', { channel: 'msedge', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const diagnostics:string[]=[];
  context.on('console',message=>{if(['error','warning'].includes(message.type()))diagnostics.push(`${message.type()}: ${message.text()}`);});
  context.on('page',page=>page.on('pageerror',error=>diagnostics.push(`pageerror: ${error.stack??error.message}`)));
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker'), panel = await context.newPage();
    await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`); await expect(panel.locator('.onboarding')).toBeVisible();
    // Legacy cases enable the option through the real editor AFTER the chat
    // has loaded. A pre-seeded boolean alone misses UI -> live snapshot races.
    const f = storyWorld(locale, 2); f.world.contextBudget = 6000; f.world.bracketedOoc=mode!=='legacy'&&mode!=='silent-setting';
    await panel.evaluate(async ({ records, locale, mode }) => {
      await new Promise<void>((resolve, reject) => { const open = indexedDB.open('deeprole'); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction('records', 'readwrite'); for (const row of records) tx.objectStore('records').put({ pk: `${row.kind}:${row.id}`, ...row, updatedAt: Date.now() }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; });
      await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, floatingPanelWidth: 200, automaticMetadataRepair: false, showChatContextMeter: false,characterSheetsEnabled:mode!=='cards-off' }, deeprole_library_change: { token: 'ooc-seed' } });
    }, { records: f.records, locale, mode });
    const msg = (id: number, parent: number | null, role: string, content: string) => ({ message_id: id, parent_id: parent, role, status: 'FINISHED', has_pending_fragment: false, fragments: [{ type: role === 'USER' ? 'REQUEST' : 'RESPONSE', content }] });
    const messages = [msg(40, null, 'USER', 'Begin'), msg(41, 40, 'ASSISTANT', 'Workshop')]; let selected = 41; const posts: string[] = [];
    let historyGate: Promise<void> | undefined, releaseHistory: (() => void) | undefined, heldReads = 0;
    await context.route('https://chat.deepseek.com/**', async route => {
      const url = route.request().url();
      if (url.includes('/api/v0/chat/history_messages')) { if(historyGate){heldReads++;await historyGate;} return route.fulfill({ json: { code: 0, data: { biz_code: 0, biz_data: { chat_session: { id: f.binding.chatId, current_message_id: selected }, chat_messages: messages } } } }); }
      if (url.endsWith('/api/v0/chat/completion')) { posts.push(route.request().postDataJSON().prompt); return route.fulfill({ contentType: 'text/event-stream', body: `event: ready\ndata: {"request_message_id":${40 + posts.length * 2},"response_message_id":${41 + posts.length * 2}}\n\nevent: finish\ndata: {}\n\nevent: close\ndata: {}\n\n` }); }
      if (url.includes('/api/v0/')) return route.fulfill({ json: {} });
      // A reload must render the selected native reply, not the initial fixture.
      const reply = messages.find(message => message.message_id === selected)!;
      const text = reply.fragments[0]!.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body><main><div data-virtual-list-item-key="${selected}"><article data-role="assistant"><div class="ds-markdown">${text}</div></article></div><textarea aria-label="Message"></textarea></main></body></html>` });
    });
    const chat = await context.newPage(); await chat.goto(f.binding.chatUrl); await chat.bringToFront();
    await expect.poll(()=>chat.evaluate(()=>document.documentElement.dataset.deeproleContext??''),{timeout:12000}).not.toBe('');
    await expect(chat.locator('.dr-character-row')).toHaveCount(mode==='cards-off'?0:2, { timeout: 12000 });
    const rpc = (data: any) => panel.evaluate(async ({ data, url }) => { const api = (globalThis as any).chrome, [tab] = await api.tabs.query({ url }); return api.tabs.sendMessage(tab.id, data); }, { data, url: f.binding.chatUrl });
    const records = () => panel.evaluate(() => new Promise<any[]>((resolve, reject) => { const open = indexedDB.open('deeprole'); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction('records'), read = tx.objectStore('records').getAll(); read.onsuccess = () => resolve(read.result); tx.oncomplete = () => db.close(); }; }));
    const setStoredBracketPolicy=(enabled:boolean)=>panel.evaluate(({worldId,enabled})=>new Promise<void>((resolve,reject)=>{
      const open=indexedDB.open('deeprole');open.onerror=()=>reject(open.error);
      open.onsuccess=()=>{const db=open.result,tx=db.transaction('records','readwrite'),store=tx.objectStore('records'),read=store.get(`world:${worldId}`);
        read.onsuccess=()=>{const row=read.result;row.data={...row.data,bracketedOoc:enabled};store.put(row);};
        tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
    }),{worldId:f.world.id,enabled});
    if(mode==='legacy'){
      const l=(ru:string,en:string)=>locale==='ru'?ru:en;
      await panel.reload();
      await panel.getByRole('button',{name:l('Миры','Worlds'),exact:true}).click();
      await panel.getByRole('button',{name:new RegExp('^'+l('Библиотека мира:','World library:'))}).click();
      await panel.getByRole('menuitemradio',{name:f.world.name,exact:true}).click();
      await panel.getByRole('button',{name:l('Мир и профили','World & profiles'),exact:true}).click();
      await panel.locator('section.rp-card').filter({has:panel.getByRole('heading',{name:f.world.name,exact:true})}).getByRole('button',{name:l('Изменить','Edit'),exact:true}).click();
      const editor=panel.locator('form.rp-editor');
      await editor.getByRole('switch',{name:storyMessageModeText(locale,'label'),exact:true}).check();
      await editor.getByRole('button',{name:l('Сохранить','Save'),exact:true}).click();
      await expect(editor).toHaveCount(0);
      expect((await records()).find(r=>r.kind==='world'&&r.id===f.world.id).data.bracketedOoc).toBe(true);
      await chat.bringToFront();
    }
    if(mode==='silent-setting'){
      // Simulate a missed/delayed library notification. The request must use
      // the saved per-world policy, not a possibly stale live preview snapshot.
      await setStoredBracketPolicy(true);
    }
    const tracked=mode!=='legacy'&&mode!=='cards-off'&&mode!=='silent-setting';
    if (tracked) expect(await rpc({ type: 'DR_STORY_GAME', operation: 'start', manual: 'stop' })).toMatchObject({ ok: true });
    if (mode === 'manual') expect(await rpc({ type: 'DR_STORY_GAME', operation: 'out-of-character', manual: 'stop' })).toMatchObject({ ok: true });
    const before = await records(), scene = before.find(r => r.kind === 'binding').data.characterScenes[f.world.id], people = before.filter(r => r.kind === 'entity');
    const draft = locale === 'ru' ? '[Напомни, где ключ от часов.]' : '[Where is the clock key?]';
    await chat.locator('textarea').fill(draft);
    const send=(draft:string,parent:number)=>chat.evaluate(async ({draft,parent,transport})=>{
      const body=JSON.stringify({chat_session_id:'synthetic-a',parent_message_id:parent,prompt:draft});
      if(transport==='fetch'){await(await fetch('/api/v0/chat/completion',{method:'POST',body})).text();return;}
      await new Promise<void>(resolve=>{const xhr=new XMLHttpRequest();xhr.open('POST','/api/v0/chat/completion');xhr.onload=()=>resolve();xhr.send(body);});
    },{draft,parent,transport});
    await send(draft,41);
    expect(posts).toHaveLength(1); expect(posts[0]).toContain('<deeprole_read_only>'); expect(posts[0]).toContain(f.entry.content); expect(posts[0]).not.toContain('<deeprole_story_update_mode>'); expect(posts[0]).not.toContain('<deeprole_choice_mode');
    await expect(chat.locator('textarea')).toHaveValue(draft);
    expect(posts[0]!.endsWith('\n\n[User message]\n'+draft)).toBe(true);
    const captured = (await records()).find(r => r.kind === 'dispatch').data; expect(captured.purpose).toBe('out-of-character');
    expect(captured.originalDraft).toBe(draft);
    // Do not navigate away while the page is still persisting the finish event.
    await expect.poll(async () => { const c=(await records()).find(r=>r.kind==='dispatch').data; return [c.delivery?.status,c.wire.phase,c.wire.sawFinish]; }, {timeout:15000}).toEqual(transport==='fetch'?['accepted','waiting',false]:['accepted','closed',true]);
    if(mode==='silent-setting')await setStoredBracketPolicy(false);
    const branch = !tracked ? undefined : (await rpc({ type: 'DR_STORY_REVIEW_READ', cursor: null })).data.guard.branchId;
    // Deliberately ignore the read-only instruction: no request ID in legacy
    // payload. Durable native ownership must block effects, not model obedience.
    const payload = !tracked ? { world: f.world.id, chat: f.binding.chatId, base: characterRevision(f.entities, scene), present: [], updates: [{ id: 'person-1', state: { ...EMPTY_STATUS, condition: 'OOC MUST NOT CHANGE SCENE' } }] } : { version: 2, world: f.world.id, chat: f.binding.chatId, branch, present: [], updates: [{ id: 'person-1', state: { condition: { op: 'set', value: 'OOC MUST NOT CHANGE SCENE' } } }], facts: [{ kind: 'event', text: 'MUST NOT BECOME MEMORY', quote: 'Hypothetical event.', risk: 'ordinary' }] };
    const inventedChoices='<deeprole_choices>'+JSON.stringify({version:1,options:['positive','neutral','negative','surprise'].map(kind=>({kind,label:kind,text:'This must not be offered after OOC.'}))})+'</deeprole_choices>';
    const answer = 'Hypothetical event.<deeprole_characters>' + JSON.stringify(payload) + '</deeprole_characters>'+inventedChoices;
    messages.push(msg(42, 41, 'USER', posts[0]!), msg(43, 42, 'ASSISTANT', answer)); selected = 43;
    const delayedProof=transport==='fetch'&&mode==='legacy';
    if(delayedProof){
      historyGate=new Promise<void>(resolve=>{releaseHistory=resolve;});
      await chat.evaluate(()=>{
        (window as any).__choiceFlashes=0;
        const selector='[data-deeprole-choices-host], [data-deeprole-choices-recovery]';
        new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node instanceof Element&&(node.matches(selector)||node.querySelector(selector)))(window as any).__choiceFlashes++;}).observe(document.body,{childList:true,subtree:true});
      });
    }
    await chat.evaluate(answer => { const article = document.querySelector('article')!; article.parentElement!.setAttribute('data-virtual-list-item-key', '43'); article.querySelector('.ds-markdown')!.textContent = answer; }, answer);
    if(delayedProof){
      try{
        await expect.poll(()=>heldReads,{timeout:10000}).toBeGreaterThan(0);
        // Deliberately hold native proof beyond the ordinary reply-settle delay.
        await chat.waitForTimeout(1600);
        expect(await chat.evaluate(()=>(window as any).__choiceFlashes)).toBe(0);
        await expect(chat.locator('[data-deeprole-choices-recovery], [data-deeprole-choices-host]')).toHaveCount(0);
      }finally{releaseHistory?.();historyGate=undefined;}
    }
    if (tracked) await expect.poll(async () => (await rpc({ type: 'DR_STORY_REVIEW_READ', cursor: null })).data.entries.filter((e: any) => e.role === 'assistant').length,{timeout:15000}).toBe(1);
    const check = async () => { const after = await records(), binding = after.find(r => r.kind === 'binding').data, current = binding.characterScenes[f.world.id]; expect(after.find(r=>r.kind==='world'&&r.id===f.world.id).data.bracketedOoc).toBe(mode!=='silent-setting'); expect(current.presentIds).toEqual(scene.presentIds); expect(current.states).toEqual(scene.states); expect(current.partnerIds).toEqual(scene.partnerIds); expect(current.partnerId).toEqual(scene.partnerId); expect(after.filter(r => r.kind === 'entity')).toEqual(people); expect(after.filter(r => r.kind === 'story' && r.data.type === 'event')).toHaveLength(0); expect(binding.nextStoryMessageMode).toBeUndefined(); };
    if(mode!=='cards-off')await expect(chat.locator('.dr-character-status')).toHaveText(locale==='ru'?'Вне игры — состояние сцены не меняется.':'Out of character — scene state is unchanged.',{timeout:15000});
    else await expect(chat.locator('[data-deeprole-choices-recovery]')).toHaveCount(0,{timeout:15000});
    await chat.reload(); await expect(chat.locator('main > [data-virtual-list-item-key]')).toHaveAttribute('data-virtual-list-item-key','43'); await expect.poll(()=>chat.evaluate(()=>document.documentElement.dataset.deeproleContext??''),{timeout:12000}).not.toBe(''); await expect(chat.locator('.dr-character-row')).toHaveCount(mode==='cards-off'?0:2, { timeout: 12000 }); await check();
    if(mode!=='cards-off')await expect(chat.locator('.dr-character-status')).toHaveText(locale==='ru'?'Вне игры — состояние сцены не меняется.':'Out of character — scene state is unchanged.',{timeout:12000});
    await expect(chat.locator('[data-deeprole-choices-recovery]')).toHaveCount(0);
    await expect(chat.locator('[data-deeprole-choices-payload]')).not.toHaveCount(0);
    await expect(chat.locator('[data-deeprole-choices-host]')).toHaveCount(0);
    if(mode!=='cards-off')expect(await chat.locator('.dr-character-status').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await chat.screenshot({path:info.outputPath(`ooc-${locale}-${mode}.png`)});
    if (tracked) { const revisions = (await records()).filter(r => r.kind === 'story' && r.data.type === 'revision'); expect(revisions).toHaveLength(2); expect(revisions.every(r => r.data.storyPurpose === 'out-of-character')).toBe(true); }
    if(mode==='silent-setting')await setStoredBracketPolicy(true);
    const gameDraft=locale==='ru'?'Я открываю дверь. [Опиши подробнее.]':'I open the door. [Describe slowly.]';
    await chat.locator('textarea').fill(gameDraft);
    // Ordinary gameplay remains the verified XHR write path even when the prior
    // OOC reply had no SSE evidence; UI fallback must not grant new write rights.
    await chat.evaluate(gameDraft => new Promise<void>(resolve => { const xhr = new XMLHttpRequest(); xhr.open('POST', '/api/v0/chat/completion'); xhr.onload = () => resolve(); xhr.send(JSON.stringify({ chat_session_id: 'synthetic-a', parent_message_id: 43, prompt: gameDraft })); }),gameDraft);
    expect(posts).toHaveLength(2); expect(posts[1]).not.toContain('<deeprole_read_only>'); expect(posts[1]).toContain('<deeprole_bracket_notes>'); expect(posts[1]!.endsWith('\n\n[User message]\n'+gameDraft)).toBe(true);
    if(mode==='cards-off')expect(posts[1]).not.toContain('<deeprole_character_mode>');else expect(posts[1]).toContain('<deeprole_character_mode>');
    expect(posts[1]).toContain('<deeprole_choice_mode');
    expect((await records()).filter(r => r.kind === 'dispatch').map(r => r.data.purpose).sort()).toEqual(['out-of-character', 'user-turn']);
    const currentScene = (await records()).find(r => r.kind === 'binding').data.characterScenes[f.world.id];
    const gamePayload = !tracked ? { world: f.world.id, chat: f.binding.chatId, base: characterRevision(f.entities, currentScene), present: ['person-1','person-2'], updates: [{ id: 'person-1', state: { ...EMPTY_STATUS, condition: 'Ordinary game still works' } }] } : { version: 2, world: f.world.id, chat: f.binding.chatId, branch, present: ['person-1','person-2'], updates: [{ id: 'person-1', state: { condition: { op: 'set', value: 'Ordinary game still works' } } }] };
    const gameAnswer = 'The door opens.<deeprole_characters>' + JSON.stringify(gamePayload) + '</deeprole_characters>';
    messages.push(msg(44,43,'USER',posts[1]!),msg(45,44,'ASSISTANT',gameAnswer)); selected = 45;
    await chat.evaluate(answer => { const article = document.querySelector('article')!; article.parentElement!.setAttribute('data-virtual-list-item-key','45'); article.querySelector('.ds-markdown')!.textContent = answer; },gameAnswer);
    if(mode!=='cards-off'){
      await expect.poll(async () => (await records()).find(r => r.kind === 'binding').data.characterScenes[f.world.id].states['person-1'].condition, { timeout: 15000 }).toBe('Ordinary game still works');
      await expect(chat.locator('.dr-character-status')).toHaveText(locale==='ru'?'Обновлено после ответа':'Updated after reply');
    }
    await expect(chat.locator('[data-deeprole-choices-recovery]')).toHaveCount(1,{timeout:10000});
    if(mode==='silent-setting'){
      await setStoredBracketPolicy(false);
      await chat.locator('textarea').fill(draft);
      await send(draft,45);
      expect(posts).toHaveLength(3);expect(posts[2]).not.toContain('<deeprole_read_only>');expect(posts[2]).not.toContain('<deeprole_bracket_notes>');expect(posts[2]).toContain('<deeprole_choice_mode');
      const after=await records();expect(after.find(r=>r.kind==='dispatch'&&r.id===captured.id).data.purpose).toBe('out-of-character');
      expect(after.filter(r=>r.kind==='dispatch').map(r=>r.data.purpose).sort()).toEqual(['out-of-character','user-turn','user-turn']);
    }
  } finally {
    if(info.status!==info.expectedStatus)await info.attach('synthetic-browser-diagnostics',{body:diagnostics.join('\n'),contentType:'text/plain'});
    await context.close();
  }
});
