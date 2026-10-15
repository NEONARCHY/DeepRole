import { chromium, expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { budgetWorld } from '../fixtures/story-budget-priority';
import { decodeStoryMemory } from '../../src/core/story-memory-transport';
import {gameMemoryCoverageText} from '../../src/core/game-memory-coverage-i18n';
const rows = (page: Page) => page.evaluate(() => new Promise<any[]>((resolve, reject) => {
  const open = indexedDB.open('deeprole'); open.onerror = () => reject(open.error); open.onsuccess = () => {
    const db = open.result, tx = db.transaction('records'), read = tx.objectStore('records').getAll();
    read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error); tx.oncomplete = () => db.close();
  };
}));
for (const locale of ['ru', 'en'] as const) test(`installed adaptive memory ${locale}: 12 whole sources POST/reload and unchanged canon`, async ({}, info) => {
  test.skip(info.project.name !== 'chromium', 'Synthetic installed Edge MV3, not a personal account'); test.setTimeout(120000);
  const context = await chromium.launchPersistentContext('', { channel: 'msedge', headless: true, args: ['--disable-extensions-except=' + path.resolve('.output/chrome-mv3'), '--load-extension=' + path.resolve('.output/chrome-mv3'), '--host-resolver-rules=MAP chat.deepseek.com ~NOTFOUND'] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker'), panel = await context.newPage();
    await panel.goto('chrome-extension://' + new URL(worker.url()).host + '/sidepanel.html'); await expect(panel.locator('.onboarding')).toBeVisible();
    const f = budgetWorld(locale), base = f.base; base.world.contextBudget = 6000;
    // Native proposals need exact literal titles/values in THIS reply. The
    // independent retrieval corpus is unchanged; use grounded synthetic data.
    for (const fact of f.records) {
      if (fact.task?.status === 'open') fact.task.title = f.s('сверить журнал только после разрешения хранителя', 'check the register only after the custodian gives permission');
      if (fact.task?.status === 'cancelled') delete fact.task;
      if (fact.claim) fact.claim.value = f.s('соловей', 'nightingale');
    }
    await panel.evaluate(async ({ records, locale }) => {
      await new Promise<void>((resolve, reject) => { const open = indexedDB.open('deeprole'); open.onerror = () => reject(open.error); open.onsuccess = () => {
        const db = open.result, tx = db.transaction('records', 'readwrite'); for (const r of records) tx.objectStore('records').put({ pk: r.kind + ':' + r.id, ...r, updatedAt: Date.now() });
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      }; });
      await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, showChatContextMeter: false, automaticMetadataRepair: false }, deeprole_library_change: { token: 'budget-priority-seed' } });
    }, { records: base.records, locale });
    const message = (id: number, parent: number | null, role: string, content: string) => ({ message_id: id, parent_id: parent, role, status: 'FINISHED', has_pending_fragment: false, fragments: [{ type: role === 'USER' ? 'REQUEST' : 'RESPONSE', content }] });
    const messages = [message(40, null, 'USER', 'Begin'), message(41, 40, 'ASSISTANT', 'Workshop')]; let selected = 41, outgoing = '', posts = 0;
    await context.route('https://chat.deepseek.com/**', route => {
      const url = route.request().url();
      if (url.includes('/api/v0/chat/history_messages')) return route.fulfill({ json: { code: 0, data: { biz_code: 0, biz_data: { chat_session: { id: base.binding.chatId, current_message_id: selected }, chat_messages: messages } } } });
      if (url.endsWith('/api/v0/chat/completion')) { posts++; outgoing = route.request().postDataJSON().prompt; return route.fulfill({ contentType: 'text/event-stream', body: `event: ready\ndata: {"request_message_id":${40 + posts * 2},"response_message_id":${41 + posts * 2}}\n\nevent: finish\ndata: {}\n\nevent: close\ndata: {}\n\n` }); }
      if (url.includes('/api/v0/')) return route.fulfill({ json: {} });
      // A reload must show the SAME selected reply as native history. Resetting
      // the DOM to root41 while the API selects51 fabricates a branch change.
      const visible = messages.find(m => m.message_id === selected)!.fragments[0]!.content.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body><main><article data-role="assistant" data-message-id="${selected}"><div class="ds-markdown">${visible}</div></article><textarea aria-label="Message"></textarea></main></body></html>` });
    });
    const chat = await context.newPage(), errors: string[] = []; chat.on('pageerror', e => errors.push(e.message));
    await chat.goto(base.binding.chatUrl!); await chat.bringToFront(); await expect(chat.locator('.dr-character-row')).toHaveCount(2, { timeout: 12000 });
    const rpc = (data: any) => panel.evaluate(async ({ data, url }) => { const api = (globalThis as any).chrome, [tab] = await api.tabs.query({ url, active: true }); return api.tabs.sendMessage(tab.id, data); }, { data, url: base.binding.chatUrl! });
    const read = async () => (await rpc({ type: 'DR_STORY_REVIEW_READ', cursor: null })).data;
    expect(await rpc({ type: 'DR_STORY_GAME', operation: 'start', manual: 'stop' })).toMatchObject({ ok: true }); const branch = (await read()).guard.branchId;
    const send = (draft: string) => chat.evaluate(({ draft, parent }) => new Promise<void>(resolve => { const x = new XMLHttpRequest(); x.open('POST', '/api/v0/chat/completion'); x.onload = () => resolve(); x.send(JSON.stringify({ chat_session_id: 'synthetic-a', parent_message_id: parent, prompt: draft })); }), { draft, parent: selected });
    const batches = [f.records.slice(0, 8), f.records.slice(8), ...Array.from({ length: 3 }, (_, i) => f.discussions.slice(i * 8, i * 8 + 8))];
    for (const batch of batches) {
      const previous = selected; await send('Continue.'); const answer = batch.map(f => f.quote).join('\n') + '<deeprole_characters>' + JSON.stringify({ version: 2, world: base.world.id, chat: base.binding.chatId, branch, updates: [], facts: batch }) + '</deeprole_characters>';
      messages.push(message(previous + 1, previous, 'USER', outgoing), message(previous + 2, previous + 1, 'ASSISTANT', answer)); selected = previous + 2;
      await chat.evaluate(({ id, answer }) => { const row = document.querySelector('article')!; row.setAttribute('data-message-id', String(id)); row.querySelector('.ds-markdown')!.textContent = answer; }, { id: selected, answer });
      await expect.poll(async () => { const r = await read(); return batch.every(f => (r.facts ?? []).some((v: any) => v.text === f.text)); }, { timeout: 12000 }).toBe(true);
      // The final noise batch repeats already accepted text. Matching text
      // alone can resolve the wait BEFORE that reply is recorded. Wait for
      // this exact selected native source before taking the immutable baseline.
      await expect.poll(async () => {
        const data = await rows(panel), revision = data.find(r => r.kind === 'story' && r.data.type === 'revision' && r.data.nativeMessageKey === JSON.stringify(['message', String(selected)]));
        return !!revision && data.find(r => r.kind === 'world').data.sharedGame.episodeSources.includes(revision.id);
      }, { timeout: 12000 }).toBe(true);
      for (let i = 0; i < 8; i++) { const r = await read(), candidate = r.facts.find((v: any) => !v.accepted && !v.superseded); if (!candidate) break; expect(await rpc({ type: 'DR_STORY_FACT', input: { worldId: base.world.id, chatId: base.binding.chatId, guard: r.guard, eventId: candidate.eventId, text: candidate.text, accept: true } })).toMatchObject({ ok: true }); }
    }
    const saved = (await rows(panel)).find(r => r.kind === 'world').data.sharedGame, pages = context.pages().length;
    for (const reload of [false, true]) {
      if (reload) { await chat.reload(); await chat.bringToFront(); await expect(chat.locator('.dr-character-row')).toHaveCount(2, { timeout: 12000 }); }
      for (const draft of [f.dual, f.s('Я ', 'I ') + f.dual, '**' + f.dual + '**']) {
        await send(draft);
        const block = outgoing.split('<deeprole_story_memory>')[1]!.split('</deeprole_story_memory>')[0]!, hints = decodeStoryMemory(JSON.parse(block.split('\n')[1]!));
        expect(outgoing.endsWith(draft)).toBe(true); expect(hints.length).toBeGreaterThan(8);
        for (const fact of f.records) { const h = hints.find(h => h.text === fact.text)!; expect(h).toBeDefined(); expect(h.sourceQuote ?? h.text).toBe(fact.quote); expect(h.task).toEqual(fact.task); expect(h.claim).toEqual(fact.claim); expect(h.episodeSource?.revisionId).toBeTruthy(); }
        // A previous unrelated anchor may stay protected. Repetitions of ALL
        // requested objects must yield to their complete substantive sources.
        expect(hints.some(h => f.discussions.some(fact => fact.text === h.text))).toBe(false);

      }
      await send(f.s('Что Роман сказал у часов?', 'What did Roman say by the clock?'));
      expect(outgoing.endsWith(f.s('Что Роман сказал у часов?', 'What did Roman say by the clock?'))).toBe(true);
    }
    // RP274: the live content controller exports preparation diagnostics over
    // its existing page-state channel, never in the actual completion prompt.
    await chat.getByRole('textbox',{name:'Message'}).fill(f.dual);
    const pageState=()=>rpc({type:'DR_GET_PAGE_STATE'});
    await expect.poll(async()=>(await pageState()).selection.memoryCoverage?.kind).toBe('complete');
    const normal=(await pageState()).selection.contextReport;
    await panel.evaluate(({worldId,budget})=>new Promise<void>((resolve,reject)=>{const open=indexedDB.open('deeprole');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('records','readwrite'),store=tx.objectStore('records'),read=store.get('world:'+worldId);read.onsuccess=()=>{read.result.data.contextBudget=budget;store.put(read.result);};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};}),{worldId:base.world.id,budget:normal.required+24});
    expect(await rpc({type:'DR_DATA_CHANGED'})).toMatchObject({ok:true});
    await expect.poll(async()=>(await pageState()).selection.memoryCoverage?.kind).toBe('budget');
    await expect(chat.locator('.dr-game-memory-notice')).toContainText(gameMemoryCoverageText(locale).budgetTitle);
    await expect(panel.locator('.dr-game-memory-notice')).toContainText(gameMemoryCoverageText(locale).budgetTitle);
    await expect(chat.getByRole('textbox',{name:'Message'})).toHaveValue(f.dual);
    await expect(chat.getByRole('dialog')).toHaveCount(0);
    await send(f.dual);expect(outgoing.endsWith(f.dual)).toBe(true);
    expect(outgoing).not.toContain('memoryCoverage');expect(outgoing).not.toContain(gameMemoryCoverageText(locale).budgetTitle);
    // Use a neutral unsupported greeting. Personal references add an existing
    // mandatory ambiguity guard, which can legitimately overflow this tiny
    // budget and must keep the required-overflow warning rather than clear it.
    await chat.getByRole('textbox',{name:'Message'}).fill(f.s('привет','hello'));
    await expect.poll(async()=>(await pageState()).selection.memoryCoverage?.kind).toBe('unverified');
    await expect(panel.locator('.dr-game-memory-notice')).toHaveCount(0);
    await chat.reload();await chat.bringToFront();await expect(chat.locator('.dr-character-row')).toHaveCount(2,{timeout:12000});await chat.getByRole('textbox',{name:'Message'}).fill(f.dual);
    await expect.poll(async()=>(await pageState()).selection.memoryCoverage?.kind).toBe('budget');
    await expect(chat.locator('.dr-game-memory-notice')).toContainText(gameMemoryCoverageText(locale).budgetTitle);
    const after = (await rows(panel)).find(r => r.kind === 'world').data.sharedGame;
    if (JSON.stringify(after.episodeSources) !== JSON.stringify(saved.episodeSources)) await info.attach('synthetic-episode-drift', { body: JSON.stringify({ saved: saved.episodeSources, after: after.episodeSources, records: await rows(panel) }), contentType: 'application/json' });
    expect(after.facts).toEqual(saved.facts); expect(after.factRoleSeeds).toEqual(saved.factRoleSeeds); expect(after.episodeSources).toEqual(saved.episodeSources);
    expect(context.pages()).toHaveLength(pages); expect(errors).toEqual([]); expect(posts).toBe(14);
  } finally { await context.close(); }
});
