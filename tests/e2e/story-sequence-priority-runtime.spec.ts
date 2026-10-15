import { chromium, expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { sequenceWorld } from '../fixtures/story-sequence-priority';
import { decodeStoryMemory } from '../../src/core/story-memory-transport';
const rows = (page: Page) => page.evaluate(() => new Promise<any[]>((resolve, reject) => {
  const open = indexedDB.open('deeprole'); open.onerror = () => reject(open.error); open.onsuccess = () => {
    const db = open.result, tx = db.transaction('records'), read = tx.objectStore('records').getAll();
    read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error); tx.oncomplete = () => db.close();
  };
}));
for (const locale of ['ru', 'en'] as const) test(`installed sequence priority ${locale}: short/dual/triple actions POST/reload and unchanged canon`, async ({}, info) => {
  test.skip(info.project.name !== 'chromium', 'Synthetic installed Edge MV3, not a personal account'); test.setTimeout(120000);
  const context = await chromium.launchPersistentContext('', { channel: 'msedge', headless: true, args: ['--disable-extensions-except=' + path.resolve('.output/chrome-mv3'), '--load-extension=' + path.resolve('.output/chrome-mv3'), '--host-resolver-rules=MAP chat.deepseek.com ~NOTFOUND'] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker'), panel = await context.newPage();
    await panel.goto('chrome-extension://' + new URL(worker.url()).host + '/sidepanel.html'); await expect(panel.locator('.onboarding')).toBeVisible();
    const f = sequenceWorld(locale), base = f.base; base.world.contextBudget = 6000;
    await panel.evaluate(async ({ records, locale }) => {
      await new Promise<void>((resolve, reject) => { const open = indexedDB.open('deeprole'); open.onerror = () => reject(open.error); open.onsuccess = () => {
        const db = open.result, tx = db.transaction('records', 'readwrite'); for (const r of records) tx.objectStore('records').put({ pk: r.kind + ':' + r.id, ...r, updatedAt: Date.now() });
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      }; });
      await (globalThis as any).chrome.storage.local.set({ deeprole_settings: { locale, onboardingComplete: true, showChatContextMeter: false, automaticMetadataRepair: false }, deeprole_library_change: { token: 'sequence-priority-seed' } });
    }, { records: base.records, locale });
    const message = (id: number, parent: number | null, role: string, content: string) => ({ message_id: id, parent_id: parent, role, status: 'FINISHED', has_pending_fragment: false, fragments: [{ type: role === 'USER' ? 'REQUEST' : 'RESPONSE', content }] });
    const messages = [message(40, null, 'USER', 'Begin'), message(41, 40, 'ASSISTANT', 'Workshop')]; let selected = 41, outgoing = '', posts = 0;
    await context.route('https://chat.deepseek.com/**', route => {
      const url = route.request().url();
      if (url.includes('/api/v0/chat/history_messages')) return route.fulfill({ json: { code: 0, data: { biz_code: 0, biz_data: { chat_session: { id: base.binding.chatId, current_message_id: selected }, chat_messages: messages } } } });
      if (url.endsWith('/api/v0/chat/completion')) { posts++; outgoing = route.request().postDataJSON().prompt; return route.fulfill({ contentType: 'text/event-stream', body: `event: ready\ndata: {"request_message_id":${40 + posts * 2},"response_message_id":${41 + posts * 2}}\n\nevent: finish\ndata: {}\n\nevent: close\ndata: {}\n\n` }); }
      if (url.includes('/api/v0/')) return route.fulfill({ json: {} });
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><main><article data-role="assistant" data-message-id="41"><div class="ds-markdown">Workshop</div></article><textarea aria-label="Message"></textarea></main></body></html>' });
    });
    const chat = await context.newPage(), errors: string[] = []; chat.on('pageerror', e => errors.push(e.message));
    await chat.goto(base.binding.chatUrl!); await chat.bringToFront(); await expect(chat.locator('.dr-character-row')).toHaveCount(2, { timeout: 12000 });
    const rpc = (data: any) => panel.evaluate(async ({ data, url }) => { const api = (globalThis as any).chrome, [tab] = await api.tabs.query({ url, active: true }); return api.tabs.sendMessage(tab.id, data); }, { data, url: base.binding.chatUrl! });
    const read = async () => (await rpc({ type: 'DR_STORY_REVIEW_READ', cursor: null })).data;
    expect(await rpc({ type: 'DR_STORY_GAME', operation: 'start', manual: 'stop' })).toMatchObject({ ok: true }); const branch = (await read()).guard.branchId;
    const send = (draft: string) => chat.evaluate(({ draft, parent }) => new Promise<void>(resolve => { const x = new XMLHttpRequest(); x.open('POST', '/api/v0/chat/completion'); x.onload = () => resolve(); x.send(JSON.stringify({ chat_session_id: 'synthetic-a', parent_message_id: parent, prompt: draft })); }), { draft, parent: selected });
    const batches = [f.records.slice(0, 4), f.records.slice(4), ...Array.from({ length: 5 }, (_, i) => f.discussions.slice(i * 8, i * 8 + 8))];
    for (const batch of batches) {
      const previous = selected; await send('Continue.'); const answer = batch.map(f => f.quote).join('\n') + '<deeprole_characters>' + JSON.stringify({ version: 2, world: base.world.id, chat: base.binding.chatId, branch, updates: [], facts: batch }) + '</deeprole_characters>';
      messages.push(message(previous + 1, previous, 'USER', outgoing), message(previous + 2, previous + 1, 'ASSISTANT', answer)); selected = previous + 2;
      await chat.evaluate(({ id, answer }) => { const row = document.querySelector('article')!; row.setAttribute('data-message-id', String(id)); row.querySelector('.ds-markdown')!.textContent = answer; }, { id: selected, answer });
      await expect.poll(async () => { const r = await read(); return batch.every(f => (r.facts ?? []).some((v: any) => v.text === f.text)); }, { timeout: 12000 }).toBe(true);
      for (let i = 0; i < 8; i++) { const r = await read(), candidate = r.facts.find((v: any) => !v.accepted && !v.superseded); if (!candidate) break; expect(await rpc({ type: 'DR_STORY_FACT', input: { worldId: base.world.id, chatId: base.binding.chatId, guard: r.guard, eventId: candidate.eventId, text: candidate.text, accept: true } })).toMatchObject({ ok: true }); }
    }
    const saved = (await rows(panel)).find(r => r.kind === 'world').data.sharedGame, pages = context.pages().length;
    for (const reload of [false, true]) {
      if (reload) { await chat.reload(); await chat.bringToFront(); await expect(chat.locator('.dr-character-row')).toHaveCount(2, { timeout: 12000 }); }
      for (const draft of [f.dual, f.triple, f.s('открываю дверь и достаю ключ', 'open the door and take the key')]) {
        await send(draft);
        const block = outgoing.split('<deeprole_story_memory>')[1]!.split('</deeprole_story_memory>')[0]!, hints = decodeStoryMemory(JSON.parse(block.split('\n')[1]!));
        expect(outgoing.endsWith(draft)).toBe(true); expect(hints.length).toBeLessThanOrEqual(8);
        for (const fact of f.records.slice(0, draft === f.triple ? 7 : 6)) { const h = hints.find(h => h.text === fact.text)!; expect(h).toBeDefined(); expect(h.sourceQuote ?? h.text).toBe(fact.quote); expect(h.task).toEqual(fact.task); expect(h.claim).toEqual(fact.claim); expect(h.episodeSource?.revisionId).toBeTruthy(); }
        // A previous unrelated anchor may stay protected. Repetitions of ALL
        // requested objects must yield to their complete substantive sources.
        expect(hints.some(h => f.discussions.some(fact => fact.text === h.text && (draft === f.triple || fact.text.includes(f.first) || fact.text.includes(f.second))))).toBe(false);

      }
      await send(f.s('Что Денис сказал у башни?', 'What did Denis say by the tower?'));
      expect(outgoing.endsWith(f.s('Что Денис сказал у башни?', 'What did Denis say by the tower?'))).toBe(true);
    }
    const after = (await rows(panel)).find(r => r.kind === 'world').data.sharedGame;
    expect(after.facts).toEqual(saved.facts); expect(after.factRoleSeeds).toEqual(saved.factRoleSeeds); expect(after.episodeSources).toEqual(saved.episodeSources);
    expect(context.pages()).toHaveLength(pages); expect(errors).toEqual([]); expect(posts).toBe(15);
  } finally { await context.close(); }
});
